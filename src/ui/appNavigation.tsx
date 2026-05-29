import { BarChart3, CalendarClock, Home, List, Menu as MenuIcon, MonitorCog, Moon, PieChart, PlusCircle, RefreshCw, Settings, Sparkles, Sun, Tags, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ThemeMode } from "../domain/types";
import { pushViewPath, type ViewId } from "./appRoutes";
import { Drawer } from "./components";

const DRAWER_WIDTH = 280;

const NAV_ITEMS = [
  { id: "home", label: "首页", icon: Home },
  { id: "entry", label: "记账", icon: PlusCircle },
  { id: "transactions", label: "明细", icon: List },
  { id: "accounts", label: "账户", icon: Wallet },
  { id: "budget", label: "预算", icon: PieChart },
  { id: "stats", label: "统计", icon: BarChart3 },
  { id: "analysis", label: "AI 分析", icon: Sparkles },
  { id: "categories", label: "分类", icon: Tags },
  { id: "recurring", label: "订阅", icon: CalendarClock },
  { id: "settings", label: "设置", icon: Settings },
] as const;

export function NavigationSidebar(props: {
  readonly viewId: ViewId;
  readonly setViewId: (id: ViewId) => void;
  readonly theme: ThemeMode;
  readonly onThemeChange: (theme: ThemeMode) => void;
  readonly syncDisabled: boolean;
  readonly syncing: boolean;
  readonly onSync: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = useNavigationItems();
  const select = (id: ViewId) => {
    selectView(id, props.setViewId);
    setMobileOpen(false);
  };
  return (
    <>
      <MobileHeader openMenu={() => setMobileOpen(true)} goHome={() => select("home")} />
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-[var(--color-border)] bg-[var(--color-surface)] md:block">
        <SidebarContent items={items} viewId={props.viewId} theme={props.theme} syncDisabled={props.syncDisabled} syncing={props.syncing} onThemeChange={props.onThemeChange} onSync={props.onSync} onSelect={select} />
      </aside>
      <Drawer
        className={{ body: "drawer-body-full p-0", content: "bg-transparent" }}
        closable={false}
        open={mobileOpen}
        title={null}
        width={DRAWER_WIDTH}
        placement="left"
        onClose={() => setMobileOpen(false)}
      >
        <SidebarContent items={items} viewId={props.viewId} theme={props.theme} syncDisabled={props.syncDisabled} syncing={props.syncing} onThemeChange={props.onThemeChange} onSync={props.onSync} onSelect={select} compact onClose={() => setMobileOpen(false)} />
      </Drawer>
    </>
  );
}

function MobileHeader(props: { readonly openMenu: () => void; readonly goHome: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] pt-[var(--safe-top)] md:hidden">
      <button
        className="motion-press grid h-10 w-10 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)]"
        type="button"
        aria-label="打开导航"
        title="打开导航"
        onClick={props.openMenu}
      >
        <MenuIcon size={22} />
      </button>
      <button className="text-lg font-semibold leading-none text-[var(--color-text)]" type="button" onClick={props.goHome}>Coinly</button>
      <span className="h-10 w-10" aria-hidden="true" />
    </header>
  );
}

function SidebarContent(props: {
  readonly items: ReturnType<typeof useNavigationItems>;
  readonly viewId: ViewId;
  readonly theme: ThemeMode;
  readonly syncDisabled: boolean;
  readonly syncing: boolean;
  readonly onThemeChange: (theme: ThemeMode) => void;
  readonly onSync: () => void;
  readonly onSelect: (id: ViewId) => void;
  readonly compact?: boolean;
  readonly onClose?: () => void;
}) {
  const paddingClass = props.compact ? "px-3 pb-4 pt-[calc(1rem+var(--safe-top))]" : "px-3 pb-4 pt-[calc(1.5rem+var(--safe-top))]";
  return (
    <div className={`flex h-full min-h-0 flex-col bg-transparent ${paddingClass}`}>
      <div className="flex min-h-12 items-center justify-between px-2 pb-4">
        <button className={`${props.compact ? "text-lg" : "text-2xl"} font-semibold text-[var(--color-text)]`} type="button" onClick={() => selectHome(props)}>Coinly</button>
        {props.compact && (
          <button
            className="motion-press grid h-9 w-9 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)]"
            type="button"
            aria-label="关闭导航"
            title="关闭导航"
            onClick={props.onClose}
          >
            <X size={20} />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1">
        {props.items.map((item) => (
          <button
            key={item.key}
            className={`motion-press relative flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium ${props.viewId === item.key ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20 before:absolute before:left-0 before:top-2 before:h-6 before:w-1 before:rounded-r before:bg-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"}`}
            type="button"
            onClick={() => props.onSelect(item.key)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <footer className="mt-4 flex justify-end gap-2 border-t border-[var(--color-border)] px-2 pt-4">
        <SyncButton disabled={props.syncDisabled} syncing={props.syncing} onSync={props.onSync} />
        <ThemeButton theme={props.theme} onChange={props.onThemeChange} />
      </footer>
    </div>
  );
}

function SyncButton(props: { readonly disabled: boolean; readonly syncing: boolean; readonly onSync: () => void }) {
  return (
    <button
      className="motion-press grid h-10 w-10 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
      type="button"
      title="同步"
      aria-label="同步"
      disabled={props.disabled || props.syncing}
      onClick={props.onSync}
    >
      <RefreshCw className={props.syncing ? "animate-spin" : undefined} size={18} />
    </button>
  );
}

function ThemeButton(props: { readonly theme: ThemeMode; readonly onChange: (theme: ThemeMode) => void }) {
  const next = nextTheme(props.theme);
  return (
    <button
      className="motion-press grid h-10 w-10 place-items-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]"
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
  if (props.theme === "system") return <MonitorCog size={18} />;
  if (props.theme === "dark") return <Moon size={18} />;
  return <Sun size={18} />;
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

function useNavigationItems() {
  return useMemo(
    () =>
      NAV_ITEMS.map((item) => ({
        key: item.id as ViewId,
        icon: <item.icon size={18} />,
        label: item.label,
      })),
    [],
  );
}

function selectHome(props: Pick<Parameters<typeof SidebarContent>[0], "onSelect" | "onClose">): void {
  props.onSelect("home");
  props.onClose?.();
}

function selectView(id: ViewId, setViewId: (id: ViewId) => void) {
  pushViewPath(id);
  setViewId(id);
}
