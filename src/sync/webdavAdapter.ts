import type { SyncTarget } from "../domain/types";
import { CLOUD_SYNC_FILE_NAME } from "./syncDefaults";
import { assertConditionalWriteResponse, assertDeleteResponse, readRemotePayloadResponse } from "./remotePayload";
import type { RemoteSnapshot } from "./syncTypes";

const DEFAULT_WEBDAV_PATH = "Coinly";

export async function readWebDav(target: SyncTarget): Promise<RemoteSnapshot | undefined> {
  const fileUrl = await resolveFileUrl(target);
  const response = await webdavFetch(target, fileUrl, { method: "GET" });
  const payload = await readRemotePayloadResponse(response, "WebDAV");
  return payload ? { payload, version: response.headers.get("etag") ?? undefined } : undefined;
}

export async function writeWebDav(target: SyncTarget, payload: string, version?: string): Promise<void> {
  const fileUrl = await resolveFileUrl(target, true);
  const response = await webdavFetch(target, fileUrl, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(version ? { "if-match": version } : {}) },
    body: payload,
  });
  assertConditionalWriteResponse(response, "WebDAV");
}

export async function testWebDav(target: SyncTarget): Promise<"found" | "missing"> {
  const fileUrl = await resolveFileUrl(target);
  const response = await webdavFetch(target, fileUrl, { method: "GET" });
  if (response.ok) return "found";
  if (response.status === 404) return "missing";
  throw new Error(`WebDAV 连接测试失败：${response.status} ${response.statusText}`);
}

export async function deleteWebDav(target: SyncTarget, version?: string): Promise<void> {
  const fileUrl = await resolveFileUrl(target);
  const response = await webdavFetch(target, fileUrl, {
    method: "DELETE",
    headers: version ? { "if-match": version } : undefined,
  });
  assertDeleteResponse(response, "WebDAV");
}

async function resolveFileUrl(target: SyncTarget, createParents = false): Promise<string> {
  const base = requireBaseUrl(target);
  const path = normalizePath(target.directoryPath, DEFAULT_WEBDAV_PATH);
  const segments = path.split("/").filter(Boolean);
  const fileName = CLOUD_SYNC_FILE_NAME;
  const filePath = segments.length > 0 ? `${segments.join("/")}/${fileName}` : fileName;
  if (createParents) await ensureParents(target, base, segments);
  return joinWebDavUrl(base, filePath);
}

async function ensureParents(target: SyncTarget, baseUrl: string, segments: readonly string[]): Promise<void> {
  let currentPath = "";
  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const exists = await webdavExists(target, joinWebDavUrl(baseUrl, currentPath));
    if (!exists) await createDirectory(target, joinWebDavUrl(baseUrl, currentPath));
  }
}

async function createDirectory(target: SyncTarget, url: string): Promise<void> {
  const response = await webdavFetch(target, url, { method: "MKCOL" });
  if (response.ok || response.status === 405) return;
  throw new Error(`WebDAV 创建目录失败：${response.status} ${response.statusText}`);
}

async function webdavExists(target: SyncTarget, url: string): Promise<boolean> {
  const response = await webdavFetch(target, url, {
    method: "PROPFIND",
    headers: { depth: "0" },
  });
  return response.ok || response.status === 207;
}

async function webdavFetch(target: SyncTarget, url: string, init: globalThis.RequestInit): Promise<Response> {
  const response = await fetch(proxyRequestUrl(target, url, init), proxyRequestInit(target, url, init));
  if (response.status === 401 || response.status === 403) {
    const detail = (await response.clone().text()).trim();
    throw new Error(
      `WebDAV 授权失败：${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`,
    );
  }
  return response;
}

function requireBaseUrl(target: SyncTarget): string {
  const value = target.webdavUrl?.trim();
  if (!value) throw new Error("WebDAV URL 不能为空");
  return value.replace(/\/+$/, "");
}

function normalizePath(value: string | undefined, defaultPath: string): string {
  const path = value?.trim() || defaultPath;
  return path.replace(/^\/+|\/+$/g, "");
}

function joinWebDavUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/${encodePath(path)}`;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function withAuthHeaders(target: SyncTarget, headers?: globalThis.HeadersInit): Headers {
  const baseHeaders = new Headers(headers);
  const username = target.webdavUsername?.trim();
  const password = target.webdavPassword ?? "";
  if (username || password) {
    baseHeaders.set("authorization", `Basic ${btoa(`${username ?? ""}:${password}`)}`);
  }
  if (!baseHeaders.has("depth")) baseHeaders.set("depth", "1");
  return baseHeaders;
}

function proxyRequestUrl(target: SyncTarget, url: string, init: globalThis.RequestInit): string {
  const proxyBaseUrl = webdavProxyBaseUrl(target);
  if (!proxyBaseUrl) return url;
  const proxyUrl = new URL(`${proxyBaseUrl}/dav`);
  proxyUrl.searchParams.set("url", url);
  proxyUrl.searchParams.set("method", (init.method ?? "GET").toUpperCase());
  return proxyUrl.toString();
}

function proxyRequestInit(target: SyncTarget, url: string, init: globalThis.RequestInit): globalThis.RequestInit {
  const proxyBaseUrl = webdavProxyBaseUrl(target);
  if (!proxyBaseUrl) return { ...init, headers: withAuthHeaders(target, init.headers) };
  const headers = withAuthHeaders(target, init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  return {
    method: "POST",
    headers,
    body: proxyRequestBody(method, init.body),
  };
}

function proxyRequestBody(method: string, body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD") return undefined;
  return body;
}

function webdavProxyBaseUrl(target: SyncTarget): string {
  return (target.proxyBaseUrl || import.meta.env.VITE_WEBDAV_PROXY_URL || "").trim().replace(/\/+$/, "");
}
