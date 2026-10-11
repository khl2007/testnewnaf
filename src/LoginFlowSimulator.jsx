import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGatewayHealth, LAB_ALLOW_LIVE_IAM, postIam } from "./iamApi";
import {
  DEFAULT_DEVICE_INFO,
  activationAction,
  activationRemainingRetries,
  activationStep,
  buildAcceptSpRequest,
  buildGetSpRequests,
  buildSubmitFaceActivationLogin,
  buildSubmitLogin,
  buildSubmitOtp,
  buildSubmitPinActivation,
  isLoginFaceActivationSuccess,
  isLoginOtpSuccess,
  loginFaceSubmitShouldRetry,
  isSpAcceptFlowComplete,
  isSpAcceptRequestSuccess,
  parseSpAcceptFollowUp,
  parseSpRequests,
  spRequestChoices,
  spChallengeFromRequestItem,
  spRequestFromAcceptResponse,
  spRequestMeta,
  spRequestRequiresUserAction,
} from "./iamEnvelopes";
import { wizardStepFromActivation } from "./labSessionStorage";
import {
  accountSummaries,
  createAccount,
  initAccounts,
  saveAccounts,
} from "./labAccounts";
import {
  AccountSwitcherBar,
  LoginScreen,
  OtpScreen,
  SpAcceptSuccessScreen,
  SpFaceChallengeScreen,
  SpNoticeScreen,
  SpNumberScreen,
  SpPinChallengeScreen,
  SpWaitingScreen,
  StepScreen,
  TealButton,
  useCountdown,
  WelcomeScreen,
} from "./nafath/NafathUi";
import { FaceFlashCapture } from "./nafath/FaceFlashCapture";

