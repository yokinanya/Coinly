import type { SyncTarget } from "../domain/types";
import { CLOUD_SYNC_FILE_NAME } from "./syncDefaults";
import { assertConditionalWriteResponse, readRemotePayloadResponse } from "./remotePayload";
import { oauthClientId } from "./oauthConfig";
import type { RemoteSnapshot } from "./syncTypes";

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GOOGLE_DRIVE_SCOPE = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");
const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_ROOT = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const APP_DATA_SPACE = "appDataFolder";
const GOOGLE_AUTH_CANCELLED = "popup_closed";
let gisScriptPromise: Promise<void> | undefined;

export async function authorizeGoogleDrive(target: SyncTarget): Promise<SyncTarget> {
  const accessToken = await requestGoogleAccessToken();
  const username = await readGoogleAccountEmail(accessToken);
  return { ...target, accessToken, username };
}

export function disconnectGoogleDrive(target: SyncTarget): SyncTarget {
  if (target.accessToken && window.google?.accounts.oauth2.revoke) {
    window.google.accounts.oauth2.revoke(target.accessToken);
  }
  const next = { ...target };
  delete next.accessToken;
  delete next.driveFileId;
  delete next.username;
  return next;
}

export async function readGoogleDrive(target: SyncTarget): Promise<RemoteSnapshot | undefined> {
  const token = requireAccessToken(target);
  const file = await findDriveFile(token);
  if (!file) return undefined;
  const response = await googleFetch(`${DRIVE_API_ROOT}/files/${encodeURIComponent(file.id)}?alt=media`, token);
  const payload = await readRemotePayloadResponse(response, "Google Drive");
  return payload ? { payload, version: file.version } : undefined;
}

export async function writeGoogleDrive(target: SyncTarget, payload: string, version?: string): Promise<void> {
  const token = requireAccessToken(target);
  const file = await findDriveFile(token);
  if (version && file?.version && file.version !== version) {
    throw new Error("Google Drive 远端已发生变化，请重新同步");
  }
  const response = file
    ? await updateDriveFile(file.id, payload, token)
    : await createDriveFile(payload, token);
  assertConditionalWriteResponse(response, "Google Drive");
}

export async function testGoogleDrive(target: SyncTarget): Promise<"found" | "missing"> {
  const token = requireAccessToken(target);
  return (await findDriveFile(token)) ? "found" : "missing";
}

async function requestGoogleAccessToken(): Promise<string> {
  await loadGoogleIdentityScript();
  const clientId = oauthClientId("google-drive");
  const google = window.google;
  if (!google) throw new Error("Google Identity Services 未就绪");
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPE,
      include_granted_scopes: true,
      callback: (response) => handleTokenResponse(response, resolve, reject),
      error_callback: (error) => reject(googleAuthError(error)),
    });
    client.requestAccessToken();
  });
}

async function findDriveFile(accessToken: string): Promise<DriveFile | undefined> {
  const params = new URLSearchParams({
    spaces: APP_DATA_SPACE,
    q: `name = '${escapeDriveQuery(CLOUD_SYNC_FILE_NAME)}' and trashed = false`,
    fields: "files(id,name,version)",
    pageSize: "1",
  });
  const response = await googleFetch(`${DRIVE_API_ROOT}/files?${params.toString()}`, accessToken);
  if (!response.ok) throw googleError(response, "读取 Google Drive 文件列表失败");
  const body = await response.json() as { readonly files?: readonly DriveFile[] };
  return body.files?.[0];
}

async function updateDriveFile(id: string, payload: string, accessToken: string): Promise<Response> {
  return googleFetch(`${DRIVE_UPLOAD_ROOT}/files/${encodeURIComponent(id)}?uploadType=media`, accessToken, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

async function createDriveFile(payload: string, accessToken: string): Promise<Response> {
  const boundary = `coinly-${crypto.randomUUID()}`;
  return googleFetch(`${DRIVE_UPLOAD_ROOT}/files?uploadType=multipart&fields=id,name`, accessToken, {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body: multipartBody(boundary, payload),
  });
}

async function googleFetch(url: string, accessToken: string, init: FetchInit = {}): Promise<Response> {
  const response = await fetch(url, { ...init, headers: requestHeaders(init.headers, accessToken) });
  if (response.status === 401 || response.status === 403) throw new Error("Google Drive 授权已失效，请重新授权");
  return response;
}

async function readGoogleAccountEmail(accessToken: string): Promise<string> {
  const response = await googleFetch(GOOGLE_USERINFO_URL, accessToken);
  if (!response.ok) throw googleError(response, "读取 Google 账户邮箱失败");
  const body = await response.json() as GoogleUserInfo;
  if (!body.email) throw new Error("Google Drive 授权成功，但 Google 未返回账户邮箱");
  return body.email;
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  gisScriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity Services 脚本加载失败"));
    document.head.append(script);
  });
  return gisScriptPromise;
}

function handleTokenResponse(
  response: GoogleTokenResponse,
  resolve: (token: string) => void,
  reject: (error: Error) => void,
): void {
  if (response.error) {
    reject(googleAuthError(response));
    return;
  }
  if (!response.access_token) throw new Error("Google Drive 授权失败：未返回访问令牌");
  resolve(response.access_token);
}

function googleAuthError(error: GoogleAuthError): Error {
  const code = error.type ?? error.error;
  if (code === GOOGLE_AUTH_CANCELLED) return new Error("Google Drive 授权已取消");
  if (code === "popup_failed_to_open") return new Error("Google Drive 授权窗口无法打开，请允许浏览器弹窗后重试");
  const detail = error.message ?? error.error_description ?? code ?? "未知错误";
  return new Error(`Google Drive 授权失败：${detail}`);
}

function multipartBody(boundary: string, payload: string): string {
  const metadata = JSON.stringify({ name: CLOUD_SYNC_FILE_NAME, parents: [APP_DATA_SPACE] });
  return [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    payload,
    `--${boundary}--`,
  ].join("\r\n");
}

function googleError(response: Response, message: string): Error {
  return new Error(`${message}：${response.status} ${response.statusText}`);
}

function requireAccessToken(target: SyncTarget): string {
  const token = target.accessToken?.trim();
  if (!token) throw new Error("Google Drive 未授权，请先登录或重新授权");
  return token;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function requestHeaders(headers: FetchInit["headers"], accessToken: string): Record<string, string> {
  return { ...(headers as Record<string, string> | undefined), authorization: `Bearer ${accessToken}` };
}

interface DriveFile {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
}

interface GoogleTokenResponse {
  readonly access_token?: string;
  readonly error?: string;
  readonly error_description?: string;
  readonly message?: string;
}

interface GoogleAuthError {
  readonly type?: string;
  readonly error?: string;
  readonly error_description?: string;
  readonly message?: string;
}

interface GoogleUserInfo {
  readonly email?: string;
}

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

declare global {
  interface Window {
    readonly google?: {
      readonly accounts: {
        readonly oauth2: {
          readonly initTokenClient: (config: {
            readonly client_id: string;
            readonly scope: string;
            readonly include_granted_scopes?: boolean;
            readonly callback: (response: GoogleTokenResponse) => void;
            readonly error_callback?: (error: GoogleAuthError) => void;
          }) => { readonly requestAccessToken: (options?: { readonly prompt?: string }) => void };
          readonly revoke?: (accessToken: string) => void;
        };
      };
    };
  }
}
