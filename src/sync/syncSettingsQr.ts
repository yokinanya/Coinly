import QRCode from "qrcode";

const QR_ERROR_CORRECTION_LEVEL = "M";
const QR_MARGIN = 2;
const QR_WIDTH = 320;

export async function syncSettingsQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    margin: QR_MARGIN,
    width: QR_WIDTH,
  });
}
