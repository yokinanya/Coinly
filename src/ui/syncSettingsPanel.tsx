import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { AppData, SyncSettings, SyncTarget } from "../domain/types";
import { normalizeSyncSettings, syncData, type SyncResult } from "../sync/syncClient";
import { Button } from "./metis";
import { SettingsSection } from "./settingsSection";
import { ProviderList, TargetModal } from "./syncProviderList";
import { SyncResolutionPanel } from "./syncResolutionPanel";
import type { SyncResolution } from "./syncResolutionPanel";
import { defaultSyncTarget, upsertSyncTarget } from "./syncTargetHelpers";

export function SyncPanel(props: {
  readonly data: AppData;
  readonly settings?: SyncSettings;
  readonly onChange: (settings: SyncSettings) => void;
  readonly applyRemote: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}) {
  const settings = normalizeSyncSettings(props.settings) ?? defaultSyncSettings();
  const targets = settings.targets ?? [];
  const hasAutoTargets = targets.some((target) => target.enabled);
  const [newTarget, setNewTarget] = useState<SyncTarget>();
  const [resolution, setResolution] = useState<SyncResolution>();
  const [syncingAll, setSyncingAll] = useState(false);
  const update = (patch: Partial<SyncSettings>) => props.onChange({ ...settings, ...patch });
  const setTargets = (nextTargets: readonly SyncTarget[]) => update({ targets: nextTargets });
  const onSyncResult = (result: SyncResult, target?: SyncTarget) => {
    reportSyncResult({ result, target, applyRemote: props.applyRemote, setResolution, setMessage: props.setMessage });
  };
  return (
    <SettingsSection title="同步">
      <div className="space-y-4">
        <SyncToolbar
          hasAutoTargets={hasAutoTargets}
          syncing={syncingAll}
          onAdd={() => setNewTarget(defaultSyncTarget())}
          onSyncAll={() => runSyncAll({ data: props.data, settings, onSyncResult, setSyncingAll, setMessage: props.setMessage })}
        />
        <ProviderList targets={targets} data={props.data} setTargets={setTargets} onSyncResult={onSyncResult} setMessage={props.setMessage} />
        <SyncResolutionPanel
          resolution={resolution}
          data={props.data}
          settings={settings}
          applyRemote={props.applyRemote}
          clear={() => setResolution(undefined)}
          setMessage={props.setMessage}
        />
        <TargetModal target={newTarget} clear={() => setNewTarget(undefined)} save={(target) => setTargets(upsertSyncTarget(targets, target))} />
      </div>
    </SettingsSection>
  );
}

function SyncToolbar(props: {
  readonly hasAutoTargets: boolean;
  readonly syncing: boolean;
  readonly onAdd: () => void;
  readonly onSyncAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={props.onAdd}><Plus size={16} />添加提供方</Button>
      <Button disabled={!props.hasAutoTargets || props.syncing} loading={props.syncing} onClick={props.onSyncAll}>
        <RefreshCw size={16} />同步全部
      </Button>
    </div>
  );
}

function runSyncAll(options: {
  readonly data: AppData;
  readonly settings: SyncSettings;
  readonly onSyncResult: (result: SyncResult) => void;
  readonly setSyncingAll: (syncing: boolean) => void;
  readonly setMessage: (value: string) => void;
}): void {
  options.setSyncingAll(true);
  syncData(options.data, options.settings)
    .then(options.onSyncResult)
    .catch((error: unknown) => options.setMessage(errorMessage(error, "同步失败")))
    .finally(() => options.setSyncingAll(false));
}

function reportSyncResult(options: {
  readonly result: SyncResult;
  readonly target?: SyncTarget;
  readonly applyRemote: (data: AppData) => void;
  readonly setResolution: (resolution: SyncResolution) => void;
  readonly setMessage: (value: string) => void;
}): void {
  if (isRemoteNewer(options.result)) {
    options.applyRemote(options.result.remoteData);
    options.setMessage("已使用较新的远端账本覆盖本地");
    return;
  }
  if (isResolutionResult(options.result)) {
    options.setResolution({ status: options.result.status, target: options.target, remoteData: options.result.remoteData });
    return;
  }
  options.setMessage(syncResultMessage(options.result));
}

function isRemoteNewer(result: SyncResult): result is SyncResult & { readonly remoteData: AppData } {
  return result.status === "remote-newer" && Boolean(result.remoteData);
}

function isResolutionResult(result: SyncResult): result is SyncResult & SyncResolution {
  return result.status === "remote-conflict" || result.status === "remote-divergent" || result.status === "remote-plaintext";
}

function defaultSyncSettings(): SyncSettings {
  return { enabled: true, targets: [] };
}

function syncResultMessage(result: SyncResult): string {
  if (result.status === "uploaded") return "同步已上传";
  if (result.status === "up-to-date") return "远端已是最新";
  if (result.status === "throttled") return result.reason ?? "自动同步频率控制中，请稍后重试";
  return "没有开启自动同步的提供方";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
