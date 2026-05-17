import { useMemo } from "react";
import type { AppData, SyncSettings, SyncTarget } from "../domain/types";
import { overwriteRemote, overwriteSyncTarget } from "../sync/syncClient";
import { collectionDiffTotal, hasDiff, summarizeSyncDiff, type CollectionDiffSummary, type SyncDiffSummary } from "../sync/syncDiff";
import { Button, Modal } from "./metis";

export type SyncResolutionStatus = "remote-conflict" | "remote-divergent" | "remote-plaintext";

export interface SyncResolution {
  readonly status: SyncResolutionStatus;
  readonly target?: SyncTarget;
  readonly remoteData?: AppData;
}

export function SyncResolutionPanel(props: {
  readonly resolution?: SyncResolution;
  readonly data: AppData;
  readonly settings: SyncSettings;
  readonly applyRemote: (data: AppData) => void;
  readonly clear: () => void;
  readonly setMessage: (value: string) => void;
}) {
  const resolution = props.resolution;
  const footer = resolution
    ? <ResolutionActions {...props} resolution={resolution} />
    : undefined;
  const remoteData = resolution?.remoteData;
  const diff = useMemo(() => {
    return remoteData ? summarizeSyncDiff(props.data, remoteData) : undefined;
  }, [props.data, remoteData]);
  return (
    <Modal centered open={Boolean(resolution)} title={resolution ? resolutionTitle(resolution) : ""} footer={footer} onCancel={props.clear}>
      {resolution && (
        <div className="space-y-4">
          <p>{resolutionDescription(resolution, props.data.updatedAt)}</p>
          {diff && <DiffSummary summary={diff} />}
        </div>
      )}
    </Modal>
  );
}

function ResolutionActions(props: {
  readonly resolution: SyncResolution;
  readonly data: AppData;
  readonly settings: SyncSettings;
  readonly applyRemote: (data: AppData) => void;
  readonly clear: () => void;
  readonly setMessage: (value: string) => void;
}) {
  const remoteUsable = props.resolution.status !== "remote-plaintext" && Boolean(props.resolution.remoteData);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button onClick={props.clear}>取消</Button>
      {remoteUsable && <Button variant="primary" onClick={() => applyRemoteResolution(props)}>使用远端</Button>}
      <Button variant="danger" onClick={() => keepLocal(props)}>保留本地并覆盖远端</Button>
    </div>
  );
}

function applyRemoteResolution(props: {
  readonly resolution: SyncResolution;
  readonly applyRemote: (data: AppData) => void;
  readonly clear: () => void;
  readonly setMessage: (value: string) => void;
}): void {
  if (!props.resolution.remoteData) throw new Error("缺少远端账本，无法使用远端");
  props.applyRemote(props.resolution.remoteData);
  props.clear();
  props.setMessage("已使用远端账本覆盖本地");
}

function keepLocal(props: {
  readonly resolution: SyncResolution;
  readonly data: AppData;
  readonly settings: SyncSettings;
  readonly clear: () => void;
  readonly setMessage: (value: string) => void;
}): void {
  writeLocalToRemote(props.resolution, props.data, props.settings)
    .then(() => props.setMessage("已用本地加密包覆盖远端"))
    .catch((error: unknown) => props.setMessage(errorMessage(error, "覆盖远端失败")))
    .finally(props.clear);
}

function writeLocalToRemote(resolution: SyncResolution, data: AppData, settings: SyncSettings): Promise<void> {
  return resolution.target
    ? overwriteSyncTarget(data, resolution.target)
    : overwriteRemote(data, settings);
}

function resolutionTitle(resolution: SyncResolution): string {
  if (resolution.status === "remote-plaintext") return "远端存在旧明文数据";
  if (resolution.status === "remote-divergent") return "本地与远端更新时间差异较大";
  return "本地与远端数据冲突";
}

function resolutionDescription(resolution: SyncResolution, localUpdatedAt: string): string {
  if (resolution.status === "remote-plaintext") {
    return "远端文件是旧明文 Coinly JSON。覆盖后会写入加密包，旧明文远端文件会被替换，此操作不可逆。";
  }
  const remoteUpdatedAt = resolution.remoteData?.updatedAt ?? "未知";
  if (resolution.status === "remote-divergent") {
    return `本地更新时间 ${formatTime(localUpdatedAt)}，远端更新时间 ${formatTime(remoteUpdatedAt)}，时间差距较大。保留本地会覆盖远端，此操作不可逆。`;
  }
  return `本地更新时间 ${formatTime(localUpdatedAt)}，远端更新时间 ${formatTime(remoteUpdatedAt)}，同一时间点内容不一致。请选择保留哪一份。`;
}

function DiffSummary({ summary }: { readonly summary: SyncDiffSummary }) {
  if (!hasDiff(summary)) {
    return <p className="text-sm text-[var(--color-text-secondary)]">本地与远端实体内容一致。</p>;
  }
  const collections = summary.collections.filter((item) => collectionDiffTotal(item) > 0);
  return (
    <div className="space-y-2 rounded border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm">
      <p className="font-medium text-[var(--color-text)]">数据差异摘要</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {collections.map((item) => <CollectionDiff key={item.key} summary={item} />)}
        {(summary.currencyLocalOnly > 0 || summary.currencyRemoteOnly > 0) && (
          <p className="text-[var(--color-text-secondary)]">
            币种：本地独有 {summary.currencyLocalOnly}，远端独有 {summary.currencyRemoteOnly}
          </p>
        )}
      </div>
    </div>
  );
}

function CollectionDiff({ summary }: { readonly summary: CollectionDiffSummary }) {
  return (
    <p className="text-[var(--color-text-secondary)]">
      {summary.label}：
      本地独有 {summary.localOnly}，
      远端独有 {summary.remoteOnly}，
      本地较新 {summary.localNewer}，
      远端较新 {summary.remoteNewer}，
      同时冲突 {summary.sameTimeConflicts}
    </p>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatTime(value: string): string {
  if (value === "未知") return value;
  return new Date(value).toLocaleString("zh-CN");
}
