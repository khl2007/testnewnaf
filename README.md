# Lab-only React PoC — Nafath face flow (127.0.0.1, own photo only)

## Login + GetSpRequests simulator

Two terminals:

```powershell
npm install
npm run gateway   # http://127.0.0.1:8787 — live IAM allowed by default
npm run dev       # http://127.0.0.1:5173 — tab "Login + SP requests"
```

Vite proxies `/api/*` → gateway. Flow: **Nationalities** (optional) → **SubmitLogin** → **SubmitOtp** → **SubmitPinActivation** → **SubmitFaceActivation** → **GetSpRequests** (once or poll).

The UI always requests **live IAM** when the gateway allows it. Mock-only gateway: `$env:ALLOW_IAM=0; npm run gateway`.

## Face liveness simulator

`npm run dev` → **http://127.0.0.1:5173** → tab **Face liveness**

Mobile-style UI like Nafath Face: camera + **circle** guide, white bottom sheet, Arabic hint, timer bar, black shutter, **إلغاء**. Camera permission runs **automatically** on load. Flash liveness runs when alignment passes; shutter downloads **600×800** JPEG (≤65 KiB).

Does **not** call `iam.gov.sa`.

---

Mirrors reversed envelope `POST /. {Action, Parameters}` (legacy mock tab removed from UI; mock still in repo):
- `SubmitLogin` (`o/getMaxWidthimpl`) -> fake `{transId,token,id}`
- `SubmitFaceActivation` (`o/getShadowElevation`, `PaddingElement.FACE`) -> accepts ANY base64 (vulnerable by design for lab)

## Run
```powershell
npm install
npm run mock   # terminal 1 -> http://127.0.0.1:8080/.
npm run dev    # terminal 2 -> http://127.0.0.1:5173
```

1. Click Run Step-1.
2. Tick consent (your own photo only), choose image -> auto resize 600x800 + JPEG shrink to <65KB + base64 (like `FaceAuthViewModel`).
3. Click Run Step-2. Mock logs `ACCEPTED (no liveness)` — proves bearer triple alone is enough in vulnerable design.

## Rules
- Localhost only. Never point at `iam.gov.sa` / production.
- Only your own face image.
- To demo the fix, require server nonce + multi-frame challenge + `Play Integrity`, reject single stills.
