import type { SyncProvider } from "../domain/types";

const OAUTH_CLIENT_IDS: Partial<Record<SyncProvider, string | undefined>> = {
  onedrive: import.meta.env.VITE_ONEDRIVE_CLIENT_ID,
  "google-drive": import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID,
};

export function oauthClientId(provider: "onedrive" | "google-drive"): string {
  const clientId = normalizeEnvValue(OAUTH_CLIENT_IDS[provider]);
  if (!clientId) throw new Error(`${providerLabel(provider)} OAuth Client ID 未配置，请在部署环境中设置`);
  return clientId;
}

export function oneDriveAuthority(): string {
  const tenantId = normalizeEnvValue(import.meta.env.VITE_ONEDRIVE_TENANT_ID) || "common";
  return `https://login.microsoftonline.com/${tenantId}`;
}

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function providerLabel(provider: "onedrive" | "google-drive"): string {
  return provider === "onedrive" ? "OneDrive" : "Google Drive";
}
