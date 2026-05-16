import type { SyncTarget } from "../domain/types";
import { CLOUD_SYNC_FILE_NAME } from "./syncDefaults";
import type { RemoteSnapshot } from "./syncTypes";

const WEIYUN_SKILL_VERSION = "1.0.3";
const BLOCK_SIZE = 524_288;
const CHECK_BLOCK_MOD = 128;
const HEX_RADIX = 16;
const BYTE_MASK = 0xff;
const BYTE_BITS = 8;
const WORD_BYTES = 4;
const SHA1_WORDS = 80;
const SHA1_CHUNK_BYTES = 64;
const SHA1_INITIAL: readonly number[] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

let requestId = 0;

export async function readWeiyun(target: SyncTarget): Promise<RemoteSnapshot | undefined> {
  const file = await findWeiyunFile(target);
  if (!file) return undefined;
  const download = await weiyunCall<WeiyunDownloadResponse>(target, "weiyun.download", {
    items: [{ file_id: file.file_id, pdir_key: file.pdirKey }],
  });
  const item = download.items?.find((value) => value.file_id === file.file_id);
  if (!item?.https_download_url) throw new Error("腾讯微云未返回下载链接");
  const response = await fetch(proxyUrl(target, "/download"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: item.https_download_url, cookie: item.cookie }),
  });
  if (!response.ok) throw new Error(`读取腾讯微云加密包失败：${await responseError(response)}`);
  const payload = await response.text();
  return { payload, version: file.version };
}

export async function writeWeiyun(target: SyncTarget, payload: string, version?: string): Promise<void> {
  if (version) await assertWeiyunVersion(target, version);
  const bytes = new TextEncoder().encode(payload);
  const params = await uploadParams(CLOUD_SYNC_FILE_NAME, bytes);
  await uploadWeiyunBytes(target, bytes, params);
}

export async function testWeiyun(target: SyncTarget): Promise<"found" | "missing"> {
  return (await findWeiyunFile(target)) ? "found" : "missing";
}

async function assertWeiyunVersion(target: SyncTarget, version: string): Promise<void> {
  const file = await findWeiyunFile(target);
  if (file?.version !== version) throw new Error("腾讯微云远端已发生变化，请重新同步");
}

async function findWeiyunFile(target: SyncTarget): Promise<WeiyunFile | undefined> {
  const response = await weiyunCall<WeiyunListResponse>(target, "weiyun.list", {
    get_type: 2,
    limit: 50,
    order_by: 2,
    asc: false,
  });
  const pdirKey = response.pdir_key ?? "";
  const file = response.file_list?.find((item) => item.filename === CLOUD_SYNC_FILE_NAME);
  return file ? { ...file, pdirKey, version: weiyunVersion(file) } : undefined;
}

async function uploadWeiyunBytes(target: SyncTarget, bytes: Uint8Array, params: UploadParams): Promise<void> {
  let preUploadArgs: WeiyunUploadArgs = params;
  for (let round = 0; round < 50; round += 1) {
    const preUpload = await weiyunCall<WeiyunUploadResponse>(target, "weiyun.upload", { ...preUploadArgs });
    if (preUpload.file_exist || preUpload.upload_state === 2) return;
    const channel = firstUploadChannel(preUpload.channel_list);
    if (!channel) throw new Error(`腾讯微云未返回可上传分片，upload_state=${preUpload.upload_state ?? 0}`);
    const chunk = bytes.subarray(channel.offset, channel.offset + channel.len);
    const upload = await weiyunCall<WeiyunUploadResponse>(target, "weiyun.upload", {
      filename: params.filename,
      file_size: params.file_size,
      file_sha: params.file_sha,
      block_sha_list: [],
      check_sha: params.check_sha,
      upload_key: requireString(preUpload.upload_key, "腾讯微云未返回 upload_key"),
      channel_list: normalizeChannels(preUpload.channel_list),
      channel_id: channel.id,
      ex: requireString(preUpload.ex, "腾讯微云未返回 ex"),
      file_data: toBase64(chunk),
    });
    if (upload.upload_state === 2) return;
    preUploadArgs = params;
  }
  throw new Error("腾讯微云上传超过最大轮数");
}

function firstUploadChannel(channels: readonly WeiyunChannel[] | undefined): WeiyunChannel | undefined {
  return channels?.find((channel) => channel.len > 0);
}

function normalizeChannels(channels: readonly WeiyunChannel[] | undefined): readonly WeiyunChannel[] {
  return (channels ?? []).map((channel) => ({ id: channel.id, offset: channel.offset, len: channel.len }));
}

async function uploadParams(filename: string, bytes: Uint8Array): Promise<UploadParams> {
  const shaInfo = sha1UploadInfo(bytes);
  return { filename, file_size: bytes.byteLength, ...shaInfo };
}

