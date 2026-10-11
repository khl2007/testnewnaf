import { useCallback, useEffect, useRef, useState } from "react";
import {
  FLASH_PULSES,
  prepareFaceJpegFromFile,
  captureFaceJpegFromVideo,
} from "../faceCapture";

const AR_READY = "الوجه جاهز للالتقاط ، قم بضغط الزر";
const AR_FLASH = "لا تتحرك أثناء الوميض";
const AR_PICK = "اختر صورة ثم شغّل التحقق بالوميض";

/**
 * Lab face picker: preview → screen-flash liveness (baked into 600×800 JPEG ≤65 KiB) → base64.
 * Optional live camera mode matches the Face tab shutter path.
 */
export function FaceFlashCapture({
  disabled,
  busy,
  onCaptured,
  onError,
  mode = "file",
  cameraReady = true,
}) {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [phase, setPhase] = useState("pick");
  const [flashPulse, setFlashPulse] = useState(0);
  const [hint, setHint] = useState(mode === "file" ? AR_PICK : AR_READY);
  const [processing, setProcessing] = useState(false);

  const runFileFlash = useCallback(
    async (file) => {
      if (!file || !canvasRef.current) return;
      setProcessing(true);
      setPhase("flash");
      setHint(AR_FLASH);
      setFlashPulse(0);
      try {
        const out = await prepareFaceJpegFromFile(file, canvasRef.current, {
          applyFlash: true,
          onFlashPulse: (i) => setFlashPulse(i),
        });
        setFlashPulse(0);
        setPhase("done");
        onCaptured(out.b64, out);
      } catch (e) {
        onError?.(e.message || String(e));
        setPhase("pick");
        setHint(AR_PICK);
      } finally {
        setProcessing(false);
      }
    },
    [onCaptured, onError],
  );

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    runFileFlash(file);
    e.target.value = "";
  };

  const runCameraFlash = useCallback(async () => {
    const video = videoRef.current;
    if (!video?.srcObject || !canvasRef.current) return;
    setProcessing(true);
    setPhase("flash");
    setHint(AR_FLASH);
    setFlashPulse(0);
    try {
      const out = await captureFaceJpegFromVideo(video, canvasRef.current, {
        applyFlash: true,
        onFlashPulse: (i) => setFlashPulse(i),
      });
      setFlashPulse(0);
      onCaptured(out.b64, out);
    } catch (e) {
      onError?.(e.message || String(e));
      setPhase("ready");
      setHint(AR_READY);
    } finally {
      setProcessing(false);
    }
  }, [onCaptured, onError]);

  useEffect(() => {
    if (mode !== "camera") return undefined;
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
          setPhase("ready");
          setHint(AR_READY);
        }
      } catch (e) {
        onError?.(e.message || String(e));
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode, onError]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const blocked = disabled || busy || processing;
  const flashOn = flashPulse > 0;

  return (
    <div className="nf-face-flash">
      <div className={`nf-face-flash-stage${flashOn ? " nf-face-flash-stage--flash" : ""}`}>
        {mode === "camera" ? (
          <video ref={videoRef} className="nf-face-flash-video" playsInline muted />
        ) : previewUrl ? (
          <img src={previewUrl} alt="" className="nf-face-flash-preview" />
        ) : (
          <div className="nf-face-flash-placeholder">
            <span className="nf-muted">600×800 · flash liveness · ≤65 KiB</span>
          </div>
        )}
        <div className="nf-face-flash-ring" aria-hidden />
      </div>

      <p className="nf-hint nf-face-flash-hint" dir="rtl">
        {hint}
      </p>

      {mode === "file" ? (
        <label className="nf-field nf-face-flash-pick">
          <span className="nf-title">{processing ? "…" : "Choose image"}</span>
          <input type="file" accept="image/*" disabled={blocked} onChange={onFileChange} />
        </label>
      ) : (
        <button
          type="button"
          className="nf-btn nf-face-flash-shutter"
          disabled={blocked || !cameraReady || phase !== "ready"}
          onClick={runCameraFlash}
        >
          {processing ? "…" : "Capture with flash"}
        </button>
      )}

      {phase === "flash" && flashPulse ? (
        <p className="nf-muted">
          Flash {flashPulse}/{FLASH_PULSES}
        </p>
      ) : null}

      <canvas ref={canvasRef} className="nf-face-flash-canvas" aria-hidden />
    </div>
  );
}
