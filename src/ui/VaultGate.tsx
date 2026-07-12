import { Camera, ChevronDown, ImageUp, Lock, ShieldCheck, Upload as UploadIcon, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { StoredVaultState } from "../storage/indexedDb";
import type { StatusMessage } from "./common";
import { Button, Input, Modal, Switch, Upload } from "./components";
import { createQrDetector, decodeQrImage, firstQrValue, hasQrScannerSupport } from "./qrScanner";

export interface VaultGateSubmitOptions {
  readonly passphrase: string;
  readonly rememberDevice: boolean;
  readonly syncSettingsPackage?: string;
  readonly fullDataPackage?: string;
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
  const [fullDataFile, setFullDataFile] = useState<SyncSettingsFile>();
  const [fileError, setFileError] = useState("");
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const mode = gateMode(props.state);
  const submit = () => {
    setSubmitting(true);
    props.onSubmit({
      passphrase,
      rememberDevice,
      syncSettingsPackage: syncSettingsFile?.content,
      fullDataPackage: fullDataFile?.content,
    }).finally(() => setSubmitting(false));
  };
  return (
    <main className="gate-shell grid min-h-svh place-items-center overflow-hidden px-4 py-8 text-(--color-text)">
      <form
        className="panel relative w-full max-w-md space-y-5 overflow-hidden p-5 sm:p-6"
        aria-labelledby="vault-gate-title"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <GateHeader mode={mode} />
        {props.status.text && (
          <p
            className={`rounded-md px-3 py-2 text-sm ${props.status.tone === "error" ? "bg-(--color-error-soft) text-(--color-error)" : "bg-(--color-surface-muted) text-(--color-text-secondary)"}`}
            role={props.status.tone === "error" ? "alert" : "status"}
            aria-live={props.status.tone === "error" ? "assertive" : "polite"}
          >
            {props.status.text}
          </p>
        )}
        <div className="grid gap-4">
          <PasswordField mode={mode} value={passphrase} onChange={setPassphrase} />
          {mode === "create" && <RecoverySection open={recoveryOpen} toggle={() => setRecoveryOpen((value) => !value)} />}
          {mode === "create" && recoveryOpen && (
            <div id="vault-recovery-options" className="rounded-md border border-(--color-border) bg-(--color-surface-muted) p-3">
              <p className="text-sm text-(--color-text-secondary)">可导入完整账本，或恢复同步源配置。</p>
              <SyncSettingsImportPicker
                file={syncSettingsFile}
                fullDataFile={fullDataFile}
                fileError={fileError}
                openQrScanner={() => setQrScannerOpen(true)}
                clear={() => clearSyncSettingsFile(setSyncSettingsFile, setFileError)}
                clearFullData={() => clearSyncSettingsFile(setFullDataFile, setFileError)}
                select={(file) => selectSyncSettingsFile(file, setSyncSettingsFile, setFileError)}
                selectFullData={(file) => selectSyncSettingsFile(file, setFullDataFile, setFileError)}
                selectQrImage={(file) => selectSyncSettingsQrImage(file, setSyncSettingsFile, setFileError)}
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-4 border-t border-(--color-border) pt-4">
            <RememberPassphrase checked={rememberDevice} onChange={setRememberDevice} />
            <Button variant="primary" htmlType="submit" disabled={syncSettingsFile?.loading || fullDataFile?.loading} loading={submitting}>
              {submitLabel(mode, syncSettingsFile, fullDataFile)}
            </Button>
          </div>
        </div>
        {mode === "create" && (
          <SyncSettingsQrScanner
            open={qrScannerOpen}
            close={() => setQrScannerOpen(false)}
            apply={(content) => applySyncSettingsQr(content, setSyncSettingsFile, setFileError, setQrScannerOpen)}
            setError={setFileError}
          />
        )}
      </form>
    </main>
  );
}

function GateHeader({ mode }: { readonly mode: VaultMode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-(--color-accent-soft) text-(--color-accent)">
        {mode === "unlock" ? <Lock size={20} /> : <ShieldCheck size={20} />}
      </span>
      <div>
        <h1 id="vault-gate-title" className="text-xl font-semibold text-balance">{modeTitle(mode)}</h1>
        <p className="text-sm text-(--color-text-secondary)">{modeDescription(mode)}</p>
      </div>
    </div>
  );
}

function PasswordField(props: {
  readonly mode: VaultMode;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="block w-full">
      <span className="label">账本口令</span>
      <Input
        className="mt-2 w-full"
        type="password"
        name="passphrase"
        autoComplete={props.mode === "unlock" ? "current-password" : "new-password"}
        required
        value={props.value}
        onChange={(value) => props.onChange(String(value))}
      />
    </label>
  );
}

function RecoverySection(props: { readonly open: boolean; readonly toggle: () => void }) {
  return (
    <button
      className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-1 text-left text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text)"
      type="button"
      aria-expanded={props.open}
      aria-controls="vault-recovery-options"
      onClick={props.toggle}
    >
      <span>从备份恢复</span>
      <ChevronDown className={`transition-transform ${props.open ? "rotate-180" : ""}`} size={17} aria-hidden="true" />
    </button>
  );
}

function SyncSettingsImportPicker(props: {
  readonly file?: SyncSettingsFile;
  readonly fullDataFile?: SyncSettingsFile;
  readonly fileError: string;
  readonly openQrScanner: () => void;
  readonly clear: () => void;
  readonly clearFullData: () => void;
  readonly select: (file: File) => string;
  readonly selectFullData: (file: File) => string;
  readonly selectQrImage: (file: File) => string;
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Upload accept="application/json" beforeUpload={props.selectFullData} maxCount={1} showUploadList={false}>
        <Button className="w-full justify-start" aria-label="导入全量数据文件" title="导入全量数据文件"><UploadIcon size={16} />全量数据</Button>
      </Upload>
      <Upload accept="application/json" beforeUpload={props.select} maxCount={1} showUploadList={false}>
        <Button className="w-full justify-start" aria-label="导入同步源配置" title="导入同步源配置"><UploadIcon size={16} />同步配置</Button>
      </Upload>
      <Button className="w-full justify-start" aria-label="扫描二维码" title="扫描二维码" onClick={props.openQrScanner}><Camera size={16} />扫描二维码</Button>
      <Upload accept="image/*" beforeUpload={props.selectQrImage} maxCount={1} showUploadList={false}>
        <Button className="w-full justify-start" aria-label="导入二维码图片" title="导入二维码图片"><ImageUp size={16} />二维码图片</Button>
      </Upload>
      {props.file && <div className="col-span-2"><SelectedSyncSettingsFile file={props.file} clear={props.clear} /></div>}
      {props.fullDataFile && <div className="col-span-2"><SelectedSyncSettingsFile file={props.fullDataFile} clear={props.clearFullData} /></div>}
      {props.fileError && <span className="col-span-2 text-sm text-red-600">{props.fileError}</span>}
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
          : <p className="text-sm text-(--color-text-secondary)">当前浏览器不支持摄像头二维码识别，请使用“导入二维码图片”。</p>}
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
      <Switch ariaLabel="记住本设备" checked={props.checked} onChange={props.onChange} />
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
    <span className="flex min-h-9 items-center gap-2 text-sm text-(--color-text-secondary)">
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

function submitLabel(mode: VaultMode, syncSettingsFile?: SyncSettingsFile, fullDataFile?: SyncSettingsFile): string {
  if (mode === "unlock") return "解锁账本";
  if (fullDataFile?.content) return "导入全量数据并创建账本";
  if (syncSettingsFile?.content) return "导入同步源并创建账本";
  return "创建账本";
}
