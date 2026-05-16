import type { UnlockState } from "./encryption";
import { createUnlockState, fromBase64, toBase64, unlockFromRawKey, unlockPackageWithPassphrase } from "./encryption";

const REMEMBERED_UNLOCK_STORAGE = "coinly-remembered-unlock-v1";
const WRAPPING_KEY_COOKIE = "coinlyWrappingKey";
const REMEMBER_MAX_AGE = 31_536_000;
const IV_BYTES = 12;
const RAW_KEY_BYTES = 32;

interface RememberedUnlock {
  readonly version: 1;
  readonly salt: string;
  readonly iv: string;
  readonly wrappedRawKey: string;
}

let currentUnlock: UnlockState | undefined;

export function currentUnlockState(): UnlockState {
  if (!currentUnlock) throw new Error("请先解锁本地账本");
  return currentUnlock;
}

export function hasUnlockState(): boolean {
  return Boolean(currentUnlock);
}

export function isRememberedDeviceEnabled(): boolean {
  return Boolean(readCookie(WRAPPING_KEY_COOKIE) && localStorage.getItem(REMEMBERED_UNLOCK_STORAGE));
}

export async function initializeVault(passphrase: string, rememberDevice: boolean): Promise<UnlockState> {
  const unlock = await createUnlockState(passphrase);
  await setUnlockState(unlock, rememberDevice);
  return unlock;
}

export async function unlockVaultWithPassphrase(
  encryptedPackage: string,
  passphrase: string,
  rememberDevice: boolean,
): Promise<UnlockState> {
  const unlock = await unlockPackageWithPassphrase(encryptedPackage, passphrase);
  await setUnlockState(unlock, rememberDevice);
  return unlock;
}

export async function tryUnlockRememberedDevice(): Promise<boolean> {
  const payload = rememberedUnlockPayload();
  if (!payload) return false;
  const wrappingKey = await importAesKey(cookieBytes());
  const rawKey = await unwrapRememberedKey(payload, wrappingKey);
  currentUnlock = await unlockFromRawKey(rawKey, payload.salt);
  return true;
}

export async function rememberCurrentDevice(): Promise<void> {
  await rememberUnlock(currentUnlockState());
}

export async function changeVaultPassphrase(
  passphrase: string,
  rememberDevice: boolean,
  persist: () => Promise<void>,
): Promise<void> {
  const previous = currentUnlockState();
  const next = await createUnlockState(passphrase);
  currentUnlock = next;
  try {
    await persist();
    await setUnlockState(next, rememberDevice);
  } catch (error) {
    currentUnlock = previous;
    throw error;
  }
}

export function clearRememberedDevice(): void {
  localStorage.removeItem(REMEMBERED_UNLOCK_STORAGE);
  document.cookie = `${WRAPPING_KEY_COOKIE}=; max-age=0; path=/; samesite=strict`;
}

export function lockVault(): void {
  currentUnlock = undefined;
}

async function setUnlockState(unlock: UnlockState, rememberDevice: boolean): Promise<void> {
  currentUnlock = unlock;
  if (rememberDevice) {
    await rememberUnlock(unlock);
    return;
  }
  clearRememberedDevice();
}

async function rememberUnlock(unlock: UnlockState): Promise<void> {
  const wrappingRawKey = randomBytes(RAW_KEY_BYTES);
  const wrappingKey = await importAesKey(wrappingRawKey);
  const iv = randomBytes(IV_BYTES);
  const wrappedRawKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    wrappingKey,
    toArrayBuffer(unlock.rawDataKey),
  );
  localStorage.setItem(REMEMBERED_UNLOCK_STORAGE, JSON.stringify({
    version: 1,
    salt: unlock.salt,
    iv: toBase64(iv),
    wrappedRawKey: toBase64(new Uint8Array(wrappedRawKey)),
  } satisfies RememberedUnlock));
  document.cookie = `${WRAPPING_KEY_COOKIE}=${encodeURIComponent(toBase64(wrappingRawKey))}; max-age=${REMEMBER_MAX_AGE}; path=/; samesite=strict`;
}

async function unwrapRememberedKey(payload: RememberedUnlock, wrappingKey: CryptoKey): Promise<Uint8Array> {
  try {
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(fromBase64(payload.iv)) },
      wrappingKey,
      toArrayBuffer(fromBase64(payload.wrappedRawKey)),
    );
    return new Uint8Array(raw);
  } catch (error) {
    throw new Error("本设备记住的解锁材料无效，请重新输入口令", { cause: error });
  }
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.byteLength !== RAW_KEY_BYTES) throw new Error("本设备 wrapping key 无效");
  return crypto.subtle.importKey("raw", toArrayBuffer(rawKey), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function rememberedUnlockPayload(): RememberedUnlock | undefined {
  const value = localStorage.getItem(REMEMBERED_UNLOCK_STORAGE);
  if (!value || !readCookie(WRAPPING_KEY_COOKIE)) return undefined;
  const payload = JSON.parse(value) as Partial<RememberedUnlock>;
  if (payload.version !== 1 || !payload.salt || !payload.iv || !payload.wrappedRawKey) {
    throw new Error("本设备记住的解锁材料格式无效");
  }
  return payload as RememberedUnlock;
}

function cookieBytes(): Uint8Array {
  const value = readCookie(WRAPPING_KEY_COOKIE);
  if (!value) throw new Error("本设备 wrapping key 不存在");
  return fromBase64(decodeURIComponent(value));
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
