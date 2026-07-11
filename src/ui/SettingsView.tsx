import { useCallback, type ReactNode } from "react";
import { bumpVersion } from "../domain/factory";
import type { AppData, SyncSettings } from "../domain/types";
import { PageHeader } from "./common";
import {
  CurrencyPanel,
  DataPanel,
} from "./settingsPanels";
import { SyncPanel } from "./syncSettingsPanel";
import { List } from "./components";
import { Message } from "./toastApi";
import type { StatusTone } from "./common";
import { statusFromText } from "./status";
import { FadeIn } from "./motion";

export function SettingsView(props: {
  readonly data: AppData;
  readonly token: import("../storage/indexedDb").SaveToken;
  readonly setData: (data: AppData | undefined) => void;
  readonly setVaultData: (data: AppData) => void;
}) {
  const report = useCallback((value: string) => {
    showMessage(value);
  }, []);
  const updateSync = (settings: SyncSettings) => props.setVaultData(bumpVersion({ ...props.data, syncSettings: settings }));

  return (
    <section className="space-y-5">
      <PageHeader title="设置" />
      <SettingsList
        sections={[
          { key: "sync", label: "同步", node: <SyncPanel data={props.data} settings={props.data.syncSettings} onChange={updateSync} applyRemote={props.setData} setMessage={report} /> },
          { key: "currency", label: "币种", node: <CurrencyPanel data={props.data} setData={props.setVaultData} setMessage={report} /> },
          { key: "data", label: "数据与安全", node: <DataPanel data={props.data} token={props.token} setData={props.setData} setMessage={report} /> },
        ]}
      />
    </section>
  );
}

function showMessage(value: string): void {
  if (!value) return;
  const status = statusFromText(value);
  const method = messageMethod(status.tone);
  Message[method](value);
}

function messageMethod(tone: StatusTone): "info" | "success" | "warning" | "error" {
  return tone;
}

function SettingsList(props: { readonly sections: readonly { readonly key: string; readonly label: string; readonly node: ReactNode }[] }) {
  return (
    <div className="grid w-full gap-4 lg:grid-cols-[10rem_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-5 lg:block lg:self-start" aria-label="设置分类">
        {props.sections.map((section) => (
          <a key={section.key} className="block min-h-10 shrink-0 rounded-md px-3 py-2 text-sm font-medium text-(--color-text-secondary) hover:bg-(--color-surface-muted) hover:text-(--color-text)" href={`#settings-${section.key}`}>
            {section.label}
          </a>
        ))}
      </nav>
      <List
        className="w-full space-y-3"
        dataSource={[...props.sections]}
        rowKey="key"
        renderItem={(section) => <div id={`settings-${section.key}`} className="scroll-mt-5"><FadeIn>{section.node}</FadeIn></div>}
      />
    </div>
  );
}
