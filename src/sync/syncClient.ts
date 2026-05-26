import { withoutLocalOnlyUiSettings } from "../domain/localOnly";
import type { AppData, SyncProvider, SyncSettings, SyncTarget } from "../domain/types";
import { parseImportedData } from "../storage/indexedDb";
import { decryptAppData, encryptAppData, isEncryptedPackage } from "../storage/encryption";
import { currentUnlockState } from "../storage/vaultSession";
import { authorizeGoogleDrive, deleteGoogleDrive, disconnectGoogleDrive, readGoogleDrive, testGoogleDrive, writeGoogleDrive } from "./googleDriveAdapter";
import { authorizeOneDrive, deleteOneDrive, disconnectOneDrive, readOneDrive, testOneDrive, writeOneDrive } from "./oneDriveAdapter";
import { deleteS3, readS3, writeS3 } from "./s3Adapter";
import { DEFAULT_OBJECT_KEY } from "./syncDefaults";
import { mergeSyncData } from "./syncMerge";
import type { RemoteSnapshot } from "./syncTypes";
import { deleteWebDav, readWebDav, testWebDav, writeWebDav } from "./webdavAdapter";

export interface SyncResult {
  readonly status: SyncStatus;
  readonly remoteData?: AppData;
  readonly reason?: string;
}

export type SyncStatus =
  | "disabled"
  | "throttled"
  | "up-to-date"
  | "uploaded"
  | "merged"
  | "remote-newer"
  | "remote-plaintext"
  | "remote-conflict"
  | "remote-divergent";
export type ConnectionTestResult = "found" | "missing";
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const LARGE_GAP_DAYS = 7;
const MINUTE_MS = 60_000;
export const AUTO_SYNC_COOLDOWN_MS = MINUTE_MS;
export const LARGE_TIME_GAP_MS = LARGE_GAP_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * MINUTE_MS;

const autoSyncAttemptAt = new Map<string, number>();

interface ActiveTarget {
  readonly label: string;
  readonly target: SyncTarget;
}

interface RemoteData {
  readonly encrypted: boolean;
  readonly data: AppData;
  readonly version?: string;
}

export async function syncData(data: AppData, settings?: SyncSettings): Promise<SyncResult> {
  const normalized = normalizeSyncSettings(settings);
  if (!normalized) return { status: "disabled" };
  const targets = enabledAutoTargets(normalized);
  if (targets.length === 0) return { status: "disabled" };
  const dueTargets = targets.filter(isAutoSyncDue);
  if (dueTargets.length === 0) return { status: "throttled", reason: "自动同步频率控制中，请稍后重试" };
  markAutoSyncAttempt(dueTargets);
  return syncActiveTargets(data, toActiveTargets(dueTargets));
}

export async function syncSingleTarget(data: AppData, target: SyncTarget): Promise<SyncResult> {
  return syncActiveTargets(data, [{ label: targetLabel(target, 0), target: normalizeTarget(target) }]);
}

export async function forceSyncTargets(data: AppData, targets: readonly SyncTarget[]): Promise<SyncResult> {
  if (targets.length === 0) throw new Error("未选择同步源");
  return syncActiveTargets(data, toActiveTargets(targets.map(normalizeTarget)));
}

export async function syncAutoTarget(data: AppData, target: SyncTarget): Promise<SyncResult> {
  const normalized = normalizeTarget(target);
  if (!normalized.enabled) return { status: "disabled" };
  if (!isAutoSyncDue(normalized)) return { status: "throttled", reason: "自动同步频率控制中，请稍后重试" };
  markAutoSyncAttempt([normalized]);
  return syncActiveTargets(data, [{ label: targetLabel(normalized, 0), target: normalized }]);
}

export async function overwriteRemote(data: AppData, settings?: SyncSettings): Promise<void> {
  const normalized = normalizeSyncSettings(settings);
  if (!normalized?.enabled) throw new Error("同步未启用，无法覆盖远端");
  await writeTargets(activeTargets(normalized), await encryptAppData(withoutLocalOnlyUiSettings(data), currentUnlockState()));
}

export async function overwriteSyncTarget(data: AppData, target: SyncTarget): Promise<void> {
  await writeTargets([{ label: targetLabel(target, 0), target: normalizeTarget(target) }], await encryptAppData(withoutLocalOnlyUiSettings(data), currentUnlockState()));
}

export async function testSyncTarget(target: SyncTarget): Promise<ConnectionTestResult> {
  return adapterFor(normalizeTarget(target)).test(normalizeTarget(target));
}

export async function readSyncTargetPayload(target: SyncTarget, index = 0): Promise<RemoteSnapshot | undefined> {
  const normalized = normalizeTarget(target);
  return readTarget({ label: targetLabel(normalized, index), target: normalized });
}

export async function authorizeSyncTarget(target: SyncTarget): Promise<SyncTarget> {
  if (target.provider === "onedrive") return authorizeOneDrive(target);
  if (target.provider === "google-drive") return authorizeGoogleDrive(target);
  return target;
}

