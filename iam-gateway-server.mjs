/**
 * Lab gateway: React -> POST /api/iam -> mock IAM or live www.iam.gov.sa/nafath/
 * Live IAM forwarding is ON by default when the client sends allowLive: true.
 * Set ALLOW_IAM=0 to force mock-only.
 */
import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";

const HOST = "127.0.0.1";
const PORT = Number(process.env.IAM_GATEWAY_PORT || 8787);
const IAM_URL = process.env.IAM_URL || "https://www.iam.gov.sa/nafath/";
const ALLOW_IAM =
  process.env.ALLOW_IAM !== "0" && process.env.ALLOW_IAM !== "false";
const CORS = "http://127.0.0.1:5173";

/** @type {Map<string, { cookies: string[], sessions: Map<string, string> }>} */
const clients = new Map();

function clientStore(labSessionId) {
  let c = clients.get(labSessionId);
  if (!c) {
    c = { cookies: [], sessions: new Map(), pendingSp: null };
    clients.set(labSessionId, c);
  } else if (c.pendingSp === undefined) {
    c.pendingSp = null;
  }
  return c;
}

function log(...args) {
  console.log("[gateway]", ...args);
}

/** Three distinct 2-digit choices for lab Random step (override: MOCK_SP_RANDOMS=12,34,56). */
function mockSpRandoms() {
  const raw = process.env.MOCK_SP_RANDOMS;
  if (raw) {
    const parsed = raw
      .split(/[,\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (parsed.length >= 3) return parsed.slice(0, 3);
  }
  const out = [];
  while (out.length < 3) {
    const n = Math.floor(Math.random() * 90) + 10;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

function summarizeSpData(data) {
  const reqs = data?.spRequests;
  if (!Array.isArray(reqs) || reqs.length === 0) return "spRequests=[]";
  return reqs
    .map((r) => {
      const d = r?.requestInfo?.data || {};
      return `transId=${r.transId} randoms=${JSON.stringify(d.randoms ?? d.randomNumbers)}`;
    })
    .join("; ");
}

function sendJson(res, obj, code = 200, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Access-Control-Allow-Origin": CORS,
    "Access-Control-Allow-Headers": "Content-Type, X-Lab-Session-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function mergeCookies(existing, setCookieHeader) {
  const jar = new Map();
  for (const c of existing) {
    const name = c.split("=")[0];
    jar.set(name, c);
  }
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  for (const raw of list) {
    const part = raw.split(";")[0];
    const name = part.split("=")[0];
    jar.set(name, part);
  }
  return [...jar.values()];
}

function forwardIam(envelope, cookieHeader) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(envelope);
    const url = new URL(IAM_URL);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Accept-Language": "ar",
          "User-Agent": "Dart/3.9 (dart:io)",
          "Accept-Encoding": "identity",
          "Content-Length": Buffer.byteLength(body),
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function mockHandle(envelope, store) {
  const action = envelope.Action;
  const params = envelope.Parameters || {};
  const deviceInfo = envelope.deviceInfo;

  if (action === "Nationalities") {
    return { status: 200, data: [{ id: 1, name: "Lab" }] };
  }

  if (action === "SubmitLogin") {
    const transId = randomUUID();
    const token = `lab-mock-token-${transId.slice(0, 8)}`;
    const id = Number(params.username) || 999001;
    store.sessions.set(transId, token);
    log("SubmitLogin", params.username, "->", transId);
    return {
      status: 200,
      data: {
        transId,
        token,
        id,
        activationInfo: {
          action: "Next",
          data: { step: "Otp", mobile: " **", expirySeconds: 180 },
        },
      },
    };
  }

  if (action === "SubmitOtp") {
    const { transId, token, id } = params;
    if (transId && store.sessions.get(transId) !== token) {
      return { status: 401, data: { Code: "F025", message: "invalid session" } };
    }
    const newToken = `${token}-otp`;
    if (transId) store.sessions.set(transId, newToken);
    log("SubmitOtp", transId);
    return {
      status: 200,
      data: {
        transId,
        id,
        token: newToken,
        activationInfo: { action: "Next", data: { step: "Pin" } },
      },
    };
  }

  if (action === "SubmitPinActivation") {
    const { transId, token, id } = params;
    if (transId && store.sessions.get(transId) !== token) {
      return { status: 401, data: { Code: "F025", message: "invalid session" } };
    }
    const newToken = `${token}-pin`;
    if (transId) store.sessions.set(transId, newToken);
    log("SubmitPinActivation", transId);
    return {
      status: 200,
      data: {
        transId,
        id,
        token: newToken,
        activationInfo: {
          action: "Next",
          data: { step: "Face", isFaceFlashOn: true },
        },
      },
    };
  }

  if (action === "SubmitFaceActivation") {
    const { transId, token } = params;
    if (transId && store.sessions.get(transId) !== token) {
      return { status: 401, data: { Code: "F025", message: "invalid session" } };
    }
    const newToken = `${token}-face`;
    if (transId) store.sessions.set(transId, newToken);
    log("SubmitFaceActivation", transId, "face_len", (params.face || "").length);
    return {
      status: 200,
      data: {
        transId,
        id: params.id,
        token: newToken,
        activationInfo: { action: "Active", data: { step: "Done" } },
      },
    };
  }

  if (action === "GetSpRequests") {
    const p = params;
    if (!store.pendingSp) {
      const spTransId = randomUUID();
      const useNotice = process.env.MOCK_SP_NOTICE === "1";
      if (useNotice) {
        store.pendingSp = {
          transId: spTransId,
          remainingSecs: 176,
          requestInfo: {
            type: "Challenge",
            action: "Next",
            data: {
              nextStep: "Notice",
              metaData: {
                entity: "شركة الاتصالات السعودية",
                message: "لديك طلب اصدار رقم جوال جديد (mock)",
                description: "انت على وشك إتمام عملية اصدار رقم جوال جديد (mock)",
              },
            },
          },
        };
        log("GetSpRequests mock NEW Notice", "transId=", spTransId);
      } else {
        const randoms = mockSpRandoms();
        store.pendingSp = {
          transId: spTransId,
          remainingSecs: 120,
          requestInfo: {
            type: "Login",
            data: {
              nextStep: "Random",
              randoms,
              serviceName: "Absher",
            },
          },
        };
        log("GetSpRequests mock NEW", "id=", p.id, "randoms=", randoms, "transId=", spTransId);
      }
    } else if (store.pendingSp.remainingSecs > 0) {
      store.pendingSp = {
        ...store.pendingSp,
        remainingSecs: store.pendingSp.remainingSecs - 1,
      };
      const r = store.pendingSp.requestInfo?.data?.randoms;
      log("GetSpRequests mock REUSE", "randoms=", r, "transId=", store.pendingSp.transId);
    }
    const sample = store.pendingSp ? [store.pendingSp] : [];
    return { status: 200, data: { spRequests: sample, phrase: " " } };
  }

  if (action === "RejectSpRequest") {
    const { transId, token, id } = params;
    log("RejectSpRequest", transId);
    if (store.pendingSp && store.pendingSp.transId === transId) {
      store.pendingSp = null;
    }
    return {
      status: 200,
      data: { token, transId, id, result: "Rejected" },
    };
  }

  if (action === "AcceptSpRequest") {
    const { transId, token, id, step, value } = params;
    log("AcceptSpRequest", transId, step, value);
    const newToken = `${token}-sp-${step || "accept"}`;
    if (step === "Notice") {
      return {
        status: 200,
        data: {
          token: newToken,
          transId,
          id,
          remainingSecs: 170,
          requestInfo: {
            type: "Challenge",
            action: "Next",
            data: {
              nextStep: "Random",
              randoms: mockSpRandoms(),
              metaData: {
                entity: "شركة الاتصالات السعودية",
                message: "لديك طلب اصدار رقم جوال جديد (mock)",
              },
            },
          },
        },
      };
    }
    if (step === "Random") {
      return {
        status: 200,
        data: {
          token: newToken,
          transId,
          id,
          requestInfo: {
            type: "Challenge",
            action: "Next",
            data: {
              nextStep: "Pin",
              remainingRetries: 3,
              metaData: {
                entity: "Lab service provider",
                message: "Confirm this login with your Nafath PIN (mock).",
              },
            },
          },
        },
      };
    }
    if (step === "Pin") {
      if (store.pendingSp && store.pendingSp.transId === transId) {
        store.pendingSp = null;
      }
      const pinOk = String(value) === "123456" || String(value).length >= 4;
      if (!pinOk) {
        return {
          status: 200,
          data: {
            token: newToken,
            transId,
            id,
            requestInfo: {
              type: "Challenge",
              action: "Next",
              data: {
                nextStep: "Pin",
                remainingRetries: 2,
                metaData: {
                  entity: "Lab service provider",
                  message: "Confirm this login with your Nafath PIN (mock).",
                },
              },
            },
          },
        };
      }
      return {
        status: 200,
        data: {
          token: newToken,
          transId,
          id,
          remainingSecs: 120,
          requestInfo: {
            type: "Challenge",
            action: "Next",
            data: {
              nextStep: "Face",
              metaData: {
                entity: "Lab service provider",
                message: "Complete face verification for this request (mock).",
              },
              requiredStepActivation: "face",
            },
          },
        },
      };
    }
    if (step === "Face") {
      const faceLen = String(value || "").length;
      if (faceLen < 64) {
        return {
          status: 200,
          data: {
            token: newToken,
            transId,
            id,
            requestInfo: {
              type: "Challenge",
              action: "Next",
              data: {
                nextStep: "Face",
                remainingRetries: 2,
                metaData: {
                  entity: "Lab service provider",
                  message: "Face verification failed (mock).",
                },
              },
            },
          },
        };
      }
      if (store.pendingSp && store.pendingSp.transId === transId) {
        store.pendingSp = null;
      }
      return {
        status: 200,
        data: {
          token: newToken,
          transId,
          id,
          requestInfo: {
            type: "Challenge",
            action: "Success",
            data: { step: "Face" },
          },
        },
      };
    }
    if (store.pendingSp && store.pendingSp.transId === transId) {
      store.pendingSp = null;
    }
    return {
      status: 200,
      data: { token: newToken, transId, id, step, value, result: "Accepted" },
    };
  }

  return {
    status: 400,
    data: { Code: "F025", message: `mock: unknown Action ${action}` },
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, {});
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return sendJson(res, {
      ok: true,
      allowIam: ALLOW_IAM,
      iamUrl: IAM_URL,
      mode: ALLOW_IAM ? "mock-or-live" : "mock-only",
    });
  }

  if (req.method !== "POST" || req.url !== "/api/iam") {
    return sendJson(res, { error: "use POST /api/iam or GET /api/health" }, 404);
  }

  const labSessionId = req.headers["x-lab-session-id"] || "default";
  const store = clientStore(labSessionId);

  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || "{}");
  } catch {
    return sendJson(res, { error: "bad json" }, 400);
  }

  const envelope = payload.envelope;
  const allowLive = Boolean(payload.allowLive);
  if (!envelope || !envelope.Action) {
    return sendJson(res, { error: "envelope.Action required" }, 400);
  }

  const redacted = JSON.parse(JSON.stringify(envelope));
  if (redacted.Parameters?.password) redacted.Parameters.password = "***";
  if (redacted.Parameters?.pin) redacted.Parameters.pin = "***";
  if (redacted.Parameters?.face?.length > 80) {
    redacted.Parameters.face = `<len=${redacted.Parameters.face.length}>`;
  }

  try {
    if (allowLive && ALLOW_IAM) {
      const cookieHeader = store.cookies.join("; ");
      const iam = await forwardIam(envelope, cookieHeader);
      if (iam.headers["set-cookie"]) {
        store.cookies = mergeCookies(store.cookies, iam.headers["set-cookie"]);
      }
      let data;
      try {
        data = JSON.parse(iam.text);
      } catch {
        data = { _raw: iam.text.slice(0, 2000) };
      }
      if (data.transId && data.token) {
        store.sessions.set(data.transId, data.token);
      }
      if (envelope.Action === "GetSpRequests") {
        log("GetSpRequests live", "status=", iam.status, summarizeSpData(data));
      }
      return sendJson(res, {
        mode: "live",
        status: iam.status,
        request: redacted,
        data,
      });
    }

    if (allowLive && !ALLOW_IAM) {
      return sendJson(
        res,
        {
          error: "Live IAM disabled on gateway (ALLOW_IAM=0). Restart without ALLOW_IAM=0.",
          request: redacted,
        },
        403,
      );
    }

    const mock = mockHandle(envelope, store);
    return sendJson(res, {
      mode: "mock",
      status: mock.status,
      request: redacted,
      data: mock.data,
    });
  } catch (err) {
    log("error", err);
    return sendJson(res, { error: String(err.message || err), request: redacted }, 502);
  }
});

server.listen(PORT, HOST, () => {
  log(`http://${HOST}:${PORT}  ALLOW_IAM=${ALLOW_IAM}  IAM=${IAM_URL}`);
  log("React: npm run dev -> Login flow tab (proxy /api -> gateway)");
});
