import { Link2, LogOut, RefreshCw, Search, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import type { AppData, SyncTarget } from "../domain/types";
import {
  authorizeSyncTarget,
  deleteSyncTarget,
  disconnectSyncTarget,
  syncSingleTarget,
  targetDisplayName,
  testSyncTarget,
  type SyncResult,
} from "../sync/syncClient";
import { Button, Modal, Popconfirm } from "./metis";
import { SyncTargetForm } from "./syncTargetForm";
import { providerLabel, targetIdentity, upsertSyncTarget } from "./syncTargetHelpers";
import { Switch } from "./metis";

type ProviderAction = "authorizing" | "disconnecting" | "testing" | "syncing" | "deleting";

export function ProviderList(props: {
  readonly targets: readonly SyncTarget[];
  readonly data: AppData;
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
  readonly onSyncResult: (result: SyncResult, target?: SyncTarget) => void;
  readonly setMessage: (value: string) => void;
}) {
  if (props.targets.length === 0) {
    return <p className="text-sm text-[var(--color-text-secondary)]">暂无同步源。</p>;
  }
  return <div className="w-full space-y-3">{props.targets.map((target, index) => <ProviderItem key={targetIdentity(target)} target={target} index={index} {...props} />)}</div>;
}

export function TargetModal(props: {
  readonly target?: SyncTarget;
  readonly clear: () => void;
  readonly save: (target: SyncTarget) => void;
  readonly data: AppData;
  readonly targets: readonly SyncTarget[];
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
  readonly onSyncResult: (result: SyncResult, target?: SyncTarget) => void;
  readonly setMessage: (value: string) => void;
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
    <Modal centered open={Boolean(props.target)} title="同步源配置" width="min(920px, calc(100vw - 2rem))" footer={footer} onCancel={close}>
      <div className="max-h-[min(72vh,42rem)] overflow-y-auto px-6 py-2 sm:px-8">
        {target && (
          <div className="space-y-4">
            <SyncTargetForm target={target} onChange={setDraft} />
            <ProviderAuthActions
              target={target}
              targets={props.targets}
              data={props.data}
              setTargets={props.setTargets}
              onSyncResult={props.onSyncResult}
              setMessage={props.setMessage}
            />
            <ProviderSyncActions
              target={target}
              targets={props.targets}
              data={props.data}
              setTargets={props.setTargets}
              onSyncResult={props.onSyncResult}
              setMessage={props.setMessage}
            />
          </div>
        )}
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
  const [deleteProviderOpen, setDeleteProviderOpen] = useState(false);
  return (
    <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
        <ProviderMeta target={props.target} index={props.index} />
        <ProviderActions
          {...props}
          edit={() => setEditing(true)}
          deleteProvider={() => setDeleteProviderOpen(true)}
          toggleEnabled={() => props.setTargets(toggleTargetEnabled(props.targets, props.target))}
        />
      </div>
      <TargetModal
        target={editing ? props.target : undefined}
        clear={() => setEditing(false)}
        save={(target) => props.setTargets(upsertSyncTarget(props.targets, target))}
        data={props.data}
        targets={props.targets}
        setTargets={props.setTargets}
        onSyncResult={props.onSyncResult}
        setMessage={props.setMessage}
      />
      <Popconfirm
        open={deleteProviderOpen}
        title={`确认删除“${targetDisplayName(props.target, props.index)}”？`}
        description="只删除本地配置，不删除云端文件。"
        cancelText="取消"
        okText="删除"
        okType="primary"
        onCancel={() => setDeleteProviderOpen(false)}
        onConfirm={() => {
          props.setTargets(props.targets.filter((target) => targetIdentity(target) !== targetIdentity(props.target)));
          setDeleteProviderOpen(false);
        }}
      />
    </div>
  );
}

function ProviderMeta(props: { readonly target: SyncTarget; readonly index: number }) {
  return (
    <span className="min-w-0">
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
  readonly deleteProvider: () => void;
  readonly toggleEnabled: () => void;
}) {
  const [busy, setBusy] = useState<ProviderAction>();
  const disabled = Boolean(busy);
  return (
    <span className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto sm:shrink-0 sm:flex-nowrap">
      <label className="mr-auto flex items-center gap-2 text-xs text-[var(--color-text-secondary)] sm:mr-0">
        <Switch checked={props.target.enabled} onChange={props.toggleEnabled} disabled={disabled} />
        自动同步
      </label>
      <Button aria-label="配置" title="配置" disabled={disabled} onClick={props.edit}><Settings2 size={16} /></Button>
      <Button aria-label="手动同步" title="手动同步" disabled={disabled} loading={busy === "syncing"} onClick={() => syncTarget({ ...props, setBusy })}><RefreshCw size={16} /></Button>
      <Button aria-label="删除" title="删除" variant="danger" disabled={disabled} onClick={props.deleteProvider}><Trash2 size={16} /></Button>
    </span>
  );
}

function ProviderAuthActions(props: {
  readonly target: SyncTarget;
  readonly targets: readonly SyncTarget[];
  readonly data: AppData;
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
  readonly onSyncResult: (result: SyncResult, target?: SyncTarget) => void;
  readonly setMessage: (value: string) => void;
}) {
  const [busy, setBusy] = useState<ProviderAction>();
  if (!isConnectedCloudTarget(props.target) && !isCloudTarget(props.target)) return null;
  const disabled = Boolean(busy);
  return (
    <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-[var(--color-text-secondary)]">云盘账号</span>
      {!isConnectedCloudTarget(props.target) && <Button aria-label="登录" title="登录" disabled={disabled} loading={busy === "authorizing"} onClick={() => authorizeTarget({ ...props, setBusy })}><Link2 size={16} />登录</Button>}
      {isConnectedCloudTarget(props.target) && <Button aria-label="断开登录" title="断开登录" disabled={disabled} loading={busy === "disconnecting"} onClick={() => disconnectTarget({ ...props, setBusy })}><LogOut size={16} />断开</Button>}
    </div>
  );
}

function ProviderSyncActions(props: {
  readonly target: SyncTarget;
  readonly targets: readonly SyncTarget[];
  readonly data: AppData;
  readonly setTargets: (targets: readonly SyncTarget[]) => void;
  readonly onSyncResult: (result: SyncResult, target?: SyncTarget) => void;
  readonly setMessage: (value: string) => void;
}) {
  const [busy, setBusy] = useState<ProviderAction>();
  const disabled = Boolean(busy);
  return (
    <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-[var(--color-text-secondary)]">同步文件</span>
      <Button aria-label="测试连接" title="测试连接" disabled={disabled} loading={busy === "testing"} onClick={() => testTarget({ ...props, setBusy })}>
        <Search size={16} />测试
      </Button>
      <Popconfirm
        title="删除云端数据"
        description="确认删除该同步源中的 Coinly 加密包？本地账本不会被删除。"
        cancelText="取消"
        okText="删除"
        okType="primary"
        onConfirm={() => deleteRemoteTarget({ ...props, setBusy })}
      >
        <Button aria-label="删除云端数据" title="删除云端数据" disabled={disabled} loading={busy === "deleting"} variant="danger">
          <Trash2 size={16} />删除
        </Button>
      </Popconfirm>
    </div>
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

function deleteRemoteTarget(props: ProviderActionProps): void {
  runProviderTask({
    action: "deleting",
    fallback: "删除云端数据失败",
    setBusy: props.setBusy,
    setMessage: props.setMessage,
    task: async () => {
      await deleteSyncTarget(props.target);
      props.setMessage("已删除云端数据");
    },
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

function isConnectedCloudTarget(target: SyncTarget): boolean {
  if (target.provider === "onedrive") return Boolean(target.accountId || target.accessToken || target.username);
  if (target.provider === "google-drive") return Boolean(target.accessToken);
  return false;
}

function isCloudTarget(target: SyncTarget): boolean {
  return target.provider === "onedrive" || target.provider === "google-drive";
}

function saveTarget(target: SyncTarget, save: (target: SyncTarget) => void, close: () => void): void {
  save(target.id ? target : { ...target, id: crypto.randomUUID() });
  close();
}

function toggleTargetEnabled(targets: readonly SyncTarget[], target: SyncTarget): readonly SyncTarget[] {
  return targets.map((item) => (targetIdentity(item) === targetIdentity(target) ? { ...item, enabled: !item.enabled } : item));
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
