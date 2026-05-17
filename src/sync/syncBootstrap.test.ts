import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, SyncSettings, SyncTarget } from "../domain/types";
import { createUnlockState, encryptAppData, encryptTextPackage } from "../storage/encryption";
import { currentUnlockState, initializeVault, lockVault } from "../storage/vaultSession";
import { loadDataFromSyncSettings } from "./syncBootstrap";
import { exportSyncSettingsPackage, previewSyncSettingsPackage, SYNC_SETTINGS_FORMAT } from "./syncSettingsPackage";

describe("sync bootstrap import", () => {
  beforeEach(async () => {
    await initializeVault("test-passphrase", false);
  });

  afterEach(() => {
    lockVault();
    vi.unstubAllGlobals();
  });

  it("loads S3 remote data from an encrypted sync settings package", async () => {
    const settings = singleTargetSettings();
    const remote = { ...initialData(), accounts: [{ ...initialData().accounts[0], name: "远端账本" }] };
    const remoteUnlock = await createUnlockState("test-passphrase");
    stubFetch([new Response(await encryptAppData(remote, remoteUnlock), { status: 200 })]);

    const settingsPackage = await exportSyncSettingsPackage(settings);
    const preview = await previewSyncSettingsPackage(settingsPackage, "test-passphrase");
    const data = await loadDataFromSyncSettings({ ...preview, passphrase: "test-passphrase", rememberDevice: false });

    expect(data.accounts[0].name).toBe("远端账本");
    expect(data.syncSettings?.targets).toHaveLength(1);
    expect(currentUnlockState().salt).toBe(remoteUnlock.salt);
  });

  it("fails when remote sync data is missing", async () => {
    stubFetch([new Response("", { status: 404 })]);

    await expect(loadDataFromSyncSettings({
      settings: singleTargetSettings(),
      passphrase: "test-passphrase",
      rememberDevice: false,
    })).rejects.toThrow("没有找到远端同步数据");
  });

  it("rejects plaintext or invalid sync settings packages", async () => {
    await expect(previewSyncSettingsPackage(JSON.stringify(singleTargetSettings()), "test-passphrase"))
      .rejects.toThrow("同步配置导入文件必须是 Coinly 加密包");

    const wrong = await encryptTextPackage(JSON.stringify({ format: "wrong", exportedAt: now(), syncSettings: singleTargetSettings() }), currentUnlockState());
    await expect(previewSyncSettingsPackage(wrong, "test-passphrase")).rejects.toThrow("同步配置包格式不支持");
  });

  it("rejects unsupported sync providers in the package", async () => {
    const packageValue = await encryptTextPackage(JSON.stringify({
      format: SYNC_SETTINGS_FORMAT,
      exportedAt: now(),
      syncSettings: { enabled: true, targets: [{ ...s3Target(), provider: "dropbox" }] },
    }), currentUnlockState());

    await expect(previewSyncSettingsPackage(packageValue, "test-passphrase"))
      .rejects.toThrow("同步目标包含不支持的来源");
  });

  it("rejects invalid remote data without creating a local ledger", async () => {
    const remoteUnlock = await createUnlockState("test-passphrase");
    const invalidRemote = await encryptTextPackage(JSON.stringify({ transactions: [] }), remoteUnlock);
    stubFetch([new Response(invalidRemote, { status: 200 })]);

    await expect(loadDataFromSyncSettings({
      settings: singleTargetSettings(),
      passphrase: "test-passphrase",
      rememberDevice: false,
    })).rejects.toThrow("数据校验失败：导入文件不是有效的 Coinly 数据");
  });

  it("fails on same-timestamp remote conflicts", async () => {
    const local = initialData();
    const left = { ...local, accounts: [{ ...local.accounts[0], name: "左侧" }] };
    const right = { ...local, accounts: [{ ...local.accounts[0], name: "右侧" }] };
    stubFetch([new Response(await encrypted(left), { status: 200 }), new Response(await encrypted(right), { status: 200 })]);

    await expect(loadDataFromSyncSettings({
      settings: multiTargetSettings(),
      passphrase: "test-passphrase",
      rememberDevice: false,
    })).rejects.toThrow("多个远端同步数据冲突");
  });
});

async function encrypted(data: AppData): Promise<string> {
  return encryptAppData(data, currentUnlockState());
}

function now(): string {
  return new Date().toISOString();
}

function singleTargetSettings(): SyncSettings {
  return { enabled: true, targets: [s3Target()] };
}

function multiTargetSettings(): SyncSettings {
  return { enabled: true, targets: [s3Target({ bucket: "primary" }), s3Target({ bucket: "backup" })] };
}

function s3Target(patch: Partial<SyncTarget> = {}): SyncTarget {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    provider: "s3-compatible",
    endpoint: "https://s3.example",
    region: "auto",
    bucket: "coinly-backups",
    objectKey: "snapshots/main.json",
    accessKeyId: "key-id",
    secretAccessKey: "secret",
    forcePathStyle: true,
    ...patch,
  };
}

function stubFetch(responses: readonly Response[]): void {
  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
  responses.forEach((response) => {
    fetchMock.mockResolvedValueOnce(response);
  });
  vi.stubGlobal("fetch", fetchMock);
}
