/**
 * LAB-ONLY mock gateway. 127.0.0.1 only. No production.
 * Mirrors reversed envelope: POST /. {Action, Parameters}
 *  SubmitLogin -> fake {transId,token,id}
 *  SubmitFaceActivation -> accepts ANY base64 (vulnerable, intentional for lab)
 * Run: npm run mock  (serves http://127.0.0.1:8080/.)
 */
import http from "node:http";

const HOST = "127.0.0.1";
const PORT = 8080;
const sessions = new Map(); // transId -> token

function send(res, obj, code = 200) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, {});
  if (req.method !== "POST" || req.url !== "/.") {
    return send(res, { error: "lab-only: POST /. only" }, 404);
  }
  let chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch (e) {
      return send(res, { error: "bad json" }, 400);
    }
    const action = body.Action;
    const p = body.Parameters || {};

    if (action === "SubmitLogin") {
      const transId = "lab-trans-001";
      const token = "lab-token-abc";
      sessions.set(transId, token);
      console.log(`[mock] SubmitLogin username=${p.username} -> ${transId}`);
      return send(res, { transId, token, id: 999001, arName: "Lab", enName: "Lab" });
    }

    if (action === "SubmitFaceActivation") {
      if (sessions.get(p.transId) !== p.token) {
        return send(res, { Code: "F025", message: "invalid session" }, 401);
      }
      let bytes = 0;
      try {
        bytes = Buffer.from(p.face || "", "base64").length;
      } catch {
        return send(res, { Code: "F025", message: "face not base64" }, 400);
      }
      console.log(`[mock] SubmitFaceActivation transId=${p.transId} face_bytes=${bytes} -> ACCEPTED (no liveness)`);
      return send(res, { success: true, note: "accepted without liveness proof (vulnerable)" });
    }

    return send(res, { Code: "F025", message: `unknown Action ${action}` }, 400);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock] LAB-ONLY http://${HOST}:${PORT}/.  Use only your own photo.`);
});
