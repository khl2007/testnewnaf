import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeFrameBrightness, captureFaceJpegFromVideo } from "./faceCapture";

const AR_READY = "الوجه جاهز للالتقاط ، قم بضغط الزر";
const AR_CENTER = "الوجه غير متمركز";
const AR_CLOSE = "اقترب من الكاميرا";
const AR_FLASH = "لا تتحرك أثناء الوميض";

const THRESHOLDS = {
  minFill: 0.42,
  maxFill: 0.88,
  maxCenterOff: 0.14,
  maxEuler: 18,
  flashPulses: 3,
  flashMs: 450,
  stableMs: 500,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function formatTimer(totalSec) {
  const s = Math.max(0, totalSec);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  const cs = String(Math.floor((s % 1) * 100)).padStart(2, "0");
  return `${mm}:${ss}.${cs}`;
}

function guideSquare(vw, vh) {
  const size = Math.min(vw, vh) * 0.62;
  return {
    x: (vw - size) / 2,
    y: vh * 0.14,
    w: size,
    h: size,
  };
}

export default function FaceLivenessSimulator() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const faceDetectorRef = useRef(null);
  const flashRanRef = useRef(false);
  const startMsRef = useRef(Date.now());

  const [cameraError, setCameraError] = useState("");
  const [gates, setGates] = useState({ ok: false });
  const [phase, setPhase] = useState("align");
  const [flashPulse, setFlashPulse] = useState(0);
  const [hint, setHint] = useState(AR_CENTER);
  const [elapsed, setElapsed] = useState(0);
  const [capturing, setCapturing] = useState(false);

  const startCamera = useCallback(async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      await v.play();
      startMsRef.current = Date.now();
      setPhase("align");
    } catch (e) {
      setCameraError(String(e.message || e));
    }
  }, []);

  const stopCamera = useCallback(() => {
    const v = videoRef.current;
    if (v?.srcObject) {
      v.srcObject.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
    cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if ("FaceDetector" in window) {
      try {
        faceDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      } catch {
        faceDetectorRef.current = null;
      }
    }
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const evaluateGates = useCallback((m) => {
    const sizeOk = m.fill >= THRESHOLDS.minFill && m.fill <= THRESHOLDS.maxFill;
    const centerOk =
      Math.abs(m.offX) <= THRESHOLDS.maxCenterOff && Math.abs(m.offY) <= THRESHOLDS.maxCenterOff;
    const eulerOk =
      Math.abs(m.eulerX) <= THRESHOLDS.maxEuler &&
      Math.abs(m.eulerY) <= THRESHOLDS.maxEuler &&
      Math.abs(m.eulerZ) <= THRESHOLDS.maxEuler;
    let hintText = AR_CENTER;
    if (!sizeOk) hintText = m.fill < THRESHOLDS.minFill ? AR_CLOSE : AR_CENTER;
    else if (!centerOk || !eulerOk) hintText = AR_CENTER;
    else hintText = AR_READY;
    return { ok: sizeOk && centerOk && eulerOk, hint: hintText };
  }, []);

  const runFlashLiveness = useCallback(async () => {
    setPhase("flash");
    setHint(AR_FLASH);
    for (let i = 1; i <= THRESHOLDS.flashPulses; i += 1) {
      setFlashPulse(i);
      await new Promise((r) => setTimeout(r, THRESHOLDS.flashMs));
    }
    setFlashPulse(0);
    await new Promise((r) => setTimeout(r, THRESHOLDS.stableMs));
    setPhase("ready");
    setHint(AR_READY);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video?.srcObject) return;

    const tick = async () => {
      if (!video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      setElapsed((Date.now() - startMsRef.current) / 1000);

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const guide = guideSquare(vw, vh);

      let fill = 0.2;
      let offX = 0.2;
      let offY = 0.2;
      let eulerX = 0;
      let eulerY = 0;
      let eulerZ = 0;

      if (faceDetectorRef.current) {
        try {
          const faces = await faceDetectorRef.current.detect(video);
          if (faces?.length) {
            const box = faces[0].boundingBox;
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            const gcx = guide.x + guide.w / 2;
            const gcy = guide.y + guide.h / 2;
            fill = clamp((box.width * box.height) / (guide.w * guide.h), 0, 1.2);
            offX = clamp((cx - gcx) / guide.w, -0.5, 0.5);
            offY = clamp((cy - gcy) / guide.h, -0.5, 0.5);
            eulerX = clamp((cx - gcx) / 12, -25, 25);
            eulerY = clamp((cy - gcy) / 12, -25, 25);
          }
        } catch {
          const bright = analyzeFrameBrightness(video, guide);
          fill = clamp(bright / 180, 0.15, 0.85);
        }
      } else {
        const bright = analyzeFrameBrightness(video, guide);
        fill = clamp(bright / 180, 0.15, 0.85);
        offX = 0;
        offY = 0;
      }

      const g = evaluateGates({ fill, offX, offY, eulerX, eulerY, eulerZ });
      setGates(g);
      if (phase === "align" || phase === "ready") setHint(g.hint);

      if (g.ok && phase === "align" && !flashRanRef.current) {
        flashRanRef.current = true;
        runFlashLiveness();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [evaluateGates, phase, runFlashLiveness]);

  const onCapture = async () => {
    if (!gates.ok || phase !== "ready") return;
    setCapturing(true);
    try {
      const out = await captureFaceJpegFromVideo(videoRef.current, canvasRef.current, {
        applyFlash: true,
        onFlashPulse: setFlashPulse,
      });
      const a = document.createElement("a");
      a.href = out.preview;
      a.download = "face.capture.jpg";
      a.click();
    } catch {
      setHint(AR_CENTER);
    } finally {
      setCapturing(false);
    }
  };

  const onCancel = () => {
    stopCamera();
    window.location.reload();
  };

  const livenessTotal = 7;
  const remaining = Math.max(0, livenessTotal - elapsed);
  const progress = clamp(elapsed / livenessTotal, 0, 1);

  const shutterEnabled = gates.ok && phase === "ready" && !capturing;

  return (
    <div className="phone">
      <div className={`camera-stage ${flashPulse ? "flash-on" : ""}`}>
        <video ref={videoRef} playsInline muted className="video" />
        <div className="guide-circle" aria-hidden="true" />
        {cameraError && <p className="camera-error">{cameraError}</p>}
      </div>

      <div className="bottom-sheet">
        <p className="hint-ar">{phase === "flash" ? AR_FLASH : hint}</p>

        <div className="timer-row">
          <span className="timer-label">{formatTimer(elapsed)}</span>
          <div className="timer-capsule">
            <div className="timer-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="timer-label">{formatTimer(remaining)}</span>
        </div>

        <button
          type="button"
          className={`shutter ${shutterEnabled ? "" : "shutter-disabled"}`}
          onClick={onCapture}
          disabled={!shutterEnabled}
          aria-label="Capture"
        />
      </div>

      <button type="button" className="cancel-bar" onClick={onCancel}>
        إلغاء
      </button>

      <canvas ref={canvasRef} className="hidden-canvas" aria-hidden="true" />
    </div>
  );
}
