import { addCurrency, deleteCurrency } from "../domain/operations";
import type { AppData } from "../domain/types";
import { DataVaultPanel } from "./DataVaultPanel";
import { DynamicTagList } from "./DynamicTagList";
import { SettingsSection } from "./settingsSection";

export function CurrencyPanel(props: {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}) {
  const save = (currency: string) => {
    try {
      props.setData(addCurrency(props.data, currency));
      props.setMessage("币种已添加");
    } catch (error) {
      props.setMessage(error instanceof Error ? error.message : "币种添加失败");
    }
  };
  const remove = (value: string) => {
    try {
      props.setData(deleteCurrency(props.data, value));
      props.setMessage("币种已删除");
    } catch (error) {
      props.setMessage(error instanceof Error ? error.message : "币种删除失败");
    }
  };
  return (
    <SettingsSection title="币种">
      <DynamicTagList values={props.data.currencies} addLabel="新增币种" placeholder="AUD" onAdd={save} onRemove={remove} />
    </SettingsSection>
  );
}

export function DataPanel(props: {
  readonly data: AppData;
  readonly token: import("../storage/indexedDb").SaveToken;
  readonly setData: (data: AppData | undefined) => void;
  readonly setMessage: (value: string) => void;
}) {
  return <DataVaultPanel {...props} />;
}
