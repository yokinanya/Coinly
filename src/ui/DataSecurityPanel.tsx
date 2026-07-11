import { useState } from "react";
import type { AppData } from "../domain/types";
import { saveData, type SaveToken } from "../storage/indexedDb";
import { changeVaultPassphrase, clearRememberedDevice, isRememberedDeviceEnabled, rememberCurrentDevice } from "../storage/vaultSession";
import { TextField } from "./common";
import { Button, Modal, Switch } from "./components";

export function DataSecurityPanel(props: {
  readonly data: AppData;
  readonly token: SaveToken;
  readonly setMessage: (value: string) => void;
}) {
  const [remembered, setRemembered] = useState(isRememberedDeviceEnabled());
  const [changingKey, setChangingKey] = useState(false);
  const remember = () => {
    rememberCurrentDevice()
      .then(() => setRemembered(true))
      .then(() => props.setMessage("已在当前浏览器开启自动解锁"))
      .catch((error: unknown) => props.setMessage(errorMessage(error, "开启当前浏览器自动解锁失败")));
  };
  const clear = () => {
    clearRememberedDevice();
    setRemembered(false);
    props.setMessage("已关闭当前浏览器自动解锁");
  };
  return (
    <>
      <div className="space-y-3 rounded-md border border-(--color-border) bg-(--color-surface-muted) p-4">
        <h3 className="text-sm font-medium text-(--color-text)">数据加密已启用</h3>
        <SecurityDescription remembered={remembered} remember={remember} clear={clear} openKeyChange={() => setChangingKey(true)} />
      </div>
      <KeyChangeModal data={props.data} token={props.token} open={changingKey} close={() => setChangingKey(false)} setRemembered={setRemembered} setMessage={props.setMessage} />
    </>
  );
}

function SecurityDescription(props: {
  readonly remembered: boolean;
  readonly remember: () => void;
  readonly clear: () => void;
  readonly openKeyChange: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-(--color-text-secondary)">
      <span>本地账本、备份文件和同步数据都会加密保存。</span>
      <span>{props.remembered ? "当前浏览器会自动解锁。" : "当前浏览器需要输入口令。"}</span>
      <span className="flex flex-wrap gap-2">
        {props.remembered ? <Button onClick={props.clear}>关闭自动解锁</Button> : <Button onClick={props.remember}>开启自动解锁</Button>}
        <Button onClick={props.openKeyChange}>修改账本口令</Button>
      </span>
    </div>
  );
}

function KeyChangeModal(props: {
  readonly data: AppData;
  readonly token: SaveToken;
  readonly open: boolean;
  readonly close: () => void;
  readonly setRemembered: (value: boolean) => void;
  readonly setMessage: (value: string) => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [rememberDevice, setRememberDevice] = useState(isRememberedDeviceEnabled());
  const [saving, setSaving] = useState(false);
  const close = () => {
    setPassphrase("");
    setConfirm("");
    props.close();
  };
  const footer = (
    <div className="flex justify-end gap-2">
      <Button onClick={close}>取消</Button>
      <Button variant="primary" loading={saving} onClick={() => submitKeyChange({ ...props, passphrase, confirm, rememberDevice, close, setSaving })}>保存新口令</Button>
    </div>
  );
  return (
    <Modal centered open={props.open} title="修改账本口令" footer={footer} onCancel={close}>
      <div className="space-y-4 px-4 py-2">
        <TextField label="新账本口令" type="password" value={passphrase} onChange={setPassphrase} />
        <TextField label="确认账本口令" type="password" value={confirm} onChange={setConfirm} />
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <Switch ariaLabel="记住本设备" checked={rememberDevice} onChange={setRememberDevice} />
          自动解锁
        </label>
      </div>
    </Modal>
  );
}

function submitKeyChange(options: {
  readonly data: AppData;
  readonly token: SaveToken;
  readonly passphrase: string;
  readonly confirm: string;
  readonly rememberDevice: boolean;
  readonly close: () => void;
  readonly setRemembered: (value: boolean) => void;
  readonly setMessage: (value: string) => void;
  readonly setSaving: (value: boolean) => void;
}): void {
  try {
    validatePassphrases(options.passphrase, options.confirm);
  } catch (error) {
    options.setMessage(errorMessage(error, "账本口令无效"));
    return;
  }
  options.setSaving(true);
  changeVaultPassphrase(options.passphrase, options.rememberDevice, () => saveData(options.data, options.token).then(() => undefined))
    .then(() => options.setRemembered(options.rememberDevice))
    .then(() => options.setMessage("账本口令已更新"))
    .then(options.close)
    .catch((error: unknown) => options.setMessage(errorMessage(error, "修改账本口令失败")))
    .finally(() => options.setSaving(false));
}

function validatePassphrases(passphrase: string, confirm: string): void {
  if (!passphrase.trim()) throw new Error("新账本口令不能为空");
  if (passphrase !== confirm) throw new Error("两次输入的账本口令不一致");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
