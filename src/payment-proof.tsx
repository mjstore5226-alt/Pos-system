import { useEffect, useId, useRef, useState } from "react";
import { Camera, ScanLine, Upload, ImagePlus, X } from "lucide-react";
import { CameraCapture } from "./camera";

const accept = "image/jpeg,image/png,image/webp";
async function preparePhoto(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("Choose a JPG, PNG or WebP photo up to 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(
      1,
      2400 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Photo processing is unavailable in this browser.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL("image/jpeg", 0.85);
    if (photo.length > 6_900_000)
      throw new Error("This photo is too large. Crop it and try again.");
    return photo;
  } catch (error) {
    if (error instanceof Error && error.name === "EncodingError")
      throw new Error("This file could not be read as a photo.");
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PaymentProof({
  photo,
  reference,
  onPhoto,
  onReference,
  onBusyChange,
  disabled = false,
}: {
  photo: string;
  reference: string;
  onPhoto: (value: string) => void;
  onReference: (value: string) => void;
  onBusyChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const takePhoto = useRef<HTMLInputElement>(null);
  const uploadPhoto = useRef<HTMLInputElement>(null);
  const scanPhoto = useRef<HTMLInputElement>(null);
  const scanSaved = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const locked = useRef(false);
  useEffect(() => {
    onBusyChange(working || camera);
  }, [working, camera, onBusyChange]);
  useEffect(
    () => () => {
      generation.current++;
      onBusyChange(false);
    },
    [onBusyChange],
  );
  function acceptCode(value: string) {
    if (!value.trim() || value.length > 250) {
      setError(
        "This code is not a short payment reference. Enter the transaction reference manually (up to 250 characters).",
      );
      return false;
    }
    onReference(value.trim());
    setError("");
    setNotice(
      "Reference scanned. Confirm the payment in your wallet or terminal.",
    );
    return true;
  }
  async function read(file: File | undefined, scan: boolean) {
    if (!file || locked.current || disabled) return;
    locked.current = true;
    const request = ++generation.current;
    setCamera(false);
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const prepared = await preparePhoto(file);
      let result: string | undefined;
      if (scan) {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        try {
          result = (
            await new BrowserMultiFormatReader().decodeFromImageUrl(prepared)
          ).getText();
        } catch {
          throw new Error(
            "No readable barcode or QR found. Try a clear, close photo with the whole code visible, or type the reference.",
          );
        }
      }
      if (request !== generation.current) return;
      if (result !== undefined && !acceptCode(result)) return;
      onPhoto(prepared);
      if (!scan) setNotice("Photo attached. Save the transaction to keep it.");
    } catch (e) {
      if (request === generation.current)
        setError((e as Error).message || "Could not read this photo.");
    } finally {
      if (request === generation.current) {
        locked.current = false;
        setWorking(false);
      }
    }
  }
  const blocked = disabled || working;
  return (
    <section className="payment-proof" aria-label="Proof of payment">
      <label className="form-group" htmlFor={id}>
        Payment reference / barcode
        <input
          id={id}
          className="form-input"
          maxLength={250}
          disabled={blocked}
          value={reference}
          onChange={(e) => onReference(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Type or scan a transaction reference"
        />
      </label>
      <div className="proof-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={blocked}
          onClick={() => {
            setCamera(false);
            takePhoto.current?.click();
          }}
        >
          <Camera size={17} />
          Take photo
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={blocked}
          onClick={() => {
            setError("");
            setNotice("");
            if (
              window.isSecureContext &&
              typeof navigator.mediaDevices?.getUserMedia === "function"
            )
              setCamera(true);
            else scanPhoto.current?.click();
          }}
        >
          <ScanLine size={17} />
          Scan barcode / QR
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={blocked}
          onClick={() => {
            setCamera(false);
            uploadPhoto.current?.click();
          }}
        >
          <Upload size={17} />
          Upload photo
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={blocked}
          onClick={() => {
            setCamera(false);
            scanSaved.current?.click();
          }}
        >
          <ImagePlus size={17} />
          Scan saved image
        </button>
      </div>
      <input
        ref={takePhoto}
        aria-label="Take payment proof photo"
        type="file"
        accept={accept}
        capture="environment"
        hidden
        onChange={(e) => {
          void read(e.target.files?.[0], false);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadPhoto}
        aria-label="Upload payment proof photo"
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          void read(e.target.files?.[0], false);
          e.target.value = "";
        }}
      />
      <input
        ref={scanPhoto}
        aria-label="Capture barcode photo"
        type="file"
        accept={accept}
        capture="environment"
        hidden
        onChange={(e) => {
          void read(e.target.files?.[0], true);
          e.target.value = "";
        }}
      />
      <input
        ref={scanSaved}
        aria-label="Scan saved barcode image"
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          void read(e.target.files?.[0], true);
          e.target.value = "";
        }}
      />
      <p className="field-hint">
        On Android, Take photo opens the phone camera when supported. Live
        scanning needs HTTPS; on local HTTP, scan a photo instead. Photos are
        resized for storage. Scanning records a reference, not confirmation of
        payment.
      </p>
      {camera && (
        <>
          <CameraCapture
            mode="barcode"
            onClose={() => setCamera(false)}
            onCapture={(value) => {
              acceptCode(value);
              setCamera(false);
            }}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setCamera(false);
              scanPhoto.current?.click();
            }}
          >
            Use phone camera instead
          </button>
        </>
      )}
      {working && <p role="status">{"Reading photo… Please wait."}</p>}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="field-hint" role="status">
          {notice}
        </p>
      )}
      {photo && (
        <div className="receipt-preview">
          <img src={photo} alt="Payment proof preview" />
          <span>Proof attached</span>
          <button
            className="icon-button"
            type="button"
            aria-label="Remove payment proof"
            disabled={blocked}
            onClick={() => {
              onPhoto("");
              setNotice("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
