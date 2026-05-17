import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, SyncTarget } from "../domain/types";
import { encryptAppData } from "../storage/encryption";
import { currentUnlockState, initializeVault, lockVault } from "../storage/vaultSession";
import { LARGE_TIME_GAP_MS, syncData } from "./syncClient";

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const SMALL_NEWER_DAYS = 1;
const LARGER_NEWER_DAYS = 2;
const DIVERGENT_OLDER_DAYS = -8;

describe("sync consistency decisions", () => {
  beforeEach(async () => {
    await initializeVault("test-passphrase", false);
  });

  afterEach(() => {
    lockVault();
    vi.unstubAllGlobals();
  });

  it("returns the highest newer remote data for automatic apply", async () => {
    const local = initialData();
    const primary = withUpdatedAt(local, SMALL_NEWER_DAYS);
    const backup = withUpdatedAt(local, LARGER_NEWER_DAYS);
    stubFetch([
      new Response(await encrypted(primary), { status: 200 }),
      new Response(await encrypted(backup), { status: 200 }),
    ]);

    const result = await syncData(local, multiTargetSettings());

    expect(result.status).toBe("remote-newer");
    expect(result.remoteData?.updatedAt).toBe(backup.updatedAt);
  });

  it("stops for plaintext remote payloads before irreversible overwrite", async () => {
    const data = initialData();
    stubFetch([new Response(JSON.stringify(data), { status: 200 })]);

    const result = await syncData(data, singleTargetSettings());

    expect(result.status).toBe("remote-plaintext");
  });

  it("rejects invalid remote payloads instead of silently overwriting them", async () => {
    const data = initialData();
    stubFetch([new Response(JSON.stringify({ transactions: [] }), { status: 200 })]);

    await expect(syncData(data, singleTargetSettings())).rejects.toThrow("远端不是 Coinly 加密包");
  });

  it("reports HTML remote responses as a configuration problem", async () => {
    const data = initialData();
    stubFetch([new Response("<!doctype html><title>Login</title>", { status: 200 })]);

    await expect(syncData(data, singleTargetSettings())).rejects.toThrow("远端返回了 HTML 页面");
  });

  it("asks before overwriting when versions are too far apart", async () => {
    const local = { ...initialData(), localVersion: 50 };
    const remote = withUpdatedAt(local, DIVERGENT_OLDER_DAYS);
    stubFetch([new Response(await encrypted(remote), { status: 200 })]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("remote-divergent");
  });

  it("asks before applying remote when the remote version is much newer", async () => {
    const local = initialData();
    const days = Math.ceil(LARGE_TIME_GAP_MS / dayMs()) + 1;
    const remote = withUpdatedAt(local, days);
    stubFetch([new Response(await encrypted(remote), { status: 200 })]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("remote-divergent");
  });

  it("treats same-version content differences as a conflict", async () => {
    const local = initialData();
    const remote = { ...local, accounts: [{ ...local.accounts[0], name: "远端账户" }] };
    stubFetch([new Response(await encrypted(remote), { status: 200 })]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("remote-conflict");
    expect(result.remoteData?.accounts[0].name).toBe("远端账户");
  });
});

async function encrypted(data: AppData): Promise<string> {
  return encryptAppData(data, currentUnlockState());
}

function withUpdatedAt(data: AppData, days: number): AppData {
  return { ...data, updatedAt: new Date(Date.parse(data.updatedAt) + days * dayMs()).toISOString() };
}

function dayMs(): number {
  return HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
}

function singleTargetSettings() {
  return { enabled: true, targets: [s3Target({ forcePathStyle: true })] };
}

function multiTargetSettings() {
  return {
    enabled: true,
    targets: [
      s3Target({ forcePathStyle: true, bucket: "primary" }),
      s3Target({ forcePathStyle: true, bucket: "backup" }),
    ],
  };
}

function s3Target(patch: { readonly forcePathStyle?: boolean; readonly bucket?: string }): SyncTarget {
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
    ...patch,
  };
}

function stubFetch(responses: readonly Response[]) {
  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
  responses.forEach((response) => {
    fetchMock.mockResolvedValueOnce(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
