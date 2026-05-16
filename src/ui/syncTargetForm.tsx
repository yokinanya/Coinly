import type { SyncProvider, SyncTarget } from "../domain/types";
import { SelectField, TextField } from "./common";
import type { FormOption } from "./common";
import { Switch } from "./metis";
import { defaultSyncTarget } from "./syncTargetHelpers";

export function SyncTargetForm(props: {
  readonly target: SyncTarget;
  readonly onChange: (target: SyncTarget) => void;
}) {
  const update = (patch: Partial<SyncTarget>) => props.onChange({ ...props.target, ...patch });
  return (
    <div className="space-y-4">
      <TextField label="名称" value={props.target.name ?? ""} onChange={(name) => update({ name })} />
      <SelectField
        label="存储类型"
        value={props.target.provider}
        options={providerOptions()}
        onChange={(provider) => props.onChange(providerPatch(props.target, provider as SyncProvider))}
      />
      {props.target.provider === "s3-compatible" && <S3Fields target={props.target} update={update} />}
      {props.target.provider === "onedrive" && <OneDriveFields target={props.target} />}
      {props.target.provider === "google-drive" && <GoogleDriveFields target={props.target} />}
      {props.target.provider === "weiyun" && <WeiyunFields target={props.target} update={update} />}
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <Switch checked={props.target.enabled} onChange={(enabled) => update({ enabled })} />
        自动同步这个提供方
      </label>
    </div>
  );
}

function S3Fields(props: {
  readonly target: SyncTarget;
  readonly update: (patch: Partial<SyncTarget>) => void;
}) {
  return (
    <>
      <TextField label="Endpoint" value={props.target.endpoint} onChange={(endpoint) => props.update({ endpoint })} />
      <TextField label="区域" value={props.target.region ?? ""} onChange={(region) => props.update({ region })} />
      <TextField label="存储桶" value={props.target.bucket ?? ""} onChange={(bucket) => props.update({ bucket })} />
      <TextField label="对象路径" value={props.target.objectKey} onChange={(objectKey) => props.update({ objectKey })} />
      <TextField label="访问密钥 ID" value={props.target.accessKeyId ?? ""} onChange={(accessKeyId) => props.update({ accessKeyId })} />
      <TextField label="访问密钥 Secret" type="password" value={props.target.secretAccessKey ?? ""} onChange={(secretAccessKey) => props.update({ secretAccessKey })} />
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <Switch checked={Boolean(props.target.forcePathStyle)} onChange={(forcePathStyle) => props.update({ forcePathStyle })} />
        路径样式
      </label>
    </>
  );
}

function OneDriveFields(props: {
  readonly target: SyncTarget;
}) {
  return (
    <p className="text-sm text-[var(--color-text-secondary)]">
      当前授权账户：{oneDriveAccountLabel(props.target)}
    </p>
  );
}

function GoogleDriveFields(props: {
  readonly target: SyncTarget;
}) {
  return (
    <p className="text-sm text-[var(--color-text-secondary)]">
      当前授权账户：{props.target.username || "未授权"}
    </p>
  );
}

function WeiyunFields(props: {
  readonly target: SyncTarget;
  readonly update: (patch: Partial<SyncTarget>) => void;
}) {
  const proxyHelp = props.target.proxyBaseUrl
    ? "当前目标会使用这里填写的代理地址。"
    : "留空时使用部署环境中的 VITE_WEIYUN_PROXY_URL。";
  return (
    <>
      <TextField label="MCP Token" type="password" value={props.target.accessToken ?? ""} onChange={(accessToken) => props.update({ accessToken })} />
      <TextField label="代理地址" value={props.target.proxyBaseUrl ?? ""} onChange={(proxyBaseUrl) => props.update({ proxyBaseUrl })} />
      <p className="text-sm text-[var(--color-text-secondary)]">{proxyHelp} 同步文件会写入 Token 绑定目录。</p>
    </>
  );
}

function oneDriveAccountLabel(target: SyncTarget): string {
  if (target.username) return target.username;
  if (target.accountId || target.accessToken) return "已授权，未读取到账户名";
  return "未授权";
}

function providerOptions(): readonly FormOption[] {
  return [
    { value: "s3-compatible", label: "S3-Compatible" },
    { value: "onedrive", label: "OneDrive" },
    { value: "google-drive", label: "Google Drive" },
    { value: "weiyun", label: "腾讯微云" },
  ];
}

function providerPatch(target: SyncTarget, provider: SyncProvider): SyncTarget {
  return {
    ...defaultSyncTarget(provider),
    id: target.id,
    enabled: target.enabled,
    name: target.name,
  };
}
