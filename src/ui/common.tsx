import type { KeyboardEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { Alert, FloatingMenu, Input, Modal, Select, Tag } from "./components";
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

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

export function PageHeader(props: { readonly title: string; readonly actions?: ReactNode }) {
  void props.title;
  if (!props.actions) return null;
  return <div className="flex flex-wrap justify-end gap-2">{props.actions}</div>;
}

export function SectionPanel(props: { readonly title?: string; readonly children: ReactNode }) {
  return (
    <FadeIn>
      <section className="panel p-4">
        {props.title && <h2 className="mb-3 font-semibold text-(--color-text)">{props.title}</h2>}
        {props.children}
      </section>
    </FadeIn>
  );
}

export function EmptyState({ children }: { readonly children: ReactNode }) {
  return <p className="row-card p-4 text-sm text-(--color-text-secondary)">{children}</p>;
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
    <label className="block w-full">
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
    <label className="block w-full">
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
  return (
    <label className="block w-full">
      <span className="label">{props.label}</span>
      <DatePicker className="mt-2" value={props.value} showTime={props.showTime} disabledDate={props.disabledDate} onChange={props.onChange} />
    </label>
  );
}

export function DateRangeField(props: {
  readonly label: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly onChange: (value: { readonly startAt: string; readonly endAt: string }) => void;
}) {
  return (
    <div>
      <span className="label">{props.label}</span>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <DatePicker value={props.startAt} onChange={(startAt) => props.onChange({ startAt, endAt: props.endAt })} />
        <DatePicker value={props.endAt} onChange={(endAt) => props.onChange({ startAt: props.startAt, endAt: endOfDayValue(endAt) })} />
      </div>
    </div>
  );
}

function DatePicker(props: {
  readonly className?: string;
  readonly value: string;
  readonly showTime?: boolean;
  readonly disabledDate?: (date: Dayjs) => boolean;
  readonly onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = toValidDay(props.value) ?? dayjs();
  const [month, setMonth] = useState(() => selected.startOf("month"));
  const label = props.value ? formatDateInputValue(props.value, Boolean(props.showTime)) : "选择日期";
  const choose = (day: Dayjs) => {
    props.onChange(formatDateValue(day.format("YYYY-MM-DD"), Boolean(props.showTime)));
    setOpen(false);
  };
  const toggleOpen = () => {
    setMonth(selected.startOf("month"));
    setOpen((value) => !value);
  };
  return (
    <>
      <button ref={triggerRef} className={`field flex items-center justify-between gap-3 text-left ${props.className ?? ""}`} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={toggleOpen}>
        <span>{label}</span>
        <span className="text-xs text-(--color-text-muted)">日历</span>
      </button>
      {open && (
        <FloatingMenu triggerRef={triggerRef} close={() => setOpen(false)} preferredHeight={380}>
          <CalendarPanel month={month} selected={selected} disabledDate={props.disabledDate} setMonth={setMonth} choose={choose} />
        </FloatingMenu>
      )}
    </>
  );
}

function CalendarPanel(props: {
  readonly month: Dayjs;
  readonly selected: Dayjs;
  readonly disabledDate?: (date: Dayjs) => boolean;
  readonly setMonth: (month: Dayjs) => void;
  readonly choose: (day: Dayjs) => void;
}) {
  const days = useMemo(() => calendarDays(props.month), [props.month]);
  return (
    <div className="ui-calendar">
      <div className="ui-calendar-header mb-3">
        <button className="ui-calendar-nav" type="button" aria-label="上个月" onClick={() => props.setMonth(props.month.subtract(1, "month"))}>‹</button>
        <div className="ui-calendar-title">{props.month.format("YYYY 年 M 月")}</div>
        <button className="ui-calendar-nav" type="button" aria-label="下个月" onClick={() => props.setMonth(props.month.add(1, "month"))}>›</button>
      </div>
      <div className="ui-calendar-grid mb-1 text-center text-xs text-(--color-text-muted)">
        {WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="ui-calendar-grid">
        {days.map((day) => <CalendarDay key={day.format("YYYY-MM-DD")} day={day} {...props} />)}
      </div>
    </div>
  );
}

function CalendarDay(props: {
  readonly day: Dayjs;
  readonly month: Dayjs;
  readonly selected: Dayjs;
  readonly disabledDate?: (date: Dayjs) => boolean;
  readonly setMonth: (month: Dayjs) => void;
  readonly choose: (day: Dayjs) => void;
}) {
  const disabled = Boolean(props.disabledDate?.(props.day));
  const selected = props.day.isSame(props.selected, "day");
  const muted = !props.day.isSame(props.month, "month");
  const className = [
    "ui-calendar-day",
    selected ? "ui-calendar-day-selected" : "",
    muted ? "ui-calendar-day-muted" : "",
    disabled ? "ui-calendar-day-disabled" : "",
  ].filter(Boolean).join(" ");
  return (
    <button
      className={className}
      type="button"
      aria-current={props.day.isSame(dayjs(), "day") ? "date" : undefined}
      aria-pressed={selected}
      data-calendar-day={props.day.format("YYYY-MM-DD")}
      disabled={disabled}
      onClick={() => props.choose(props.day)}
      onKeyDown={(event) => handleCalendarDayKeyDown(event, props.day, props.setMonth)}
    >
      {props.day.date()}
    </button>
  );
}

function handleCalendarDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: Dayjs, setMonth: (month: Dayjs) => void): void {
  const offset = calendarKeyOffset(event.key, day);
  if (offset === null) return;
  event.preventDefault();
  const next = typeof offset === "number" ? day.add(offset, "day") : offset;
  setMonth(next.startOf("month"));
  window.requestAnimationFrame(() => focusCalendarDay(next));
}

function calendarKeyOffset(key: string, day: Dayjs): number | Dayjs | null {
  if (key === "ArrowLeft") return -1;
  if (key === "ArrowRight") return 1;
  if (key === "ArrowUp") return -7;
  if (key === "ArrowDown") return 7;
  if (key === "Home") return -((day.day() + 6) % 7);
  if (key === "End") return 6 - ((day.day() + 6) % 7);
  if (key === "PageUp") return day.subtract(1, "month");
  if (key === "PageDown") return day.add(1, "month");
  return null;
}

function focusCalendarDay(day: Dayjs): void {
  document.querySelector<HTMLButtonElement>(`[data-calendar-day="${day.format("YYYY-MM-DD")}"]`)?.focus({ preventScroll: true });
}

function calendarDays(month: Dayjs): readonly Dayjs[] {
  const start = month.startOf("month");
  const offset = (start.day() + 6) % 7;
  const first = start.subtract(offset, "day");
  return Array.from({ length: 42 }, (_unused, index) => first.add(index, "day"));
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

function formatDateValue(value: string, showTime: boolean): string {
  if (!value) return "";
  const date = dayjs(value);
  if (!date.isValid()) throw new Error("日期格式无效");
  return showTime ? date.toDate().toISOString() : date.startOf("day").toDate().toISOString();
}

function endOfDayValue(value: string): string {
  if (!value) return "";
  const date = dayjs(value);
  if (!date.isValid()) throw new Error("日期格式无效");
  return date.endOf("day").toDate().toISOString();
}

function formatDateInputValue(value: string, showTime: boolean): string {
  const date = toValidDay(value);
  if (!date) return "";
  return showTime ? date.format("YYYY-MM-DDTHH:mm") : date.format("YYYY-MM-DD");
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
