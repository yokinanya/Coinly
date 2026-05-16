import type { AccountInfo, AuthenticationResult, PublicClientApplication } from "@azure/msal-browser";
import type { SyncTarget } from "../domain/types";
import { CLOUD_SYNC_FILE_NAME } from "./syncDefaults";
import { assertConditionalWriteResponse, readRemotePayloadResponse } from "./remotePayload";
import { oauthClientId, oneDriveAuthority } from "./oauthConfig";
import type { RemoteSnapshot } from "./syncTypes";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const ONEDRIVE_SCOPES = ["Files.ReadWrite.AppFolder", "User.Read"];
const ONE_DRIVE_CLIENT_SECRET_ERROR_MARKERS = ["AADSTS70002", "client_secret", "invalid_client"];
const MSAL_INTERACTION_IN_PROGRESS = "interaction_in_progress";
const CLIENT_CACHE = new Map<string, Promise<PublicClientApplication>>();
let activeInteraction: Promise<unknown> | undefined;

export async function authorizeOneDrive(target: SyncTarget): Promise<SyncTarget> {
  const token = await acquireOneDriveToken(target, true);
  return { ...target, accessToken: token.accessToken, accountId: token.accountId, username: token.username };
}

export async function disconnectOneDrive(target: SyncTarget): Promise<SyncTarget> {
  const client = await msalClient();
  const account = findAccount(client, target.accountId);
  if (account) await runInteractiveTask(() => client.logoutPopup({ account, mainWindowRedirectUri: window.location.href }));
  return clearOneDriveAuth(target);
}

export async function readOneDrive(target: SyncTarget): Promise<RemoteSnapshot | undefined> {
  const response = await graphFetch(target, "GET");
  const payload = await readRemotePayloadResponse(response, "OneDrive");
  return payload ? { payload, version: response.headers.get("etag") ?? response.headers.get("eTag") ?? undefined } : undefined;
}

export async function writeOneDrive(target: SyncTarget, payload: string, version?: string): Promise<void> {
  const response = await graphFetch(target, "PUT", payload, version);
  assertConditionalWriteResponse(response, "OneDrive");
}

export async function testOneDrive(target: SyncTarget): Promise<"found" | "missing"> {
  return (await readOneDrive(target)) ? "found" : "missing";
}

async function graphFetch(target: SyncTarget, method: "GET" | "PUT", body?: string, version?: string): Promise<Response> {
  const token = await acquireOneDriveToken(target, false);
  const response = await fetch(oneDriveContentUrl(), {
    method,
    headers: graphHeaders(token.accessToken, Boolean(body), version),
    body,
  });
  if (response.status === 401 || response.status === 403) throw new Error("OneDrive 授权已失效，请重新授权");
  return response;
}

async function acquireOneDriveToken(target: SyncTarget, interactive: boolean): Promise<OneDriveToken> {
  if (!interactive && target.accessToken) return { accessToken: target.accessToken };
  const client = await msalClient();
  const account = findAccount(client, target.accountId);
  if (account) return acquireWithAccount(client, account, interactive);
  if (!interactive) throw new Error("OneDrive 未授权，请先登录或重新授权");
  const result = await runInteractiveTask(() => client.loginPopup({ scopes: ONEDRIVE_SCOPES }));
  return tokenFromResult(client, result);
}

async function acquireWithAccount(
  client: PublicClientApplication,
  account: AccountInfo,
  interactive: boolean,
): Promise<OneDriveToken> {
  try {
    const result = await client.acquireTokenSilent({ account, scopes: ONEDRIVE_SCOPES });
    return tokenFromResult(client, result, account);
  } catch (error) {
    if (!interactive) throw new Error("OneDrive 授权已失效，请重新授权", { cause: error });
    const result = await runInteractiveTask(() => client.acquireTokenPopup({ account, scopes: ONEDRIVE_SCOPES }));
    return tokenFromResult(client, result, account);
  }
}

async function tokenFromResult(
  client: PublicClientApplication,
  result: AuthenticationResult,
  fallbackAccount?: AccountInfo,
): Promise<OneDriveToken> {
  const account = result.account ?? fallbackAccount ?? findAccount(client);
  return {
    accessToken: result.accessToken,
    accountId: account?.homeAccountId,
    username: account?.username || await readOneDriveUsername(result.accessToken),
  };
}

