"use client";

import QRCode from "qrcode";
import { useEffect, useRef } from "react";

export type QrCodeProps = {
  value: string;
  /** Canvas side length in CSS pixels. Default: 200 */
  size?: number;
};

/**
 * Renders a QR code into a <canvas> element using the `qrcode` library.
 * Re-renders whenever `value` or `size` changes.
 * Shows a plain-text fallback on any render error.
 */
export function QrCode({ value, size = 200 }: QrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const errorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const errorEl = errorRef.current;
    if (!canvas) return;

    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(() => {
        if (errorEl) errorEl.textContent = "";
      })
      .catch(() => {
        if (errorEl) errorEl.textContent = value;
      });
  }, [value, size]);

  return (
    <span style={{ display: "inline-block", lineHeight: 0 }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 8 }}
        aria-label="二维码"
        role="img"
      />
      <span
        ref={errorRef}
        style={{
          display: "block",
          fontSize: "0.75rem",
          wordBreak: "break-all",
          color: "var(--color-text-muted)",
          lineHeight: 1.4,
          marginTop: "0.25rem",
        }}
      />
    </span>
  );
}
