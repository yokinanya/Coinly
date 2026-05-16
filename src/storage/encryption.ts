import type { AppData } from "../domain/types";
import { parseImportedData } from "./dataValidation";

export const ENCRYPTED_FORMAT = "coinly.encrypted.v1";

const KDF_NAME = "PBKDF2";
const CIPHER_NAME = "AES-GCM";
const HASH_NAME = "SHA-256";
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const RAW_KEY_BYTES = 32;
const BASE64_CHUNK_SIZE = 0x8000;

export interface EncryptedPackage {
  readonly format: typeof ENCRYPTED_FORMAT;
  readonly kdf: {
    readonly name: typeof KDF_NAME;
    readonly hash: typeof HASH_NAME;
    readonly iterations: number;
  };
  readonly cipher: {
    readonly name: typeof CIPHER_NAME;
    readonly keyLength: typeof KEY_LENGTH;
  };
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly createdAt: string;
}

export interface UnlockState {
  readonly dataKey: CryptoKey;
  readonly rawDataKey: Uint8Array;
  readonly salt: string;
}

export async function createUnlockState(passphrase: string, salt = toBase64(randomBytes(SALT_BYTES))): Promise<UnlockState> {
  return unlockFromRawKey(await deriveRawKey(requirePassphrase(passphrase), fromBase64(salt)), salt);
}

export async function unlockPackageWithPassphrase(value: string, passphrase: string): Promise<UnlockState> {
  const payload = parseEncryptedPackage(value);
  return createUnlockState(passphrase, payload.salt);
}

export async function unlockFromRawKey(rawKey: Uint8Array, salt: string): Promise<UnlockState> {
  if (rawKey.byteLength !== RAW_KEY_BYTES) throw new Error("本设备解锁密钥无效");
  const copy = new Uint8Array(rawKey);
  const dataKey = await crypto.subtle.importKey("raw", toArrayBuffer(copy), CIPHER_NAME, false, ["encrypt", "decrypt"]);
  return { dataKey, rawDataKey: copy, salt };
}

export async function encryptAppData(data: AppData, unlock: UnlockState): Promise<string> {
  return encryptTextPackage(JSON.stringify(data), unlock);
}

export async function encryptTextPackage(value: string, unlock: UnlockState): Promise<string> {
  const iv = randomBytes(IV_BYTES);
  const plaintext = new TextEncoder().encode(value);
  const ciphertext = await crypto.subtle.encrypt({ name: CIPHER_NAME, iv: toArrayBuffer(iv) }, unlock.dataKey, toArrayBuffer(plaintext));
  return JSON.stringify({
    format: ENCRYPTED_FORMAT,
    kdf: { name: KDF_NAME, hash: HASH_NAME, iterations: PBKDF2_ITERATIONS },
    cipher: { name: CIPHER_NAME, keyLength: KEY_LENGTH },
    salt: unlock.salt,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  } satisfies EncryptedPackage);
}

export async function decryptAppData(value: string, unlock: UnlockState): Promise<AppData> {
  const plaintext = await decryptTextPackage(value, unlock);
  try {
    return parseImportedData(plaintext);
  } catch (error) {
    throw new Error(`数据校验失败：${errorMessage(error)}`, { cause: error });
  }
}

export async function decryptTextPackage(value: string, unlock: UnlockState): Promise<string> {
  const payload = parseEncryptedPackage(value);
  const plaintext = await decryptPayload(payload, unlock);
  return new TextDecoder().decode(plaintext);
}

export function isEncryptedPackage(value: string): boolean {
  try {
    return JSON.parse(value)?.format === ENCRYPTED_FORMAT;
  } catch {
    return false;
  }
}

export function parseEncryptedPackage(value: string): EncryptedPackage {
  const payload = parsePackageJson(value);
  if (payload.format !== ENCRYPTED_FORMAT) throw new Error("不支持的加密包格式");
  if (!isValidKdf(payload.kdf) || !isValidCipher(payload.cipher)) {
    throw new Error("加密包算法字段无效");
  }
  if (!isNonEmptyString(payload.salt) || !isNonEmptyString(payload.iv) || !isNonEmptyString(payload.ciphertext)) {
    throw new Error("加密包字段缺失");
  }
  if (!isNonEmptyString(payload.createdAt)) throw new Error("加密包字段缺失");
  return payload as EncryptedPackage;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(index, index + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch (error) {
    throw new Error("Base64 密钥材料无效", { cause: error });
  }
}

async function decryptPayload(payload: EncryptedPackage, unlock: UnlockState): Promise<ArrayBuffer> {
  try {
    return await crypto.subtle.decrypt(
      { name: CIPHER_NAME, iv: toArrayBuffer(fromBase64(payload.iv)) },
      unlock.dataKey,
      toArrayBuffer(fromBase64(payload.ciphertext)),
    );
  } catch (error) {
    throw new Error("解密失败：口令错误或 ciphertext 已损坏", { cause: error });
  }
}

async function deriveRawKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), KDF_NAME, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: KDF_NAME, salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: HASH_NAME },
    material,
    KEY_LENGTH,
  );
  return new Uint8Array(bits);
}

function parsePackageJson(value: string): Partial<EncryptedPackage> {
  try {
    return JSON.parse(value) as Partial<EncryptedPackage>;
  } catch (error) {
    throw new Error("加密包不是有效 JSON", { cause: error });
  }
}

function isValidKdf(value: EncryptedPackage["kdf"] | undefined): boolean {
  return value?.name === KDF_NAME
    && value.hash === HASH_NAME
    && value.iterations === PBKDF2_ITERATIONS;
}

function isValidCipher(value: EncryptedPackage["cipher"] | undefined): boolean {
  return value?.name === CIPHER_NAME && value.keyLength === KEY_LENGTH;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function requirePassphrase(passphrase: string): string {
  const normalized = passphrase.trim();
  if (!normalized) throw new Error("加密口令不能为空");
  return normalized;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
