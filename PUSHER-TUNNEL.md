# Pusher tunnel (lab)

[Pusher Channels](https://pusher.com/channels) is **not** an HTTP reverse proxy like ngrok. It is a **message bus**. This lab setup uses it as transport:

```
Internet  →  pusher-tunnel-relay (public HTTP)
                    ↓ Pusher cloud (WebSocket)
             pusher-tunnel-agent (your PC, outbound only)
                    ↓
             iam-gateway-server.mjs :8787
```

**Why Pusher:** your agent only **connects out** to Pusher (works behind NAT/firewalls). You still need **one public HTTP entry** — the relay — on Render/Fly/Railway or similar (or ngrok on the relay port).

**Limit:** each Pusher event is **≤ 10 KB**. Face base64 is ~70 KB, so this repo **chunks** requests/responses automatically.

## 1. Pusher dashboard

1. [Create a Channels app](https://dashboard.pusher.com/).
2. Copy **app_id**, **key**, **secret**, **cluster**.
3. Generate `PUSHER_TUNNEL_KEY` (long random string).

Copy `pusher-tunnel.env.example` → `.env.local` or set env vars in PowerShell.

## 2. Install deps

```powershell
cd lab-poc-react
npm install pusher pusher-js
```

## 3. Run (three terminals)

```powershell
# Terminal 1 — IAM gateway (unchanged)
npm run gateway

# Terminal 2 — local agent (must stay running)
$env:PUSHER_APP_ID="..."; $env:PUSHER_KEY="..."; $env:PUSHER_SECRET="..."; $env:PUSHER_CLUSTER="eu"; $env:PUSHER_TUNNEL_KEY="..."
npm run pusher-agent

# Terminal 3 — public relay (deploy this to cloud for real “online” access)
npm run pusher-relay
```

Deploy **only** `pusher-tunnel-relay.mjs` + env to your host; keep **agent + gateway** on your machine.

### Railway

- Root / service directory: `lab-poc-react`
- Build: `npm install`
- Start: `node pusher-tunnel/pusher-tunnel-relay.mjs`
- Env: `PUSHER_*`, `PUSHER_TUNNEL_KEY`, `PUSHER_RELAY_HOST=0.0.0.0` (Railway sets `PORT` automatically)
- Public URL: `https://your-service.up.railway.app/api/health`

## 4. Test

Against relay URL (local relay example):

```powershell
curl http://127.0.0.1:8788/api/health
curl -X POST http://127.0.0.1:8788/api/iam -H "Content-Type: application/json" -d "{\"allowLive\":false,\"envelope\":{\"Action\":\"Nationalities\",\"Parameters\":{},\"deviceInfo\":{}}}"
```

Same JSON shape as `POST http://127.0.0.1:8787/api/iam`.

## Security

- Anyone with relay URL + your Pusher **key** can attempt traffic; **tunnel key** in messages reduces casual abuse.
- Do **not** expose live IAM (`allowLive: true`) on a public relay without extra auth.
- Prefer `ALLOW_IAM=0` on the gateway when demoing through Pusher.

## React app

Point Vite proxy at the relay, or set a custom API base — tunnel URL is your deployed relay, not Pusher’s hostname directly.
