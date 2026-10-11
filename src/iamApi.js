const LAB_SESSION_KEY = "nafath-lab-session-id";

/** Base or full IAM API endpoint configured via Vite env (e.g. VITE_IAM_API_URL) */
const rawApiUrl = (
  import.meta.env.VITE_IAM_API_URL ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_IAM_GATEWAY_URL ||
  import.meta.env.VITE_GATEWAY_URL ||
  "https://nafrailway-production.up.railway.app"
).trim().replace(/\/+$/, "");

export const IAM_API_URL = rawApiUrl
  ? rawApiUrl.endsWith("/api/iam")
    ? rawApiUrl
    : rawApiUrl.endsWith("/api")
      ? `${rawApiUrl}/iam`
      : `${rawApiUrl}/api/iam`
  : "/api/iam";

export const HEALTH_API_URL =
  (import.meta.env.VITE_HEALTH_API_URL || "").trim() ||
  (rawApiUrl
    ? rawApiUrl.endsWith("/api/iam")
      ? rawApiUrl.replace(/\/api\/iam$/, "/api/health")
      : rawApiUrl.endsWith("/api")
        ? `${rawApiUrl}/health`
        : `${rawApiUrl}/api/health`
    : "/api/health");

/** Lab UI always forwards to real IAM when the gateway allows it. */
export const LAB_ALLOW_LIVE_IAM =
  import.meta.env.VITE_ALLOW_LIVE_IAM !== "false" &&
  import.meta.env.VITE_ALLOW_LIVE_IAM !== "0";

/** Generate a fresh gateway session id (one per logged-in account). */
export function newLabSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `lab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

export function getLabSessionId() {
  let id = sessionStorage.getItem(LAB_SESSION_KEY);
  if (!id) {
    id = newLabSessionId();
    sessionStorage.setItem(LAB_SESSION_KEY, id);
  }
  return id;
}

/**
 * @param {object} envelope IAM Action envelope
 * @param {{ allowLive?: boolean, labSessionId?: string }} opts
 */
export async function postIam(envelope, opts = {}) {
  const labSessionId = opts.labSessionId || getLabSessionId();
  const res = await fetch(IAM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lab-Session-Id": labSessionId,
    },
    body: JSON.stringify({
      envelope,
      allowLive: opts.allowLive ?? LAB_ALLOW_LIVE_IAM,
    }),
  });
  const json = await res.json();
  if (!res.ok && !json.data) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

export async function fetchGatewayHealth() {
  const res = await fetch(HEALTH_API_URL);
  return res.json();
}
