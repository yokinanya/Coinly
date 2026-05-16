const WEIYUN_MCP_URL = "https://www.weiyun.com/api/v3/mcpserver";
const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_HEADERS = "content-type, x-weiyun-token";

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      if (request.method === "OPTIONS") return preflightResponse();
      const url = new URL(request.url);
      if (request.method !== "POST") return corsText("Method Not Allowed", 405);
      if (url.pathname === "/mcp") return proxyMcp(request);
      if (url.pathname === "/download") return proxyDownload(request);
      return corsText("Not Found", 404);
    } catch (error) {
      return corsText(errorMessage(error), 400);
    }
  },
};

async function proxyMcp(request: Request): Promise<Response> {
  const token = requireToken(request);
  const response = await fetch(WEIYUN_MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      WyHeader: `mcp_token=${token}`,
    },
    body: request.body,
  });
  return withCors(response);
}

async function proxyDownload(request: Request): Promise<Response> {
  const body = await readDownloadRequest(request);
  const response = await fetch(body.url, { headers: body.cookie ? { cookie: body.cookie } : {} });
  return withCors(response);
}

async function readDownloadRequest(request: Request): Promise<DownloadRequest> {
  const value = await request.json().catch((error: unknown) => {
    throw new Error("下载代理请求不是有效 JSON", { cause: error });
  });
  if (!isRecord(value) || typeof value.url !== "string") {
    throw new Error("下载代理请求缺少 url");
  }
  if (!isAllowedDownloadUrl(value.url)) {
    throw new Error("下载代理只允许 HTTPS URL");
  }
  if (value.cookie !== undefined && typeof value.cookie !== "string") {
    throw new Error("下载代理 cookie 字段必须是字符串");
  }
  return { url: value.url, cookie: value.cookie };
}

function requireToken(request: Request): string {
  const token = request.headers.get("x-weiyun-token")?.trim();
  if (!token) throw new Error("缺少 x-weiyun-token");
  return token;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  setCorsHeaders(headers);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function preflightResponse(): Response {
  const headers = new Headers();
  setCorsHeaders(headers);
  headers.set("access-control-max-age", "86400");
  return new Response(null, { status: 204, headers });
}

function corsText(message: string, status: number): Response {
  const headers = new Headers({ "content-type": "text/plain; charset=utf-8" });
  setCorsHeaders(headers);
  return new Response(message, { status, headers });
}

function setCorsHeaders(headers: Headers): void {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", ALLOWED_METHODS);
  headers.set("access-control-allow-headers", ALLOWED_HEADERS);
}

function isAllowedDownloadUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "代理请求失败";
}

interface DownloadRequest {
  readonly url: string;
  readonly cookie?: string;
}
