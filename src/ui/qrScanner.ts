type BarcodeDetectorInstance = {
  readonly detect: (source: CanvasImageSource) => Promise<readonly { readonly rawValue: string }[]>;
};

type BarcodeDetectorConstructor = new (options: { readonly formats: readonly string[] }) => BarcodeDetectorInstance;

interface BarcodeWindow extends Window {
  readonly BarcodeDetector?: BarcodeDetectorConstructor;
}

const QR_FORMATS = ["qr_code"];

export function hasQrScannerSupport(): boolean {
  return Boolean(barcodeDetectorConstructor());
}

export function createQrDetector(): BarcodeDetectorInstance {
  const Detector = barcodeDetectorConstructor();
  if (!Detector) throw new Error("当前浏览器不支持二维码识别，请上传同步配置文件导入");
  return new Detector({ formats: QR_FORMATS });
}

export async function decodeQrImage(file: File): Promise<string> {
  const detector = createQrDetector();
  const bitmap = await createImageBitmap(file);
  try {
    const values = await detector.detect(bitmap);
    return firstQrValue(values);
  } finally {
    bitmap.close();
  }
}

export function firstQrValue(values: readonly { readonly rawValue: string }[]): string {
  const value = values[0]?.rawValue?.trim();
  if (!value) throw new Error("未识别到同步配置二维码");
  return value;
}

function barcodeDetectorConstructor(): BarcodeDetectorConstructor | undefined {
  return (window as BarcodeWindow).BarcodeDetector;
}