async function readOneDriveUsername(accessToken: string): Promise<string> {
  const response = await fetch(`${GRAPH_ROOT}/me?$select=displayName,userPrincipalName,mail`, {
    headers: graphHeaders(accessToken, false),
  });
  if (!response.ok) throw new Error(`OneDrive 授权成功，但读取账户失败：${response.status} ${response.statusText}`);
  const profile = await response.json() as OneDriveProfile;
  const username = profile.mail || profile.userPrincipalName || profile.displayName;
  if (!username) throw new Error("OneDrive 授权成功，但 Microsoft Graph 未返回账户信息");
  return username;
}

async function runInteractiveTask<T>(task: () => Promise<T>): Promise<T> {
  if (activeInteraction) throw oneDriveInteractionError();
  const promise = Promise.resolve().then(task).catch((error: unknown) => {
    throw normalizeMsalError(error);
  });
  activeInteraction = promise;
  try {
    return await promise;
  } finally {
    activeInteraction = undefined;
  }
}

async function msalClient(): Promise<PublicClientApplication> {
  const clientId = oauthClientId("onedrive");
  const authority = oneDriveAuthority();
  const key = `${clientId}:${authority}`;
  if (!CLIENT_CACHE.has(key)) CLIENT_CACHE.set(key, createMsalClient(clientId, authority));
  return CLIENT_CACHE.get(key) as Promise<PublicClientApplication>;
}

async function createMsalClient(clientId: string, authority: string): Promise<PublicClientApplication> {
  const { PublicClientApplication } = await import("@azure/msal-browser");
  const client = new PublicClientApplication({
    auth: {
      clientId,
      authority,
      redirectUri: oneDriveRedirectUri(),
    },
    cache: { cacheLocation: "localStorage" },
  });
  await client.initialize();
  return client;
}

function oneDriveRedirectUri(): string {
  return `${window.location.origin}/auth.html`;
}

function findAccount(client: PublicClientApplication, accountId?: string): AccountInfo | undefined {
  const accounts = client.getAllAccounts();
  return accounts.find((account) => account.homeAccountId === accountId) ?? accounts[0];
}

function graphHeaders(accessToken: string, hasBody: boolean, version?: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    ...(version ? { "if-match": version } : {}),
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

function oneDriveContentUrl(): string {
  return `${GRAPH_ROOT}/me/drive/special/approot:/${encodeURIComponent(CLOUD_SYNC_FILE_NAME)}:/content`;
}

function clearOneDriveAuth(target: SyncTarget): SyncTarget {
  const next = { ...target };
  delete next.accessToken;
  delete next.accountId;
  delete next.username;
  return next;
}

function normalizeMsalError(error: unknown): Error {
  if (isMsalInteractionInProgress(error)) return oneDriveInteractionError();
  if (isOneDriveClientSecretConfigError(error)) return oneDriveConfigError(error);
  return error instanceof Error ? error : new Error("OneDrive 授权失败");
}

function oneDriveInteractionError(): Error {
  return new Error("OneDrive 授权窗口仍在处理中，请先完成或关闭 Microsoft 登录窗口后再重试；如果窗口已经关闭，请刷新页面。");
}

function oneDriveConfigError(error: unknown): Error {
  return new Error(
    "OneDrive 授权失败：当前 Azure 应用注册很可能被配置成 Web/confidential client 了。请把重定向地址配置到 Single-page application (SPA) 平台，使用公开 Client ID，不要配置 client secret。",
    { cause: error },
  );
}

function isMsalInteractionInProgress(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { readonly errorCode?: string; readonly error?: string; readonly message?: string };
  return value.errorCode === MSAL_INTERACTION_IN_PROGRESS
    || value.error === MSAL_INTERACTION_IN_PROGRESS
    || value.message?.includes(MSAL_INTERACTION_IN_PROGRESS) === true;
}

function isOneDriveClientSecretConfigError(error: unknown): boolean {
  const message = errorText(error);
  return ONE_DRIVE_CLIENT_SECRET_ERROR_MARKERS.some((marker) => message.includes(marker));
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const value = error as {
    readonly code?: string;
    readonly error?: string;
    readonly errorCode?: string;
    readonly errorDescription?: string;
    readonly errorMessage?: string;
    readonly message?: string;
  };
  return [value.code, value.errorCode, value.error, value.errorDescription, value.errorMessage, value.message]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

interface OneDriveToken {
  readonly accessToken: string;
  readonly accountId?: string;
  readonly username?: string;
}

interface OneDriveProfile {
  readonly displayName?: string;
  readonly userPrincipalName?: string;
  readonly mail?: string;
}
