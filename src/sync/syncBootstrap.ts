import type { AppData, SyncSettings } from "../domain/types";
import { decryptAppData, isEncryptedPackage, unlockPackageWithPassphrase } from "../storage/encryption";
import { unlockVaultWithPassphrase } from "../storage/vaultSession";
import { canonicalSyncData, dataTimestamp, normalizeSyncSettings, readSyncTargetPayload } from "./syncClient";

export interface SyncSettingsLoadOptions {
  readonly settings: SyncSettings;
  readonly passphrase: string;
  readonly rememberDevice: boolean;
}

interface RemoteSnapshot {
  readonly payload: string;
  readonly data: AppData;
}

export async function loadDataFromSyncSettings(options: SyncSettingsLoadOptions): Promise<AppData> {
  const settings = requireImportSyncSettings(options.settings);
  const payloads = await readImportPayloads(settings);
  const selected = selectRemoteSnapshot(await parseRemoteSnapshots(payloads, options.passphrase));
  await unlockVaultWithPassphrase(selected.payload, options.passphrase, options.rememberDevice);
  return { ...selected.data, syncSettings: settings };
}

async function readImportPayloads(settings: SyncSettings): Promise<readonly string[]> {
  const targets = settings.targets ?? [];
  const payloads = await Promise.all(targets.map((target, index) => readSyncTargetPayload(target, index)));
  const present = payloads.filter(isPresent).map((snapshot) => snapshot.payload);
  if (present.length === 0) throw new Error("没有找到远端同步数据");
  return present;
}

async function parseRemoteSnapshots(payloads: readonly string[], passphrase: string): Promise<readonly RemoteSnapshot[]> {
  return Promise.all(payloads.map((payload) => parseRemoteSnapshot(payload, passphrase)));
}

async function parseRemoteSnapshot(payload: string, passphrase: string): Promise<RemoteSnapshot> {
  if (!isEncryptedPackage(payload)) throw new Error("远端同步数据不是 Coinly 加密包");
  const unlock = await unlockPackageWithPassphrase(payload, passphrase);
  return { payload, data: await decryptAppData(payload, unlock) };
}

function selectRemoteSnapshot(snapshots: readonly RemoteSnapshot[]): RemoteSnapshot {
  const latest = latestSnapshot(snapshots);
  const conflict = snapshots.find((snapshot) => hasLatestConflict(snapshot, latest));
  if (conflict) throw new Error("多个远端同步数据冲突，请先在已有设备处理冲突后再导入");
  return latest;
}

function latestSnapshot(snapshots: readonly RemoteSnapshot[]): RemoteSnapshot {
  if (snapshots.length === 0) throw new Error("没有找到远端同步数据");
  return [...snapshots].sort((left, right) => dataTimestamp(right.data) - dataTimestamp(left.data))[0];
}

function hasLatestConflict(snapshot: RemoteSnapshot, latest: RemoteSnapshot): boolean {
  return dataTimestamp(snapshot.data) === dataTimestamp(latest.data)
    && canonicalSyncData(snapshot.data) !== canonicalSyncData(latest.data);
}

function requireImportSyncSettings(settings: SyncSettings): SyncSettings {
  const normalized = normalizeSyncSettings(settings);
  if (!normalized?.targets || normalized.targets.length === 0) {
    throw new Error("同步配置未包含同步提供方");
  }
  return { ...normalized, targets: normalized.targets.map((target) => ({ ...target, enabled: true })) };
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}
