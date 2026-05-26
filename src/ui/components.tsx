import { X } from "lucide-react";
import type { ChangeEvent, CSSProperties, InputHTMLAttributes, ReactNode, RefObject, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export { Button };

type Tone = "info" | "success" | "warning" | "error";
const LIST_IGNORE = "__COINLY_UPLOAD_IGNORE__";
const FLOATING_MENU_MARGIN = 8;
const FLOATING_MENU_MAX_WIDTH = 448;

export function Alert(props: { readonly type?: Tone; readonly message: ReactNode }) {
  return <div className={cn("alert", `alert-${props.type ?? "info"}`)}>{props.message}</div>;
}

export function Checkbox(props: {
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (checked: boolean) => void;
}) {
  const checked = Boolean(props.checked);
  return (
    <button
      className={cn("ui-checkbox", checked && "ui-checkbox-checked")}
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={props.disabled}
      onClick={() => props.onChange?.(!checked)}
    >
      {checked && <span aria-hidden="true">✓</span>}
    </button>
  );
}

export function Divider() {
  return <hr className="border-[var(--color-border)]" />;
}

export function Switch(props: {
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (checked: boolean) => void;
}) {
  return (
    <button
      className={cn("ui-switch", props.checked && "ui-switch-checked")}
      type="button"
      role="switch"
      aria-checked={Boolean(props.checked)}
      disabled={props.disabled}
      onClick={() => props.onChange?.(!props.checked)}
    >
      <span />
    </button>
  );
}

export function Modal(props: {
  readonly open: boolean;
  readonly title?: ReactNode;
  readonly footer?: ReactNode;
  readonly children?: ReactNode;
  readonly centered?: boolean;
  readonly width?: number | string;
  readonly onCancel?: () => void;
  readonly onOk?: () => void;
}) {
  useEscapeClose(props.open, props.onCancel);
  if (!props.open) return null;
  const style = { "--dialog-width": dialogWidth(props.width) } as CSSProperties;
  return (
    <div className="dialog-root" role="presentation">
      <button className="dialog-backdrop" type="button" aria-label="关闭弹窗" onClick={props.onCancel} />
      <section className={cn("dialog-panel", props.centered && "dialog-centered")} style={style} role="dialog" aria-modal="true">
        <DialogHeader title={props.title} close={props.onCancel} />
        <div className="dialog-body">{props.children}</div>
        <DialogFooter footer={props.footer} ok={props.onOk} cancel={props.onCancel} />
      </section>
    </div>
  );
}

export function Drawer(props: {
  readonly open: boolean;
  readonly title?: ReactNode;
  readonly footer?: ReactNode;
  readonly children?: ReactNode;
  readonly width?: number | string;
  readonly placement?: "left" | "right";
  readonly className?: { readonly body?: string; readonly content?: string };
  readonly closable?: boolean;
  readonly onClose?: () => void;
}) {
  useEscapeClose(props.open, props.onClose);
  if (!props.open) return null;
  const style = { "--drawer-width": dialogWidth(props.width) } as CSSProperties;
  return (
    <div className="dialog-root" role="presentation">
      <button className="dialog-backdrop" type="button" aria-label="关闭抽屉" onClick={props.onClose} />
      <section className={cn("drawer-panel", props.placement === "left" && "drawer-left", props.className?.content)} style={style} role="dialog" aria-modal="true">
        <DialogHeader title={props.title} close={props.closable === false ? undefined : props.onClose} />
        <div className={cn("drawer-body", props.className?.body)}>{props.children}</div>
        {props.footer && <footer className="dialog-footer">{props.footer}</footer>}
      </section>
    </div>
  );
}

function DialogHeader(props: { readonly title?: ReactNode; readonly close?: () => void }) {
  if (!props.title && !props.close) return null;
  return (
    <header className="dialog-header">
      {props.title && <h2 className="text-base font-semibold">{props.title}</h2>}
      {props.close && <Button aria-label="关闭" title="关闭" variant="ghost" onClick={props.close}><X size={16} /></Button>}
    </header>
  );
}

function DialogFooter(props: { readonly footer?: ReactNode; readonly ok?: () => void; readonly cancel?: () => void }) {
  if (props.footer) return <footer className="dialog-footer">{props.footer}</footer>;
  if (!props.ok) return null;
  return <footer className="dialog-footer"><Button onClick={props.cancel}>取消</Button><Button variant="primary" onClick={props.ok}>确定</Button></footer>;
}

function useEscapeClose(open: boolean, close?: () => void): void {
  useEffect(() => {
    if (!open || !close) return undefined;
    const listener = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [close, open]);
}

function dialogWidth(width?: number | string): string {
  if (typeof width === "number") return `${width}px`;
  return width ?? "32rem";
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement> & { readonly onChange?: (value: string) => void }) {
  const { className, onChange, ...rest } = props;
  return <input className={cn("field", className)} onChange={(event) => onChange?.(event.currentTarget.value)} {...rest} />;
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly autoSize?: { readonly minRows?: number; readonly maxRows?: number };
  readonly onChange?: (value: string) => void;
}) {
  const { autoSize, className, onChange, rows, ...rest } = props;
  return <textarea className={cn("field min-h-24 resize-y", className)} rows={rows ?? autoSize?.minRows} onChange={(event) => onChange?.(event.currentTarget.value)} {...rest} />;
}

export const Input = Object.assign(TextInput, { TextArea });

export function InputNumber(props: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { readonly onChange?: (value: number | null) => void }) {
  return <TextInput {...props} type="number" onChange={(value) => props.onChange?.(value === "" ? null : Number(value))} />;
}

export function Select(props: Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  readonly mode?: "multiple";
  readonly options?: readonly { readonly value: string; readonly label: ReactNode }[];
  readonly onChange?: (value: string | readonly string[]) => void;
}) {
  const { className, mode, multiple, onChange, options = [], value, disabled, ...rest } = props;
  void rest;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const multi = Boolean(multiple || mode === "multiple");
  const values = selectValues(value);
  const selected = options.filter((option) => values.includes(option.value));
  const label = selected.length > 0 ? selected.map((option) => option.label).reduce<ReactNode[]>((nodes, node, index) => [...nodes, index > 0 ? "，" : "", node], []) : "请选择";
  const openUp = useOpenUp(triggerRef, open, 280);
  const choose = (nextValue: string) => {
    if (!multi) {
      onChange?.(nextValue);
      setOpen(false);
      return;
    }
    onChange?.(toggleSelectValue(values, nextValue));
  };
  return (
    <span className="ui-select-root">
      <button
        ref={triggerRef}
        className={cn("field flex items-center justify-between gap-3 text-left", !selected.length && "text-[var(--color-text-muted)]", className)}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 text-xs text-[var(--color-text-muted)]">▾</span>
      </button>
      {open && (
        <LocalFloatingMenu openUp={openUp} close={() => setOpen(false)}>
          <div className="ui-select-menu" role="listbox" aria-multiselectable={multi || undefined}>
            {options.map((option) => {
              const checked = values.includes(option.value);
              return (
                <button
                  key={option.value}
                  className={cn("ui-select-option", checked && "ui-select-option-selected")}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => choose(option.value)}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {checked && <span className="shrink-0 text-[var(--color-accent)]">✓</span>}
                </button>
              );
            })}
          </div>
        </LocalFloatingMenu>
      )}
    </span>
  );
}

