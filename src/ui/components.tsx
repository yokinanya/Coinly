import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ChangeEvent, CSSProperties, InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export { Button };

type Tone = "info" | "success" | "warning" | "error";
const LIST_IGNORE = "__COINLY_UPLOAD_IGNORE__";
const FLOATING_MENU_MARGIN = 8;
const FLOATING_MENU_MAX_WIDTH = 448;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Alert(props: { readonly type?: Tone; readonly message: ReactNode }) {
  const type = props.type ?? "info";
  return (
    <div className={cn("alert", `alert-${type}`)} role={type === "error" ? "alert" : "status"} aria-live={type === "error" ? "assertive" : "polite"} aria-atomic="true">
      {props.message}
    </div>
  );
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
  return <hr className="border-(--color-border)" />;
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
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useDialogBehavior(props.open, panelRef, props.onCancel);
  if (!props.open) return null;
  const style = { "--dialog-width": dialogWidth(props.width) } as CSSProperties;
  return (
    <div className="dialog-root" role="presentation">
      <button className="dialog-backdrop" type="button" aria-label="关闭弹窗" onClick={props.onCancel} />
      <section ref={panelRef} className={cn("dialog-panel", props.centered && "dialog-centered")} style={style} role="dialog" aria-modal="true" aria-labelledby={props.title ? titleId : undefined} tabIndex={-1} data-dialog-panel>
        <DialogHeader title={props.title} titleId={titleId} close={props.onCancel} />
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
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useDialogBehavior(props.open, panelRef, props.onClose);
  if (!props.open) return null;
  const style = { "--drawer-width": dialogWidth(props.width) } as CSSProperties;
  return (
    <div className="dialog-root" role="presentation">
      <button className="dialog-backdrop" type="button" aria-label="关闭抽屉" onClick={props.onClose} />
      <section ref={panelRef} className={cn("drawer-panel", props.placement === "left" && "drawer-left", props.className?.content)} style={style} role="dialog" aria-modal="true" aria-labelledby={props.title ? titleId : undefined} tabIndex={-1} data-dialog-panel>
        <DialogHeader title={props.title} titleId={titleId} close={props.closable === false ? undefined : props.onClose} />
        <div className={cn("drawer-body", props.className?.body)}>{props.children}</div>
        {props.footer && <footer className="dialog-footer">{props.footer}</footer>}
      </section>
    </div>
  );
}

function DialogHeader(props: { readonly title?: ReactNode; readonly titleId: string; readonly close?: () => void }) {
  if (!props.title && !props.close) return null;
  return (
    <header className="dialog-header">
      {props.title && <h2 id={props.titleId} className="text-base font-semibold">{props.title}</h2>}
      {props.close && <Button aria-label="关闭" title="关闭" variant="ghost" onClick={props.close}><X size={16} /></Button>}
    </header>
  );
}

function DialogFooter(props: { readonly footer?: ReactNode; readonly ok?: () => void; readonly cancel?: () => void }) {
  if (props.footer) return <footer className="dialog-footer">{props.footer}</footer>;
  if (!props.ok) return null;
  return <footer className="dialog-footer"><Button onClick={props.cancel}>取消</Button><Button variant="primary" onClick={props.ok}>确定</Button></footer>;
}

function useDialogBehavior(open: boolean, panelRef: RefObject<HTMLElement | null>, close?: () => void): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => focusInitialDialogElement(panelRef.current));
    return () => previousFocusRef.current?.focus({ preventScroll: true });
  }, [open, panelRef]);
  useEffect(() => {
    if (!open) return undefined;
    const listener = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || !isTopDialog(panel)) return;
      if (event.key === "Escape" && close) {
        close();
        return;
      }
      if (event.key === "Tab") trapDialogFocus(event, panel);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [close, open, panelRef]);
}

function focusInitialDialogElement(panel: HTMLElement | null): void {
  if (!panel || !isTopDialog(panel)) return;
  const target = focusableElements(panel)[0] ?? panel;
  target.focus({ preventScroll: true });
}

function trapDialogFocus(event: KeyboardEvent, panel: HTMLElement): void {
  const elements = focusableElements(panel);
  if (elements.length === 0) {
    event.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }
  const first = elements[0];
  const last = elements[elements.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !panel.contains(active))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function focusableElements(panel: HTMLElement): readonly HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden"));
}

function isTopDialog(panel: HTMLElement): boolean {
  const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-dialog-panel]"));
  return panels[panels.length - 1] === panel;
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

