export type ViewId = "home" | "transactions" | "accounts" | "budget" | "stats" | "categories" | "recurring" | "settings";

export const VIEW_PATHS: Record<ViewId, string> = {
  home: "/",
  transactions: "/transactions",
  accounts: "/accounts",
  budget: "/budget",
  stats: "/stats",
  categories: "/categories",
  recurring: "/recurring",
  settings: "/settings",
};

export function viewFromPath(pathname: string): ViewId {
  const match = (Object.entries(VIEW_PATHS) as [ViewId, string][]).find(([, path]) => path === pathname);
  return match?.[0] ?? "home";
}

export function replaceUnknownPath(id: ViewId): void {
  const knownPath = Object.values(VIEW_PATHS).includes(window.location.pathname);
  if (knownPath) return;
  window.history.replaceState(null, "", VIEW_PATHS[id]);
}

export function pushViewPath(id: ViewId): void {
  const path = VIEW_PATHS[id];
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
}
