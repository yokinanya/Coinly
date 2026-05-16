import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData } from "../domain/factory";
import type { AppData, SyncTarget } from "../domain/types";
import { encryptAppData } from "../storage/encryption";
import { currentUnlockState, initializeVault, lockVault } from "../storage/vaultSession";
import { authorizeGoogleDrive, readGoogleDrive, writeGoogleDrive } from "./googleDriveAdapter";
import { authorizeOneDrive, readOneDrive, writeOneDrive } from "./oneDriveAdapter";

const msalMock = vi.hoisted(() => ({
  loginResult: undefined as MsalLoginResult | undefined,
  loginError: undefined as unknown,
}));

vi.mock("@azure/msal-browser", () => ({
  PublicClientApplication: class {
    initialize(): Promise<void> {
      return Promise.resolve();
    }

    getAllAccounts(): readonly unknown[] {
      return [];
    }

    loginPopup(): Promise<MsalLoginResult> {
      if (msalMock.loginError) return Promise.reject(msalMock.loginError);
      if (!msalMock.loginResult) throw new Error("MSAL login result was not configured");
      return Promise.resolve(msalMock.loginResult);
    }
  },
}));

describe("cloud drive adapters", () => {
  beforeEach(async () => {
    await initializeVault("test-passphrase", false);
  });

  afterEach(() => {
    lockVault();
    msalMock.loginResult = undefined;
    msalMock.loginError = undefined;
    vi.unstubAllGlobals();
  });

  it("reads and writes OneDrive app folder content", async () => {
    const payload = await encrypted(initialData());
    const fetchMock = stubFetch([
      new Response(payload, { status: 200 }),
      new Response("", { status: 200 }),
    ]);
    const target = cloudTarget("onedrive");

    await expect(readOneDrive(target)).resolves.toMatchObject({ payload });
    await writeOneDrive(target, payload);

    expect(fetchMock).toHaveBeenNthCalledWith(1, oneDriveUrl(), expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, oneDriveUrl(), expect.objectContaining({ method: "PUT", body: payload }));
  });

  it("reads and writes Google Drive appDataFolder content", async () => {
    const payload = await encrypted(initialData());
    const fetchMock = stubFetch([
      jsonResponse({ files: [{ id: "file-id", name: "data.coinly.enc.json" }] }),
      new Response(payload, { status: 200 }),
      jsonResponse({ files: [{ id: "file-id", name: "data.coinly.enc.json" }] }),
      new Response("", { status: 200 }),
    ]);
    const target = cloudTarget("google-drive");

    await expect(readGoogleDrive(target)).resolves.toMatchObject({ payload });
    await writeGoogleDrive(target, payload);

    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://www.googleapis.com/drive/v3/files/file-id?alt=media", expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "https://www.googleapis.com/upload/drive/v3/files/file-id?uploadType=media", expect.objectContaining({ method: "PATCH", body: payload }));
  });

  it("stores Google Drive account email after authorization", async () => {
    const fetchMock = stubFetch([jsonResponse({ email: "user@example.com" })]);
    stubGoogleIdentity("token");

    await expect(authorizeGoogleDrive(cloudTarget("google-drive"))).resolves.toMatchObject({
      accessToken: "token",
      username: "user@example.com",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://www.googleapis.com/oauth2/v3/userinfo", expect.any(Object));
  });

  it("reads OneDrive account name after authorization when MSAL account has no username", async () => {
    const fetchMock = stubFetch([jsonResponse({ userPrincipalName: "user@example.com" })]);
    stubMsalLogin({ accessToken: "token", account: { homeAccountId: "account-id" } });

    await expect(authorizeOneDrive(cloudTarget("onedrive"))).resolves.toMatchObject({
      accessToken: "token",
      accountId: "account-id",
      username: "user@example.com",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName,mail", expect.any(Object));
  });

  it("reports OneDrive app registration config errors clearly", async () => {
    stubMsalLoginError(new Error("invalid_client: AADSTS70002: The provided request must include a 'client_secret' input parameter."));

    await expect(authorizeOneDrive(cloudTarget("onedrive"))).rejects.toThrow(/Single-page application \(SPA\)|client secret/i);
  });
});

async function encrypted(data: AppData): Promise<string> {
  return encryptAppData(data, currentUnlockState());
}

function cloudTarget(provider: "onedrive" | "google-drive"): SyncTarget {
  return { enabled: true, provider, endpoint: "", objectKey: "", accessToken: "token" };
}

function oneDriveUrl(): string {
  return "https://graph.microsoft.com/v1.0/me/drive/special/approot:/data.coinly.enc.json:/content";
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function stubFetch(responses: readonly Response[]) {
  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
  responses.forEach((response) => {
    fetchMock.mockResolvedValueOnce(response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubGoogleIdentity(accessToken: string): void {
  vi.stubGlobal("google", {
    accounts: {
      oauth2: {
        initTokenClient: (config: { readonly callback: (response: { readonly access_token: string }) => void }) => ({
          requestAccessToken: () => config.callback({ access_token: accessToken }),
        }),
      },
    },
  });
}

function stubMsalLogin(result: MsalLoginResult): void {
  msalMock.loginResult = result;
  msalMock.loginError = undefined;
}

function stubMsalLoginError(error: unknown): void {
  msalMock.loginError = error;
  msalMock.loginResult = undefined;
}

interface MsalLoginResult {
  readonly accessToken: string;
  readonly account: { readonly homeAccountId: string };
}