export function Select(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value"> & {
  readonly mode?: "multiple";
  readonly multiple?: boolean;
  readonly value?: SelectHTMLAttributes<HTMLSelectElement>["value"];
  readonly options?: readonly { readonly value: string; readonly label: ReactNode }[];
  readonly onChange?: (value: string | readonly string[]) => void;
}) {
  const { className, mode, multiple, onChange, options = [], value, disabled, ...rest } = props;
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const multi = Boolean(multiple || mode === "multiple");
  const values = selectValues(value);
  const selected = options.filter((option) => values.includes(option.value));
  const label = selected.length > 0 ? selected.map((option) => option.label).reduce<ReactNode[]>((nodes, node, index) => [...nodes, index > 0 ? "，" : "", node], []) : "请选择";
  const openUp = useOpenUp(triggerRef, open, 280);
  const openSelect = (focusOption: boolean, index = initialSelectIndex(options, values)) => {
    setFocusedIndex(index);
    setOpen(true);
    if (focusOption) focusSelectOption(rootRef, index);
  };
  const closeSelect = (focusTrigger: boolean) => {
    setOpen(false);
    setFocusedIndex(-1);
    if (focusTrigger) window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };
  const choose = (nextValue: string) => {
    if (!multi) {
      onChange?.(nextValue);
      closeSelect(true);
      return;
    }
    onChange?.(toggleSelectValue(values, nextValue));
  };
  return (
    <span ref={rootRef} className="ui-select-root">
      <button
        {...rest}
        ref={triggerRef}
        className={cn("field flex items-center justify-between gap-3 text-left", !selected.length && "text-(--color-text-muted)", className)}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => open ? closeSelect(false) : openSelect(false)}
        onKeyDown={(event) => handleSelectTriggerKeyDown(event, { open, options, openSelect, closeSelect })}
      >
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 text-xs text-(--color-text-muted)">▾</span>
      </button>
      {open && (
        <LocalFloatingMenu openUp={openUp} close={() => closeSelect(false)}>
          <div className="ui-select-menu" role="listbox" aria-multiselectable={multi || undefined}>
            {options.map((option, index) => {
              const checked = values.includes(option.value);
              return (
                <button
                  key={option.value}
                  className={cn("ui-select-option", checked && "ui-select-option-selected")}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  data-select-option-index={index}
                  tabIndex={focusedIndex === index ? 0 : -1}
                  onClick={() => choose(option.value)}
                  onFocus={() => setFocusedIndex(index)}
                  onKeyDown={(event) => handleSelectOptionKeyDown(event, { index, options, choose, closeSelect, rootRef, setFocusedIndex })}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {checked && <span className="shrink-0 text-(--color-accent)">✓</span>}
                </button>
              );
            })}
          </div>
        </LocalFloatingMenu>
      )}
    </span>
  );
}

function handleSelectTriggerKeyDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  options: {
    readonly open: boolean;
    readonly options: readonly unknown[];
    readonly openSelect: (focusOption: boolean, index?: number) => void;
    readonly closeSelect: (focusTrigger: boolean) => void;
  },
): void {
  if (event.key === "Escape" && options.open) {
    event.preventDefault();
    options.closeSelect(true);
    return;
  }
  if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const index = event.key === "ArrowUp" ? Math.max(0, options.options.length - 1) : 0;
    options.openSelect(true, index);
  }
}

function handleSelectOptionKeyDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  options: {
    readonly index: number;
    readonly options: readonly { readonly value: string }[];
    readonly choose: (value: string) => void;
    readonly closeSelect: (focusTrigger: boolean) => void;
    readonly rootRef: RefObject<HTMLElement | null>;
    readonly setFocusedIndex: (index: number) => void;
  },
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    options.closeSelect(true);
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    options.choose(options.options[options.index]?.value ?? "");
    return;
  }
  const nextIndex = nextSelectOptionIndex(event.key, options.index, options.options.length);
  if (nextIndex === options.index) return;
  event.preventDefault();
  options.setFocusedIndex(nextIndex);
  focusSelectOption(options.rootRef, nextIndex);
}

function nextSelectOptionIndex(key: string, index: number, total: number): number {
  if (total <= 0) return index;
  if (key === "ArrowDown") return Math.min(total - 1, index + 1);
  if (key === "ArrowUp") return Math.max(0, index - 1);
  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  return index;
}

function initialSelectIndex(options: readonly { readonly value: string }[], values: readonly string[]): number {
  const selectedIndex = options.findIndex((option) => values.includes(option.value));
  return Math.max(0, selectedIndex);
}

function focusSelectOption(rootRef: RefObject<HTMLElement | null>, index: number): void {
  window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-select-option-index="${index}"]`)?.focus({ preventScroll: true }));
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
        {props.description && <p className="text-sm text-(--color-text-secondary)">{props.description}</p>}
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
      {props.description && <span className="block truncate text-sm text-(--color-text-secondary)">{props.description}</span>}
    </span>
  );
}

List.Item = Object.assign(ListItem, { Meta: ListItemMeta });

export function Tabs(props: { readonly items?: readonly { readonly key: string; readonly label: ReactNode; readonly children: ReactNode }[]; readonly defaultActiveKey?: string }) {
  const [active, setActive] = useState(props.defaultActiveKey ?? props.items?.[0]?.key);
  const item = useMemo(() => props.items?.find((item) => item.key === active), [active, props.items]);
  return <div><div className="toolbar mb-3 flex gap-1 p-1">{props.items?.map((item) => <Button key={item.key} variant={item.key === active ? "primary" : "ghost"} onClick={() => setActive(item.key)}>{item.label}</Button>)}</div>{item?.children}</div>;
}
