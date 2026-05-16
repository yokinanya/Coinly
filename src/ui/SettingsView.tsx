import { useCallback, type ReactNode } from "react";
import { bumpVersion } from "../domain/factory";
import type { AiSettings, AppData, SyncSettings, ThemeMode } from "../domain/types";
import { PageHeader } from "./common";
import {
  AiSettingsPanel,
  CatalogPanel,
  CurrencyPanel,
  DataPanel,
  ThemePanel,
} from "./settingsPanels";
import { SyncPanel } from "./syncSettingsPanel";
import { List, Message } from "./metis";
import type { StatusTone } from "./common";
import { statusFromText } from "./status";
import { FadeIn } from "./motion";

export function SettingsView(props: {
  readonly data: AppData;
  readonly token: import("../storage/indexedDb").SaveToken;
  readonly setData: (data: AppData) => void;
}) {
  const report = useCallback((value: string) => {
    showMessage(value);
  }, []);
  const updateSync = (settings: SyncSettings) => props.setData(bumpVersion({ ...props.data, syncSettings: settings }));
  const updateAi = (settings: AiSettings) => props.setData(bumpVersion({ ...props.data, aiSettings: settings }));
  const updateTheme = (theme: ThemeMode) => props.setData(bumpVersion({ ...props.data, uiSettings: { theme } }));

  return (
    <section className="space-y-5">
      <PageHeader title="设置" />
      <SettingsList
        sections={[
          { key: "theme", node: <ThemePanel theme={props.data.uiSettings?.theme ?? "system"} onChange={updateTheme} /> },
          { key: "sync", node: <SyncPanel data={props.data} settings={props.data.syncSettings} onChange={updateSync} applyRemote={props.setData} setMessage={report} /> },
          { key: "ai", node: <AiSettingsPanel settings={props.data.aiSettings} onChange={updateAi} /> },
          { key: "currency", node: <CurrencyPanel data={props.data} setData={props.setData} setMessage={report} /> },
          { key: "data", node: <DataPanel data={props.data} token={props.token} setData={props.setData} setMessage={report} /> },
          { key: "catalog", node: <CatalogPanel data={props.data} /> },
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

function SettingsList(props: { readonly sections: readonly { readonly key: string; readonly node: ReactNode }[] }) {
  return (
    <div className="w-full">
      <List
        bordered
        className="w-full"
        dataSource={[...props.sections]}
        rowKey="key"
        renderItem={(section) => <List.Item><FadeIn>{section.node}</FadeIn></List.Item>}
      />
    </div>
  );
}