function selectValues(value: SelectHTMLAttributes<HTMLSelectElement>["value"]): readonly string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "number") return [String(value)];
  if (typeof value === "string") return [value];
  return [];
}

function toggleSelectValue(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function LocalFloatingMenu(props: {
  readonly openUp: boolean;
  readonly close: () => void;
  readonly children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.parentElement?.contains(event.target as Node)) return;
      props.close();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [props]);
  return (
    <div
      ref={menuRef}
      data-floating-menu
      className={cn("ui-floating-menu ui-select-floating", props.openUp ? "ui-select-floating-up" : "ui-select-floating-down")}
    >
      {props.children}
    </div>
  );
}

function useOpenUp(triggerRef: RefObject<HTMLElement | null>, open: boolean, preferredHeight: number): boolean {
  const [openUp, setOpenUp] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const update = () => setOpenUp(shouldOpenUp(triggerRef.current, preferredHeight));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, preferredHeight, triggerRef]);
  return openUp;
}

function shouldOpenUp(trigger: HTMLElement | null, preferredHeight: number): boolean {
  if (!trigger) return false;
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const below = window.innerHeight - rect.bottom - gap;
  const above = rect.top - gap;
  return below < preferredHeight && above > below;
}

export function FloatingMenu(props: {
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly close: () => void;
  readonly preferredHeight?: number;
  readonly children: ReactNode;
}) {
  const [style, setStyle] = useState<CSSProperties>();
  useEffect(() => {
    const update = () => setStyle(menuStyle(props.triggerRef.current, props.preferredHeight ?? 280));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [props.preferredHeight, props.triggerRef]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (props.triggerRef.current?.contains(event.target as Node)) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-floating-menu]")) return;
      props.close();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [props]);
  if (!style) return null;
  return createPortal(
    <div data-floating-menu className="ui-floating-menu" style={style}>
      {props.children}
    </div>,
    document.body,
  );
}

function menuStyle(trigger: HTMLElement | null, preferredHeight: number): CSSProperties | undefined {
  if (!trigger) return undefined;
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const viewportWidth = window.innerWidth - FLOATING_MENU_MARGIN * 2;
  const width = Math.min(Math.max(rect.width, 192), FLOATING_MENU_MAX_WIDTH, viewportWidth);
  const below = window.innerHeight - rect.bottom - gap;
  const above = rect.top - gap;
  const openUp = below < preferredHeight && above > below;
  return {
    boxSizing: "border-box",
    left: floatingMenuLeft(rect, width),
    top: openUp ? undefined : rect.bottom + gap,
    bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
    width,
    maxHeight: Math.min(preferredHeight, Math.max(160, openUp ? above : below)),
  };
}

