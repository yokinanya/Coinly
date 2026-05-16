import type { LegacySyncProvider, SyncProvider, SyncSettings } from "../domain/types";
import { currentUnlockState } from "../storage/vaultSession";
import { decryptTextPackage, encryptTextPackage, isEncryptedPackage, unlockPackageWithPassphrase } from "../storage/encryption";
import { normalizeSyncSettings } from "./syncClient";

export const SYNC_SETTINGS_FORMAT = "coinly.sync-settings.v1";

const SYNC_PROVIDER_VALUES: readonly SyncProvider[] = ["s3-compatible", "onedrive", "google-drive", "weiyun"];
const LEGACY_PROVIDER_VALUES: readonly LegacySyncProvider[] = ["s3"];
const TARGET_STRING_FIELDS = [
  "id",
  "name",
  "endpoint",
  "bucket",
  "objectKey",
  "region",
  "accessKeyId",
  "secretAccessKey",
  "driveFileId",
  "driveFolderId",
  "accessToken",
  "proxyBaseUrl",
  "accountId",
  "username",
] as const;
const SETTINGS_STRING_FIELDS = ["lastSyncedAt", "endpoint", "bucket", "objectKey", "accessKey", "username"] as const;

export interface SyncSettingsPreview {
  readonly settings: SyncSettings;
  readonly summary: SyncSettingsSummary;
}

export interface SyncSettingsSummary {
  readonly targets: number;
  readonly enabledTargets: number;
  readonly providers: readonly SyncProvider[];
}

interface SyncSettingsPackage {
  readonly format: typeof SYNC_SETTINGS_FORMAT;
  readonly exportedAt: string;
  readonly syncSettings: SyncSettings;
}

export async function exportSyncSettingsPackage(settings?: SyncSettings): Promise<string> {
  const normalized = requireNormalizedSettings(settings);
  return encryptTextPackage(JSON.stringify(syncSettingsPackage(normalized)), currentUnlockState());
}

export async function previewSyncSettingsPackage(value: string, passphrase: string): Promise<SyncSettingsPreview> {
  if (!isEncryptedPackage(value)) throw new Error("同步配置导入文件必须是 Coinly 加密包");
  const unlock = await unlockPackageWithPassphrase(value, passphrase);
  const payload = parseSyncSettingsPackage(await decryptTextPackage(value, unlock));
  return { settings: payload.syncSettings, summary: syncSettingsSummary(payload.syncSettings) };
}

export function syncSettingsSummary(settings: SyncSettings): SyncSettingsSummary {
  const targets = settings.targets ?? [];
  return {
    targets: targets.length,
    enabledTargets: targets.filter((target) => target.enabled).length,
    providers: [...new Set(targets.map((target) => target.provider))],
  };
}

function syncSettingsPackage(settings: SyncSettings): SyncSettingsPackage {
  return { format: SYNC_SETTINGS_FORMAT, exportedAt: new Date().toISOString(), syncSettings: settings };
}

function parseSyncSettingsPackage(value: string): SyncSettingsPackage {
  const payload = parsePackageJson(value);
  if (payload.format !== SYNC_SETTINGS_FORMAT) throw new Error("同步配置包格式不支持");
  if (!isNonEmptyString(payload.exportedAt)) throw new Error("同步配置包缺少导出时间");
  const settings = readSyncSettings(payload.syncSettings);
  return { format: SYNC_SETTINGS_FORMAT, exportedAt: payload.exportedAt, syncSettings: settings };
}

function readSyncSettings(value: unknown): SyncSettings {
  if (!isRecord(value)) throw new Error("同步配置包缺少 syncSettings");
  validateSyncSettings(value);
  return requireNormalizedSettings(value as unknown as SyncSettings);
}

function requireNormalizedSettings(settings?: SyncSettings): SyncSettings {
  const normalized = normalizeSyncSettings(settings);
  if (!normalized || normalized.targets?.length === 0) {
    throw new Error("同步配置未包含同步提供方");
  }
  return normalized;
}

function validateSyncSettings(value: Record<string, unknown>): void {
  optionalBooleanField(value, "enabled");
  optionalProviderField(value, "provider");
  SETTINGS_STRING_FIELDS.forEach((field) => optionalStringField(value, field));
  optionalTargetField(value, "primary");
  optionalTargetField(value, "backup");
  validateTargets(value.targets);
}

function validateTargets(value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error("同步配置 targets 必须是数组");
  value.forEach(validateTarget);
}

function optionalTargetField(value: Record<string, unknown>, field: "primary" | "backup"): void {
  const target = value[field];
  if (target === undefined) return;
  validateTarget(target);
}

function validateTarget(value: unknown): void {
  if (!isRecord(value)) throw new Error("同步目标必须是对象");
  requiredBooleanField(value, "enabled");
  requiredSyncProviderField(value, "provider");
  requiredStringField(value, "endpoint");
  requiredStringField(value, "objectKey");
  TARGET_STRING_FIELDS.forEach((field) => optionalStringField(value, field));
  optionalBooleanField(value, "forcePathStyle");
  optionalAccountTypeField(value);
}

function optionalProviderField(value: Record<string, unknown>, field: "provider"): void {
  const provider = value[field];
  if (provider === undefined) return;
  if (isSyncProvider(provider) || isLegacyProvider(provider)) return;
  throw new Error("同步配置包含不支持的提供方");
}

function requiredSyncProviderField(value: Record<string, unknown>, field: "provider"): void {
  const provider = value[field];
  if (isSyncProvider(provider)) return;
  throw new Error("同步目标包含不支持的提供方");
}

function optionalAccountTypeField(value: Record<string, unknown>): void {
  const accountType = value.accountType;
  if (accountType === undefined || accountType === "personal" || accountType === "work") return;
  throw new Error("同步目标 accountType 字段无效");
}

function requiredBooleanField(value: Record<string, unknown>, field: string): void {
  if (typeof value[field] === "boolean") return;
  throw new Error(`同步目标 ${field} 字段必须是布尔值`);
}

function optionalBooleanField(value: Record<string, unknown>, field: string): void {
  if (value[field] === undefined || typeof value[field] === "boolean") return;
  throw new Error(`同步配置 ${field} 字段必须是布尔值`);
}

function requiredStringField(value: Record<string, unknown>, field: string): void {
  if (typeof value[field] === "string") return;
  throw new Error(`同步目标 ${field} 字段必须是字符串`);
}

function optionalStringField(value: Record<string, unknown>, field: string): void {
  if (value[field] === undefined || typeof value[field] === "string") return;
  throw new Error(`同步配置 ${field} 字段必须是字符串`);
}

function parsePackageJson(value: string): Partial<SyncSettingsPackage> {
  try {
    return JSON.parse(value) as Partial<SyncSettingsPackage>;
  } catch (error) {
    throw new Error("同步配置包不是有效 JSON", { cause: error });
  }
}

function isSyncProvider(value: unknown): value is SyncProvider {
  return SYNC_PROVIDER_VALUES.includes(value as SyncProvider);
}

function isLegacyProvider(value: unknown): value is LegacySyncProvider {
  return LEGACY_PROVIDER_VALUES.includes(value as LegacySyncProvider);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