function sha1UploadInfo(bytes: Uint8Array): Sha1UploadInfo {
  const lastBlockSize = lastBlockByteLength(bytes.byteLength);
  const checkBlockSize = checkBlockByteLength(lastBlockSize);
  const beforeBlockSize = bytes.byteLength - lastBlockSize;
  const sha1 = new StreamingSha1();
  const blockShaList: string[] = [];
  for (let offset = 0; offset < beforeBlockSize; offset += BLOCK_SIZE) {
    sha1.update(bytes.subarray(offset, offset + BLOCK_SIZE));
    blockShaList.push(sha1.stateHex());
  }
  sha1.update(bytes.subarray(beforeBlockSize, bytes.byteLength - checkBlockSize));
  const checkSha = sha1.stateHex();
  const checkDataBytes = bytes.subarray(bytes.byteLength - checkBlockSize);
  sha1.update(checkDataBytes);
  const fileSha = sha1.hexdigest();
  blockShaList.push(fileSha);
  return { file_sha: fileSha, block_sha_list: blockShaList, check_sha: checkSha, check_data: toBase64(checkDataBytes) };
}

function lastBlockByteLength(size: number): number {
  if (size === 0) return 0;
  const remainder = size % BLOCK_SIZE;
  return remainder === 0 ? BLOCK_SIZE : remainder;
}

function checkBlockByteLength(lastBlockSize: number): number {
  if (lastBlockSize === 0) return 0;
  const remainder = lastBlockSize % CHECK_BLOCK_MOD;
  return remainder === 0 ? CHECK_BLOCK_MOD : remainder;
}

async function weiyunCall<T>(target: SyncTarget, tool: string, args: Record<string, unknown>): Promise<T> {
  requestId += 1;
  const response = await fetch(proxyUrl(target, "/mcp"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-weiyun-token": requireToken(target),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: { name: tool, arguments: { ...args, req_header: reqHeader() } },
    }),
  });
  if (!response.ok) throw new Error(`腾讯微云请求失败：${await responseError(response)}`);
  return parseMcpResponse<T>(await response.json());
}

async function responseError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text || `${response.status} ${response.statusText}`;
}

function parseMcpResponse<T>(payload: unknown): T {
  if (isRecord(payload) && payload.error) throw new Error(`腾讯微云请求失败：${JSON.stringify(payload.error)}`);
  const content = (payload as { readonly result?: { readonly content?: readonly McpContent[] } }).result?.content ?? [];
  const text = content.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("腾讯微云响应缺少文本内容");
  const data = JSON.parse(text) as T & { readonly error?: string };
  if (data.error) throw new Error(`腾讯微云操作失败：${data.error}`);
  return data;
}

function reqHeader(): { readonly qua: string; readonly version: string } {
  return { qua: "WEB_BROWSER_COINLY_0.1.0", version: WEIYUN_SKILL_VERSION };
}

function requireToken(target: SyncTarget): string {
  const token = target.accessToken?.trim();
  if (!token) throw new Error("腾讯微云 MCP Token 不能为空");
  return token;
}

