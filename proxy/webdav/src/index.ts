const ALLOWED_METHODS = "GET, HEAD, PUT, DELETE, MKCOL, PROPFIND, POST, OPTIONS";
const METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "MKCOL", "PROPFIND"]);

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method === "OPTIONS") return preflightResponse(request);
      const url = new URL(request.url);
      if (request.method !== "POST") return corsText("Method Not Allowed", 405);
      if (url.pathname !== "/dav") return corsText("Not Found", 404);
      return proxyWebDav(request);
    } catch (error) {
      return corsText(errorMessage(error), 500);
    }
  },
};

async function proxyWebDav(request: Request): Promise<Response> {
  const targetUrl = requireTargetUrl(request);
  const method = requireMethod(request);
  const requestHeaders = upstreamHeaders(request);
  const response = await fetch(targetUrl, {
    method,
    headers: requestHeaders,
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
  });
  if (response.ok || response.status === 404) return withCors(response);
  const body = await response.text();
  return corsText(formatUpstreamError(response.status, response.statusText, body, method, targetUrl), response.status);
}

function requireTargetUrl(request: Request): string {
  const value = new URL(request.url).searchParams.get("url")?.trim();
  if (!value) throw new Error("缺少 url");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("WebDAV 代理只允许 HTTPS URL");
  return url.toString();
}

function requireMethod(request: Request): string {
  const method = new URL(request.url).searchParams.get("method")?.trim().toUpperCase() ?? request.method.toUpperCase();
  if (!method || !METHODS.has(method)) throw new Error("WebDAV 方法不支持");
  return method;
}

function upstreamHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");
  return headers;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  setCorsHeaders(headers);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function preflightResponse(request: Request): Response {
  const headers = new Headers();
  setCorsHeaders(headers);
  headers.set("access-control-allow-headers", requestedHeaders(request));
  headers.set("access-control-max-age", "86400");
  return new Response(null, { status: 204, headers });
}

function corsText(message: string, status: number): Response {
  const headers = new Headers({ "content-type": "text/plain; charset=utf-8" });
  setCorsHeaders(headers);
  return new Response(message, { status, headers });
}

function formatUpstreamError(status: number, statusText: string, body: string, method: string, targetUrl: string): string {
  const detail = body.trim() || statusText.trim() || "WebDAV 上游请求失败";
  return `WebDAV 上游请求失败：${status} ${method} ${targetUrl} ${detail}`;
}

function setCorsHeaders(headers: Headers): void {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", ALLOWED_METHODS);
  headers.set("vary", "origin");
}

function requestedHeaders(request: Request): string {
  const value = request.headers.get("access-control-request-headers")?.trim();
  return value || "authorization, content-type, depth, if-match, destination, overwrite, timeout, range, if-none-match, if-modified-since, if-unmodified-since";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "代理请求失败";
}
