import { materializeDueRecurring } from "../domain/recurring";
import type { AppData } from "../domain/types";
import { inspectStoredVault, loadData, saveData } from "../storage/indexedDb";
import type { LoadedDataResult } from "../storage/indexedDb";
import type { StoredVaultState } from "../storage/indexedDb";
import { decryptAppData, isEncryptedPackage } from "../storage/encryption";
import { parseImportedData } from "../storage/indexedDb";
import { currentUnlockState, initializeVault, tryUnlockRememberedDevice, unlockVaultWithPassphrase } from "../storage/vaultSession";
import { loadDataFromSyncSettings } from "../sync/syncBootstrap";
import { previewSyncSettingsPackage } from "../sync/syncSettingsPackage";
import type { StatusMessage } from "./common";

export interface SubmitVaultOptions {
  readonly state: StoredVaultState;
  readonly passphrase: string;
  readonly rememberDevice: boolean;
  readonly syncSettingsPackage?: string;
  readonly fullDataPackage?: string;
  readonly setData: (data: AppData) => void;
  readonly setSaveToken: (token: { readonly version: number }) => void;
  readonly setStatus: (value: StatusMessage) => void;
}

export async function bootstrapVault(
  setStoredVault: (state: StoredVaultState) => void,
  setData: (data: AppData) => void,
  setSaveToken: (token: { readonly version: number }) => void,
  setStatus: (value: StatusMessage) => void,
): Promise<void> {
  const state = await inspectStoredVault();
  if (state.kind === "encrypted" && await canAutoUnlock(setStatus)) {
    setLoadedData(await loadData(), setData, setSaveToken, setStatus);
    return;
  }
  setStoredVault(state);
  setStatus({ tone: "info", text: vaultPromptText(state) });
}

export async function submitVault(options: SubmitVaultOptions): Promise<void> {
  try {
    const loaded = await loadSubmittedData(options);
    setLoadedData(loaded, options.setData, options.setSaveToken, options.setStatus);
    if (options.state.kind !== "encrypted") await saveData(loaded.data, loaded.token);
  } catch (error) {
    options.setStatus({ tone: "error", text: errorMessage(error, "账本解锁失败") });
  }
}

async function loadSubmittedData(options: SubmitVaultOptions): Promise<LoadedDataResult> {
  if (options.fullDataPackage) return loadFromFullDataPackage(options);
  if (options.syncSettingsPackage) return loadFromSyncSettingsPackage(options);
  await unlockOrCreateVault(options.state, options.passphrase, options.rememberDevice);
  return loadData();
}

async function loadFromFullDataPackage(options: SubmitVaultOptions): Promise<LoadedDataResult> {
  if (options.state.kind !== "empty") throw new Error("只能在创建账本时导入全量数据文件");
  if (isEncryptedPackage(options.fullDataPackage ?? "")) {
    await unlockVaultWithPassphrase(options.fullDataPackage ?? "", options.passphrase, options.rememberDevice);
    return { data: await decryptAppData(options.fullDataPackage ?? "", currentUnlockState()), token: { version: 0 } };
  }
  await initializeVault(options.passphrase, options.rememberDevice);
  return { data: parseImportedData(options.fullDataPackage ?? ""), token: { version: 0 } };
}

async function loadFromSyncSettingsPackage(options: SubmitVaultOptions): Promise<LoadedDataResult> {
  if (options.state.kind !== "empty") throw new Error("只能在创建账本时导入同步源配置");
  const preview = await previewSyncSettingsPackage(options.syncSettingsPackage ?? "", options.passphrase);
  const data = await loadDataFromSyncSettings({
    settings: preview.settings,
    passphrase: options.passphrase,
    rememberDevice: options.rememberDevice,
  });
  return { data, token: { version: 0 } };
}

function setLoadedData(
  loaded: { readonly data: AppData; readonly token: { readonly version: number } },
  setData: (data: AppData) => void,
  setSaveToken: (token: { readonly version: number }) => void,
  setStatus: (value: StatusMessage) => void,
): { readonly data: AppData; readonly token: { readonly version: number } } {
  const next = materializeDueRecurring(loaded.data);
  setData(next);
  setSaveToken(loaded.token);
  setStatus({ tone: "success", text: "" });
  return { data: next, token: loaded.token };
}

async function canAutoUnlock(setStatus: (value: StatusMessage) => void): Promise<boolean> {
  try {
    return await tryUnlockRememberedDevice();
  } catch (error) {
    setStatus({ tone: "error", text: errorMessage(error, "当前浏览器自动解锁失败") });
    return false;
  }
}

async function unlockOrCreateVault(
  state: StoredVaultState,
  passphrase: string,
  rememberDevice: boolean,
): Promise<void> {
  if (state.kind === "encrypted") {
    await unlockVaultWithPassphrase(state.encryptedData, passphrase, rememberDevice);
    return;
  }
  await initializeVault(passphrase, rememberDevice);
}

function vaultPromptText(state: StoredVaultState): string {
  return state.kind === "encrypted" ? "请先解锁本地账本" : "请先创建本地账本";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