function proxyUrl(target: SyncTarget, path: "/mcp" | "/download"): string {
  const baseUrl = (target.proxyBaseUrl || import.meta.env.VITE_WEIYUN_PROXY_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("腾讯微云代理地址未配置，请填写代理地址或设置 VITE_WEIYUN_PROXY_URL");
  return `${baseUrl}${path}`;
}

function requireString(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

function weiyunVersion(file: WeiyunFileItem): string {
  return [file.file_id, file.file_size, file.file_mtime].join(":");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(HEX_RADIX).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class StreamingSha1 {
  private h0 = SHA1_INITIAL[0];
  private h1 = SHA1_INITIAL[1];
  private h2 = SHA1_INITIAL[2];
  private h3 = SHA1_INITIAL[3];
  private h4 = SHA1_INITIAL[4];
  private messageLength = 0;
  private pending: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  update(data: Uint8Array): void {
    this.pending = concatBytes(this.pending, data);
    this.messageLength += data.byteLength;
    while (this.pending.byteLength >= SHA1_CHUNK_BYTES) {
      this.processChunk(this.pending.subarray(0, SHA1_CHUNK_BYTES));
      this.pending = this.pending.subarray(SHA1_CHUNK_BYTES);
    }
  }

  stateHex(): string {
    if (this.pending.byteLength !== 0) throw new Error("腾讯微云 SHA1 状态未对齐");
    return hex(littleEndianWords([this.h0, this.h1, this.h2, this.h3, this.h4]));
  }

  hexdigest(): string {
    const copy = this.clone();
    copy.update(copy.padding());
    return [copy.h0, copy.h1, copy.h2, copy.h3, copy.h4].map((word) => word.toString(HEX_RADIX).padStart(8, "0")).join("");
  }

  private clone(): StreamingSha1 {
    const copy = new StreamingSha1();
    copy.h0 = this.h0;
    copy.h1 = this.h1;
    copy.h2 = this.h2;
    copy.h3 = this.h3;
    copy.h4 = this.h4;
    copy.messageLength = this.messageLength;
    copy.pending = copyBytes(this.pending);
    return copy;
  }

  private padding(): Uint8Array {
    const bitLength = this.messageLength * BYTE_BITS;
    const zeroBytes = (56 - ((this.pending.byteLength + 1) % SHA1_CHUNK_BYTES) + SHA1_CHUNK_BYTES) % SHA1_CHUNK_BYTES;
    const padding = new Uint8Array(1 + zeroBytes + 8);
    padding[0] = 0x80;
    const view = new DataView(padding.buffer);
    view.setUint32(padding.byteLength - 8, Math.floor(bitLength / 0x100000000), false);
    view.setUint32(padding.byteLength - 4, bitLength >>> 0, false);
    return padding;
  }

  private processChunk(chunk: Uint8Array): void {
    const words = sha1Words(chunk);
    let [a, b, c, d, e] = [this.h0, this.h1, this.h2, this.h3, this.h4];
    for (let index = 0; index < SHA1_WORDS; index += 1) {
      const { f, k } = sha1Round(index, b, c, d);
      const temp = (leftRotate(a, 5) + f + e + k + words[index]) >>> 0;
      [e, d, c, b, a] = [d, c, leftRotate(b, 30), a, temp];
    }
    this.h0 = (this.h0 + a) >>> 0;
    this.h1 = (this.h1 + b) >>> 0;
    this.h2 = (this.h2 + c) >>> 0;
    this.h3 = (this.h3 + d) >>> 0;
    this.h4 = (this.h4 + e) >>> 0;
  }
}

function sha1Words(chunk: Uint8Array): number[] {
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const words = Array.from({ length: SHA1_WORDS }, (_, index) => index < 16 ? view.getUint32(index * WORD_BYTES, false) : 0);
  for (let index = 16; index < SHA1_WORDS; index += 1) {
    words[index] = leftRotate(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);
  }
  return words;
}

function sha1Round(index: number, b: number, c: number, d: number): { readonly f: number; readonly k: number } {
  if (index <= 19) return { f: (b & c) | (~b & d), k: 0x5a827999 };
  if (index <= 39) return { f: b ^ c ^ d, k: 0x6ed9eba1 };
  if (index <= 59) return { f: (b & c) | (b & d) | (c & d), k: 0x8f1bbdc };
  return { f: b ^ c ^ d, k: 0xca62c1d6 };
}

function leftRotate(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function littleEndianWords(words: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(words.length * WORD_BYTES);
  words.forEach((word, index) => {
    bytes[index * WORD_BYTES] = word & BYTE_MASK;
    bytes[index * WORD_BYTES + 1] = (word >>> 8) & BYTE_MASK;
    bytes[index * WORD_BYTES + 2] = (word >>> 16) & BYTE_MASK;
    bytes[index * WORD_BYTES + 3] = (word >>> 24) & BYTE_MASK;
  });
  return bytes;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const next = new Uint8Array(left.byteLength + right.byteLength);
  next.set(left);
  next.set(right, left.byteLength);
  return next;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

interface McpContent {
  readonly type: string;
  readonly text?: string;
}

interface WeiyunListResponse {
  readonly pdir_key?: string;
  readonly file_list?: readonly WeiyunFileItem[];
}

interface WeiyunFileItem {
  readonly file_id: string;
  readonly filename: string;
  readonly file_size: number;
  readonly file_mtime: number;
}

interface WeiyunFile extends WeiyunFileItem {
  readonly pdirKey: string;
  readonly version: string;
}

interface WeiyunDownloadResponse {
  readonly items?: readonly {
    readonly file_id: string;
    readonly https_download_url?: string;
    readonly cookie?: string;
  }[];
}

interface WeiyunChannel {
  readonly id: number;
  readonly offset: number;
  readonly len: number;
}

interface WeiyunUploadResponse {
  readonly file_exist?: boolean;
  readonly upload_state?: number;
  readonly upload_key?: string;
  readonly channel_list?: readonly WeiyunChannel[];
  readonly ex?: string;
}

interface Sha1UploadInfo {
  readonly file_sha: string;
  readonly block_sha_list: readonly string[];
  readonly check_sha: string;
  readonly check_data: string;
}

interface UploadParams extends Sha1UploadInfo {
  readonly filename: string;
  readonly file_size: number;
}

interface WeiyunUploadArgs extends Partial<UploadParams> {
  readonly upload_key?: string;
  readonly channel_list?: readonly WeiyunChannel[];
  readonly channel_id?: number;
  readonly ex?: string;
  readonly file_data?: string;
}
