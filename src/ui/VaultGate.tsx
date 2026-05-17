import { Camera, ImageUp, Lock, ShieldCheck, Upload as UploadIcon, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { StoredVaultState } from "../storage/indexedDb";
import type { StatusMessage } from "./common";
import { Button, Input, Modal, Switch, Upload } from "./metis";
import { createQrDetector, decodeQrImage, firstQrValue, hasQrScannerSupport } from "./qrScanner";

export interface VaultGateSubmitOptions {
  readonly passphrase: string;
  readonly rememberDevice: boolean;
  readonly syncSettingsPackage?: string;
}

interface SyncSettingsFile {
  readonly name: string;
  readonly content?: string;
  readonly loading: boolean;
}

export function VaultGate(props: {
  readonly state: StoredVaultState;
  readonly status: StatusMessage;
  readonly onSubmit: (options: VaultGateSubmitOptions) => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [syncSettingsFile, setSyncSettingsFile] = useState<SyncSettingsFile>();
  const [fileError, setFileError] = useState("");
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const mode = gateMode(props.state);
  const submit = () => {
    setSubmitting(true);
    props.onSubmit({
      passphrase,
      rememberDevice,
      syncSettingsPackage: syncSettingsFile?.content,
    }).finally(() => setSubmitting(false));
  };
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-background)] px-4 py-8 text-[var(--color-text)]">
      <section className="w-full max-w-md space-y-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <GateHeader mode={mode} />
        {props.status.text && <p className={`text-sm ${props.status.tone === "error" ? "text-red-600" : "text-[var(--color-text-secondary)]"}`}>{props.status.text}</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <PasswordField value={passphrase} onChange={setPassphrase} />
          {mode === "create" && (
            <SyncSettingsImportPicker
              file={syncSettingsFile}
              fileError={fileError}
              openQrScanner={() => setQrScannerOpen(true)}
              clear={() => clearSyncSettingsFile(setSyncSettingsFile, setFileError)}
              select={(file) => selectSyncSettingsFile(file, setSyncSettingsFile, setFileError)}
              selectQrImage={(file) => selectSyncSettingsQrImage(file, setSyncSettingsFile, setFileError)}
            />
          )}
          <RememberPassphrase checked={rememberDevice} onChange={setRememberDevice} />
          <Button className="w-full sm:w-auto" variant="primary" disabled={syncSettingsFile?.loading} loading={submitting} onClick={submit}>
            {submitLabel(mode, syncSettingsFile)}
          </Button>
        </div>
        {mode === "create" && (
          <SyncSettingsQrScanner
            open={qrScannerOpen}
            close={() => setQrScannerOpen(false)}
            apply={(content) => applySyncSettingsQr(content, setSyncSettingsFile, setFileError, setQrScannerOpen)}
            setError={setFileError}
          />
        )}
      </section>
    </main>
  );
}

function GateHeader({ mode }: { readonly mode: VaultMode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        {mode === "unlock" ? <Lock size={20} /> : <ShieldCheck size={20} />}
      </span>
      <div>
        <h1 className="text-lg font-semibold">{modeTitle(mode)}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{modeDescription(mode)}</p>
      </div>
    </div>
  );
}

function PasswordField(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="block w-full sm:col-span-2">
      <span className="label">账本口令</span>
      <Input className="mt-2 w-full" type="password" value={props.value} onChange={(value) => props.onChange(String(value))} />
    </label>
  );
}

function SyncSettingsImportPicker(props: {
  readonly file?: SyncSettingsFile;
  readonly fileError: string;
  readonly openQrScanner: () => void;
  readonly clear: () => void;
  readonly select: (file: File) => string;
  readonly selectQrImage: (file: File) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
      <Upload accept="application/json" beforeUpload={props.select} maxCount={1} showUploadList={false}>
        <Button aria-label="导入同步源配置" title="导入同步源配置"><UploadIcon size={16} /></Button>
      </Upload>
      <Button aria-label="扫描二维码" title="扫描二维码" onClick={props.openQrScanner}><Camera size={16} /></Button>
      <Upload accept="image/*" beforeUpload={props.selectQrImage} maxCount={1} showUploadList={false}>
        <Button aria-label="导入二维码图片" title="导入二维码图片"><ImageUp size={16} /></Button>
      </Upload>
      {props.file && <SelectedSyncSettingsFile file={props.file} clear={props.clear} />}
      {props.fileError && <span className="text-sm text-red-600">{props.fileError}</span>}
    </div>
  );
}

