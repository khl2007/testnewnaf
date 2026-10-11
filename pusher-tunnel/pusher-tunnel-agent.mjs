/**
 * Local Pusher tunnel agent (outbound only — no port forwarding on your router).
 * Listens on a Pusher channel, forwards requests to iam-gateway-server.mjs.
 *
 *   npm run gateway
 *   npm run pusher-agent
 */
import http from "node:http";
import Pusher from "pusher";
import PusherJs from "pusher-js";
import { RequestAssembler, splitString } from "./chunk.mjs";

const GATEWAY = process.env.IAM_GATEWAY_URL || "http://127.0.0.1:8787";
const TUNNEL_KEY = process.env.PUSHER_TUNNEL_KEY || "";
const APP_ID = process.env.PUSHER_APP_ID || "";
const KEY = process.env.PUSHER_KEY || "";
const SECRET = process.env.PUSHER_SECRET || "";
const CLUSTER = process.env.PUSHER_CLUSTER || "eu";

if (!TUNNEL_KEY || !APP_ID || !KEY || !SECRET) {
  console.error(
    "Set PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER, PUSHER_TUNNEL_KEY (see pusher-tunnel.env.example)",
  );
  process.exit(1);
}

const CHANNEL = `nafath-lab-${TUNNEL_KEY.slice(0, 16)}`;

const pusherServer = new Pusher({ appId: APP_ID, key: KEY, secret: SECRET, cluster: CLUSTER, useTLS: true });

const pusherClient = new PusherJs(KEY, {
  cluster: CLUSTER,
  forceTLS: true,
});

const assembler = new RequestAssembler();

function log(...args) {
  console.log("[pusher-agent]", ...args);
}

function forwardToGateway(req) {
  return new Promise((resolve, reject) => {
    const url = new URL(req.path, GATEWAY);
    const headers = { ...req.headers };
    if (req.body && !headers["Content-Length"]) {
      headers["Content-Length"] = Buffer.byteLength(req.body);
    }
    const r = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: req.method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 502,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    r.on("error", reject);
    if (req.body) r.write(req.body);
    r.end();
  });
}

async function publishResponse(id, response) {
  const body = response.body || "";
  const chunks = splitString(body);
  const headerPick = {
    "content-type": response.headers["content-type"] || "application/json",
  };
  await pusherServer.trigger(CHANNEL, "res_meta", {
    id,
    status: response.status,
    headers: headerPick,
    totalChunks: chunks.length,
  });
  for (let i = 0; i < chunks.length; i += 1) {
    await pusherServer.trigger(CHANNEL, "res_chunk", { id, index: i, data: chunks[i] });
  }
  await pusherServer.trigger(CHANNEL, "res_done", { id });
}

async function handleRequest(tunnelReq) {
  if (tunnelReq.tunnelKey !== TUNNEL_KEY) {
    log("reject wrong tunnel key", tunnelReq.id);
    await publishResponse(tunnelReq.id, {
      status: 403,
      headers: {},
      body: JSON.stringify({ error: "invalid tunnel key" }),
    });
    return;
  }
  log("forward", tunnelReq.method, tunnelReq.path, "body", tunnelReq.body.length);
  try {
    const res = await forwardToGateway(tunnelReq);
    await publishResponse(tunnelReq.id, res);
  } catch (err) {
    await publishResponse(tunnelReq.id, {
      status: 502,
      headers: {},
      body: JSON.stringify({ error: String(err.message || err) }),
    });
  }
}

const channel = pusherClient.subscribe(CHANNEL);
channel.bind("pusher:subscription_succeeded", () => {
  log("subscribed", CHANNEL, "-> gateway", GATEWAY);
});

for (const ev of ["req_meta", "req_chunk", "req_done"]) {
  channel.bind(ev, (data) => {
    const assembled = assembler.ingest(ev, data);
    if (assembled) handleRequest(assembled);
  });
}

pusherClient.connection.bind("error", (err) => log("connection error", err));
