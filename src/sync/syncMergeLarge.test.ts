import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, SyncTarget } from "../domain/types";
import { encryptAppData } from "../storage/encryption";
import { currentUnlockState, initializeVault, lockVault } from "../storage/vaultSession";
import { syncData } from "./syncClient";

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const SMALL_NEWER_DAYS = 1;
const LARGER_NEWER_DAYS = 2;
const LARGE_SET_SIZE = 1000;

describe("large sync merges", () => {
  beforeEach(async () => {
    await initializeVault("test-passphrase", false);
  });

  afterEach(() => {
    lockVault();
    vi.unstubAllGlobals();
  });

  it("merges large one-sided transaction sets without changing results", async () => {
    const local = withTransactions(initialData(), "local", LARGE_SET_SIZE, SMALL_NEWER_DAYS);
    const remote = withTransactions(initialData(), "remote", LARGE_SET_SIZE, LARGER_NEWER_DAYS);
    stubFetch([
      new Response(await encrypted(remote), { status: 200 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("merged");
    expect(result.remoteData?.transactions).toHaveLength(LARGE_SET_SIZE * 2);
    expect(result.remoteData?.transactions[0]?.id).toBe("local-0");
    expect(result.remoteData?.transactions[LARGE_SET_SIZE]?.id).toBe("remote-0");
  });

  it("keeps large-set same-time entity conflicts explicit", async () => {
    const local = withTransactions(initialData(), "local", LARGE_SET_SIZE, SMALL_NEWER_DAYS);
    const remote = {
      ...local,
      transactions: [
        { ...local.transactions[0], note: "remote edit" },
        ...local.transactions.slice(1),
      ],
    };
    stubFetch([new Response(await encrypted(remote), { status: 200 })]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("remote-conflict");
    expect(result.remoteData?.transactions[0]?.note).toBe("remote edit");
  });

  it("keeps newer entity precedence in large merged sets", async () => {
    const base = withTransactions(initialData(), "shared", LARGE_SET_SIZE, SMALL_NEWER_DAYS);
    const local = editTransaction(base, "shared-500", "local edit", SMALL_NEWER_DAYS);
    const remote = editTransaction(base, "shared-500", "remote edit", LARGER_NEWER_DAYS);
    stubFetch([
      new Response(await encrypted(remote), { status: 200 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(local, singleTargetSettings());

    expect(result.status).toBe("merged");
    expect(result.remoteData?.transactions.find((item) => item.id === "shared-500")?.note).toBe("remote edit");
  });
});

async function encrypted(data: AppData): Promise<string> {
  return encryptAppData(data, currentUnlockState());
}

function withTransactions(data: AppData, prefix: string, count: number, days: number): AppData {
  const updatedAt = new Date(Date.parse(data.updatedAt) + days * dayMs()).toISOString();
  return {
    ...data,
    updatedAt,
    transactions: Array.from({ length: count }, (_unused, index) => transaction(data, prefix, index, updatedAt)),
  };
}

function transaction(data: AppData, prefix: string, index: number, updatedAt: string) {
  return {
    id: `${prefix}-${index}`,
    createdAt: updatedAt,
    updatedAt,
    kind: "expense" as const,
    accountId: data.accounts[0].id,
    amount: 10,
    currency: data.accounts[0].currency,
    occurredAt: updatedAt,
    tagIds: [],
    note: `${prefix}-${index}`,
  };
}

function editTransaction(data: AppData, id: string, note: string, days: number): AppData {
  const updatedAt = new Date(Date.parse(data.updatedAt) + days * dayMs()).toISOString();
  return {
    ...data,
    updatedAt,
    transactions: data.transactions.map((transaction) => {
      return transaction.id === id ? { ...transaction, note, updatedAt } : transaction;
    }),
  };
}

function dayMs(): number {
  return HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
}

function singleTargetSettings() {
  return { enabled: true, targets: [s3Target({ forcePathStyle: true })] };
}

function s3Target(patch: { readonly forcePathStyle?: boolean }): SyncTarget {
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