export default function LoginFlowSimulator() {
  const [registry, setRegistry] = useState(() => initAccounts());
  const bootActive = registry.byId[registry.activeId];
  const [health, setHealth] = useState(null);
  const [wizardStep, setWizardStep] = useState(bootActive?.wizardStep ?? "welcome");
  const [username, setUsername] = useState(bootActive?.username ?? "");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [pushToken, setPushToken] = useState("lab-fcm-token");
  const [session, setSession] = useState(bootActive?.session ?? null);
  const [labSessionId, setLabSessionId] = useState(bootActive?.labSessionId ?? null);
  const [mobileHint, setMobileHint] = useState("**");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [spPayload, setSpPayload] = useState(null);
  /** Stay on number picker until user taps a choice (poll may return spRequests=[]). */
  const [pinnedSpReq, setPinnedSpReq] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [faceHint, setFaceHint] = useState("");
  const [bypassLoginFace, setBypassLoginFace] = useState(false);
  const [otpHint, setOtpHint] = useState("");
  /** @type {null | { spTransId: string, step: string, entity: string, message: string, remainingRetries: number | null }} */
  const [spChallenge, setSpChallenge] = useState(null);
  const [spPin, setSpPin] = useState("");
  const [spPinHint, setSpPinHint] = useState("");
  const [spFaceHint, setSpFaceHint] = useState("");
  const [spAcceptSuccess, setSpAcceptSuccess] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [remainSecs, setRemainSecs] = useState(null);
  const [spTimerTotal, setSpTimerTotal] = useState(120);
  const otpTimer = useCountdown(178, wizardStep === "otp");
  const pollRef = useRef(null);
  const spTimerTransRef = useRef(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const labSessionIdRef = useRef(labSessionId);
  labSessionIdRef.current = labSessionId;
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const loggedInAtRef = useRef(bootActive?.loggedInAt ?? null);

  useEffect(() => {
    if (session && !loggedInAtRef.current) loggedInAtRef.current = new Date().toISOString();
    if (!session) loggedInAtRef.current = null;
    setRegistry((reg) => {
      const id = reg.activeId;
      if (!id || !reg.byId[id]) return reg;
      const next = {
        ...reg,
        byId: {
          ...reg.byId,
          [id]: {
            ...reg.byId[id],
            labSessionId,
            session,
            wizardStep,
            username,
            loggedInAt: loggedInAtRef.current,
          },
        },
      };
      saveAccounts(next);
      return next;
    });
  }, [session, wizardStep, username, labSessionId]);

  const mergeSession = useCallback((data) => {
    if (!data || typeof data !== "object" || !data.token) return null;
    const mobile = data?.activationInfo?.data?.mobile;
    if (mobile) setMobileHint(String(mobile).trim() || "**");
    setSession((s) => {
      if (data.transId) {
        return { transId: data.transId, token: data.token, id: data.id ?? s?.id };
      }
      if (s) return { ...s, token: data.token, id: data.id ?? s.id };
      return s;
    });
    const act = activationAction(data);
    const step = activationStep(data);
    let nextWizard = wizardStepFromActivation(step, act);
    if (nextWizard && nextWizard !== "otp" && !isLoginOtpSuccess(data) && (step === "Otp" || act === "Retry")) {
      nextWizard = "otp";
    }
    if (nextWizard) setWizardStep(nextWizard);
    return { act, step, nextWizard };
  }, []);

  const callIam = useCallback(
    async (_label, envelope) => {
      setBusy(true);
      setError("");
      try {
        const json = await postIam(envelope, { labSessionId: labSessionIdRef.current });
        if (json.error && !json.data) throw new Error(json.error);
        if (json.data) mergeSession(json.data);
        return json;
      } catch (e) {
        setError(e.message || String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [mergeSession],
  );

  const fetchSp = useCallback(async () => {
    const s = sessionRef.current;
    if (!s?.token) return;
    setPollCount((n) => n + 1);
    try {
      const json = await postIam(
        buildGetSpRequests({ token: s.token, id: s.id, deviceInfo: DEFAULT_DEVICE_INFO }),
        { labSessionId: labSessionIdRef.current },
      );
      if (json.data) {
        setSpPayload(json.data);
        const hasSpList = parseSpRequests(json.data).length > 0;
        if (json.data.token && !hasSpList) mergeSession(json.data);
      }
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [mergeSession]);

  useEffect(() => {
    fetchGatewayHealth().then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  useEffect(() => {
    if (wizardStep !== "requests") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    fetchSp();
    pollRef.current = setInterval(fetchSp, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [wizardStep, fetchSp, labSessionId]);

  useEffect(() => {
    if (!spAcceptSuccess) return;
    const t = setTimeout(() => {
      setSpAcceptSuccess(false);
      fetchSp();
    }, 2800);
    return () => clearTimeout(t);
  }, [spAcceptSuccess, fetchSp]);

  const resetTransient = useCallback(() => {
    setPassword("");
    setOtp("");
    setPin("");
    setSpPayload(null);
    setPinnedSpReq(null);
    setRemainSecs(null);
    spTimerTransRef.current = null;
    setSpChallenge(null);
    setSpPin("");
    setSpPinHint("");
    setSpFaceHint("");
    setSpAcceptSuccess(false);
    setBypassLoginFace(false);
    setFaceHint("");
    setOtpHint("");
    setError("");
    setMobileHint("**");
    setPollCount(0);
  }, []);

  /** Load an account record into the live component state (its working copy). */
  const loadWorkingCopy = useCallback(
    (rec) => {
      setSession(rec?.session ?? null);
      setUsername(rec?.username ?? "");
      setWizardStep(rec?.wizardStep ?? "welcome");
      setLabSessionId(rec?.labSessionId ?? null);
      loggedInAtRef.current = rec?.loggedInAt ?? null;
      resetTransient();
    },
    [resetTransient],
  );

  const switchAccount = useCallback(
    (id) => {
      const reg = registryRef.current;
      if (!reg.byId[id] || id === reg.activeId) return;
      const next = { ...reg, activeId: id };
      saveAccounts(next);
      setRegistry(next);
      loadWorkingCopy(reg.byId[id]);
    },
    [loadWorkingCopy],
  );

  const addAccount = useCallback(() => {
    const acc = createAccount();
    const reg = registryRef.current;
    const next = {
      order: [...reg.order, acc.accountId],
      byId: { ...reg.byId, [acc.accountId]: acc },
      activeId: acc.accountId,
    };
    saveAccounts(next);
    setRegistry(next);
    loadWorkingCopy(acc);
  }, [loadWorkingCopy]);

  /** Remove a specific account tab. Falls back to another (or a fresh) account
   *  only when the removed one was active. */
  const removeAccount = useCallback(
    (id) => {
      const reg = registryRef.current;
      if (!reg?.byId[id]) return;
      const order = reg.order.filter((x) => x !== id);
      const byId = { ...reg.byId };
      delete byId[id];
      const removingActive = id === reg.activeId;

      let next;
      if (order.length) {
        next = { order, byId, activeId: removingActive ? order[0] : reg.activeId };
      } else {
        const acc = createAccount();
        next = { order: [acc.accountId], byId: { [acc.accountId]: acc }, activeId: acc.accountId };
      }
      saveAccounts(next);
      setRegistry(next);
      // Only swap the live working copy when the active account changed.
      if (removingActive || !order.length) {
        loadWorkingCopy(next.byId[next.activeId]);
      }
    },
    [loadWorkingCopy],
  );

  /** Log out the active account: drop it, then switch to another (or a fresh one). */
  const logoutActive = useCallback(() => {
    const reg = registryRef.current;
    if (reg?.activeId) removeAccount(reg.activeId);
  }, [removeAccount]);

  const onLogin = async () => {
    await callIam("SubmitLogin", buildSubmitLogin({ username, password, deviceInfo: DEFAULT_DEVICE_INFO }));
  };

  const onOtp = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    setOtpHint("");
    try {
      const json = await postIam(buildSubmitOtp(session, otp.replace(/\s/g, "")), {
        labSessionId: labSessionIdRef.current,
      });
      if (json.error && !json.data) throw new Error(json.error);
      if (json.data) mergeSession(json.data);

      const data = json.data;
      if (!data?.token) throw new Error("Invalid OTP response");

      if (isLoginOtpSuccess(data)) {
        setOtp("");
        return;
      }

      setWizardStep("otp");
      const remaining = activationRemainingRetries(data);
      if (remaining != null) {
        setOtpHint(`Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`);
      } else if (activationAction(data) === "Retry" || activationStep(data) === "Otp") {
        setOtpHint("Incorrect code. Try again.");
      } else {
        const msg = data.Message || data.message || (data.Code ? `IAM ${data.Code}` : "OTP failed");
        throw new Error(String(msg));
      }
    } catch (e) {
      setError(e.message || String(e));
      setWizardStep("otp");
    } finally {
      setBusy(false);
    }
  };

  const onPin = async () => {
    if (!session) return;
    await callIam("SubmitPinActivation", buildSubmitPinActivation(session, pin, pushToken));
  };

  const submitLoginFace = useCallback(
    async ({ faceB64 = null, bypassFace = false } = {}) => {
      const maxAttempts = bypassFace ? 1 : 4;
      const retryDelayMs = 800;
      setBusy(true);
      setError("");
      setFaceHint("");
      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const s = sessionRef.current;
          if (!s?.token) throw new Error("Session expired — log in again");

          const json = await postIam(
            buildSubmitFaceActivationLogin(s, faceB64, { bypassFace }),
            { labSessionId: labSessionIdRef.current },
          );
          if (json.error && !json.data) throw new Error(json.error);
          if (json.data) mergeSession(json.data);

          const data = json.data;
          if (data && isLoginFaceActivationSuccess(data)) {
            setWizardStep("requests");
            return;
          }

          if (!loginFaceSubmitShouldRetry(data)) {
            const msg =
              data?.Message || data?.message || (data?.Code ? `IAM ${data.Code}` : "Face step failed");
            throw new Error(String(msg));
          }

          const remaining = activationRemainingRetries(data);
          if (attempt >= maxAttempts) {
            setError(
              remaining != null
                ? `Face not accepted (${remaining} retries reported). Try another photo.`
                : `Face not accepted after ${maxAttempts} attempts. Try another photo.`,
            );
            setWizardStep("face");
            return;
          }

          setFaceHint(
            remaining != null
              ? `Retry requested (${remaining} left). Sending again (${attempt + 1}/${maxAttempts})…`
              : `Retry requested. Sending again (${attempt + 1}/${maxAttempts})…`,
          );
          await new Promise((r) => setTimeout(r, retryDelayMs));
        }
      } catch (e) {
        setError(e.message || String(e));
        setWizardStep("face");
      } finally {
        setBusy(false);
      }
    },
    [mergeSession],
  );

  const onLoginFaceCaptured = async (faceB64) => {
    if (!session || !faceB64) return;
    await submitLoginFace({ faceB64 });
  };

  const onFaceBypassContinue = async () => {
    if (!session || !bypassLoginFace) return;
    await submitLoginFace({ bypassFace: true });
  };

  const applyAcceptSpResponse = useCallback((data, spTransId) => {
    if (data?.token) {
      setSession((cur) =>
        cur ? { ...cur, token: data.token, id: data.id ?? cur.id } : cur,
      );
    }

    const finishSpAcceptAndPoll = () => {
      setSpChallenge(null);
      setSpPin("");
      setSpPinHint("");
      setSpFaceHint("");
      setPinnedSpReq(null);
      setSpPayload({ spRequests: [], phrase: " " });
      spTimerTransRef.current = null;
      setRemainSecs(null);
      setError("");
    };

    if (isSpAcceptRequestSuccess(data)) {
      finishSpAcceptAndPoll();
      setSpAcceptSuccess(true);
      return { complete: true, showSuccess: true, followUp: null };
    }

    const embedded = spRequestFromAcceptResponse(data);
    if (embedded) {
      const { values, step } = spRequestChoices(embedded);
      if (step === "Face") {
        setSpPin("");
        setSpPinHint("");
        setSpFaceHint("");
        setSpChallenge({
          ...spChallengeFromRequestItem(embedded),
          remainingRetries: null,
        });
        setPinnedSpReq(embedded);
        spTimerTransRef.current = null;
        return { complete: false, followUp: null, embedded: true };
      }
      if (values.length > 0 || step === "Notice") {
        setSpChallenge(null);
        setSpPin("");
        setSpPinHint("");
        setSpFaceHint("");
        setPinnedSpReq(embedded);
        spTimerTransRef.current = null;
        return { complete: false, followUp: null, embedded: true };
      }
    }

    const followUp = parseSpAcceptFollowUp(data);
    if (followUp?.step === "Pin" || followUp?.step === "Face") {
      setSpChallenge({
        spTransId: data?.transId ?? spTransId,
        step: followUp.step,
        entity: followUp.entity,
        message: followUp.message,
        description: followUp.description ?? "",
        remainingRetries: followUp.remainingRetries,
      });
      if (followUp.step === "Face") {
        setSpPin("");
        setSpPinHint("");
      }
      return { complete: false, followUp };
    }

    if (isSpAcceptFlowComplete(data)) {
      finishSpAcceptAndPoll();
      setSpAcceptSuccess(true);
      return { complete: true, showSuccess: true, followUp: null };
    }
    return { complete: false, followUp: null, showSuccess: false };
  }, []);

  const postAcceptSpStep = useCallback(
    async (spTransId, step, value) => {
      const s = sessionRef.current;
      if (!s?.token) throw new Error("Session expired — log in again");
      const json = await postIam(
        buildAcceptSpRequest(s, spTransId, step, value, DEFAULT_DEVICE_INFO),
        { labSessionId: labSessionIdRef.current },
      );
      if (json.error && !json.data) throw new Error(json.error);
      return json.data;
    },
    [],
  );

  const onAcceptSp = async (spTransId, step, value) => {
    setBusy(true);
    setError("");
    setSpPinHint("");
    try {
      const data = await postAcceptSpStep(spTransId, step || "Random", value);
      const { complete, showSuccess } = applyAcceptSpResponse(data, spTransId);
      if (complete && !showSuccess) await fetchSp();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSpPinConfirm = async () => {
    if (!spChallenge?.spTransId || spChallenge.step !== "Pin") return;
    setBusy(true);
    setError("");
    setSpPinHint("");
    try {
      const data = await postAcceptSpStep(spChallenge.spTransId, "Pin", spPin);
      const { complete, followUp, showSuccess } = applyAcceptSpResponse(data, spChallenge.spTransId);
      if (!complete && followUp?.step === "Pin") {
        setSpPin("");
        setSpPinHint(
          followUp.remainingRetries != null
            ? `Incorrect PIN. ${followUp.remainingRetries} attempt(s) left.`
            : "Incorrect PIN. Try again.",
        );
        return;
      }
      if (complete && !showSuccess) await fetchSp();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelSpChallenge = () => {
    setSpChallenge(null);
    setSpPin("");
    setSpPinHint("");
    setSpFaceHint("");
    setError("");
  };

  const modeHint =
    health?.ok === false
      ? "Gateway offline — npm run gateway"
      : health?.allowIam === false
        ? "Gateway mock-only (ALLOW_IAM=0)"
        : "Live IAM";

  const spList = parseSpRequests(spPayload);

  useEffect(() => {
    if (wizardStep !== "requests" || pinnedSpReq || spAcceptSuccess) return;
    for (const req of spList) {
      if (spRequestRequiresUserAction(req)) {
        setPinnedSpReq(req);
        break;
      }
    }
  }, [spList, wizardStep, pinnedSpReq, spAcceptSuccess]);

  useEffect(() => {
    if (!pinnedSpReq) return;
    const fresh = spList.find((r) => r.transId === pinnedSpReq.transId);
    if (!fresh) return;
    const freshChoices = spRequestChoices(fresh);
    const pinChoices = spRequestChoices(pinnedSpReq);
    const freshVals = freshChoices.values.join(",");
    const pinVals = pinChoices.values.join(",");
    const secsChanged = Number(fresh.remainingSecs) !== Number(pinnedSpReq.remainingSecs);
    const noticeRefresh = freshChoices.step === "Notice" || freshChoices.step === "Face";
    if (LAB_ALLOW_LIVE_IAM && freshVals.length > 0 && freshVals !== pinVals) {
      setPinnedSpReq(fresh);
    } else if (secsChanged || noticeRefresh) {
      setPinnedSpReq(fresh);
    }
  }, [spList, pinnedSpReq]);

  /** When live IAM returns spRequests, randoms come from the latest poll, not a stale pin. */
  const reqFromLatestPoll = pinnedSpReq?.transId
    ? spList.find((r) => r.transId === pinnedSpReq.transId)
    : null;
  const displayReq = reqFromLatestPoll ?? pinnedSpReq;

  /** Sync countdown from each GetSpRequests poll (`remainingSecs`), tick locally between polls. */
  useEffect(() => {
    if (wizardStep !== "requests" || !displayReq?.transId) return;
    const fromServer =
      displayReq.remainingSecs != null ? Number(displayReq.remainingSecs) : null;
    if (fromServer == null) return;

    if (spTimerTransRef.current !== displayReq.transId) {
      spTimerTransRef.current = displayReq.transId;
      const total = Math.max(fromServer, 1);
      setSpTimerTotal(total);
    }
    setRemainSecs(fromServer);
  }, [wizardStep, spPayload, displayReq?.transId, displayReq?.remainingSecs]);

  useEffect(() => {
    if (wizardStep !== "requests" || !displayReq?.transId) return;
    const t = setInterval(() => {
      setRemainSecs((n) => (n != null && n > 0 ? n - 1 : n));
    }, 1000);
    return () => clearInterval(t);
  }, [wizardStep, displayReq?.transId]);

  const { step: spStep, values: spValues } = displayReq
    ? spRequestChoices(displayReq)
    : { step: "Random", values: [] };
  const spMeta = displayReq ? spRequestMeta(displayReq) : null;
  const showSpNotice = Boolean(
    wizardStep === "requests" &&
      !spAcceptSuccess &&
      displayReq &&
      spStep === "Notice" &&
      !spChallenge,
  );
  const showSpNumbers = Boolean(
    !spAcceptSuccess &&
      displayReq &&
      spValues.length > 0 &&
      !spChallenge &&
      !showSpNotice,
  );

  const spFaceChallenge = spAcceptSuccess
    ? null
    : spChallenge?.step === "Face"
      ? spChallenge
      : displayReq && spStep === "Face" && !spChallenge
        ? spChallengeFromRequestItem(displayReq)
        : null;

  const onSpFaceCaptured = async (faceB64) => {
    if (!faceB64 || !spFaceChallenge?.spTransId) return;
    setBusy(true);
    setError("");
    setSpFaceHint("");
    try {
      const data = await postAcceptSpStep(spFaceChallenge.spTransId, "Face", faceB64);
      const { complete, followUp, showSuccess } = applyAcceptSpResponse(data, spFaceChallenge.spTransId);
      if (!complete && followUp?.step === "Face") {
        setSpFaceHint(
          followUp.remainingRetries != null
            ? `Face not accepted. ${followUp.remainingRetries} attempt(s) left.`
            : "Face not accepted. Try another photo.",
        );
        return;
      }
      if (complete && !showSuccess) await fetchSp();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSpNoticeAccept = async () => {
    if (!displayReq?.transId) return;
    setBusy(true);
    setError("");
    setSpPinHint("");
    try {
      const data = await postAcceptSpStep(displayReq.transId, "Notice", true);
      const { complete, showSuccess } = applyAcceptSpResponse(data, displayReq.transId);
      if (complete && !showSuccess) await fetchSp();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const accounts = accountSummaries(registry);

  const renderScreen = () => {
    if (wizardStep === "welcome") {
      return <WelcomeScreen onActivate={() => setWizardStep("login")} />;
    }

    if (wizardStep === "login") {
      return (
        <LoginScreen
          username={username}
          password={password}
          showPassword={showPassword}
          onTogglePassword={() => setShowPassword((v) => !v)}
          onUsername={setUsername}
          onPassword={setPassword}
          onNext={onLogin}
          onBack={() => setWizardStep("welcome")}
          busy={busy}
          error={error}
          modeHint={modeHint}
        />
      );
    }

    if (wizardStep === "otp") {
      return (
        <OtpScreen
          otp={otp}
          onOtpChange={setOtp}
          mobileHint={mobileHint}
          timer={otpTimer}
          onCancel={() => {
            setOtp("");
            setWizardStep("login");
          }}
          onNext={onOtp}
          busy={busy}
          sessionReady={Boolean(session)}
          hint={otpHint}
          error={error}
        />
      );
    }

    if (wizardStep === "pin") {
      return (
        <StepScreen title="PIN" onBack={() => setWizardStep("otp")}>
          <p className="nf-hint">Enter your Nafath PIN</p>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="nf-input"
          />
          <input
            value={pushToken}
            onChange={(e) => setPushToken(e.target.value)}
            placeholder="pushNotifToken (lab)"
            className="nf-input"
            style={{ marginTop: 12, fontSize: 12 }}
          />
          {error && <p className="nf-error">{error}</p>}
          <div style={{ marginTop: 24, width: "100%" }}>
            <TealButton disabled={busy || !pin} onClick={onPin}>
              Next
            </TealButton>
          </div>
        </StepScreen>
      );
    }

    if (wizardStep === "face") {
      return (
        <StepScreen title="Face" onBack={() => setWizardStep("pin")}>
          <p className="nf-hint">Lab — your own photo only. Image is resized to 600×800, flash liveness, ≤65 KiB (naf12).</p>
          {!bypassLoginFace ? (
            <FaceFlashCapture
              disabled={!session}
              busy={busy}
              onCaptured={onLoginFaceCaptured}
              onError={setError}
            />
          ) : null}
          <label className="nf-muted" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
            <input
              type="checkbox"
              checked={bypassLoginFace}
              disabled={busy}
              onChange={(e) => setBypassLoginFace(e.target.checked)}
            />
            Post without face (<code>byPassStep: Face</code>, lab)
          </label>
          {bypassLoginFace && (
            <div style={{ marginTop: 16, width: "100%" }}>
              <TealButton disabled={busy || !session} onClick={onFaceBypassContinue}>
                {busy ? "…" : "Continue"}
              </TealButton>
            </div>
          )}
          {faceHint && !error && <p className="nf-hint">{faceHint}</p>}
          {error && <p className="nf-error">{error}</p>}
        </StepScreen>
      );
    }

    if (wizardStep === "requests" && spAcceptSuccess) {
      return <SpAcceptSuccessScreen />;
    }

    if (showSpNotice && spMeta) {
      return (
        <SpNoticeScreen
          entity={spMeta.entity}
          message={spMeta.message}
          description={spMeta.description}
          onAccept={onSpNoticeAccept}
          onLogout={logoutActive}
          busy={busy}
          error={error}
          remainingSecs={remainSecs}
        />
      );
    }

    if (wizardStep === "requests" && spFaceChallenge) {
      return (
        <SpFaceChallengeScreen
          entity={spFaceChallenge.entity}
          message={spFaceChallenge.message}
          description={spFaceChallenge.description}
          remainingRetries={spFaceChallenge.remainingRetries}
          onCancel={cancelSpChallenge}
          onLogout={logoutActive}
          busy={busy}
          hint={spFaceHint}
          error={error}
          remainingSecs={remainSecs}
        >
          <FaceFlashCapture
            busy={busy}
            onCaptured={onSpFaceCaptured}
            onError={setError}
          />
        </SpFaceChallengeScreen>
      );
    }

    if (wizardStep === "requests" && spChallenge?.step === "Pin" && !spAcceptSuccess) {
      return (
        <SpPinChallengeScreen
          entity={spChallenge.entity}
          message={spChallenge.message}
          remainingRetries={spChallenge.remainingRetries}
          pin={spPin}
          onPinChange={setSpPin}
          onConfirm={onSpPinConfirm}
          onCancel={cancelSpChallenge}
          onLogout={logoutActive}
          busy={busy}
          hint={spPinHint}
          error={error}
          remainingSecs={remainSecs}
        />
      );
    }

    if (showSpNumbers) {
      return (
        <SpNumberScreen
          values={spValues}
          remainingSecs={remainSecs}
          busy={busy}
          error={error}
          onLogout={logoutActive}
          onPick={(value) => onAcceptSp(displayReq.transId, spStep, value)}
        />
      );
    }

    return (
      <SpWaitingScreen
        remainingSecs={displayReq ? remainSecs : null}
        totalSecs={spTimerTotal}
        onLogout={logoutActive}
        error={error}
        pulseKey={pollCount}
      />
    );
  };

  return (
    <div className="nf-login-shell">
      <AccountSwitcherBar
        accounts={accounts}
        activeId={registry.activeId}
        onSwitch={switchAccount}
        onAdd={addAccount}
        onClose={removeAccount}
      />
      <div className="nf-login-screen">{renderScreen()}</div>
    </div>
  );
}
