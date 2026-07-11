import { Cloud, Database, KeyRound, Network } from "lucide-react";
import type { ReactNode } from "react";
import type { SyncProvider, SyncTarget } from "../domain/types";
import { SelectField, TextField } from "./common";
import type { FormOption } from "./common";
import { Switch } from "./components";
import { defaultSyncTarget } from "./syncTargetHelpers";

export function SyncTargetForm(props: {
  readonly target: SyncTarget;
  readonly onChange: (target: SyncTarget) => void;
}) {
  const update = (patch: Partial<SyncTarget>) => props.onChange({ ...props.target, ...patch });
  return (
    <div className="space-y-4">
      <FormGroup icon={<Cloud size={16} />} title="同步源">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="名称" value={props.target.name ?? ""} onChange={(name) => update({ name })} />
          <SelectField
            label="存储类型"
            value={props.target.provider}
            options={providerOptions()}
            onChange={(provider) => props.onChange(providerPatch(props.target, provider as SyncProvider))}
          />
        </div>
      </FormGroup>
      {props.target.provider === "s3-compatible" && <S3Fields target={props.target} update={update} />}
      {props.target.provider === "onedrive" && <OneDriveFields target={props.target} />}
      {props.target.provider === "google-drive" && <GoogleDriveFields target={props.target} />}
      {props.target.provider === "webdav" && <WebDavFields target={props.target} update={update} />}
    </div>
  );
}

function S3Fields(props: {
  readonly target: SyncTarget;
  readonly update: (patch: Partial<SyncTarget>) => void;
}) {
  return (
    <>
      <FormGroup icon={<Network size={16} />} title="连接">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Endpoint" value={props.target.endpoint} onChange={(endpoint) => props.update({ endpoint })} />
          <TextField label="区域" value={props.target.region ?? ""} onChange={(region) => props.update({ region })} />
        </div>
      </FormGroup>
      <FormGroup icon={<Database size={16} />} title="对象">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="存储桶" value={props.target.bucket ?? ""} onChange={(bucket) => props.update({ bucket })} />
          <TextField label="对象路径" value={props.target.objectKey} onChange={(objectKey) => props.update({ objectKey })} />
        </div>
        <label className="mt-3 flex min-h-10 items-center gap-2 text-sm text-(--color-text-secondary)">
          <Switch ariaLabel="强制路径样式" checked={Boolean(props.target.forcePathStyle)} onChange={(forcePathStyle: boolean) => props.update({ forcePathStyle })} />
          使用路径样式访问
        </label>
      </FormGroup>
      <FormGroup icon={<KeyRound size={16} />} title="访问密钥">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="访问密钥 ID" value={props.target.accessKeyId ?? ""} onChange={(accessKeyId) => props.update({ accessKeyId })} />
          <TextField label="访问密钥 Secret" type="password" value={props.target.secretAccessKey ?? ""} onChange={(secretAccessKey) => props.update({ secretAccessKey })} />
        </div>
        <CorsHint />
      </FormGroup>
    </>
  );
}

function FormGroup(props: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="surface-panel space-y-3 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-(--color-text)">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-(--color-accent-soft) text-(--color-accent)">{props.icon}</span>
        {props.title}
      </div>
      {props.children}
    </section>
  );
}

function CorsHint() {
  return (
    <p className="mt-3 rounded-md border border-(--color-border) bg-(--color-surface-muted) p-3 text-xs leading-5 text-(--color-text-secondary)">
      腾讯云 COS 需要在 Bucket CORS 中允许当前站点 Origin、GET/PUT/DELETE/OPTIONS、Authorization 与 x-amz-* 请求头，并暴露 ETag。
    </p>
  );
}

function OneDriveFields(props: {
  readonly target: SyncTarget;
}) {
  return (
    <p className="surface-panel p-3 text-sm text-(--color-text-secondary)">
      当前授权账户：{oneDriveAccountLabel(props.target)}
    </p>
  );
}

function GoogleDriveFields(props: {
  readonly target: SyncTarget;
}) {
  return (
    <p className="surface-panel p-3 text-sm text-(--color-text-secondary)">
      当前授权账户：{props.target.username || "未授权"}
    </p>
  );
}

function WebDavFields(props: {
  readonly target: SyncTarget;
  readonly update: (patch: Partial<SyncTarget>) => void;
}) {
  return (
    <FormGroup icon={<Network size={16} />} title="WebDAV">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="WebDAV URL" value={props.target.webdavUrl ?? ""} onChange={(webdavUrl) => props.update({ webdavUrl })} />
        <TextField label="代理地址" value={props.target.proxyBaseUrl ?? ""} onChange={(proxyBaseUrl) => props.update({ proxyBaseUrl })} />
        <TextField label="目录路径" value={props.target.directoryPath ?? "Coinly"} onChange={(directoryPath) => props.update({ directoryPath })} />
        <TextField label="用户名" value={props.target.webdavUsername ?? ""} onChange={(webdavUsername) => props.update({ webdavUsername })} />
        <TextField label="密码" type="password" value={props.target.webdavPassword ?? ""} onChange={(webdavPassword) => props.update({ webdavPassword })} />
      </div>
    </FormGroup>
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
    { value: "webdav", label: "WebDAV" },
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
