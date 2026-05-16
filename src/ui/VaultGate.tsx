import { Lock, ShieldCheck, Upload as UploadIcon, X } from "lucide-react";
import { useState } from "react";
import type { StoredVaultState } from "../storage/indexedDb";
import type { StatusMessage } from "./common";
import { Button, Input, Switch, Upload } from "./metis";

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
              clear={() => clearSyncSettingsFile(setSyncSettingsFile, setFileError)}
              select={(file) => selectSyncSettingsFile(file, setSyncSettingsFile, setFileError)}
            />
          )}
          <RememberPassphrase checked={rememberDevice} onChange={setRememberDevice} />
          <Button className="w-full sm:w-auto" variant="primary" disabled={syncSettingsFile?.loading} loading={submitting} onClick={submit}>
            {submitLabel(mode, syncSettingsFile)}
          </Button>
        </div>
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
  readonly clear: () => void;
  readonly select: (file: File) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
      <Upload accept="application/json" beforeUpload={props.select} maxCount={1} showUploadList={false}>
        <Button icon={<UploadIcon size={16} />}>快速导入同步配置</Button>
      </Upload>
      {props.file && <SelectedSyncSettingsFile file={props.file} clear={props.clear} />}
      {props.fileError && <span className="text-sm text-red-600">{props.fileError}</span>}
    </div>
  );
}

function RememberPassphrase(props: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <Switch checked={props.checked} onChange={props.onChange} />
      记住口令
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

function clearSyncSettingsFile(
  setFile: (value: SyncSettingsFile | undefined) => void,
  setFileError: (value: string) => void,
): void {
  setFile(undefined);
  setFileError("");
}

type VaultMode = "unlock" | "create" | "migrate";

function gateMode(state: StoredVaultState): VaultMode {
  if (state.kind === "encrypted") return "unlock";
  if (state.kind === "legacy") return "migrate";
  return "create";
}

function modeTitle(mode: VaultMode): string {
  if (mode === "unlock") return "解锁 Coinly";
  if (mode === "migrate") return "加密旧账本";
  return "创建账本";
}

function modeDescription(mode: VaultMode): string {
  if (mode === "unlock") return "输入口令后才会加载本地账本。";
  if (mode === "migrate") return "设置口令后会把旧明文账本迁移为加密包。";
  return "首次使用需要先设置本地账本口令。";
}

function submitLabel(mode: VaultMode, syncSettingsFile?: SyncSettingsFile): string {
  if (mode === "unlock") return "解锁账本";
  if (mode === "migrate") return "加密旧账本";
  return syncSettingsFile?.content ? "导入并创建账本" : "创建账本";
}
