import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { SyncTarget } from "../domain/types";
import { initializeVault, lockVault } from "../storage/vaultSession";
import { s3ObjectUrl } from "./s3Adapter";
import { normalizeSyncSettings, overwriteRemote, syncData, testSyncTarget } from "./syncClient";

describe("syncClient", () => {
  beforeEach(async () => {
    await initializeVault("test-passphrase", false);
  });

  afterEach(() => {
    lockVault();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("normalizes configured targets", () => {
    const settings = normalizeSyncSettings({
      enabled: true,
      targets: [
        s3Target({ forcePathStyle: true, bucket: "primary" }),
        { enabled: true, provider: "onedrive", endpoint: "", objectKey: "", accessToken: "token" },
      ],
    });

    expect(settings?.targets).toHaveLength(2);
    expect(settings?.targets?.[1].provider).toBe("onedrive");
  });

  it("uploads an encrypted S3 package after a missing remote object", async () => {
    const data = initialData();
    const fetchMock = stubFetch([
      new Response("", { status: 404 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(data, {
      enabled: true,
      targets: [s3Target({ forcePathStyle: true })],
    });

    expect(result.status).toBe("uploaded");
    const body = putBody(fetchMock, 2);
    expect(JSON.parse(body).format).toBe("coinly.encrypted.v1");
    expect(body).not.toContain(data.accounts[0].name);
  });

  it("generates S3-compatible virtual hosted and path-style URLs", () => {
    const target = s3Target({ forcePathStyle: false });
    expect(s3ObjectUrl(target)).toBe("https://coinly-backups.s3.example/snapshots/main.json");
    expect(s3ObjectUrl({ ...target, forcePathStyle: true }))
      .toBe("https://s3.example/coinly-backups/snapshots/main.json");
  });

  it("signs S3-compatible GET and PUT requests", async () => {
    const data = initialData();
    const fetchMock = stubFetch([
      new Response("", { status: 404 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(data, {
      enabled: true,
      targets: [s3Target({ forcePathStyle: true })],
    });

    expect(result.status).toBe("uploaded");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://s3.example/coinly-backups/snapshots/main.json", {
      method: "GET",
      headers: expect.objectContaining(signedHeaderShape()),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://s3.example/coinly-backups/snapshots/main.json", {
      method: "PUT",
      headers: expect.objectContaining({ ...signedHeaderShape(), "content-type": "application/json" }),
      body: expect.any(String),
    });
  });

  it("writes all enabled targets before reporting success", async () => {
    const data = initialData();
    const fetchMock = stubFetch([
      new Response("", { status: 404 }),
      new Response("", { status: 404 }),
      new Response("", { status: 200 }),
      new Response("", { status: 200 }),
    ]);

    const result = await syncData(data, {
      enabled: true,
      targets: [
        s3Target({ forcePathStyle: true, bucket: "primary" }),
        s3Target({ forcePathStyle: true, bucket: "backup" }),
      ],
    });

    expect(result.status).toBe("uploaded");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requestUrls(fetchMock).slice(2)).toEqual(expect.arrayContaining([
      "https://s3.example/primary/snapshots/main.json",
      "https://s3.example/backup/snapshots/main.json",
    ]));
  });

  it("throttles repeated automatic syncs but allows manual syncs", async () => {
    const data = initialData();
    const target = s3Target({ forcePathStyle: true });
    const settings = { enabled: true, targets: [target] };
    const fetchMock = stubFetch([
      new Response("", { status: 404 }),
      new Response("", { status: 200 }),
      new Response("", { status: 404 }),
      new Response("", { status: 200 }),
    ]);

    const automatic = await syncData(data, settings, { throttle: true });
    const throttled = await syncData(data, settings, { throttle: true });
    const manual = await syncData(data, settings);

    expect(automatic.status).toBe("uploaded");
    expect(throttled.status).toBe("throttled");
    expect(manual.status).toBe("uploaded");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fails when any enabled target write fails", async () => {
    const data = initialData();
    stubFetch([
      new Response("", { status: 404 }),
      new Response("", { status: 404 }),
      new Response("", { status: 200 }),
      new Response("", { status: 503, statusText: "Unavailable" }),
    ]);

    await expect(syncData(data, {
      enabled: true,
      targets: [
        s3Target({ forcePathStyle: true, bucket: "primary" }),
        s3Target({ forcePathStyle: true, bucket: "backup" }),
      ],
    })).rejects.toThrow("写入失败");
  });

  it("overwrites all enabled targets when keeping local data", async () => {
    const data = initialData();
    const fetchMock = stubFetch([
      new Response("", { status: 200 }),
      new Response("", { status: 200 }),
    ]);

    await overwriteRemote(data, {
      enabled: true,
      targets: [
        s3Target({ forcePathStyle: true, bucket: "primary" }),
        s3Target({ forcePathStyle: true, bucket: "backup" }),
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestUrls(fetchMock)).toEqual(expect.arrayContaining([
      "https://s3.example/primary/snapshots/main.json",
      "https://s3.example/backup/snapshots/main.json",
    ]));
  });

  it("tests target connection without uploading data", async () => {
    const fetchMock = stubFetch([new Response("", { status: 404 })]);

    const result = await testSyncTarget(s3Target({ forcePathStyle: true }));

    expect(result).toBe("missing");
    expect(fetchMock).toHaveBeenCalledWith("https://s3.example/coinly-backups/snapshots/main.json", {
      method: "GET",
      headers: expect.objectContaining(signedHeaderShape()),
    });
  });

  it("reports S3-compatible browser CORS failures explicitly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(testSyncTarget(s3Target({ forcePathStyle: true })))
      .rejects.toThrow("S3-Compatible 跨域或网络请求失败");
  });

  it("suggests Tencent COS CORS settings for HTML responses", async () => {
    stubFetch([new Response("<!doctype html><title>403</title>", { status: 200 })]);

    await expect(testSyncTarget({
      ...s3Target({ forcePathStyle: true }),
      endpoint: "https://cos.ap-guangzhou.myqcloud.com",
    })).rejects.toThrow("请配置 腾讯云 COS Bucket CORS");
  });

});

function signedHeaderShape() {
  return {
    authorization: expect.stringContaining("AWS4-HMAC-SHA256"),
    "x-amz-content-sha256": expect.any(String),
    "x-amz-date": expect.any(String),
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

function putBody(fetchMock: ReturnType<typeof stubFetch>, call: number): string {
  const init = fetchMock.mock.calls[call - 1]?.[1] as Parameters<typeof fetch>[1] | undefined;
  return String(init?.body ?? "");
}

function requestUrls(fetchMock: ReturnType<typeof stubFetch>): readonly string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function stubFetch(responses: readonly Response[]) {
  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
  responses.forEach((response) => {
    fetchMock.mockResolvedValueOnce(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
