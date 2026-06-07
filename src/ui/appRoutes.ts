export type ViewId = "home" | "entry" | "transactions" | "statements" | "accounts" | "budget" | "stats" | "ai" | "categories" | "recurring" | "settings";

export const VIEW_PATHS: Record<ViewId, string> = {
  home: "/",
  entry: "/entry",
  transactions: "/transactions",
  statements: "/statements",
  accounts: "/accounts",
  budget: "/budget",
  stats: "/stats",
  ai: "/ai",
  categories: "/categories",
  recurring: "/recurring",
  settings: "/settings",
};

const VIEW_PATH_ALIASES: Readonly<Record<string, ViewId>> = {
  "/analysis": "ai",
};

export function viewFromPath(pathname: string): ViewId {
  const match = (Object.entries(VIEW_PATHS) as [ViewId, string][]).find(([, path]) => path === pathname);
  return match?.[0] ?? VIEW_PATH_ALIASES[pathname] ?? "home";
}

export function replaceUnknownPath(id: ViewId): void {
  const alias = VIEW_PATH_ALIASES[window.location.pathname];
  if (alias) {
    window.history.replaceState(null, "", VIEW_PATHS[alias]);
    return;
  }
  const knownPath = Object.values(VIEW_PATHS).includes(window.location.pathname);
  if (knownPath) return;
  window.history.replaceState(null, "", VIEW_PATHS[id]);
}

export function pushViewPath(id: ViewId): void {
  const path = VIEW_PATHS[id];
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
}
