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

  it("merges local and remote transaction additions and writes the merged data", async () => {
    const local = withTransaction(initialData(), "local-transaction", SMALL_NEWER_DAYS);
    const remote = withTransaction(initialData(), "remote-transaction", LARGER_NEWER_DAYS);
    const fetchMock = stubFetch([
      new Response(await encrypted(remote), { status: 200 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("merged");
    expect(result.remoteData?.transactions.map((item) => item.id)).toEqual([
      "local-transaction",
      "remote-transaction",
    ]);
    expect((await decryptedPutData(fetchMock)).transactions).toHaveLength(2);
  });

  it("merges a local entity edit with a remote transaction addition", async () => {
    const local = withAccountName(initialData(), "本地账户", LARGER_NEWER_DAYS);
    const remote = withTransaction(initialData(), "remote-transaction", SMALL_NEWER_DAYS);
    stubFetch([
      new Response(await encrypted(remote), { status: 200 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("merged");
    expect(result.remoteData?.accounts[0].name).toBe("本地账户");
    expect(result.remoteData?.transactions[0]?.id).toBe("remote-transaction");
  });

  it("chooses the newer entity when both sides changed the same entity", async () => {
    const base = initialData();
    const local = withAccountName(base, "本地账户", SMALL_NEWER_DAYS);
    const remote = withAccountName(base, "远端账户", LARGER_NEWER_DAYS);
    stubFetch([
      new Response(await encrypted(remote), { status: 200 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("merged");
    expect(result.remoteData?.accounts[0].name).toBe("远端账户");
  });

  it("keeps one-sided missing entities instead of treating them as deletes", async () => {
    const local = initialData();
    const remote = { ...withUpdatedAt(local, SMALL_NEWER_DAYS), categories: local.categories.slice(1) };
    stubFetch([
      new Response(await encrypted(remote), { status: 200 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("merged");
    expect(result.remoteData?.categories).toHaveLength(local.categories.length);
  });

  it("reports a conflict for same-entity edits with the same timestamp", async () => {
    const local = withAccountName(initialData(), "本地账户", SMALL_NEWER_DAYS);
    const remote = { ...local, accounts: [{ ...local.accounts[0], name: "远端账户" }] };
    stubFetch([new Response(await encrypted(remote), { status: 200 })]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("remote-conflict");
    expect(result.remoteData?.accounts[0].name).toBe("远端账户");
  });

  it("writes merged data back to every enabled target", async () => {
    const local = withTransaction(initialData(), "local-transaction", SMALL_NEWER_DAYS);
    const primary = withTransaction(initialData(), "primary-transaction", SMALL_NEWER_DAYS);
    const backup = withTransaction(initialData(), "backup-transaction", LARGER_NEWER_DAYS);
    const fetchMock = stubFetch([
      new Response(await encrypted(primary), { status: 200 }),
      new Response(await encrypted(backup), { status: 200 }),
      new Response("", { status: 200 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(local, multiTargetSettings());

    expect(result.status).toBe("merged");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.remoteData?.transactions.map((item) => item.id)).toEqual([
      "local-transaction",
      "primary-transaction",
      "backup-transaction",
    ]);
  });

  it("stops for plaintext remote payloads before irreversible overwrite", async () => {
    const data = initialData();
    stubFetch([new Response(JSON.stringify(data), { status: 200 })]);

    const result = await syncData(data, singleTargetSettings());

    expect(result.status).toBe("remote-plaintext");
  });

  it("ignores private local settings when detecting remote conflicts", async () => {
    const local = {
      ...initialData(),
      aiSettings: { provider: "openai-compatible" as const, endpoint: "https://api.example", model: "model", apiKey: "key" },
      uiSettings: { theme: "dark" as const },
    };
    const remote = { ...local, aiSettings: undefined, uiSettings: { theme: "system" as const } };
    stubFetch([new Response(await encrypted(remote), { status: 200 })]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("up-to-date");
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

async function decryptedPutData(fetchMock: ReturnType<typeof stubFetch>): Promise<AppData> {
  const init = fetchMock.mock.calls[1]?.[1] as Parameters<typeof fetch>[1] | undefined;
  const payload = String(init?.body ?? "");
  const { decryptAppData } = await import("../storage/encryption");
  return decryptAppData(payload, currentUnlockState());
}

function withUpdatedAt(data: AppData, days: number): AppData {
  return { ...data, updatedAt: new Date(Date.parse(data.updatedAt) + days * dayMs()).toISOString() };
}

function withAccountName(data: AppData, name: string, days: number): AppData {
  const updatedAt = new Date(Date.parse(data.updatedAt) + days * dayMs()).toISOString();
  return {
    ...data,
    updatedAt,
    accounts: [{ ...data.accounts[0], name, updatedAt }],
  };
}

function withTransaction(data: AppData, id: string, days: number): AppData {
  const updatedAt = new Date(Date.parse(data.updatedAt) + days * dayMs()).toISOString();
  return {
    ...data,
    updatedAt,
    transactions: [{
      id,
      createdAt: updatedAt,
      updatedAt,
      kind: "expense",
      accountId: data.accounts[0].id,
      amount: 10,
      currency: data.accounts[0].currency,
      occurredAt: updatedAt,
      tagIds: [],
      note: id,
    }],
  };
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
