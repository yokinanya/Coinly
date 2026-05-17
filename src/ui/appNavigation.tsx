import { BarChart3, CalendarClock, Home, List, Menu as MenuIcon, PieChart, Settings, Tags, Wallet, X } from "lucide-react";
import type { Key } from "react";
import { useMemo, useState } from "react";
import { pushViewPath, type ViewId } from "./appRoutes";
import { Drawer, Layout, Menu } from "./metis";

const SIDEBAR_WIDTH = 240;
const DRAWER_WIDTH = 280;

const NAV_ITEMS = [
  { id: "home", label: "首页", icon: Home },
  { id: "transactions", label: "明细", icon: List },
  { id: "accounts", label: "账户", icon: Wallet },
  { id: "budget", label: "预算", icon: PieChart },
  { id: "stats", label: "统计", icon: BarChart3 },
  { id: "categories", label: "分类", icon: Tags },
  { id: "recurring", label: "订阅", icon: CalendarClock },
  { id: "settings", label: "设置", icon: Settings },
] as const;

export function NavigationSidebar(props: {
  readonly viewId: ViewId;
  readonly setViewId: (id: ViewId) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = useNavigationItems();
  const select = (id: ViewId) => {
    selectView(id, props.setViewId);
    setMobileOpen(false);
  };
  return (
    <>
      <MobileHeader openMenu={() => setMobileOpen(true)} />
      <Layout.Sider className="fixed inset-y-0 left-0 z-20 hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] md:block" width={SIDEBAR_WIDTH}>
        <SidebarContent items={items} viewId={props.viewId} onSelect={select} />
      </Layout.Sider>
      <Drawer
        className={{ body: "p-0", content: "bg-[var(--color-surface)]" }}
        closable={false}
        open={mobileOpen}
        title={null}
        width={DRAWER_WIDTH}
        placement="left"
        onClose={() => setMobileOpen(false)}
      >
        <SidebarContent items={items} viewId={props.viewId} onSelect={select} compact onClose={() => setMobileOpen(false)} />
      </Drawer>
    </>
  );
}

function MobileHeader(props: { readonly openMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] pt-[var(--safe-top)] md:hidden">
      <h1 className="text-lg font-semibold leading-none text-[var(--color-text)]">Coinly</h1>
      <button
        className="grid h-10 w-10 place-items-center rounded-md text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-muted)]"
        type="button"
        aria-label="打开导航"
        title="打开导航"
        onClick={props.openMenu}
      >
        <MenuIcon size={22} />
      </button>
    </header>
  );
}

function SidebarContent(props: {
  readonly items: ReturnType<typeof useNavigationItems>;
  readonly viewId: ViewId;
  readonly onSelect: (id: ViewId) => void;
  readonly compact?: boolean;
  readonly onClose?: () => void;
}) {
  const paddingClass = props.compact ? "px-3 pb-4 pt-[calc(1rem+var(--safe-top))]" : "px-3 pb-4 pt-[calc(1.5rem+var(--safe-top))]";
  return (
    <div className={`flex h-full min-h-0 flex-col bg-[var(--color-surface)] ${paddingClass}`}>
      <div className="flex min-h-12 items-center justify-between px-2 pb-4">
        <h1 className={`${props.compact ? "text-lg" : "text-2xl"} font-semibold text-[var(--color-text)]`}>Coinly</h1>
        {props.compact && (
          <button
            className="grid h-9 w-9 place-items-center rounded-md text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-muted)]"
            type="button"
            aria-label="关闭导航"
            title="关闭导航"
            onClick={props.onClose}
          >
            <X size={20} />
          </button>
        )}
      </div>
      <Menu
        className={{ root: "border-none bg-transparent" }}
        items={props.items}
        mode="inline"
        selectedKeys={[props.viewId]}
        onClick={(event: { readonly key: Key }) => props.onSelect(event.key as ViewId)}
      />
    </div>
  );
}

function useNavigationItems() {
  return useMemo(
    () =>
      NAV_ITEMS.map((item) => ({
        key: item.id,
        icon: <item.icon size={18} />,
        label: item.label,
      })),
    [],
  );
}

function selectView(id: ViewId, setViewId: (id: ViewId) => void) {
  pushViewPath(id);
  setViewId(id);
}
