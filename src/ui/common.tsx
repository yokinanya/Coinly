import type { ReactNode } from "react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { Alert, DatePicker, Input, Modal, Select, Tag } from "./metis";
import { FadeIn } from "./motion";

export type StatusTone = "info" | "success" | "warning" | "error";

export interface StatusMessage {
  readonly tone: StatusTone;
  readonly text: string;
}

export interface FormOption {
  readonly value: string;
  readonly label: string;
}

export function PageHeader(props: { readonly title: string; readonly actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-[var(--text-xl)] font-semibold leading-[var(--leading-tight)] text-[var(--color-text)]">{props.title}</h1>
      {props.actions && <div className="flex flex-wrap items-center gap-2">{props.actions}</div>}
    </header>
  );
}

export function SectionPanel(props: { readonly title?: string; readonly children: ReactNode }) {
  return (
    <FadeIn>
      <section className="panel p-4">
        {props.title && <h2 className="mb-3 font-semibold text-[var(--color-text)]">{props.title}</h2>}
        {props.children}
      </section>
    </FadeIn>
  );
}

export function EmptyState({ children }: { readonly children: ReactNode }) {
  return <p className="row-card p-4 text-sm text-[var(--color-text-secondary)]">{children}</p>;
}

export function ErrorBanner({ message }: { readonly message: string }) {
  if (!message) return null;
  return <Alert type="error" message={message} />;
}

export function SuccessBanner({ message }: { readonly message: string }) {
  if (!message) return null;
  return <Alert type="success" message={message} />;
}

export function MessageBanner({ message, tone }: { readonly message: string; readonly tone: StatusTone }) {
  if (!message) return null;
  return <Alert type={alertType(tone)} message={message} />;
}

export function StatusBar({ status }: { readonly status: StatusMessage }) {
  return <MessageBanner message={status.text} tone={status.tone} />;
}

export function ConfirmDialog(props: {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal centered open={props.open} title={props.title} onCancel={props.onCancel} onOk={props.onConfirm}>
      <p>{props.description}</p>
    </Modal>
  );
}

export function TextField(props: {
  readonly label: string;
  readonly value: string | number;
  readonly type?: string;
  readonly placeholder?: string;
  readonly compact?: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="block w-full">
      <span className="label">{props.label}</span>
      <Input className="mt-2 w-full" style={{ width: "100%", height: props.compact ? 36 : undefined }} type={props.type ?? "text"} value={props.value} placeholder={props.placeholder} onChange={(value) => props.onChange(String(value))} />
    </label>
  );
}

export function SelectField(props: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly FormOption[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="label">{props.label}</span>
      <Select className="mt-2 w-full" value={props.value} options={[...props.options]} onChange={(value) => props.onChange(String(value))} />
    </label>
  );
}

export function MultiSelectField(props: {
  readonly label: string;
  readonly values: readonly string[];
  readonly options: readonly FormOption[];
  readonly onChange: (values: readonly string[]) => void;
}) {
  return (
    <label>
      <span className="label">{props.label}</span>
      <Select
        className="mt-2 w-full"
        mode="multiple"
        value={[...props.values]}
        options={[...props.options]}
        onChange={(values) => props.onChange(Array.isArray(values) ? values.map(String) : [])}
      />
    </label>
  );
}

export function DateField(props: {
  readonly label: string;
  readonly value: string;
  readonly showTime?: boolean;
  readonly disabledDate?: (date: Dayjs) => boolean;
  readonly onChange: (value: string) => void;
}) {
  const value = props.value ? dayjs(props.value) : undefined;
  const format = props.showTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD";
  return (
    <label>
      <span className="label">{props.label}</span>
      <DatePicker
        className="mt-2 w-full"
        format={format}
        showTime={props.showTime ? { format: "HH:mm" } : false}
        value={value?.isValid() ? value : undefined}
        disabledDate={props.disabledDate}
        onChange={(_dateString, date) => props.onChange(formatDateValue(date, Boolean(props.showTime)))}
      />
    </label>
  );
}

export function DateRangeField(props: {
  readonly label: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly onChange: (value: { readonly startAt: string; readonly endAt: string }) => void;
}) {
  const startAt = toValidDay(props.startAt);
  const endAt = toValidDay(props.endAt);
  const value = startAt || endAt ? ([startAt, endAt] as [Dayjs | null, Dayjs | null]) : null;
  return (
    <label>
      <span className="label">{props.label}</span>
      <DatePicker.RangePicker
        className="mt-2 w-full"
        format="YYYY-MM-DD"
        value={value}
        onChange={(_dateStrings, dates) => props.onChange(formatDateRangeValue(dates))}
      />
    </label>
  );
}

export function CheckableTagList(props: {
  readonly label: string;
  readonly selected: readonly string[];
  readonly options: readonly FormOption[];
  readonly onChange: (values: readonly string[]) => void;
}) {
  return (
    <div>
      <span className="label">{props.label}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {props.options.map((option) => (
          <Tag.CheckableTag
            key={option.value}
            checked={props.selected.includes(option.value)}
            onChange={(checked) => props.onChange(toggleValue(props.selected, option.value, checked))}
          >
            {option.label}
          </Tag.CheckableTag>
        ))}
      </div>
    </div>
  );
}

export function TextAreaField(props: {
  readonly label: string;
  readonly value: string;
  readonly minRows?: number;
  readonly maxRows?: number;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="label">{props.label}</span>
      <Input.TextArea className="mt-2" autoSize={{ minRows: props.minRows ?? 1, maxRows: props.maxRows ?? 6 }} value={props.value} onChange={(value) => props.onChange(String(value))} />
    </label>
  );
}

function formatDateValue(date: Dayjs | Dayjs[] | null, showTime: boolean): string {
  if (!date || Array.isArray(date)) return "";
  return showTime ? date.toDate().toISOString() : date.startOf("day").toDate().toISOString();
}

function formatDateRangeValue(dates: readonly (Dayjs | null)[] | null): { readonly startAt: string; readonly endAt: string } {
  if (!dates || dates.length < 2) return { startAt: "", endAt: "" };
  const [startAt, endAt] = dates;
  return {
    startAt: startAt?.startOf("day").toDate().toISOString() ?? "",
    endAt: endAt?.endOf("day").toDate().toISOString() ?? "",
  };
}

function toValidDay(value: string): Dayjs | null {
  if (!value) return null;
  const date = dayjs(value);
  return date.isValid() ? date : null;
}

function toggleValue(values: readonly string[], value: string, checked: boolean): readonly string[] {
  if (checked) return values.includes(value) ? values : [...values, value];
  return values.filter((item) => item !== value);
}

function alertType(tone: StatusTone): "info" | "success" | "warning" | "error" {
  return tone;
}
