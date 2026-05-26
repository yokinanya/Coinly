import { initialData } from "../domain/factory";
import { withoutLocalOnlyUiSettings } from "../domain/localOnly";
import type { AppData } from "../domain/types";
import { assertValidAppData, dataSummary, migrateData, parseImportedData as parsePlainImportedData, previewImportedData as previewPlainImportedData } from "./dataValidation";
import type { DataSummary, ImportPreview } from "./dataValidation";
import { decryptAppData, encryptAppData, isEncryptedPackage } from "./encryption";
import { currentUnlockState } from "./vaultSession";

export { migrateData };
export type { DataSummary, ImportPreview };

const DB_NAME = "coinly";
const DB_VERSION = 2;
const STORE_NAME = "app";
const DATA_KEY = "data";

export interface SaveToken {
  readonly version: number;
}

type StoredAppValue = string | AppData;

interface StoredAppRecord {
  readonly data: StoredAppValue;
  readonly version: number;
}

type StoredAppEntry = StoredAppValue | StoredAppRecord;

export type StoredVaultState =
  | { readonly kind: "empty" }
  | { readonly kind: "encrypted"; readonly encryptedData: string };

export async function inspectStoredVault(): Promise<StoredVaultState> {
  const db = await openDatabase();
  const value = await readData(db);
  db.close();
  return storedVaultState(value);
}

export interface LoadedDataResult {
  readonly data: AppData;
  readonly token: SaveToken;
}

export async function loadData(): Promise<LoadedDataResult> {
  const db = await openDatabase();
  const value = await readData(db);
  db.close();
  if (!value) return { data: initialData(), token: { version: 0 } };
  const loaded = typeof value === "string"
    ? await loadStringData(value)
    : isStoredAppRecord(value)
      ? typeof value.data === "string"
        ? await loadStringData(value.data)
        : migrateData(value.data)
      : migrateData(value);
  assertValidAppData(loaded);
  return {
    data: loaded,
    token: { version: isStoredAppRecord(value) ? value.version : 0 },
  };
}

export async function saveData(data: AppData, expectedToken: SaveToken): Promise<SaveToken> {
  const db = await openDatabase();
  const nextToken = await writeData(db, await encryptAppData(withoutLocalOnlyUiSettings(data), currentUnlockState()), expectedToken);
  db.close();
  return nextToken;
}

export async function exportData(data: AppData): Promise<string> {
  return encryptAppData(withoutLocalOnlyUiSettings(data), currentUnlockState());
}

export async function clearStoredVault(): Promise<void> {
  const db = await openDatabase();
  await removeData(db);
  db.close();
}

export async function previewImportData(value: string): Promise<ImportPreview> {
  if (!isEncryptedPackage(value)) return previewPlainImportedData(value);
  const data = await decryptAppData(value, currentUnlockState());
  return { data, summary: dataSummary(data) };
}

export function parseImportedData(value: string): AppData {
  return parsePlainImportedData(value);
}

export function previewImportedData(value: string): ImportPreview {
  return previewPlainImportedData(value);
}

function storedVaultState(value: StoredAppEntry | undefined): StoredVaultState {
  if (!value) return { kind: "empty" };
  if (typeof value === "string") {
    if (!isEncryptedPackage(value)) throw new Error("本地账本数据格式已过时，请清空后重新创建");
    return { kind: "encrypted", encryptedData: value };
  }
  if (isStoredAppRecord(value)) return storedVaultState(value.data);
  throw new Error("本地账本数据格式已过时，请清空后重新创建");
}

async function loadStringData(value: string): Promise<AppData> {
  if (isEncryptedPackage(value)) return migrateData(await decryptAppData(value, currentUnlockState()));
  return parsePlainImportedData(value);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("本地数据库升级被阻止，请关闭其它 Coinly 页面后重试"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      createStoreIfMissing(request.result, STORE_NAME);
    };
  });
}

function createStoreIfMissing(db: IDBDatabase, name: string): void {
  if (!db.objectStoreNames.contains(name)) {
    db.createObjectStore(name);
  }
}

function readData(db: IDBDatabase): Promise<StoredAppEntry | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(DATA_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as StoredAppEntry | undefined);
  });
}

function writeData(db: IDBDatabase, data: string, expectedToken: SaveToken): Promise<SaveToken> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve(nextToken);
    const store = transaction.objectStore(STORE_NAME);
    const current = store.get(DATA_KEY);
    let nextToken: SaveToken = expectedToken;
    current.onerror = () => reject(current.error);
    current.onsuccess = () => {
      const record = current.result as StoredAppRecord | undefined;
      const version = record?.version ?? 0;
      if (version !== expectedToken.version) {
        void handleVersionMismatch(record, data)
          .then((match) => {
            if (match) {
              nextToken = { version };
              return;
            }
            reject(new Error("本地账本已被其它标签页更新"));
            transaction.abort();
          })
          .catch((error: unknown) => {
            reject(error);
            transaction.abort();
          });
        return;
      }
      nextToken = { version: version + 1 };
      store.put({ data, version: nextToken.version }, DATA_KEY);
    };
  });
}

async function handleVersionMismatch(record: StoredAppRecord | undefined, nextData: StoredAppValue): Promise<boolean> {
  if (!record) return false;
  const currentData = await loadStoredData(record.data);
  return isSameAppData(currentData, await loadStoredData(nextData));
}

async function loadStoredData(value: StoredAppValue): Promise<AppData> {
  if (typeof value !== "string") return migrateData(value);
  if (isEncryptedPackage(value)) return migrateData(await decryptAppData(value, currentUnlockState()));
  return parsePlainImportedData(value);
}

export function isSameAppData(left: AppData, right: AppData): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function removeData(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
    transaction.objectStore(STORE_NAME).delete(DATA_KEY);
  });
}

function isStoredAppRecord(value: StoredAppEntry): value is StoredAppRecord {
  return typeof value === "object" && value !== null && "data" in value && "version" in value;
}
