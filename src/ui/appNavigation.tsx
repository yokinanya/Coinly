import { BarChart3, CalendarClock, Home, List, Menu, PieChart, Settings, Tags, Wallet } from "lucide-react";
import { pushViewPath, type ViewId } from "./appRoutes";

type MobileNavId = ViewId | "more";

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

const MOBILE_PRIMARY_IDS: readonly ViewId[] = ["home", "transactions", "accounts", "budget"];
const MOBILE_MORE_IDS: readonly ViewId[] = ["stats", "categories", "recurring", "settings"];

export function NavigationSidebar(props: {
  readonly viewId: ViewId;
  readonly mobileMoreOpen: boolean;
  readonly setViewId: (id: ViewId) => void;
  readonly setMobileMoreOpen: (open: boolean) => void;
}) {
  const select = (id: ViewId) => selectView(id, props.setViewId, props.setMobileMoreOpen);
  return (
    <aside className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] md:inset-y-0 md:left-0 md:right-auto md:w-60 md:border-r md:border-t-0 md:p-0">
      <div className="hidden px-5 pb-6 pt-[calc(1.5rem+var(--safe-top))] md:block">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Coinly</h1>
      </div>
      {props.mobileMoreOpen && <MorePanel viewId={props.viewId} onSelect={select} />}
      <nav className="grid grid-cols-5 gap-1 p-2 md:block">
        {mobileNavItems().map((item) => (
          <NavButton key={item.id} item={item} active={isNavActive(item.id, props.viewId)} onSelect={(id) => selectMobileNav(id, props.setViewId, props.setMobileMoreOpen)} />
        ))}
        {NAV_ITEMS.map((item) => <DesktopNavButton key={item.id} item={item} active={props.viewId === item.id} onSelect={select} />)}
      </nav>
    </aside>
  );
}

function NavButton(props: {
  readonly item: { readonly id: MobileNavId; readonly label: string; readonly icon: typeof Home };
  readonly active: boolean;
  readonly onSelect: (id: MobileNavId) => void;
}) {
  const Icon = props.item.icon;
  const activeClass = props.active ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]";
  return (
    <button className={`flex min-h-14 w-full flex-col items-center gap-1 rounded-md p-2 text-xs font-medium md:hidden ${activeClass}`} onClick={() => props.onSelect(props.item.id)}>
      <Icon size={18} />
      <span>{props.item.label}</span>
    </button>
  );
}

function DesktopNavButton(props: {
  readonly item: (typeof NAV_ITEMS)[number];
  readonly active: boolean;
  readonly onSelect: (id: ViewId) => void;
}) {
  const Icon = props.item.icon;
  const activeClass = props.active ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-muted)]";
  return (
    <button className={`hidden min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium md:flex ${activeClass}`} onClick={() => props.onSelect(props.item.id)}>
      <Icon size={18} />
      <span>{props.item.label}</span>
    </button>
  );
}

function MorePanel(props: { readonly viewId: ViewId; readonly onSelect: (id: ViewId) => void }) {
  return (
    <div className="border-t border-[var(--color-border)] p-2 md:hidden">
      <div className="grid grid-cols-2 gap-2">
        {NAV_ITEMS.filter((item) => MOBILE_MORE_IDS.includes(item.id)).map((item) => (
          <button key={item.id} className={`min-h-10 rounded-md px-3 text-sm font-medium ${isNavActive(item.id, props.viewId) ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"}`} onClick={() => props.onSelect(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function mobileNavItems() {
  const primary = NAV_ITEMS.filter((item) => MOBILE_PRIMARY_IDS.includes(item.id));
  return [...primary, { id: "more" as const, label: "更多", icon: Menu }];
}

function selectMobileNav(
  id: MobileNavId,
  setViewId: (id: ViewId) => void,
  setMobileMoreOpen: (open: boolean) => void,
) {
  if (id === "more") {
    setMobileMoreOpen(true);
    return;
  }
  selectView(id, setViewId, setMobileMoreOpen);
}

function selectView(id: ViewId, setViewId: (id: ViewId) => void, setMobileMoreOpen: (open: boolean) => void) {
  pushViewPath(id);
  setViewId(id);
  setMobileMoreOpen(false);
}

function isNavActive(id: MobileNavId, viewId: ViewId): boolean {
  if (id === "more") return MOBILE_MORE_IDS.includes(viewId);
  return id === viewId;
}
