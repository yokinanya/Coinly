import {
  BarChart3,
  CalendarClock,
  PanelLeftClose,
  PanelLeftOpen,
  Home,
  List,
  MonitorCog,
  Moon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  Tags,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { ThemeMode } from "../domain/types";
import { pushViewPath, VIEW_PATHS, type ViewId } from "./appRoutes";
import { Drawer } from "./components";

const DRAWER_WIDTH = 320;

interface NavigationItem {
  readonly id: ViewId;
  readonly label: string;
  readonly icon: LucideIcon;
}

const NAV_GROUPS: readonly { readonly label: string; readonly items: readonly NavigationItem[] }[] = [
  {
    label: "日常",
    items: [
      { id: "home", label: "概览", icon: Home },
      { id: "entry", label: "记账", icon: Plus },
      { id: "transactions", label: "明细", icon: List },
    ],
  },
  {
    label: "洞察",
    items: [
      { id: "stats", label: "统计", icon: BarChart3 },
      { id: "ai", label: "助手", icon: Sparkles },
    ],
  },
  {
    label: "规划",
    items: [
      { id: "budget", label: "预算", icon: WalletCards },
      { id: "recurring", label: "订阅", icon: CalendarClock },
    ],
  },
  {
    label: "管理",
    items: [
      { id: "accounts", label: "账户", icon: WalletCards },
      { id: "categories", label: "分类标签", icon: Tags },
      { id: "settings", label: "设置", icon: Settings },
    ],
  },
];

const MOBILE_ITEMS: readonly NavigationItem[] = [
  { id: "home", label: "概览", icon: Home },
  { id: "transactions", label: "明细", icon: List },
  { id: "entry", label: "记账", icon: Plus },
  { id: "stats", label: "统计", icon: BarChart3 },
  { id: "ai", label: "助手", icon: Sparkles },
];

const MORE_ITEMS = NAV_GROUPS.flatMap((group) => group.items).filter(
  (item) => !MOBILE_ITEMS.some((mobile) => mobile.id === item.id),
);

interface NavigationProps {
  readonly viewId: ViewId;
  readonly setViewId: (id: ViewId) => void;
  readonly collapsed?: boolean;
  readonly theme: ThemeMode;
  readonly onThemeChange: (theme: ThemeMode) => void;
  readonly onCollapsedChange?: (collapsed: boolean) => void;
  readonly syncDisabled: boolean;
  readonly syncing: boolean;
  readonly onSync: () => void;
}

export function NavigationSidebar(props: NavigationProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(false);
  const collapsed = props.collapsed ?? uncontrolledCollapsed;
  const setCollapsed = (nextCollapsed: boolean) => {
    if (props.collapsed === undefined) setUncontrolledCollapsed(nextCollapsed);
    props.onCollapsedChange?.(nextCollapsed);
  };
  const select = (id: ViewId) => {
    props.setViewId(id);
    setMoreOpen(false);
  };
  return (
    <>
      <DesktopSidebar {...props} collapsed={collapsed} onCollapsedChange={setCollapsed} onSelect={select} />
      <MobileNavigation viewId={props.viewId} openMore={() => setMoreOpen(true)} onSelect={select} />
      <MoreDrawer {...props} open={moreOpen} close={() => setMoreOpen(false)} onSelect={select} />
    </>
  );
}

function DesktopSidebar(props: NavigationProps & { readonly onSelect: (id: ViewId) => void }) {
  const collapsed = Boolean(props.collapsed);
  return (
    <aside className={`fixed inset-y-0 left-0 z-20 hidden border-r border-(--color-border) bg-(--color-background) md:block ${collapsed ? "w-16" : "w-60"}`}>
      <div className={`flex h-full min-h-0 flex-col pb-4 pt-[calc(1.25rem+var(--safe-top))] ${collapsed ? "px-2" : "px-3"}`}>
        <div className={`mb-5 flex min-h-11 items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
        {!collapsed && (
          <RouteLink
            className="flex min-w-0 items-center text-xl font-semibold text-(--color-text)"
            id="home"
            onSelect={props.onSelect}
          >
            Coinly
          </RouteLink>
        )}
        <button
          className="grid h-9 w-9 place-items-center rounded-md text-(--color-text-secondary) hover:bg-(--color-surface-muted) hover:text-(--color-text)"
          type="button"
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          onClick={() => props.onCollapsedChange?.(!collapsed)}
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
        </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-3" aria-label="桌面主导航">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && <div className="px-3 pb-1.5 text-xs font-medium text-(--color-text-muted)">{group.label}</div>}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <DesktopRoute
                    key={item.id}
                    item={item}
                    active={props.viewId === item.id}
                    collapsed={collapsed}
                    onSelect={props.onSelect}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <footer className={`mt-2 flex items-center border-t border-(--color-border) pt-3 ${collapsed ? "flex-col gap-1" : "justify-between px-2"}`}>
          {!collapsed && <span className="text-xs text-(--color-text-muted)">本地加密账本</span>}
          <div className={`flex gap-1 ${collapsed ? "flex-col" : ""}`}>
            <SyncButton disabled={props.syncDisabled} syncing={props.syncing} onSync={props.onSync} />
            <ThemeButton theme={props.theme} onChange={props.onThemeChange} />
          </div>
        </footer>
      </div>
    </aside>
  );
}

function DesktopRoute(props: {
  readonly item: NavigationItem;
  readonly active: boolean;
  readonly collapsed?: boolean;
  readonly onSelect: (id: ViewId) => void;
}) {
  const Icon = props.item.icon;
  return (
    <RouteLink
      className={`flex min-h-10 items-center rounded-md text-sm font-medium ${props.collapsed ? "justify-center px-0" : "gap-3 px-3"} ${props.active ? "bg-(--color-accent-soft) text-(--color-text)" : "text-(--color-text-secondary) hover:bg-(--color-surface-muted) hover:text-(--color-text)"}`}
      id={props.item.id}
      current={props.active}
      onSelect={props.onSelect}
    >
      <Icon size={18} aria-hidden="true" />
      {props.collapsed ? <span className="sr-only">{props.item.label}</span> : props.item.label}
    </RouteLink>
  );
}

function MobileNavigation(props: {
  readonly viewId: ViewId;
  readonly openMore: () => void;
  readonly onSelect: (id: ViewId) => void;
}) {
  const moreActive = MORE_ITEMS.some((item) => item.id === props.viewId);
  return (
    <nav
      className="fixed bottom-0 left-0 z-30 grid w-dvw grid-cols-6 border-t border-(--color-border) bg-(--color-background) px-[max(0.25rem,var(--safe-left))] pb-(--safe-bottom) md:hidden"
      aria-label="移动主导航"
    >
      {MOBILE_ITEMS.map((item) => (
        <MobileRoute
          key={item.id}
          item={item}
          active={props.viewId === item.id}
          onSelect={props.onSelect}
        />
      ))}
      <button
        className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${moreActive ? "text-(--color-text)" : "text-(--color-text-secondary)"}`}
        type="button"
        aria-label="更多"
        aria-expanded={moreActive || undefined}
        onClick={props.openMore}
      >
        <MoreHorizontal size={21} aria-hidden="true" />
        <span>更多</span>
      </button>
    </nav>
  );
}

function MobileRoute(props: {
  readonly item: NavigationItem;
  readonly active: boolean;
  readonly onSelect: (id: ViewId) => void;
}) {
  const Icon = props.item.icon;
  const entry = props.item.id === "entry";
  return (
    <RouteLink
      className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${props.active ? "text-(--color-text)" : "text-(--color-text-secondary)"}`}
      id={props.item.id}
      current={props.active}
      onSelect={props.onSelect}
    >
      <span className={entry && props.active ? "grid h-8 w-8 place-items-center rounded-md bg-(--color-accent-soft)" : undefined}>
        <Icon size={entry ? 20 : 21} strokeWidth={entry ? 2.5 : 2} aria-hidden="true" />
      </span>
      {props.item.label}
    </RouteLink>
  );
}

function MoreDrawer(
  props: NavigationProps & {
    readonly open: boolean;
    readonly close: () => void;
    readonly onSelect: (id: ViewId) => void;
  },
) {
  return (
    <Drawer open={props.open} title="更多" width={DRAWER_WIDTH} placement="right" onClose={props.close}>
      <nav className="grid gap-1" aria-label="更多功能">
        {MORE_ITEMS.map((item) => (
          <DesktopRoute
            key={item.id}
            item={item}
            active={props.viewId === item.id}
            collapsed={false}
            onSelect={props.onSelect}
          />
        ))}
      </nav>
      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-(--color-border) pt-4">
        <button
          className="ui-button border-(--color-border) bg-(--color-surface) text-(--color-text)"
          type="button"
          disabled={props.syncDisabled || props.syncing}
          onClick={props.onSync}
        >
          <RefreshCw className={props.syncing ? "animate-spin" : undefined} size={17} aria-hidden="true" />
          同步
        </button>
        <button
          className="ui-button border-(--color-border) bg-(--color-surface) text-(--color-text)"
          type="button"
          onClick={() => props.onThemeChange(nextTheme(props.theme))}
        >
          <ThemeIcon theme={props.theme} />
          {themeLabel(props.theme)}
        </button>
      </div>
    </Drawer>
  );
}

function RouteLink(props: {
  readonly id: ViewId;
  readonly current?: boolean;
  readonly className: string;
  readonly children: ReactNode;
  readonly onSelect: (id: ViewId) => void;
}) {
  return (
    <a
      className={props.className}
      href={VIEW_PATHS[props.id]}
      aria-current={props.current ? "page" : undefined}
      onClick={(event) => handleRouteClick(event, props.id, props.onSelect)}
    >
      {props.children}
    </a>
  );
}

function handleRouteClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
  id: ViewId,
  onSelect: (id: ViewId) => void,
): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  pushViewPath(id);
  onSelect(id);
}

function SyncButton(props: { readonly disabled: boolean; readonly syncing: boolean; readonly onSync: () => void }) {
  return (
    <button
      className="grid h-10 w-10 place-items-center rounded-md text-(--color-text-secondary) hover:bg-(--color-surface-muted) hover:text-(--color-text) disabled:cursor-not-allowed disabled:opacity-50"
      type="button"
      title="同步"
      aria-label="同步"
      disabled={props.disabled || props.syncing}
      onClick={props.onSync}
    >
      <RefreshCw className={props.syncing ? "animate-spin" : undefined} size={18} aria-hidden="true" />
    </button>
  );
}

function ThemeButton(props: { readonly theme: ThemeMode; readonly onChange: (theme: ThemeMode) => void }) {
  const next = nextTheme(props.theme);
  return (
    <button
      className="grid h-10 w-10 place-items-center rounded-md text-(--color-text-secondary) hover:bg-(--color-surface-muted) hover:text-(--color-text)"
      type="button"
      title={`切换到${themeLabel(next)}`}
      aria-label={`当前主题：${themeLabel(props.theme)}，切换到${themeLabel(next)}`}
      onClick={() => props.onChange(next)}
    >
      <ThemeIcon theme={props.theme} />
    </button>
  );
}

function ThemeIcon(props: { readonly theme: ThemeMode }) {
  if (props.theme === "system") return <MonitorCog size={18} aria-hidden="true" />;
  if (props.theme === "dark") return <Moon size={18} aria-hidden="true" />;
  return <Sun size={18} aria-hidden="true" />;
}

function nextTheme(theme: ThemeMode): ThemeMode {
  if (theme === "system") return "light";
  if (theme === "light") return "dark";
  return "system";
}

function themeLabel(theme: ThemeMode): string {
  if (theme === "light") return "浅色";
  if (theme === "dark") return "深色";
  return "跟随系统";
}
