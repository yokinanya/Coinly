import { Download, Trash2, Upload as UploadIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { AppData, SyncSettings, SyncTarget } from "../domain/types";
import {
  clearStoredVault,
  exportData,
  previewImportData,
} from "../storage/indexedDb";
import type { DataSummary, ImportPreview } from "../storage/indexedDb";
import { forceSyncTargets, normalizeSyncSettings, type SyncResult } from "../sync/syncClient";
import { exportSyncSettingsPackage } from "../sync/syncSettingsPackage";
import { syncSettingsQrDataUrl } from "../sync/syncSettingsQr";
import { clearRememberedDevice, lockVault } from "../storage/vaultSession";
import { ConfirmDialog } from "./common";
import { Button, Checkbox, Modal, Upload } from "./components";
import { DataSecurityPanel } from "./DataSecurityPanel";
import { SettingsSection } from "./settingsSection";
import { targetIdentity } from "./syncTargetHelpers";
import { SyncResolutionPanel, type SyncResolution } from "./syncResolutionPanel";

export function DataVaultPanel(props: {
  readonly data: AppData;
  readonly token: import("../storage/indexedDb").SaveToken;
  readonly setData: (data: AppData | undefined) => void;
  readonly setMessage: (value: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [preview, setPreview] = useState<ImportPreview>();
  const [exportingSync, setExportingSync] = useState(false);
  const [selectedSyncTarget, setSelectedSyncTarget] = useState<string>();
  const [resolution, setResolution] = useState<SyncResolution>();
  return (
    <SettingsSection title="数据管理">
      <div className="space-y-4">
        <DataSecurityPanel data={props.data} token={props.token} setMessage={props.setMessage} />
        <VaultActions
          {...props}
          setPreview={setPreview}
          setConfirmClear={setConfirmClear}
          openSyncExport={() => openSyncExport(props.data, setSelectedSyncTarget, setExportingSync)}
        />
      </div>
      <ImportPreviewModal preview={preview} clear={() => setPreview(undefined)} setData={props.setData} setMessage={props.setMessage} />
      <SyncSettingsExportModal
        data={props.data}
        open={exportingSync}
        selected={selectedSyncTarget}
        setSelected={setSelectedSyncTarget}
        close={() => setExportingSync(false)}
        setResolution={setResolution}
        setMessage={props.setMessage}
      />
      <SyncResolutionPanel resolution={resolution} data={props.data} settings={props.data.syncSettings ?? { enabled: true, targets: [] }} applyRemote={props.setData} clear={() => setResolution(undefined)} setMessage={props.setMessage} />
      <ConfirmDialog open={confirmClear} title="确认清空数据" description="这会删除当前账本里的账户、分类、标签、交易、预算、订阅规则、账期和应用设置，并恢复为初始数据。" onCancel={() => setConfirmClear(false)} onConfirm={() => clearData(props, setConfirmClear)} />
    </SettingsSection>
  );
}

function VaultActions(props: {
  readonly data: AppData;
  readonly setMessage: (value: string) => void;
  readonly setPreview: (preview: ImportPreview) => void;
  readonly setConfirmClear: (open: boolean) => void;
  readonly openSyncExport: () => void;
}) {
  const uploadBackup = (file: File) => {
    file.text()
      .then(previewImportData)
      .then(props.setPreview)
      .catch((error: unknown) => props.setMessage(error instanceof Error ? error.message : "导入预览失败"));
    return Upload.LIST_IGNORE;
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => exportData(props.data).then((json) => downloadJson(json, "coinly-data.enc.json"))}><Download size={16} />导出加密备份</Button>
      <Button onClick={props.openSyncExport}><Download size={16} />导出同步配置</Button>
      <Upload accept="application/json" beforeUpload={uploadBackup} maxCount={1} showUploadList={false}>
        <Button icon={<UploadIcon size={16} />}>导入账本</Button>
      </Upload>
      <Button variant="danger" onClick={() => props.setConfirmClear(true)}><Trash2 size={16} />清空数据</Button>
    </div>
  );
}

function openSyncExport(
  data: AppData,
  setSelected: (value: string | undefined) => void,
  setOpen: (value: boolean) => void,
): void {
  const targets = normalizeSyncSettings(data.syncSettings)?.targets ?? [];
  setSelected(targets[0] ? targetIdentity(targets[0]) : undefined);
  setOpen(true);
}

function exportSelectedSyncSettings(options: {
  readonly data: AppData;
  readonly target: SyncTarget;
  readonly selected?: string;
  readonly mode: "file" | "qr";
  readonly close: () => void;
  readonly setQrDataUrl: (value: string | undefined) => void;
  readonly setExporting: (value: boolean) => void;
  readonly setResolution: (resolution: SyncResolution) => void;
  readonly setMessage: (value: string) => void;
}): void {
  if (options.selected !== options.target.id && options.selected !== targetIdentity(options.target)) {
    options.setMessage("请选择一个同步源");
    return;
  }
  options.setExporting(true);
  forceSyncTargets(options.data, [options.target])
    .then((result) => handleForcedSyncExport({ ...options, targets: [options.target], result }))
    .catch((error: unknown) => options.setMessage(error instanceof Error ? error.message : "导出同步配置失败"))
    .finally(() => options.setExporting(false));
}

function handleForcedSyncExport(options: {
  readonly data: AppData;
  readonly targets: readonly SyncTarget[];
  readonly result: SyncResult;
  readonly mode: "file" | "qr";
  readonly close: () => void;
  readonly setQrDataUrl: (value: string | undefined) => void;
  readonly setResolution: (resolution: SyncResolution) => void;
  readonly setMessage: (value: string) => void;
}): void {
  if (options.result.status === "remote-newer") throw new Error("云端账本较新，请先同步后再导出配置");
  if (isResolutionResult(options.result)) {
    options.setResolution({ status: options.result.status, remoteData: options.result.remoteData });
    return;
  }
  const settings: SyncSettings = { enabled: true, targets: options.targets.map((target) => ({ ...target, enabled: true })) };
  exportSyncSettingsPackage(settings)
    .then((json) => exportSyncSettingsPayload(json, options))
    .catch((error: unknown) => options.setMessage(error instanceof Error ? error.message : "导出同步配置失败"));
}

function exportSyncSettingsPayload(
  json: string,
  options: {
    readonly mode: "file" | "qr";
    readonly close: () => void;
    readonly setQrDataUrl: (value: string | undefined) => void;
    readonly setMessage: (value: string) => void;
  },
): Promise<void> {
  if (options.mode === "file") {
    downloadJson(json, "coinly-sync-settings.enc.json");
    options.setMessage("同步配置已导出");
    options.close();
    return Promise.resolve();
  }
  return syncSettingsQrDataUrl(json)
    .then(options.setQrDataUrl)
    .then(() => options.setMessage("同步配置二维码已生成"));
}

function isResolutionResult(result: SyncResult): result is SyncResult & SyncResolution {
  return result.status === "remote-conflict" || result.status === "remote-divergent" || result.status === "remote-plaintext";
}

function SyncSettingsExportModal(props: {
  readonly data: AppData;
  readonly open: boolean;
  readonly selected?: string;
  readonly setSelected: (value: string | undefined) => void;
  readonly close: () => void;
  readonly setResolution: (resolution: SyncResolution) => void;
  readonly setMessage: (value: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const targets = useMemo(() => normalizeSyncSettings(props.data.syncSettings)?.targets ?? [], [props.data.syncSettings]);
  const target = targets.find((item) => targetIdentity(item) === props.selected);
  const footer = (
    <div className="flex justify-end gap-2">
      <Button onClick={() => closeSyncExportModal(props.close, setQrDataUrl)}>取消</Button>
      <Button loading={exporting} onClick={() => target && exportSelectedSyncSettings({ ...props, target, mode: "qr", setQrDataUrl, setExporting })}>导出二维码</Button>
      <Button variant="primary" loading={exporting} onClick={() => target && exportSelectedSyncSettings({ ...props, target, mode: "file", setQrDataUrl, setExporting })}>导出文件</Button>
    </div>
  );
  return (
    <Modal centered open={props.open} title="导出同步配置" footer={footer} onCancel={() => closeSyncExportModal(props.close, setQrDataUrl)}>
      <div className="space-y-3">
        {targets.length === 0
          ? <p className="text-sm text-(--color-text-secondary)">暂无同步源。</p>
          : targets.map((target) => (
            <label key={targetIdentity(target)} className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox ariaLabel={`选择同步源 ${target.name || target.provider}`} checked={props.selected === targetIdentity(target)} onChange={() => props.setSelected(targetIdentity(target))} />
              {target.name || target.provider}
            </label>
          ))}
        {qrDataUrl && (
          <div className="space-y-2 rounded-lg border border-(--color-border) bg-(--color-background) p-3">
            <img className="mx-auto h-64 w-64 rounded bg-white p-2" src={qrDataUrl} alt="同步配置二维码" />
            <p className="text-center text-xs text-(--color-text-secondary)">在另一台设备创建账本时扫描此二维码。</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function closeSyncExportModal(close: () => void, setQrDataUrl: (value: string | undefined) => void): void {
  setQrDataUrl(undefined);
  close();
}

function ImportPreviewModal(props: {
  readonly preview?: ImportPreview;
  readonly clear: () => void;
  readonly setData: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}) {
  const footer = props.preview
    ? <div className="flex justify-end gap-2"><Button onClick={props.clear}>取消</Button><Button variant="primary" onClick={() => confirmImport(props)}>替换当前账本</Button></div>
    : undefined;
  return (
    <Modal open={Boolean(props.preview)} title="导入预览" footer={footer} onCancel={props.clear}>
      {props.preview && <SummaryGrid summary={props.preview.summary} />}
    </Modal>
  );
}

function SummaryGrid({ summary }: { readonly summary: DataSummary }) {
  return (
    <div className="grid gap-2 text-sm text-(--color-text-secondary) sm:grid-cols-2 xl:grid-cols-4">
      <span>版本：{summary.schemaVersion}</span>
      <span>更新时间：{new Date(summary.updatedAt).toLocaleString("zh-CN")}</span>
      <span>本地版本：{summary.localVersion}</span>
      <span>币种：{summary.currencies}</span>
      <span>账户：{summary.accounts}</span>
      <span>分类：{summary.categories}</span>
      <span>标签：{summary.tags}</span>
      <span>交易：{summary.transactions}</span>
      <span>预算：{summary.budgets}</span>
      <span>订阅：{summary.recurringRules}</span>
      <span>账期：{summary.statements}</span>
    </div>
  );
}

function confirmImport(props: {
  readonly preview?: ImportPreview;
  readonly clear: () => void;
  readonly setData: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}): void {
  if (!props.preview) return;
  props.setData(props.preview.data);
  props.setMessage("数据已导入");
  props.clear();
}

function clearData(
  props: { readonly setData: (data: AppData | undefined) => void; readonly setMessage: (value: string) => void },
  setConfirmClear: (open: boolean) => void,
): void {
  clearStoredVault()
    .then(() => {
      clearRememberedDevice();
      lockVault();
      props.setData(undefined);
      props.setMessage("数据已清空");
      setConfirmClear(false);
    })
    .catch((error: unknown) => props.setMessage(error instanceof Error ? error.message : "清空数据失败"));
}

function downloadJson(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