export async function disconnectSyncTarget(target: SyncTarget): Promise<SyncTarget> {
  if (target.provider === "onedrive") return disconnectOneDrive(target);
  if (target.provider === "google-drive") return disconnectGoogleDrive(target);
  return target;
}

export async function deleteSyncTarget(target: SyncTarget): Promise<void> {
  const normalized = normalizeTarget(target);
  if (normalized.provider === "s3-compatible") {
    await deleteS3(normalized);
    return;
  }
  if (normalized.provider === "onedrive") {
    await deleteOneDrive(normalized);
    return;
  }
  if (normalized.provider === "google-drive") {
    await deleteGoogleDrive(normalized);
    return;
  }
  if (normalized.provider === "webdav") {
    await deleteWebDav(normalized);
    return;
  }
  throw new Error("同步目标类型不支持");
}

export function normalizeSyncSettings(settings?: SyncSettings): SyncSettings | undefined {
  if (!settings) return undefined;
  const targets = settingsTargets(settings);
  return {
    enabled: targets.length > 0 ? true : settings.enabled,
    targets,
    lastSyncedAt: settings.lastSyncedAt,
  };
}

export function targetDisplayName(target: SyncTarget, index = 0): string {
  return targetLabel(target, index);
}

async function syncActiveTargets(data: AppData, targets: readonly ActiveTarget[]): Promise<SyncResult> {
  const remoteData = await readRemoteData(targets);
  const decision = consistencyDecision(data, remoteData);
  if (decision) return decision;
  const remotes = remoteData.map((item) => item.data);
  const merged = mergeSyncData(data, remotes);
  if (merged.conflict) return { status: "remote-conflict", remoteData: merged.conflict };
  if (merged.data) {
    await writeTargets(targets, await encryptAppData(withoutLocalOnlyUiSettings(merged.data), currentUnlockState()), latestRemoteVersion(remoteData));
    return { status: "merged", remoteData: merged.data };
  }
  const newer = newestRemote(remotes, dataTimestamp(data));
  if (newer) return { status: "remote-newer", remoteData: newer };
  await writeTargets(targets, await encryptAppData(withoutLocalOnlyUiSettings(data), currentUnlockState()), latestRemoteVersion(remoteData));
  return { status: "uploaded" };
}

async function readRemoteData(targets: readonly ActiveTarget[]): Promise<readonly RemoteData[]> {
  const payloads = await Promise.all(targets.map((item) => readTarget(item)));
  return Promise.all(payloads.filter(isPresent).map(parseRemotePayload));
}

async function readTarget(item: ActiveTarget): Promise<RemoteSnapshot | undefined> {
  try {
    return await adapterFor(item.target).read(item.target);
  } catch (error) {
    throw targetError(item, "读取", error);
  }
}

async function parseRemotePayload(snapshot: RemoteSnapshot): Promise<RemoteData> {
  if (isEncryptedPackage(snapshot.payload)) {
    return { encrypted: true, data: await decryptAppData(snapshot.payload, currentUnlockState()), version: snapshot.version };
  }
  try {
    return { encrypted: false, data: parseImportedData(snapshot.payload), version: snapshot.version };
  } catch (error) {
    throw new Error("远端不是 Coinly 加密包，也不是可迁移的旧明文 Coinly JSON", { cause: error });
  }
}

async function writeTargets(targets: readonly ActiveTarget[], payload: string, version?: string): Promise<void> {
  await Promise.all(targets.map(async (item) => writeTarget(item, payload, version)));
}

async function writeTarget(item: ActiveTarget, payload: string, version?: string): Promise<void> {
  try {
    await adapterFor(item.target).write(item.target, payload, version);
  } catch (error) {
    throw targetError(item, "写入", error);
  }
}

function adapterFor(target: SyncTarget): SyncAdapter {
  if (target.provider === "s3-compatible") return { read: readS3, write: writeS3, test: testS3 };
  if (target.provider === "onedrive") return { read: readOneDrive, write: writeOneDrive, test: testOneDrive };
  if (target.provider === "google-drive") return { read: readGoogleDrive, write: writeGoogleDrive, test: testGoogleDrive };
  if (target.provider === "webdav") return { read: readWebDav, write: writeWebDav, test: testWebDav };
  throw new Error("同步目标类型不支持");
}

function testS3(target: SyncTarget): Promise<ConnectionTestResult> {
  return readS3(target).then((snapshot) => snapshot ? "found" : "missing");
}

function settingsTargets(settings: SyncSettings): readonly SyncTarget[] {
  return (settings.targets ?? []).map(normalizeTarget);
}

function normalizeTarget(target: SyncTarget): SyncTarget {
  if (!isSupportedProvider(target)) return { ...defaultSyncTarget("s3-compatible"), enabled: false };
  return normalizeObjectKey(target);
}

function normalizeObjectKey(target: SyncTarget): SyncTarget {
  if (target.provider !== "s3-compatible" || target.objectKey) return target;
  return { ...target, objectKey: DEFAULT_OBJECT_KEY };
}

