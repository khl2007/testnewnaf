/** IAM JSON envelopes (naf12 login + GetSpRequests wire shapes). */

export const DEFAULT_APP_VERSION = "12.5";
export const DEFAULT_TEAM_ID = "89bb4442-dbfd-2e42-bfbe-4c3d0c88d35f";

export const DEFAULT_DEVICE_INFO = {
  "last-update-time": "1790882772361",
  "native-application-version": "13",
  "device-name": "Pixel 9",
  "os-version": "34",
  "native-build-version": "165",
  "os-internal-build-id": "AP2A.240905.003",
  "os-build-id": "12231197",
  "installation-time": "1790882772361",
  os: "Android 14",
  ip: "127.0.0.1",
  manufacturer: "Google",
  model: "Pixel 9",
  brand: "google",
  androidId: "b1ac3c5136e35548",
  uuid: "daf65099-bb60-4b68-ae04-59ecf38360bc",
};

export function activationStep(data) {
  return data?.activationInfo?.data?.step ?? null;
}

export function activationAction(data) {
  return data?.activationInfo?.action ?? null;
}

export function activationRemainingRetries(data) {
  const n = data?.activationInfo?.data?.remainingRetries;
  return n == null ? null : Number(n);
}

/** SubmitOtp accepted — IAM moved past the Otp step. */
export function isLoginOtpSuccess(data) {
  if (!data || typeof data !== "object") return false;
  const code = data.Code;
  if (code === "400-B003" || code === "F025") return false;
  const step = activationStep(data);
  const action = activationAction(data);
  if (step === "Otp" || action === "Retry") return false;
  if (action === "Active" || step === "Done") return true;
  if (step === "Pin" || step === "Face") return true;
  return action === "Next" && Boolean(step);
}

/** Login SubmitFaceActivation succeeded (Active / left Face step). */
export function isLoginFaceActivationSuccess(data) {
  if (!data || typeof data !== "object") return false;
  const code = data.Code;
  if (code && String(code).toLowerCase() !== "ok") return false;
  const action = activationAction(data);
  if (action === "Active") return true;
  const step = activationStep(data);
  return (action === "Done" || action === "Next") && step && step !== "Face";
}

/** IAM asked to submit face again (HTTP 200, action Retry). */
export function loginFaceSubmitShouldRetry(data) {
  if (!data || typeof data !== "object") return false;
  const code = data.Code;
  if (code === "400-B003" || code === "F025") return false;
  if (isLoginFaceActivationSuccess(data)) return false;
  const action = activationAction(data);
  const step = activationStep(data);
  if (action === "Retry") return true;
  if (step === "Face" && action !== "Active" && action !== "Done") return true;
  if (code === "400-B055") return true;
  return false;
}

export function buildSubmitLogin({
  username,
  password,
  appVersion = DEFAULT_APP_VERSION,
  teamId = DEFAULT_TEAM_ID,
  deviceInfo = DEFAULT_DEVICE_INFO,
}) {
  return {
    Action: "SubmitLogin",
    Parameters: {
      username,
      password,
      appVersion,
      teamId,
      deviceInfo: { ...deviceInfo },
    },
  };
}

export function buildSubmitOtp(session, otp) {
  return {
    Action: "SubmitOtp",
    Parameters: {
      token: session.token,
      transId: session.transId,
      id: session.id,
      byPassStep: null,
      otp: Number(otp),
    },
  };
}

export function buildSubmitPinActivation(session, pin, pushNotifToken) {
  return {
    Action: "SubmitPinActivation",
    Parameters: {
      token: session.token,
      transId: session.transId,
      id: session.id,
      pin: String(pin),
      pushNotifToken: pushNotifToken || "",
    },
  };
}

export function buildSubmitFaceActivationLogin(session, faceB64, opts = {}) {
  const bypassFace = Boolean(opts.bypassFace);
  if (bypassFace) {
    return {
      Action: "SubmitFaceActivation",
      Parameters: {
        token: session.token,
        transId: session.transId,
        id: session.id,
        face: null,
        byPassStep: "Face",
      },
    };
  }
  return {
    Action: "SubmitFaceActivation",
    Parameters: {
      token: session.token,
      transId: session.transId,
      id: session.id,
      face: faceB64,
      byPassStep: null,
    },
  };
}

export function buildGetSpRequests({
  token,
  id,
  appVersion = DEFAULT_APP_VERSION,
  teamId = DEFAULT_TEAM_ID,
  deviceInfo = DEFAULT_DEVICE_INFO,
}) {
  return {
    Action: "GetSpRequests",
    deviceInfo: { ...deviceInfo },
    Parameters: {
      token,
      appVersion,
      teamId,
      id,
    },
  };
}

export function buildNationalitiesWarmup() {
  return { Action: "Nationalities", Parameters: {} };
}

function formatAcceptSpValue(step, value) {
  if (step === "Pin") {
    const n = Number(String(value).replace(/\D/g, ""));
    return Number.isFinite(n) ? n : value;
  }
  if (step === "Notice") {
    if (value === false || value === "false") return false;
    return true;
  }
  if (step === "Face") {
    return String(value);
  }
  return String(value);
}

export function buildAcceptSpRequest(
  session,
  spTransId,
  step,
  value,
  deviceInfo = DEFAULT_DEVICE_INFO,
) {
  return {
    Action: "AcceptSpRequest",
    Parameters: {
      token: session.token,
      transId: spTransId,
      id: session.id,
      step,
      deviceInfo: { ...deviceInfo },
      value: formatAcceptSpValue(step, value),
    },
  };
}