function SyncSettingsQrScanner(props: {
  readonly open: boolean;
  readonly close: () => void;
  readonly apply: (content: string) => void;
  readonly setError: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!props.open) return undefined;
    return startQrCamera(videoRef, props.apply, props.setError);
  }, [props.open, props.apply, props.setError]);
  return (
    <Modal centered open={props.open} title="扫描同步源二维码" footer={<Button onClick={props.close}>关闭</Button>} onCancel={props.close}>
      <div className="space-y-3">
        {hasQrScannerSupport()
          ? <video ref={videoRef} className="aspect-square w-full rounded-lg bg-black object-cover" muted playsInline />
          : <p className="text-sm text-[var(--color-text-secondary)]">当前浏览器不支持摄像头二维码识别，请使用“导入二维码图片”。</p>}
      </div>
    </Modal>
  );
}

function RememberPassphrase(props: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <Switch checked={props.checked} onChange={props.onChange} />
      记住本设备
    </label>
  );
}

function SelectedSyncSettingsFile(props: {
  readonly file: SyncSettingsFile;
  readonly clear: () => void;
}) {
  const label = props.file.loading ? "正在读取同步配置" : props.file.name;
  return (
    <span className="flex min-h-9 items-center gap-2 text-sm text-[var(--color-text-secondary)]">
      <span className="max-w-56 truncate">{label}</span>
      <Button aria-label="移除同步配置" title="移除同步配置" onClick={props.clear}><X size={14} /></Button>
    </span>
  );
}

function selectSyncSettingsFile(
  file: File,
  setFile: (value: SyncSettingsFile) => void,
  setFileError: (value: string) => void,
): string {
  setFile({ name: file.name, loading: true });
  file.text()
    .then((content) => setFile({ name: file.name, content, loading: false }))
    .then(() => setFileError(""))
    .catch((error: unknown) => setFileError(error instanceof Error ? error.message : "读取同步配置失败"));
  return Upload.LIST_IGNORE;
}

function selectSyncSettingsQrImage(
  file: File,
  setFile: (value: SyncSettingsFile) => void,
  setFileError: (value: string) => void,
): string {
  setFile({ name: file.name, loading: true });
  decodeQrImage(file)
    .then((content) => setFile({ name: "二维码同步配置", content, loading: false }))
    .then(() => setFileError(""))
    .catch((error: unknown) => setFileError(error instanceof Error ? error.message : "读取二维码失败"));
  return Upload.LIST_IGNORE;
}

function applySyncSettingsQr(
  content: string,
  setFile: (value: SyncSettingsFile) => void,
  setFileError: (value: string) => void,
  setQrScannerOpen: (value: boolean) => void,
): void {
  setFile({ name: "二维码同步配置", content, loading: false });
  setFileError("");
  setQrScannerOpen(false);
}

function startQrCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  apply: (content: string) => void,
  setError: (value: string) => void,
): () => void {
  const controller = new AbortController();
  openQrCamera(videoRef, apply, setError, controller.signal);
  return () => controller.abort();
}

async function openQrCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  apply: (content: string) => void,
  setError: (value: string) => void,
  signal: AbortSignal,
): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
    await scanQrStream(videoRef, stream, apply, signal);
  } catch (error) {
    setError(error instanceof Error ? error.message : "无法打开摄像头");
  }
}

async function scanQrStream(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream,
  apply: (content: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const video = requireVideo(videoRef);
  video.srcObject = stream;
  await video.play();
  const detector = createQrDetector();
  await scanQrFrames(video, detector, apply, signal);
  stopStream(stream);
}

async function scanQrFrames(
  video: HTMLVideoElement,
  detector: ReturnType<typeof createQrDetector>,
  apply: (content: string) => void,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const values = await detector.detect(video);
    if (values.length > 0) return apply(firstQrValue(values));
    await delay(250);
  }
}

function requireVideo(videoRef: RefObject<HTMLVideoElement | null>): HTMLVideoElement {
  if (!videoRef.current) throw new Error("摄像头画面未就绪");
  return videoRef.current;
}

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clearSyncSettingsFile(
  setFile: (value: SyncSettingsFile | undefined) => void,
  setFileError: (value: string) => void,
): void {
  setFile(undefined);
  setFileError("");
}

type VaultMode = "unlock" | "create" | "migrate";

function gateMode(state: StoredVaultState): VaultMode {
  return state.kind === "encrypted" ? "unlock" : "create";
}

function modeTitle(mode: VaultMode): string {
  return mode === "unlock" ? "解锁 Coinly" : "创建账本";
}

function modeDescription(mode: VaultMode): string {
  return mode === "unlock" ? "输入口令以加载本地账本。" : "先设置本地账本口令。";
}

function submitLabel(mode: VaultMode, syncSettingsFile?: SyncSettingsFile): string {
  return mode === "unlock" ? "解锁账本" : syncSettingsFile?.content ? "导入同步源并创建账本" : "创建账本";
}
