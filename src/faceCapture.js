/** Nafath 12 / FaceAuthViewModel-style face JPEG: 600×800, ≤65 KiB before base64 */

export const FACE_WIDTH = 600;
export const FACE_HEIGHT = 800;
export const FACE_MAX_JPEG_BYTES = 65 * 1024;
/** On-device wire JPEG center face region (calibrated from real Nafath capture). */
export const DEVICE_TARGET_CENTER_LUMA = 91;

export const FLASH_PULSES = 3;
export const FLASH_MS = 450;
export const FLASH_STABLE_MS = 500;

function cropDrawSource(ctx, source, w, h) {
  const sw = source.videoWidth ?? source.naturalWidth ?? source.width;
  const sh = source.videoHeight ?? source.naturalHeight ?? source.height;
  if (!sw || !sh) throw new Error("Image source not ready");

  const targetRatio = w / h;
  const srcRatio = sw / sh;
  let sx = 0;
  let sy = 0;
  let cw = sw;
  let ch = sh;
  if (srcRatio > targetRatio) {
    cw = Math.round(sh * targetRatio);
    sx = Math.floor((sw - cw) / 2);
  } else if (srcRatio < targetRatio) {
    ch = Math.round(sw / targetRatio);
    sy = Math.floor((sh - ch) / 2);
  }
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, w, h);
}

function sampleCenterLuma(ctx, w, h) {
  const rw = Math.floor(w * 0.45);
  const rh = Math.floor(h * 0.5);
  const x = Math.floor((w - rw) / 2);
  const y = Math.floor((h - rh) / 2);
  const data = ctx.getImageData(x, y, rw, rh).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i] + data[i + 1] + data[i + 2];
  }
  return sum / (data.length / 4) / 3;
}

function applyBrightness(ctx, w, h, factor) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * factor);
    d[i + 1] = Math.min(255, d[i + 1] * factor);
    d[i + 2] = Math.min(255, d[i + 2] * factor);
  }
  ctx.putImageData(img, 0, 0);
}

/** Match naf12 device JPEG tone (darker center ~91 vs over-bright still uploads). */
function applyDeviceTone(ctx, w, h, target = DEVICE_TARGET_CENTER_LUMA) {
  const current = sampleCenterLuma(ctx, w, h);
  if (current < 1) return;
  let factor = target / current;
  factor = Math.max(0.48, Math.min(1.02, factor));
  if (Math.abs(factor - 1) < 0.015) return;
  applyBrightness(ctx, w, h, factor);
  applyContrast(ctx, w, h, 0.94);
}

function applyContrast(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, Math.max(0, (d[i] - 128) * amount + 128));
    d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - 128) * amount + 128));
    d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - 128) * amount + 128));
  }
  ctx.putImageData(img, 0, 0);
}

export function canvasToFaceJpeg(canvas) {
  let q = 0.92;
  let dataUrl = "";
  let bytes = 0;
  while (q >= 0.05) {
    dataUrl = canvas.toDataURL("image/jpeg", q);
    bytes = Math.round((dataUrl.length * 3) / 4);
    if (bytes <= FACE_MAX_JPEG_BYTES) break;
    q -= 0.05;
  }
  return {
    b64: dataUrl.split(",")[1],
    bytes,
    quality: q,
    preview: dataUrl,
    width: FACE_WIDTH,
    height: FACE_HEIGHT,
  };
}

/**
 * Draw source to 600×800 canvas, optional screen-flash liveness baked into pixels, then JPEG compress.
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} drawBase
 * @param {HTMLCanvasElement} canvas
 * @param {{ applyFlash?: boolean, onFlashPulse?: (n: number) => void }} [opts]
 */
export async function prepareFaceJpegFromDraw(drawBase, canvas, opts = {}) {
  const { applyFlash = true, onFlashPulse } = opts;
  const w = FACE_WIDTH;
  const h = FACE_HEIGHT;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  const redraw = () => {
    ctx.clearRect(0, 0, w, h);
    drawBase(ctx, w, h);
  };

  if (applyFlash) {
    const lumas = [];
    for (let i = 1; i <= FLASH_PULSES; i += 1) {
      redraw();
      const alpha = 0.22 + (i / FLASH_PULSES) * 0.68;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(0, 0, w, h);
      lumas.push(sampleCenterLuma(ctx, w, h));
      onFlashPulse?.(i);
      await new Promise((r) => setTimeout(r, FLASH_MS));
    }
    redraw();
    applyDeviceTone(ctx, w, h);
    await new Promise((r) => setTimeout(r, FLASH_STABLE_MS));
  } else {
    redraw();
    applyDeviceTone(ctx, w, h);
  }

  return canvasToFaceJpeg(canvas);
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

export async function prepareFaceJpegFromFile(file, canvas, opts = {}) {
  const img = await loadImageFromFile(file);
  return prepareFaceJpegFromDraw((ctx) => cropDrawSource(ctx, img, FACE_WIDTH, FACE_HEIGHT), canvas, opts);
}

/** Live camera frame — same wire format as naf12 / FaceAuthViewModel. */
export async function captureFaceJpegFromVideo(video, canvas, opts = {}) {
  if (!video?.videoWidth) throw new Error("Camera not ready");
  return prepareFaceJpegFromDraw((ctx) => cropDrawSource(ctx, video, FACE_WIDTH, FACE_HEIGHT), canvas, opts);
}

export function analyzeFrameBrightness(video, oval) {
  const c = document.createElement("canvas");
  const size = 64;
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.drawImage(video, oval.x, oval.y, oval.w, oval.h, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
  return sum / (data.length / 4) / 3;
}