export function buildRejectSpRequest(session, spTransId, deviceInfo = DEFAULT_DEVICE_INFO) {
  return {
    Action: "RejectSpRequest",
    Parameters: {
      token: session.token,
      transId: spTransId,
      id: session.id,
      deviceInfo: { ...deviceInfo },
    },
  };
}

/** Unwrap IAM GetSpRequests body (live JSON is usually top-level spRequests). */
export function normalizeGetSpRequestsBody(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data.spRequests)) return data;
  const inner = data.data ?? data.Data ?? data.result ?? data.Result;
  if (inner && typeof inner === "object" && Array.isArray(inner.spRequests)) {
    return { ...data, ...inner, spRequests: inner.spRequests };
  }
  return data;
}

/** @param {unknown} data GetSpRequests response body */
export function parseSpRequests(data) {
  const body = normalizeGetSpRequestsBody(data);
  if (!body || typeof body !== "object") return [];
  return Array.isArray(body.spRequests) ? body.spRequests : [];
}

function extractRandomValues(block) {
  if (!block || typeof block !== "object") return [];
  const raw = block.randoms ?? block.randomNumbers ?? block.randomList;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map(String);
}

export function spRequestChoices(req) {
  const info = req?.requestInfo || {};
  const block = info.data || info.Data || {};
  const nextStep = block.nextStep || block.step || "Random";
  const values = extractRandomValues(block);
  if (values.length) {
    return { step: nextStep === "Random" ? "Random" : String(nextStep), values };
  }
  return { step: String(nextStep), values: [] };
}

export function spRequestTitle(req) {
  const info = req?.requestInfo || {};
  const block = info.data || {};
  return (
    block.serviceName ||
    block.spName ||
    info.serviceName ||
    info.name ||
    info.type ||
    "service provider"
  );
}

/** GetSpRequests item metadata (Notice, Random follow-on, etc.). */
export function spRequestMeta(req) {
  const info = req?.requestInfo || {};
  const block = info.data || info.Data || {};
  const meta = block.metaData || block.metadata || {};
  const step = block.nextStep || block.step || "Random";
  return {
    step: String(step),
    entity: meta.entity != null ? String(meta.entity) : "",
    message: meta.message != null ? String(meta.message) : "",
    description: meta.description != null ? String(meta.description) : "",
  };
}

export function spRequestRequiresUserAction(req) {
  const { values, step } = spRequestChoices(req);
  if (values.length > 0) return true;
  return step === "Notice" || step === "Face";
}

export function spChallengeFromRequestItem(req) {
  const meta = spRequestMeta(req);
  return {
    spTransId: req.transId,
    step: meta.step,
    entity: meta.entity,
    message: meta.message,
    description: meta.description,
    remainingRetries: null,
  };
}

export function spAcceptRequestInfo(data) {
  if (!data || typeof data !== "object") return null;
  const info =
    data.requestInfo ??
    (Array.isArray(data.spRequests) ? data.spRequests[0]?.requestInfo : null);
  return info && typeof info === "object" ? info : null;
}

/** AcceptSpRequest body shaped like a GetSpRequests item (Notice → Random, etc.). */
export function spRequestFromAcceptResponse(data) {
  if (!data || typeof data !== "object") return null;
  if (isSpAcceptRequestSuccess(data)) return null;
  if (!data.transId || !data.requestInfo) return null;
  const info = data.requestInfo;
  if (isSuccessActionName(info.action) || isSuccessActionName(info.Action)) return null;
  return {
    transId: data.transId,
    remainingSecs: data.remainingSecs,
    expTime: data.expTime,
    requestInfo: data.requestInfo,
  };
}

function isSuccessActionName(action) {
  if (action == null) return false;
  const s = String(action).trim();
  return /^Success$/i.test(s) || /^Done$/i.test(s);
}

/** IAM finished this AcceptSpRequest step (e.g. Pin / Face verified: action Success). */
export function isSpAcceptRequestSuccess(data) {
  if (!data || typeof data !== "object") return false;
  const info = spAcceptRequestInfo(data);
  if (isSuccessActionName(info?.action) || isSuccessActionName(info?.Action)) return true;
  if (isSuccessActionName(data.action) || isSuccessActionName(data.Action)) return true;
  const block = info?.data ?? info?.Data;
  if (block && typeof block === "object" && isSuccessActionName(block.action)) return true;
  return false;
}

/** Pending AcceptSpRequest challenge (action Next → show Pin UI, etc.). */
export function parseSpAcceptFollowUp(data) {
  if (!data || typeof data !== "object") return null;
  if (isSpAcceptRequestSuccess(data)) return null;
  const info = spAcceptRequestInfo(data);
  if (!info) return null;
  const action = info.action;
  if (action && action !== "Next" && action !== "Retry") return null;
  const block = info.data || info.Data || {};
  const nextStep = block.nextStep || block.step;
  if (!nextStep || nextStep === "Done") return null;
  const meta = block.metaData || block.metadata || {};
  return {
    step: String(nextStep),
    remainingRetries:
      block.remainingRetries != null ? Number(block.remainingRetries) : null,
    entity: meta.entity != null ? String(meta.entity) : "",
    message: meta.message != null ? String(meta.message) : "",
    description: meta.description != null ? String(meta.description) : "",
  };
}

export function isSpAcceptFlowComplete(data) {
  if (!data || typeof data !== "object") return false;
  const code = data.Code;
  if (code && code !== "OK" && String(code).toLowerCase() !== "ok") return false;
  if (isSpAcceptRequestSuccess(data)) return true;
  if (parseSpAcceptFollowUp(data)) return false;
  return Boolean(
    data.result === "Accepted" ||
      activationAction(data) === "Active" ||
      activationStep(data) === "Done",
  );
}
