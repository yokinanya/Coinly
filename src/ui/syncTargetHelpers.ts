import type { SyncProvider, SyncTarget } from "../domain/types";
import { DEFAULT_OBJECT_KEY } from "../sync/syncDefaults";

export function defaultSyncTarget(provider: SyncProvider = "s3-compatible"): SyncTarget {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    provider,
    endpoint: "",
    objectKey: provider === "s3-compatible" ? DEFAULT_OBJECT_KEY : "",
  };
}

export function providerLabel(provider: SyncProvider): string {
  if (provider === "s3-compatible") return "S3-Compatible";
  if (provider === "onedrive") return "OneDrive";
  if (provider === "weiyun") return "腾讯微云";
  return "Google Drive";
}

export function targetSummary(target: SyncTarget): string {
  if (target.provider === "s3-compatible") return target.bucket || target.endpoint || "未配置 S3-Compatible";
  if (target.provider === "onedrive") return target.username || "OneDrive App Folder";
  if (target.provider === "weiyun") return target.proxyBaseUrl ? "腾讯微云代理已配置" : "腾讯微云代理使用环境变量";
  return target.accessToken ? "Google Drive appDataFolder 已授权" : "Google Drive appDataFolder 未授权";
}

export function targetIdentity(target: SyncTarget): string {
  return target.id ?? `${target.provider}:${target.endpoint}:${target.objectKey}`;
}

export function upsertSyncTarget(targets: readonly SyncTarget[], target: SyncTarget): readonly SyncTarget[] {
  const found = targets.some((item) => targetIdentity(item) === targetIdentity(target));
  if (!found) return [...targets, target];
  return targets.map((item) => targetIdentity(item) === targetIdentity(target) ? target : item);
}
