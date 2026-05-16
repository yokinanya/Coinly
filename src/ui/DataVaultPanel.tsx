import { Download, Trash2, Upload as UploadIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { initialData } from "../domain/factory";
import type { AppData, SyncSettings, SyncTarget } from "../domain/types";
import {
  createBackup,
  deleteBackup,
  exportData,
  listBackups,
  previewImportData,
  readBackupData,
} from "../storage/indexedDb";
import type { BackupRecord, DataSummary, ImportPreview } from "../storage/indexedDb";
import { forceSyncTargets, normalizeSyncSettings, type SyncResult } from "../sync/syncClient";
import { loadDataFromSyncSettings } from "../sync/syncBootstrap";
import { exportSyncSettingsPackage, previewSyncSettingsPackage, type SyncSettingsPreview } from "../sync/syncSettingsPackage";
import { ConfirmDialog } from "./common";
import { Button, Checkbox, List, Modal, Upload } from "./metis";
import { DataSecurityPanel } from "./DataSecurityPanel";
import { FadeIn } from "./motion";
import { SettingsSection } from "./settingsSection";
import { providerLabel, targetIdentity } from "./syncTargetHelpers";
import { SyncResolutionPanel, type SyncResolution } from "./syncResolutionPanel";

export function DataVaultPanel(props: {
  readonly data: AppData;
  readonly token: import("../storage/indexedDb").SaveToken;
  readonly setData: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [preview, setPreview] = useState<ImportPreview>();
  const [backups, setBackups] = useState<readonly BackupRecord[]>([]);
  const [restoring, setRestoring] = useState<BackupRecord>();
  const [deleting, setDeleting] = useState<BackupRecord>();
  const [exportingSync, setExportingSync] = useState(false);
  const [selectedSyncTargets, setSelectedSyncTargets] = useState<readonly string[]>([]);
  const [syncImport, setSyncImport] = useState<SyncImportPreview>();
  const [resolution, setResolution] = useState<SyncResolution>();
  useEffect(() => {
    refreshBackups(setBackups, props.setMessage);
  }, [props.setMessage]);
  return (
    <SettingsSection title="数据管理">
      <div className="space-y-4">
        <DataSecurityPanel data={props.data} token={props.token} setMessage={props.setMessage} />
        <VaultActions
          {...props}
          setPreview={setPreview}
          setBackups={setBackups}
          setConfirmClear={setConfirmClear}
          openSyncExport={() => openSyncExport(props.data, setSelectedSyncTargets, setExportingSync)}
          setSyncImport={setSyncImport}
        />
        <FadeIn><BackupList backups={backups} setRestoring={setRestoring} setDeleting={setDeleting} /></FadeIn>
      </div>
      <ImportPreviewModal preview={preview} clear={() => setPreview(undefined)} setData={props.setData} setMessage={props.setMessage} />
      <RestoreDialog backup={restoring} clear={() => setRestoring(undefined)} setData={props.setData} setMessage={props.setMessage} />
      <DeleteBackupDialog backup={deleting} clear={() => setDeleting(undefined)} setBackups={setBackups} setMessage={props.setMessage} />
      <SyncSettingsExportModal
        data={props.data}
        open={exportingSync}
        selected={selectedSyncTargets}
        setSelected={setSelectedSyncTargets}
        close={() => setExportingSync(false)}
        setResolution={setResolution}
        setMessage={props.setMessage}
      />
      <SyncSettingsImportModal preview={syncImport} clear={() => setSyncImport(undefined)} setData={props.setData} setMessage={props.setMessage} />
      <SyncResolutionPanel resolution={resolution} data={props.data} settings={props.data.syncSettings ?? { enabled: true, targets: [] }} applyRemote={props.setData} clear={() => setResolution(undefined)} setMessage={props.setMessage} />
      <ConfirmDialog open={confirmClear} title="确认清空数据" description="这会删除当前账本里的账户、分类、标签、交易、预算、订阅规则、账期和应用设置，并恢复为初始数据。" onCancel={() => setConfirmClear(false)} onConfirm={() => clearData(props, setConfirmClear)} />
    </SettingsSection>
  );
}

function VaultActions(props: {
  readonly data: AppData;
  readonly setMessage: (value: string) => void;
  readonly setPreview: (preview: ImportPreview) => void;
  readonly setBackups: (backups: readonly BackupRecord[]) => void;
  readonly setConfirmClear: (open: boolean) => void;
  readonly openSyncExport: () => void;
  readonly setSyncImport: (preview: SyncImportPreview) => void;
}) {
  const uploadBackup = (file: File) => {
    file.text()
      .then(previewImportData)
      .then(props.setPreview)
      .catch((error: unknown) => props.setMessage(error instanceof Error ? error.message : "导入预览失败"));
    return Upload.LIST_IGNORE;
  };
  const uploadSyncSettings = (file: File) => {
    const passphrase = window.prompt("请输入同步配置包加密口令");
    if (!passphrase) {
      props.setMessage("同步配置导入已取消");
      return Upload.LIST_IGNORE;
    }
    file.text()
      .then((value) => previewSyncSettingsPackage(value, passphrase))
      .then((preview) => props.setSyncImport({ preview, passphrase }))
      .catch((error: unknown) => props.setMessage(error instanceof Error ? error.message : "同步配置导入预览失败"));
    return Upload.LIST_IGNORE;
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => exportData(props.data).then((json) => downloadJson(json, "coinly-data.enc.json"))}><Download size={16} />导出加密备份</Button>
      <Button onClick={props.openSyncExport}><Download size={16} />导出同步配置</Button>
      <Upload accept="application/json" beforeUpload={uploadSyncSettings} maxCount={1} showUploadList={false}>
        <Button icon={<UploadIcon size={16} />}>导入同步配置</Button>
      </Upload>
      <Upload accept="application/json" beforeUpload={uploadBackup} maxCount={1} showUploadList={false}>
        <Button icon={<UploadIcon size={16} />}>预览导入备份</Button>
      </Upload>
      <Button onClick={() => saveBackup(props.data, props.setBackups, props.setMessage)}>创建备份</Button>
      <Button variant="danger" onClick={() => props.setConfirmClear(true)}><Trash2 size={16} />清空数据</Button>
    </div>
  );
}

function openSyncExport(
  data: AppData,
  setSelected: (values: readonly string[]) => void,
  setOpen: (value: boolean) => void,
): void {
  const targets = normalizeSyncSettings(data.syncSettings)?.targets ?? [];
  setSelected(targets.map(targetIdentity));
  setOpen(true);
}

function exportSelectedSyncSettings(options: {
  readonly data: AppData;
  readonly targets: readonly SyncTarget[];
  readonly selected: readonly string[];
  readonly close: () => void;
  readonly setExporting: (value: boolean) => void;
  readonly setResolution: (resolution: SyncResolution) => void;
  readonly setMessage: (value: string) => void;
}): void {
  const targets = options.targets.filter((target) => options.selected.includes(targetIdentity(target)));
  if (targets.length === 0) {
    options.setMessage("请选择要导出的同步提供方");
    return;
  }
  options.setExporting(true);
  forceSyncTargets(options.data, targets)
    .then((result) => handleForcedSyncExport({ ...options, targets, result }))
    .catch((error: unknown) => options.setMessage(error instanceof Error ? error.message : "导出同步配置失败"))
    .finally(() => options.setExporting(false));
}

function handleForcedSyncExport(options: {
  readonly data: AppData;
  readonly targets: readonly SyncTarget[];
  readonly result: SyncResult;
  readonly close: () => void;
  readonly setResolution: (resolution: SyncResolution) => void;
  readonly setMessage: (value: string) => void;
}): void {
  if (options.result.status === "remote-newer") throw new Error("远端账本较新，请先同步处理后再导出配置");
  if (isResolutionResult(options.result)) {
    options.setResolution({ status: options.result.status, remoteData: options.result.remoteData });
    return;
  }
  const settings: SyncSettings = { enabled: true, targets: options.targets };
  exportSyncSettingsPackage(settings)
    .then((json) => downloadJson(json, "coinly-sync-settings.enc.json"))
    .then(() => options.setMessage("同步配置已导出"))
    .then(options.close)
    .catch((error: unknown) => options.setMessage(error instanceof Error ? error.message : "导出同步配置失败"));
}

function toggleSelection(
  target: SyncTarget,
  selected: readonly string[],
  setSelected: (value: readonly string[]) => void,
): void {
  const identity = targetIdentity(target);
  setSelected(selected.includes(identity)
    ? selected.filter((value) => value !== identity)
    : [...selected, identity]);
}

function importSyncSettings(props: {
  readonly preview?: SyncImportPreview;
  readonly clear: () => void;
  readonly setData: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}): void {
  if (!props.preview) return;
  loadDataFromSyncSettings({
    settings: props.preview.preview.settings,
    passphrase: props.preview.passphrase,
    rememberDevice: false,
  })
    .then(props.setData)
    .then(() => props.setMessage("已使用同步配置拉取远端账本"))
    .catch((error: unknown) => props.setMessage(error instanceof Error ? error.message : "同步配置导入失败"))
    .finally(props.clear);
}

function isResolutionResult(result: SyncResult): result is SyncResult & SyncResolution {
  return result.status === "remote-conflict" || result.status === "remote-divergent" || result.status === "remote-plaintext";
}

function SyncSettingsExportModal(props: {
  readonly data: AppData;
  readonly open: boolean;
  readonly selected: readonly string[];
  readonly setSelected: (values: readonly string[]) => void;
  readonly close: () => void;
  readonly setResolution: (resolution: SyncResolution) => void;
  readonly setMessage: (value: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const targets = useMemo(() => normalizeSyncSettings(props.data.syncSettings)?.targets ?? [], [props.data.syncSettings]);
  const footer = (
    <div className="flex justify-end gap-2">
      <Button onClick={props.close}>取消</Button>
      <Button variant="primary" loading={exporting} onClick={() => exportSelectedSyncSettings({ ...props, targets, setExporting })}>同步并导出</Button>
    </div>
  );
  return (
    <Modal centered open={props.open} title="导出同步配置" footer={footer} onCancel={props.close}>
      <div className="space-y-3">
        {targets.length === 0
          ? <p className="text-sm text-[var(--color-text-secondary)]">暂无同步提供方。</p>
          : targets.map((target) => (
            <label key={targetIdentity(target)} className="flex min-h-9 items-center gap-2 text-sm">
              <Checkbox checked={props.selected.includes(targetIdentity(target))} onChange={() => toggleSelection(target, props.selected, props.setSelected)} />
              {target.name || providerLabel(target.provider)}
            </label>
          ))}
      </div>
    </Modal>
  );
}

function SyncSettingsImportModal(props: {
  readonly preview?: SyncImportPreview;
  readonly clear: () => void;
  readonly setData: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}) {
  const footer = props.preview
    ? <div className="flex justify-end gap-2"><Button onClick={props.clear}>取消</Button><Button variant="primary" onClick={() => importSyncSettings(props)}>拉取远端并覆盖本地</Button></div>
    : undefined;
  return (
    <Modal open={Boolean(props.preview)} title="同步配置导入预览" footer={footer} onCancel={props.clear}>
      {props.preview && <p className="text-sm text-[var(--color-text-secondary)]">提供方 {props.preview.preview.summary.targets} 个，导入时会忽略开关并拉取远端账本。</p>}
    </Modal>
  );
}

function ImportPreviewModal(props: {
  readonly preview?: ImportPreview;
  readonly clear: () => void;
  readonly setData: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}) {
  const footer = props.preview
    ? <div className="flex justify-end gap-2"><Button onClick={props.clear}>取消</Button><Button variant="primary" onClick={() => confirmImport(props)}>确认导入并替换当前账本</Button></div>
    : undefined;
  return (
    <Modal open={Boolean(props.preview)} title="导入预览" footer={footer} onCancel={props.clear}>
      {props.preview && <SummaryGrid summary={props.preview.summary} />}
    </Modal>
  );
}

function BackupList(props: {
  readonly backups: readonly BackupRecord[];
  readonly setRestoring: (backup: BackupRecord) => void;
  readonly setDeleting: (backup: BackupRecord) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-[var(--color-text)]">本地备份</h3>
      {props.backups.length === 0
        ? <p className="text-sm text-[var(--color-text-secondary)]">暂无本地备份。</p>
        : (
          <List
            bordered
            dataSource={[...props.backups]}
            rowKey="id"
            renderItem={(backup) => <BackupItem backup={backup} setRestoring={props.setRestoring} setDeleting={props.setDeleting} />}
          />
        )}
    </div>
  );
}

function BackupItem(props: {
  readonly backup: BackupRecord;
  readonly setRestoring: (backup: BackupRecord) => void;
  readonly setDeleting: (backup: BackupRecord) => void;
}) {
  return (
    <List.Item>
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-medium text-[var(--color-text)]">{new Date(props.backup.createdAt).toLocaleString("zh-CN")}</span>
          <span className="text-xs text-[var(--color-text-secondary)]">交易 {props.backup.summary.transactions} / 账户 {props.backup.summary.accounts}</span>
        </span>
        <span className="flex gap-2">
          <Button onClick={() => props.setRestoring(props.backup)}>恢复</Button>
          <Button variant="danger" onClick={() => props.setDeleting(props.backup)}>删除</Button>
        </span>
      </div>
    </List.Item>
  );
}

function SummaryGrid({ summary }: { readonly summary: DataSummary }) {
  return (
    <div className="grid gap-2 text-sm text-[var(--color-text-secondary)] sm:grid-cols-2 xl:grid-cols-4">
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

function RestoreDialog(props: {
  readonly backup?: BackupRecord;
  readonly clear: () => void;
  readonly setData: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}) {
  return (
    <ConfirmDialog
      open={Boolean(props.backup)}
      title="恢复备份"
      description="恢复后会用该备份整体替换当前账本。"
      onCancel={props.clear}
      onConfirm={() => props.backup && restoreBackup(props.backup.id, props)}
    />
  );
}

function DeleteBackupDialog(props: {
  readonly backup?: BackupRecord;
  readonly clear: () => void;
  readonly setBackups: (backups: readonly BackupRecord[]) => void;
  readonly setMessage: (value: string) => void;
}) {
  return (
    <ConfirmDialog
      open={Boolean(props.backup)}
      title="删除备份"
      description="确认删除这个本地备份？"
      onCancel={props.clear}
      onConfirm={() => props.backup && removeBackup(props.backup.id, props)}
    />
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

function saveBackup(data: AppData, setBackups: (backups: readonly BackupRecord[]) => void, setMessage: (value: string) => void): void {
  createBackup(data)
    .then(() => refreshBackups(setBackups, setMessage))
    .then(() => setMessage("备份已创建"))
    .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "创建备份失败"));
}

function restoreBackup(
  id: string,
  props: { readonly clear: () => void; readonly setData: (data: AppData) => void; readonly setMessage: (value: string) => void },
): void {
  readBackupData(id)
    .then((preview) => props.setData(preview.data))
    .then(() => props.setMessage("备份已恢复"))
    .catch((error: unknown) => props.setMessage(error instanceof Error ? error.message : "恢复备份失败"))
    .finally(props.clear);
}

function removeBackup(
  id: string,
  props: { readonly clear: () => void; readonly setBackups: (backups: readonly BackupRecord[]) => void; readonly setMessage: (value: string) => void },
): void {
  deleteBackup(id)
    .then(() => refreshBackups(props.setBackups, props.setMessage))
    .then(() => props.setMessage("备份已删除"))
    .catch((error: unknown) => props.setMessage(error instanceof Error ? error.message : "删除备份失败"))
    .finally(props.clear);
}

function refreshBackups(setBackups: (backups: readonly BackupRecord[]) => void, setMessage: (value: string) => void): void {
  listBackups()
    .then(setBackups)
    .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "读取备份失败"));
}

function clearData(
  props: { readonly setData: (data: AppData) => void; readonly setMessage: (value: string) => void },
  setConfirmClear: (open: boolean) => void,
): void {
  props.setData(initialData());
  props.setMessage("数据已清空");
  setConfirmClear(false);
}

function downloadJson(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface SyncImportPreview {
  readonly preview: SyncSettingsPreview;
  readonly passphrase: string;
}
