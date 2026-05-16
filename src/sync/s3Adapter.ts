import type { SyncTarget } from "../domain/types";
import { assertConditionalWriteResponse, readRemotePayloadResponse } from "./remotePayload";
import type { RemoteSnapshot } from "./syncTypes";

type RequestHeaders = Record<string, string>;
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb924"
  + "27ae41e4649b934ca495991b7852b855";
const SERVICE = "s3";
const TERMINATOR = "aws4_request";

export async function readS3(target: SyncTarget): Promise<RemoteSnapshot | undefined> {
  const request = await signedRequest(target, "GET");
  const response = await s3Fetch(request.url, { method: "GET", headers: request.headers });
  const payload = await readRemotePayloadResponse(response, "S3-Compatible");
  return payload ? { payload, version: response.headers.get("etag") ?? undefined } : undefined;
}

export async function writeS3(target: SyncTarget, payload: string, version?: string): Promise<void> {
  const request = await signedRequest(target, "PUT", payload, version);
  const response = await s3Fetch(request.url, { method: "PUT", headers: request.headers, body: payload });
  assertConditionalWriteResponse(response, "S3-Compatible");
}

export function s3ObjectUrl(target: SyncTarget): string {
  const config = requireS3Config(target);
  const endpoint = new URL(config.endpoint);
  const objectPath = encodeObjectKey(config.objectKey);
  if (config.forcePathStyle) {
    endpoint.pathname = joinPath(endpoint.pathname, config.bucket, objectPath);
    return endpoint.toString();
  }
  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = joinPath(endpoint.pathname, objectPath);
  return endpoint.toString();
}

async function signedRequest(target: SyncTarget, method: "GET" | "PUT", body = "", version?: string) {
  const config = requireS3Config(target);
  const url = s3ObjectUrl(config);
  const date = new Date();
  const amzDate = amzTimestamp(date);
  const shortDate = amzDate.slice(0, 8);
  const payloadHash = method === "GET" ? EMPTY_SHA256 : await sha256Hex(body);
  const headers = baseHeaders(url, payloadHash, amzDate, method, version);
  const authorization = await authorizationHeader(config, method, url, headers, shortDate);
  return { url, headers: { ...headers, authorization } };
}

async function s3Fetch(url: string, init: FetchInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw s3NetworkError(url, error);
  }
}

function s3NetworkError(url: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : "未知网络错误";
  const host = new URL(url).host;
  return new Error(
    `S3-Compatible 跨域或网络请求失败：浏览器无法读取 ${host} 的响应。`
    + "请检查 Bucket CORS 是否允许当前站点 Origin、GET/PUT/OPTIONS 方法，以及 Authorization、content-type、x-amz-content-sha256、x-amz-date 请求头。"
    + `原始错误：${detail}`,
    { cause: error },
  );
}

async function authorizationHeader(
  target: RequiredS3Target,
  method: "GET" | "PUT",
  url: string,
  headers: RequestHeaders,
  shortDate: string,
): Promise<string> {
  const signedHeaders = Object.keys(headers).sort().join(";");
  const scope = `${shortDate}/${target.region}/${SERVICE}/${TERMINATOR}`;
  const canonical = canonicalRequest(method, url, headers, signedHeaders);
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    headers["x-amz-date"],
    scope,
    await sha256Hex(canonical),
  ].join("\n");
  const signature = await hmacHex(await signingKey(target, shortDate), stringToSign);
  return `AWS4-HMAC-SHA256 Credential=${target.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function canonicalRequest(
  method: "GET" | "PUT",
  url: string,
  headers: RequestHeaders,
  signedHeaders: string,
): string {
  const parsed = new URL(url);
  const canonicalHeaders = Object.keys(headers).sort()
    .map((key) => `${key}:${headers[key].trim()}\n`)
    .join("");
  return [
    method,
    parsed.pathname || "/",
    parsed.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    headers["x-amz-content-sha256"],
  ].join("\n");
}

function baseHeaders(
  url: string,
  payloadHash: string,
  amzDate: string,
  method: "GET" | "PUT",
  version?: string,
): RequestHeaders {
  const headers: RequestHeaders = {
    host: new URL(url).host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (version) {
    headers["if-match"] = version;
  }
  return method === "PUT" ? { ...headers, "content-type": "application/json" } : headers;
}

async function signingKey(target: RequiredS3Target, shortDate: string): Promise<ArrayBuffer> {
  const dateKey = await hmacRaw(`AWS4${target.secretAccessKey}`, shortDate);
  const regionKey = await hmacRaw(dateKey, target.region);
  const serviceKey = await hmacRaw(regionKey, SERVICE);
  return hmacRaw(serviceKey, TERMINATOR);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encode(value));
  return hex(digest);
}

async function hmacHex(key: string | ArrayBuffer, value: string): Promise<string> {
  return hex(await hmacRaw(key, value));
}

async function hmacRaw(key: string | ArrayBuffer, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes(key), {
    name: "HMAC",
    hash: "SHA-256",
  }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encode(value));
}

function keyBytes(value: string | ArrayBuffer): ArrayBuffer {
  return typeof value === "string" ? encode(value) : value;
}

function encode(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer.slice(0);
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function amzTimestamp(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeObjectKey(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function joinPath(...parts: readonly string[]): string {
  const path = parts.map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return `/${path}`;
}

interface RequiredS3Target extends SyncTarget {
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

function requireS3Config(target: SyncTarget): RequiredS3Target {
  const missing = [
    ["Endpoint", target.endpoint],
    ["Region", target.region],
    ["Bucket", target.bucket],
    ["Object Key", target.objectKey],
    ["Access Key ID", target.accessKeyId],
    ["Secret Access Key", target.secretAccessKey],
  ].filter(([, value]) => !value).map(([label]) => label);
  if (missing.length > 0) {
    throw new Error(`S3-Compatible 缺少配置：${missing.join("、")}`);
  }
  return target as RequiredS3Target;
}