function floatingMenuLeft(rect: DOMRect, width: number): number {
  const preferredLeft = rect.left;
  const maxLeft = window.innerWidth - width - FLOATING_MENU_MARGIN;
  return Math.max(FLOATING_MENU_MARGIN, Math.min(preferredLeft, maxLeft));
}

export function Popconfirm(props: {
  readonly children?: ReactNode;
  readonly open?: boolean;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly cancelText?: string;
  readonly okText?: string;
  readonly okType?: string;
  readonly onCancel?: () => void;
  readonly onConfirm: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.open ?? internalOpen;
  const close = () => props.onCancel ? props.onCancel() : setInternalOpen(false);
  return (
    <>
      {props.children && <span onClick={() => setInternalOpen(true)}>{props.children}</span>}
      <Modal open={open} title={props.title} footer={<ConfirmFooter close={close} confirm={props.onConfirm} /> } onCancel={close}>
        {props.description && <p className="text-sm text-[var(--color-text-secondary)]">{props.description}</p>}
      </Modal>
    </>
  );
}

function ConfirmFooter(props: { readonly close: () => void; readonly confirm: () => void }) {
  return <div className="flex justify-end gap-2"><Button onClick={props.close}>取消</Button><Button variant="danger" onClick={props.confirm}>确定</Button></div>;
}

export function Upload(props: {
  readonly children: ReactNode;
  readonly accept?: string;
  readonly disabled?: boolean;
  readonly beforeUpload?: (file: File) => unknown;
  readonly maxCount?: number;
  readonly showUploadList?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <span>
      <span onClick={() => !props.disabled && inputRef.current?.click()}>{props.children}</span>
      <input ref={inputRef} className="hidden" type="file" accept={props.accept} disabled={props.disabled} onChange={(event) => handleUpload(event, props.beforeUpload)} />
    </span>
  );
}

Upload.LIST_IGNORE = LIST_IGNORE;

function handleUpload(event: ChangeEvent<HTMLInputElement>, beforeUpload?: (file: File) => unknown): void {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  if (file) beforeUpload?.(file);
}

function CheckableTag(props: { readonly checked?: boolean; readonly children: ReactNode; readonly onChange?: (checked: boolean) => void }) {
  return <button className={cn("tag motion-press", props.checked && "tag-checked")} type="button" onClick={() => props.onChange?.(!props.checked)}>{props.children}</button>;
}

function TagRoot(props: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly closable?: boolean;
  readonly onClick?: () => void;
  readonly onClose?: () => void;
}) {
  return (
    <span className={cn("tag", props.onClick && "motion-press cursor-pointer", props.className)} onClick={props.onClick}>
      {props.children}
      {props.closable && <button className="ml-1 text-current" type="button" aria-label="移除" onClick={props.onClose}>×</button>}
    </span>
  );
}

export const Tag = Object.assign(
  TagRoot,
  { CheckableTag },
);

export function List<T>(props: {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly dataSource?: readonly T[];
  readonly renderItem?: (item: T) => ReactNode;
  readonly rowKey?: keyof T | string;
  readonly bordered?: boolean;
}) {
  const content = props.dataSource?.map((item, index) => <div key={listKey(item, props.rowKey, index)}>{props.renderItem?.(item)}</div>);
  return <div className={cn("space-y-2", props.bordered && "glass-surface p-2", props.className)}>{props.children ?? content}</div>;
}

function listKey<T>(item: T, rowKey: keyof T | string | undefined, index: number): string | number {
  if (!rowKey || typeof item !== "object" || item === null) return index;
  const value = (item as Record<string, unknown>)[String(rowKey)];
  return typeof value === "string" || typeof value === "number" ? value : index;
}

function ListItem(props: { readonly children?: ReactNode; readonly className?: string; readonly actions?: readonly ReactNode[] }) {
  return (
    <div className={cn("row-card flex items-center justify-between gap-3 p-3", props.className)}>
      <div className="min-w-0">{props.children}</div>
      {props.actions && <div className="flex shrink-0 gap-2">{props.actions}</div>}
    </div>
  );
}

function ListItemMeta(props: { readonly title?: ReactNode; readonly description?: ReactNode }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{props.title}</span>
      {props.description && <span className="block truncate text-sm text-[var(--color-text-secondary)]">{props.description}</span>}
    </span>
  );
}

List.Item = Object.assign(ListItem, { Meta: ListItemMeta });

export function Tabs(props: { readonly items?: readonly { readonly key: string; readonly label: ReactNode; readonly children: ReactNode }[]; readonly defaultActiveKey?: string }) {
  const [active, setActive] = useState(props.defaultActiveKey ?? props.items?.[0]?.key);
  const item = useMemo(() => props.items?.find((item) => item.key === active), [active, props.items]);
  return <div><div className="toolbar mb-3 flex gap-1 p-1">{props.items?.map((item) => <Button key={item.key} variant={item.key === active ? "primary" : "ghost"} onClick={() => setActive(item.key)}>{item.label}</Button>)}</div>{item?.children}</div>;
}
