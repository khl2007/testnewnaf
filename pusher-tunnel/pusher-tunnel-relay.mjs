/**
 * Public HTTP front for the Pusher tunnel (host on Render/Fly/Railway OR ngrok this port).
 * Online clients POST here; relay publishes to Pusher; local agent answers.
 *
 *   npm run pusher-relay
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import Pusher from "pusher";
import PusherJs from "pusher-js";
import { ResponseAssembler, splitString } from "./chunk.mjs";

const HOST = process.env.PUSHER_RELAY_HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || process.env.PUSHER_RELAY_PORT || 8788);
const TUNNEL_KEY = process.env.PUSHER_TUNNEL_KEY || "";
const APP_ID = process.env.PUSHER_APP_ID || "";
const KEY = process.env.PUSHER_KEY || "";
const SECRET = process.env.PUSHER_SECRET || "";
const CLUSTER = process.env.PUSHER_CLUSTER || "eu";

if (!TUNNEL_KEY || !APP_ID || !KEY || !SECRET) {
  console.error("Missing Pusher env — copy pusher-tunnel.env.example");
  process.exit(1);
}

const CHANNEL = `nafath-lab-${TUNNEL_KEY.slice(0, 16)}`;

const pusherServer = new Pusher({ appId: APP_ID, key: KEY, secret: SECRET, cluster: CLUSTER, useTLS: true });
const pusherClient = new PusherJs(KEY, { cluster: CLUSTER, forceTLS: true });
const responses = new ResponseAssembler();

const channel = pusherClient.subscribe(CHANNEL);
for (const ev of ["res_meta", "res_chunk", "res_done"]) {
  channel.bind(ev, (data) => responses.ingest(ev, data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function publishRequest(id, method, path, headers, body) {
  const chunks = splitString(body);
  await pusherServer.trigger(CHANNEL, "req_meta", {
    id,
    tunnelKey: TUNNEL_KEY,
    method,
    path,
    headers,
    totalChunks: chunks.length,
    totalBytes: body.length,
  });
  for (let i = 0; i < chunks.length; i += 1) {
    await pusherServer.trigger(CHANNEL, "req_chunk", { id, index: i, data: chunks[i] });
  }
  await pusherServer.trigger(CHANNEL, "req_done", { id });
}

function log(...args) {
  console.log("[pusher-relay]", ...args);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Lab-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/api/health") {
    const body = JSON.stringify({
      ok: true,
      transport: "pusher-tunnel",
      channel: CHANNEL,
      hint: "POST /api/iam with same body as iam-gateway-server.mjs",
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(body);
  }

  if (req.method !== "POST" || !req.url?.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "use POST /api/iam or GET /api/health" }));
  }

  const id = randomUUID();
  const body = await readBody(req);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string" && (k === "content-type" || k === "x-lab-session-id")) {
      headers[k] = v;
    }
  }

  try {
    log("request", id, req.method, req.url, body.length);
    const wait = responses.wait(id);
    await publishRequest(id, req.method, req.url, headers, body);
    const tunnelRes = await wait;
    const outHeaders = { ...tunnelRes.headers, "Content-Length": Buffer.byteLength(tunnelRes.body) };
    res.writeHead(tunnelRes.status, outHeaders);
    res.end(tunnelRes.body);
  } catch (err) {
    log("error", err);
    res.writeHead(504, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err.message || err), hint: "Is pusher-agent running locally?" }));
  }
});

channel.bind("pusher:subscription_succeeded", () => {
  server.listen(PORT, HOST, () => {
    log(`http://${HOST}:${PORT}  channel=${CHANNEL}`);
    log("Run locally: npm run gateway && npm run pusher-agent");
  });
});
