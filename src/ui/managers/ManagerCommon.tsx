import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import type { AppData } from "../../domain/types";
import { ConfirmDialog, SelectField as CommonSelectField, TextField } from "../common";
import type { FormOption } from "../common";
import { Button, Drawer } from "../components";
import { FadeIn } from "../motion";

const DRAWER_WIDTH = 440;

export type SetData = (data: AppData) => void;
export type CollectionKey = "accounts" | "categories" | "tags" | "budgets" | "recurringRules" | "statements";

export interface ManagerProps {
  readonly data: AppData;
  readonly setData: SetData;
  readonly setMessage: (value: string) => void;
}

export function ManagerPanel(props: { readonly title: string; readonly children: ReactNode }) {
  return <FadeIn><section className="panel space-y-4 p-4"><h2 className="font-semibold text-(--color-text)">{props.title}</h2>{props.children}</section></FadeIn>;
}

export function EntityList<T extends { readonly id: string; readonly name: string }>(props: {
  readonly items: readonly T[];
  readonly deleteLabel: string;
  readonly onEdit: (item: T) => void;
  readonly onDelete: (id: string) => void;
}) {
  const [pending, setPending] = useState<T>();
  const confirm = () => {
    if (!pending) return;
    props.onDelete(pending.id);
    setPending(undefined);
  };
  return (
    <div className="grid gap-2">
      {props.items.map((item) => <AnimatedRow key={item.id}><EntityRow item={item} onEdit={props.onEdit} onDelete={setPending} /></AnimatedRow>)}
      <ConfirmDialog
        open={Boolean(pending)}
        title="确认删除"
        description={pending ? `确认删除“${pending.name}”？${props.deleteLabel}` : ""}
        onCancel={() => setPending(undefined)}
        onConfirm={confirm}
      />
    </div>
  );
}

export function ManagerDrawer(props: {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly contentClassName?: string;
  readonly onClose: () => void;
  readonly onSave: () => void;
}) {
  const footer = (
    <div className="flex justify-end gap-2">
      <Button onClick={props.onClose}>取消</Button>
      <Button variant="primary" onClick={props.onSave}>保存</Button>
    </div>
  );
  return (
    <Drawer open={props.open} title={props.title} width={DRAWER_WIDTH} footer={footer} onClose={props.onClose}>
      <div className={props.contentClassName ?? "space-y-5 py-1"}>{props.children}</div>
    </Drawer>
  );
}

export function Field(props: {
  readonly label: string;
  readonly value: string | number;
  readonly type?: InputHTMLAttributes<HTMLInputElement>["type"];
  readonly inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  readonly min?: InputHTMLAttributes<HTMLInputElement>["min"];
  readonly step?: InputHTMLAttributes<HTMLInputElement>["step"];
  readonly onChange: (value: string) => void;
}) {
  return <div className="py-0.5"><TextField label={props.label} type={props.type} inputMode={props.inputMode} min={props.min} step={props.step} value={props.value} onChange={props.onChange} /></div>;
}

export function SelectField(props: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly labels?: Record<string, string>;
  readonly onChange: (value: string) => void;
}) {
  return <div className="py-0.5"><CommonSelectField label={props.label} value={props.value} options={optionsToFormOptions(props.options, props.labels)} onChange={props.onChange} /></div>;
}

export function AnimatedRow({ children }: { readonly children: ReactNode }) {
  return <FadeIn>{children}</FadeIn>;
}

export function NewButton(props: { readonly onClick: () => void }) {
  return <Button variant="primary" onClick={props.onClick}>新建</Button>;
}

function EntityRow<T extends { readonly id: string; readonly name: string }>(props: {
  readonly item: T;
  readonly onEdit: (item: T) => void;
  readonly onDelete: (item: T) => void;
}) {
  return (
    <div className="row-card flex items-center justify-between gap-3 p-2 text-sm">
      <span>{props.item.name}</span>
      <span className="flex gap-2">
        <Button onClick={() => props.onEdit(props.item)}>编辑</Button>
        <Button variant="danger" onClick={() => props.onDelete(props.item)}>删除</Button>
      </span>
    </div>
  );
}

function optionsToFormOptions(options: readonly string[], labels?: Record<string, string>): readonly FormOption[] {
  return options.map((value) => ({ value, label: labels?.[value] ?? (value || "无") }));
}
