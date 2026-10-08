import { useRef, useState, useEffect } from "react";
import { Camera, X } from "lucide-react";

export function CameraCapture({
  label,
  mode,
  onCapture,
  onClose,
}: {
  label?: string;
  mode: "photo" | "barcode";
  onCapture: (value: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const callback = useRef(onCapture);
  callback.current = onCapture;
  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    let scanner: { stop(): void } | undefined;
    let timeout: ReturnType<typeof setTimeout>;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera access requires HTTPS or localhost. Enter the code manually or use an image upload where available.",
          );
        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (options: object) => {
              detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector;
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          setReady(true);
        }
        if (mode === "barcode" && !Detector) {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (cancelled || !video.current) return;
          let found = false;
          scanner = await new BrowserMultiFormatReader().decodeFromStream(
            stream,
            video.current,
            (result) => {
              if (result && !cancelled && !found) {
                found = true;
                callback.current(result.getText());
              }
            },
          );
          if (cancelled) scanner.stop();
        }
        if (mode === "barcode" && Detector) {
          const detector = new Detector({});
          const scan = async () => {
            if (cancelled || !video.current) return;
            try {
              const codes = await detector.detect(video.current);
              if (codes[0]?.rawValue) {
                if (!cancelled) callback.current(codes[0].rawValue);
                return;
              }
            } catch {
              /* A camera frame may not be ready yet. */
            }
            if (!cancelled) timeout = setTimeout(scan, 400);
          };
          void scan();
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            `Could not start the camera. ${(e as Error).message} Check camera permission, or enter the code manually.`,
          );
          stream?.getTracks().forEach((t) => t.stop());
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      scanner?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);
  function capture() {
    if (!video.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0);
    onCapture(canvas.toDataURL("image/jpeg", 0.85));
  }
  return (
    <div className="camera-box">
      <div>
        <strong>
          {label ||
            (mode === "photo"
              ? "Capture payment receipt"
              : "Point camera at receipt barcode or QR")}
        </strong>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close camera"
        >
          <X size={17} />
        </button>
      </div>
      {error ? (
        <p className="error-box">{error}</p>
      ) : (
        <>
          <video ref={video} muted playsInline />
          {mode === "photo" ? (
            <button
              type="button"
              className="secondary-button full"
              disabled={!ready}
              onClick={capture}
            >
              <Camera size={16} />
              Capture receipt
            </button>
          ) : (
            <p className="field-hint">
              Scanning… Keep the code inside the camera view.
            </p>
          )}
        </>
      )}
    </div>
  );
}