function consistencyDecision(local: AppData, remoteData: readonly RemoteData[]): SyncResult | undefined {
  const plaintext = remoteData.find((item) => !item.encrypted);
  if (plaintext) return { status: "remote-plaintext", remoteData: plaintext.data };
  const remotes = remoteData.map((item) => item.data);
  const latestRemote = latestData(remotes);
  const conflict = latestRemote ? newestRemoteConflict(remotes, latestRemote) : undefined;
  if (conflict) return { status: "remote-conflict", remoteData: conflict };
  if (!latestRemote) return undefined;
  if (hasSameTimeConflict(local, latestRemote)) return { status: "remote-conflict", remoteData: latestRemote };
  if (timeGap(local, latestRemote) > LARGE_TIME_GAP_MS) {
    return { status: "remote-divergent", remoteData: latestRemote };
  }
  if (isSameDataTimestamp(local, latestRemote) && canonicalSyncData(local) === canonicalSyncData(latestRemote)) {
    return { status: "up-to-date" };
  }
  return undefined;
}

function latestRemoteVersion(remoteData: readonly RemoteData[]): string | undefined {
  return remoteData.find((item) => item.version)?.version;
}

function newestRemote(remoteData: readonly AppData[], localUpdatedAt: number): AppData | undefined {
  return latestData(remoteData.filter((data) => dataTimestamp(data) > localUpdatedAt));
}

function latestData(data: readonly AppData[]): AppData | undefined {
  return [...data].sort((left, right) => dataTimestamp(right) - dataTimestamp(left))[0];
}

function hasSameTimeConflict(local: AppData, remote: AppData): boolean {
  return isSameDataTimestamp(local, remote) && canonicalSyncData(local) !== canonicalSyncData(remote);
}

function newestRemoteConflict(remoteData: readonly AppData[], latest: AppData): AppData | undefined {
  return remoteData.find((data) => isSameDataTimestamp(data, latest) && canonicalSyncData(data) !== canonicalSyncData(latest));
}

function timeGap(local: AppData, remote: AppData): number {
  return Math.abs(dataTimestamp(local) - dataTimestamp(remote));
}

function isSameDataTimestamp(left: AppData, right: AppData): boolean {
  return dataTimestamp(left) === dataTimestamp(right);
}

export function dataTimestamp(data: AppData): number {
  const timestamp = Date.parse(data.updatedAt);
  if (Number.isNaN(timestamp)) throw new Error("账本更新时间无效，无法同步");
  return timestamp;
}

export function canonicalSyncData(data: AppData): string {
  return JSON.stringify({
    ...data,
    localVersion: undefined,
    syncSettings: undefined,
    aiSettings: undefined,
    uiSettings: undefined,
  });
}

function activeTargets(settings: SyncSettings): readonly ActiveTarget[] {
  const enabledTargets = (settings.targets ?? []).filter((target) => target.enabled);
  if (enabledTargets.length === 0) throw new Error("未配置已启用同步源");
  return toActiveTargets(enabledTargets);
}

function enabledAutoTargets(settings: SyncSettings): readonly SyncTarget[] {
  return (settings.targets ?? []).filter((target) => target.enabled);
}

function toActiveTargets(targets: readonly SyncTarget[]): readonly ActiveTarget[] {
  return targets.map((target, index) => ({ label: targetLabel(target, index), target }));
}

function isAutoSyncDue(target: SyncTarget): boolean {
  const lastAttempt = autoSyncAttemptAt.get(targetIdentity(target));
  return lastAttempt === undefined || Date.now() - lastAttempt >= AUTO_SYNC_COOLDOWN_MS;
}

function markAutoSyncAttempt(targets: readonly SyncTarget[]): void {
  const timestamp = Date.now();
  targets.forEach((target) => autoSyncAttemptAt.set(targetIdentity(target), timestamp));
}

function defaultSyncTarget(provider: SyncProvider): SyncTarget {
  return { enabled: true, provider, endpoint: "", objectKey: provider === "s3-compatible" ? DEFAULT_OBJECT_KEY : "" };
}

function targetLabel(target: SyncTarget, index: number): string {
  const name = target.name?.trim();
  if (name) return name;
  return `${providerLabel(target.provider)} ${index + 1}`;
}

function targetIdentity(target: SyncTarget): string {
  return target.id ?? `${target.provider}:${target.endpoint}:${target.objectKey}`;
}

function providerLabel(provider: SyncProvider): string {
  if (provider === "s3-compatible") return "S3-Compatible";
  if (provider === "onedrive") return "OneDrive";
  if (provider === "webdav") return "WebDAV";
  return "Google Drive";
}

function targetError(item: ActiveTarget, action: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : `${action}失败`;
  return new Error(`${item.label}${action}失败：${message}`);
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isSupportedProvider(target: SyncTarget): boolean {
  const provider = (target as { readonly provider?: string }).provider;
  return provider === "s3-compatible" || provider === "onedrive" || provider === "google-drive" || provider === "webdav";
}

interface SyncAdapter {
  readonly read: (target: SyncTarget) => Promise<RemoteSnapshot | undefined>;
  readonly write: (target: SyncTarget, payload: string, version?: string) => Promise<void>;
  readonly test: (target: SyncTarget) => Promise<ConnectionTestResult>;
}
