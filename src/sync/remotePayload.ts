const HTML_RESPONSE_PATTERN = /^\s*(?:<!doctype\s+html|<html[\s>])/i;

export interface RemoteSnapshot {
  readonly payload: string;
  readonly version?: string;
}

export async function readRemotePayloadResponse(response: Response, label: string): Promise<string | undefined> {
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`读取 ${label} 加密包失败：${response.status} ${response.statusText}`);
  const body = await response.text();
  if (HTML_RESPONSE_PATTERN.test(body)) {
    throw new Error(`${label} 远端返回了 HTML 页面，请检查同步配置或重新授权`);
  }
  return body;
}

export function assertWriteResponse(response: Response, label: string): void {
  if (!response.ok) throw new Error(`写入 ${label} 加密包失败：${response.status} ${response.statusText}`);
}

export function assertConditionalWriteResponse(response: Response, label: string): void {
  if (response.ok) return;
  if (response.status === 412 || response.status === 409) {
    throw new Error(`${label} 远端已发生变化，请重新同步`);
  }
  assertWriteResponse(response, label);
}

export function assertDeleteResponse(response: Response, label: string): void {
  if (response.ok || response.status === 404) return;
  if (response.status === 409 || response.status === 412) {
    throw new Error(`${label} 远端已发生变化，请重新同步后再删除`);
  }
  throw new Error(`删除 ${label} 加密包失败：${response.status} ${response.statusText}`);
}
