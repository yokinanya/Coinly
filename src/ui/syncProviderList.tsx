import { Link2, LogOut, RefreshCw, Settings2, Trash2, Wifi } from "lucide-react";
import { useState } from "react";
import type { AppData, SyncTarget } from "../domain/types";
import {
  authorizeSyncTarget,
  disconnectSyncTarget,
  syncAutoTarget,
  syncSingleTarget,
  targetDisplayName,
  testSyncTarget,
  type SyncResult,
} from "../sync/syncClient";
import { Button, List, Modal, Switch } from "./metis";
import { SyncTargetForm } from "./syncTargetForm";
import { providerLabel, targetIdentity, upsertSyncTarget } from "./syncTargetHelpers";

type ProviderAction = "authorizing" | "disconnecting" | "testing" | "syncing";

export function ProviderList(props: {
  readonly targets: readonly SyncTarget[];
  readonly data: AppData;
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
  readonly onSyncResult: (result: SyncResult, target?: SyncTarget) => void;
  readonly setMessage: (value: string) => void;
}) {
  if (props.targets.length === 0) {
    return <p className="text-sm text-[var(--color-text-secondary)]">暂无同步提供方。</p>;
  }
  return (
    <List
      bordered
      className="w-full"
      dataSource={[...props.targets]}
      rowKey={targetIdentity}
      renderItem={(target, index) => <ProviderItem target={target} index={index} {...props} />}
    />
  );
}

export function TargetModal(props: {
  readonly target?: SyncTarget;
  readonly clear: () => void;
  readonly save: (target: SyncTarget) => void;
}) {
  const [draft, setDraft] = useState<SyncTarget>();
  const target = draft ?? props.target;
  const close = () => {
    setDraft(undefined);
    props.clear();
  };
  const footer = target
    ? <div className="flex justify-end gap-2"><Button onClick={close}>取消</Button><Button variant="primary" onClick={() => saveTarget(target, props.save, close)}>保存</Button></div>
    : undefined;
  return (
    <Modal centered open={Boolean(props.target)} title="同步提供方配置" width="min(920px, calc(100vw - 2rem))" footer={footer} onCancel={close}>
      <div className="max-h-[min(72vh,42rem)] overflow-y-auto px-6 py-2 sm:px-8">
        {target && <SyncTargetForm target={target} onChange={setDraft} />}
      </div>
    </Modal>
  );
}

function ProviderItem(props: {
  readonly target: SyncTarget;
  readonly index: number;
  readonly targets: readonly SyncTarget[];
  readonly data: AppData;
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
  readonly onSyncResult: (result: SyncResult, target?: SyncTarget) => void;
  readonly setMessage: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <List.Item>
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <ProviderMeta target={props.target} index={props.index} />
        <ProviderActions {...props} edit={() => setEditing(true)} />
      </div>
      <TargetModal target={editing ? props.target : undefined} clear={() => setEditing(false)} save={(target) => props.setTargets(upsertSyncTarget(props.targets, target))} />
    </List.Item>
  );
}

function ProviderMeta(props: { readonly target: SyncTarget; readonly index: number }) {
  return (
    <span>
      <span className="block text-sm font-medium text-[var(--color-text)]">{targetDisplayName(props.target, props.index)}</span>
      <span className="text-xs text-[var(--color-text-secondary)]">
        {providerMetaText(props.target)}
      </span>
    </span>
  );
}

function providerMetaText(target: SyncTarget): string {
  const label = providerLabel(target.provider);
  if ((target.provider === "onedrive" || target.provider === "google-drive") && target.username) {
    return `${label} / ${target.username}`;
  }
  return label;
}

function ProviderActions(props: {
  readonly target: SyncTarget;
  readonly targets: readonly SyncTarget[];
  readonly data: AppData;
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
  readonly onSyncResult: (result: SyncResult, target?: SyncTarget) => void;
  readonly setMessage: (value: string) => void;
  readonly edit: () => void;
}) {
  const [busy, setBusy] = useState<ProviderAction>();
  const cloudTarget = props.target.provider === "onedrive" || props.target.provider === "google-drive";
  const connected = isConnectedCloudTarget(props.target);
  const disabled = Boolean(busy);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="flex min-h-8 items-center gap-2 text-sm">
        <Switch disabled={disabled} checked={props.target.enabled} onChange={() => toggleTarget({ ...props, setBusy })} />
        {props.target.enabled ? "自动同步已启用" : "自动同步已停用"}
      </label>
      <Button aria-label="配置" title="配置" disabled={disabled} onClick={props.edit}><Settings2 size={16} /></Button>
      {cloudTarget && !connected && <Button aria-label="授权" title="授权" disabled={disabled} loading={busy === "authorizing"} onClick={() => authorizeTarget({ ...props, setBusy })}><Link2 size={16} /></Button>}
      {cloudTarget && connected && <Button aria-label="断开连接" title="断开连接" disabled={disabled} loading={busy === "disconnecting"} onClick={() => disconnectTarget({ ...props, setBusy })}><LogOut size={16} /></Button>}
      <Button aria-label="测试连接" title="测试连接" disabled={disabled} loading={busy === "testing"} onClick={() => testTarget({ ...props, setBusy })}><Wifi size={16} /></Button>
      <Button aria-label="手动同步" title="手动同步" disabled={disabled} loading={busy === "syncing"} onClick={() => syncTarget({ ...props, setBusy })}><RefreshCw size={16} /></Button>
      <Button aria-label="删除" title="删除" variant="danger" disabled={disabled} onClick={() => removeTarget(props)}><Trash2 size={16} /></Button>
    </span>
  );
}

