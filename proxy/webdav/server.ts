import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const ALLOWED_METHODS = "GET, HEAD, PUT, DELETE, MKCOL, PROPFIND, POST, OPTIONS";
const METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "MKCOL", "PROPFIND"]);
const DEFAULT_HEADERS =
  "authorization, content-type, depth, if-match, destination, overwrite, timeout, range, if-none-match, if-modified-since, if-unmodified-since";

http.createServer(async (req, res) => {
  try {
    if (!req.url || !req.method) return sendText(res, 400, "Bad Request");
    const requestUrl = new URL(req.url, `http://${req.headers.host || HOST}`);
    if (req.method === "OPTIONS") return sendPreflight(req, res);
    if (requestUrl.pathname !== "/dav") return sendText(res, 404, "Not Found");
    if (!isProxyRequestMethod(req.method)) return sendText(res, 405, "Method Not Allowed");
    await proxyWebDav(req, res, requestUrl);
  } catch (error) {
    sendText(res, 500, error instanceof Error ? error.message : "代理请求失败");
  }
}).listen(PORT, HOST);

async function proxyWebDav(req: http.IncomingMessage, res: http.ServerResponse, requestUrl: URL): Promise<void> {
  const targetUrl = requireTargetUrl(requestUrl);
  const method = requireMethod(requestUrl, req.method);
  const headers = upstreamHeaders(req.headers);
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
  const upstream = await fetch(targetUrl, { method, headers, body });
  if (upstream.ok || upstream.status === 404) return sendUpstream(res, upstream);
  const text = await upstream.text();
  sendCorsText(res, upstream.status, formatUpstreamError(upstream.status, upstream.statusText, text, method, targetUrl));
}

function requireTargetUrl(requestUrl: URL): string {
  const value = requestUrl.searchParams.get("url")?.trim();
  if (!value) throw new Error("缺少 url");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("WebDAV 代理只允许 HTTPS URL");
  return url.toString();
}

function requireMethod(requestUrl: URL, fallback: string | undefined): string {
  const method = requestUrl.searchParams.get("method")?.trim().toUpperCase() ?? fallback?.toUpperCase() ?? "GET";
  if (!METHODS.has(method)) throw new Error("WebDAV 方法不支持");
  return method;
}

function isProxyRequestMethod(method: string): boolean {
  return method === "POST" || METHODS.has(method);
}

function upstreamHeaders(headers: http.IncomingHttpHeaders): Headers {
  const next = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== "string") continue;
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "origin" || lower === "referer") continue;
    next.set(key, value);
  }
  return next;
}

async function readBody(req: http.IncomingMessage): Promise<BodyInit | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
}

async function sendUpstream(res: http.ServerResponse, upstream: Response): Promise<void> {
  const body = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, { ...Object.fromEntries(upstream.headers.entries()), ...baseCorsHeaders() });
  res.end(body);
}

function sendPreflight(req: http.IncomingMessage, res: http.ServerResponse): void {
  const headers = corsHeaders(req);
  res.writeHead(204, headers);
  res.end();
}

function sendCorsText(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...baseCorsHeaders() });
  res.end(message);
}

function sendText(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...baseCorsHeaders() });
  res.end(message);
}

function baseCorsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": ALLOWED_METHODS,
    vary: "origin",
  };
}

function corsHeaders(req: http.IncomingMessage): Record<string, string> {
  const requested = typeof req.headers["access-control-request-headers"] === "string" ? req.headers["access-control-request-headers"] : DEFAULT_HEADERS;
  return {
    ...baseCorsHeaders(),
    "access-control-allow-headers": requested,
    "access-control-max-age": "86400",
  };
}

function formatUpstreamError(status: number, statusText: string, body: string, method: string, targetUrl: string): string {
  const detail = body.trim() || statusText.trim() || "WebDAV 上游请求失败";
  return `WebDAV 上游请求失败：${status} ${method} ${targetUrl} ${detail}`;
}