function authorizeTarget(props: ProviderActionProps): void {
  runProviderTask({
    action: "authorizing",
    fallback: "授权失败",
    setBusy: props.setBusy,
    setMessage: props.setMessage,
    task: async () => {
      props.setTargets(upsertSyncTarget(props.targets, await authorizeSyncTarget(props.target)));
      props.setMessage("已授权");
    },
  });
}

function disconnectTarget(props: ProviderActionProps): void {
  runProviderTask({
    action: "disconnecting",
    fallback: "断开连接失败",
    setBusy: props.setBusy,
    setMessage: props.setMessage,
    task: async () => {
      props.setTargets(upsertSyncTarget(props.targets, await disconnectSyncTarget(props.target)));
      props.setMessage("已断开连接");
    },
  });
}

function testTarget(props: ProviderActionProps): void {
  runProviderTask({
    action: "testing",
    fallback: "连接测试失败",
    setBusy: props.setBusy,
    setMessage: props.setMessage,
    task: async () => {
      const result = await testSyncTarget(props.target);
      props.setMessage(result === "found" ? "连接成功，远端加密包可读取" : "连接成功，远端加密包不存在");
    },
  });
}

function syncTarget(props: ProviderActionProps): void {
  runProviderTask({
    action: "syncing",
    fallback: "同步失败",
    setBusy: props.setBusy,
    setMessage: props.setMessage,
    task: async () => props.onSyncResult(await syncSingleTarget(props.data, props.target), props.target),
  });
}

function syncAutoEnabledTarget(props: ProviderActionProps): void {
  runProviderTask({
    action: "syncing",
    fallback: "自动同步失败",
    setBusy: props.setBusy,
    setMessage: props.setMessage,
    task: async () => props.onSyncResult(await syncAutoTarget(props.data, props.target), props.target),
  });
}

function runProviderTask(options: {
  readonly action: ProviderAction;
  readonly fallback: string;
  readonly setBusy: (action?: ProviderAction) => void;
  readonly setMessage: (value: string) => void;
  readonly task: () => Promise<void>;
}): void {
  options.setBusy(options.action);
  options.task()
    .catch((error: unknown) => options.setMessage(errorMessage(error, options.fallback)))
    .finally(() => options.setBusy(undefined));
}

function toggleTarget(props: {
  readonly target: SyncTarget;
  readonly targets: readonly SyncTarget[];
  readonly data: AppData;
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
  readonly onSyncResult: (result: SyncResult, target?: SyncTarget) => void;
  readonly setMessage: (value: string) => void;
  readonly setBusy: (action?: ProviderAction) => void;
}): void {
  const target = { ...props.target, enabled: !props.target.enabled };
  props.setTargets(upsertSyncTarget(props.targets, target));
  if (target.enabled) syncAutoEnabledTarget({ ...props, target });
}

function removeTarget(props: {
  readonly target: SyncTarget;
  readonly targets: readonly SyncTarget[];
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
}): void {
  props.setTargets(props.targets.filter((target) => targetIdentity(target) !== targetIdentity(props.target)));
}

function saveTarget(target: SyncTarget, save: (target: SyncTarget) => void, close: () => void): void {
  save(target.id ? target : { ...target, id: crypto.randomUUID() });
  close();
}

function isConnectedCloudTarget(target: SyncTarget): boolean {
  if (target.provider === "onedrive") return Boolean(target.accountId || target.accessToken || target.username);
  if (target.provider === "google-drive") return Boolean(target.accessToken);
  return false;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

interface ProviderActionProps {
  readonly target: SyncTarget;
  readonly targets: readonly SyncTarget[];
  readonly data: AppData;
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
  readonly onSyncResult: (result: SyncResult, target?: SyncTarget) => void;
  readonly setMessage: (value: string) => void;
  readonly setBusy: (action?: ProviderAction) => void;
}
