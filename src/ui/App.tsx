import { Plus } from "lucide-react";
import type { MutableRefObject } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, SyncSettings, ThemeMode } from "../domain/types";
import { saveData, type SaveToken } from "../storage/indexedDb";
import type { StoredVaultState } from "../storage/indexedDb";
import { syncData, type SyncResult } from "../sync/syncClient";
import type { StatsFilter } from "./StatsView";
import { VaultGate } from "./VaultGate";
import { NavigationSidebar } from "./appNavigation";
import { replaceUnknownPath, VIEW_PATHS, viewFromPath, type ViewId } from "./appRoutes";
import { StatusBar } from "./common";
import type { StatusMessage } from "./common";
import { Message } from "./metis";
import { PageTransition } from "./motion";
import { statusFromText } from "./status";
import { SyncResolutionPanel, type SyncResolution } from "./syncResolutionPanel";
import { bootstrapVault, submitVault } from "./vaultStartup";

const EMPTY_SYNC_SETTINGS: SyncSettings = { enabled: true, targets: [] };
const AUTO_SYNC_DELAY_MS = 60_000;
const AccountsView = lazy(() => import("./AccountsView").then((module) => ({ default: module.AccountsView })));
const AnalysisView = lazy(() => import("./AnalysisView").then((module) => ({ default: module.AnalysisView })));
const BudgetView = lazy(() => import("./BudgetView").then((module) => ({ default: module.BudgetView })));
const CategoriesView = lazy(() => import("./CategoriesView").then((module) => ({ default: module.CategoriesView })));
const DashboardView = lazy(() => import("./DashboardView").then((module) => ({ default: module.DashboardView })));
const EntryDialog = lazy(() => import("./EntryView").then((module) => ({ default: module.EntryDialog })));
const RecurringView = lazy(() => import("./RecurringView").then((module) => ({ default: module.RecurringView })));
const SettingsView = lazy(() => import("./SettingsView").then((module) => ({ default: module.SettingsView })));
const StatsView = lazy(() => import("./StatsView").then((module) => ({ default: module.StatsView })));
const TransactionsView = lazy(() => import("./TransactionsView").then((module) => ({ default: module.TransactionsView })));

export function App() {
  const [data, setData] = useState<AppData>();
  const [storedVault, setStoredVault] = useState<StoredVaultState>();
  const saveTokenRef = useRef<SaveToken>({ version: 0 });
  const [saveToken, setSaveToken] = useState<SaveToken>({ version: 0 });
  const [viewId, setViewId] = useState<ViewId>(() => viewFromPath(window.location.pathname));
  const [entryOpen, setEntryOpen] = useState(false);
  const [syncResolution, setSyncResolution] = useState<SyncResolution>();
  const [status, setStatus] = useState<StatusMessage>({ tone: "info", text: "正在加载本地账本" });
  const syncTimerRef = useRef<number | undefined>(undefined);
  const syncingRef = useRef(false);
  const updateSaveToken = useCallback((token: SaveToken) => {
    saveTokenRef.current = token;
    setSaveToken(token);
  }, []);
  const setVaultData = useCallback((nextData: AppData) => {
    setData(nextData);
  }, []);

  useEffect(() => {
    replaceUnknownPath(viewId);
    const onPopState = () => setViewId(viewFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [viewId]);

  useEffect(() => {
    bootstrapVault(setStoredVault, setData, updateSaveToken, setStatus)
      .catch((error: unknown) => setStatus({ tone: "error", text: errorMessage(error, "本地账本加载失败") }));
  }, [updateSaveToken]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const token = saveTokenRef.current;
    saveData(data, token)
      .then((token) => {
        updateSaveToken(token);
        scheduleAutoSync({ data, timerRef: syncTimerRef, syncingRef, setData, setStatus, setResolution: setSyncResolution, setMessage: showAppMessage });
      })
      .catch((error: unknown) => showAppMessage(errorMessage(error, "本地保存失败")));
  }, [data, updateSaveToken]);

  useEffect(() => () => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
  }, []);

  useEffect(() => {
    applyTheme(data?.uiSettings?.theme ?? "system");
  }, [data?.uiSettings?.theme]);

  const content = useMemo(() => renderView({ viewId, data, token: saveToken, setData, setVaultData, setStatus, setViewId }), [viewId, data, saveToken, setData, setVaultData]);

  if (!data) {
    if (storedVault) {
      return (
        <VaultGate
          state={storedVault}
          status={status}
          onSubmit={(options) => submitVault({ ...options, state: storedVault, setData, setSaveToken: updateSaveToken, setStatus })}
        />
      );
    }
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--color-background)] px-4 text-center text-[var(--color-text-secondary)]">
        <div className="max-w-md space-y-3">
          <StatusBar status={status} />
          {status.tone === "error" && <p className="text-sm">请刷新页面；如果仍失败，请确认浏览器允许本地存储，并关闭其它打开的 Coinly 页面后重试。</p>}
        </div>
      </main>
    );
  }
  return (
    <div className="min-h-[100svh] bg-[var(--color-background)] md:min-h-screen">
      <NavigationSidebar viewId={viewId} setViewId={setViewId} />
      <main className="w-full px-4 pb-[calc(var(--safe-bottom)+5.5rem)] pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] pt-4 md:ml-60 md:w-[calc(100%-15rem)] md:px-8 md:pb-8 md:pt-[calc(1.25rem+var(--safe-top))]">
        {shouldShowStatus(status) && <div className="mb-4"><StatusBar status={status} /></div>}
        <Suspense fallback={<StatusBar status={{ tone: "info", text: "正在加载页面" }} />}>
          <PageTransition key={viewId}>{content}</PageTransition>
        </Suspense>
      </main>
      <button
        className="fixed bottom-[calc(var(--safe-bottom)+1rem)] right-[max(1rem,var(--safe-right))] z-30 grid h-14 w-14 place-items-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition hover:bg-[var(--color-accent-hover)] md:bottom-6"
        type="button"
        aria-label="记账"
        title="记账"
        onClick={() => setEntryOpen(true)}
      >
        <Plus size={24} />
      </button>
      {entryOpen && (
        <Suspense fallback={null}>
          <EntryDialog open={entryOpen} data={data} setData={setVaultData} setStatus={setStatus} onClose={() => setEntryOpen(false)} />
        </Suspense>
      )}
      <SyncResolutionPanel
        resolution={syncResolution}
        data={data}
        settings={data.syncSettings ?? EMPTY_SYNC_SETTINGS}
        applyRemote={setVaultData}
        clear={() => setSyncResolution(undefined)}
        setMessage={showAppMessage}
      />
    </div>
  );
}

function scheduleAutoSync(options: {
  readonly data: AppData;
  readonly timerRef: MutableRefObject<number | undefined>;
  readonly syncingRef: MutableRefObject<boolean>;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (value: StatusMessage) => void;
  readonly setResolution: (resolution: SyncResolution) => void;
  readonly setMessage: (value: string) => void;
}): void {
  options.setStatus({ tone: "success", text: "" });
  if (options.timerRef.current) window.clearTimeout(options.timerRef.current);
  options.timerRef.current = window.setTimeout(() => syncCurrentData(options), AUTO_SYNC_DELAY_MS);
}

function syncCurrentData(options: {
  readonly data: AppData;
  readonly syncingRef: MutableRefObject<boolean>;
  readonly setData: (data: AppData) => void;
  readonly setResolution: (resolution: SyncResolution) => void;
  readonly setMessage: (value: string) => void;
}): void {
  if (options.syncingRef.current) return;
  options.syncingRef.current = true;
  syncData(options.data, options.data.syncSettings)
    .then((result) => handleAutoSyncResult(result, options))
    .catch((error: unknown) => options.setMessage(errorMessage(error, "同步失败")))
    .finally(() => {
      options.syncingRef.current = false;
    });
}

function handleAutoSyncResult(
  result: SyncResult,
  options: {
    readonly setData: (data: AppData) => void;
    readonly setResolution: (resolution: SyncResolution) => void;
    readonly setMessage: (value: string) => void;
  },
): void {
  if ((result.status === "remote-newer" || result.status === "merged") && result.remoteData) {
    options.setData(result.remoteData);
    options.setMessage(result.status === "merged" ? "已自动合并本地与远端账本" : "已同步远端账本到本地");
    return;
  }
  if (isResolutionResult(result)) {
    options.setResolution({ status: result.status, remoteData: result.remoteData });
  }
}

function renderView(options: {
  readonly viewId: ViewId;
  readonly data: AppData | undefined;
  readonly token: SaveToken;
  readonly setData: (data: AppData | undefined) => void;
  readonly setVaultData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
  readonly setViewId: (id: ViewId) => void;
}) {
  if (!options.data) {
    return null;
  }
  const props = { data: options.data, setData: options.setVaultData };
  if (options.viewId === "transactions") return <TransactionsView {...props} />;
  if (options.viewId === "accounts") return <AccountsView {...props} />;
  if (options.viewId === "budget") return <BudgetView {...props} />;
  if (options.viewId === "stats") return <StatsView data={options.data} onFilter={(filter) => navigateToTransactions(filter, options.setViewId)} />;
  if (options.viewId === "analysis") return <AnalysisView data={options.data} />;
  if (options.viewId === "categories") return <CategoriesView {...props} />;
  if (options.viewId === "recurring") return <RecurringView {...props} />;
  if (options.viewId === "settings") return <SettingsView data={options.data} token={options.token} setData={options.setData} setVaultData={options.setVaultData} />;
  return <DashboardView {...props} />;
}

function navigateToTransactions(
  filter: StatsFilter,
  setViewId: (id: ViewId) => void,
): void {
  const params = new URLSearchParams();
  if (filter.categoryId) params.set("categoryId", filter.categoryId);
  if (filter.tagId) params.set("tagId", filter.tagId);
  if (filter.currency) params.set("currency", filter.currency);
  window.history.pushState(null, "", `${VIEW_PATHS.transactions}?${params.toString()}`);
  setViewId("transactions");
}

function applyTheme(theme: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = theme === "system" ? "system" : theme;
}

function shouldShowStatus(status: StatusMessage): boolean {
  return Boolean(status.text) && status.tone !== "success";
}

function isResolutionResult(result: SyncResult): result is SyncResult & SyncResolution {
  return result.status === "remote-conflict" || result.status === "remote-divergent" || result.status === "remote-plaintext";
}

function showAppMessage(value: string): void {
  if (!value) return;
  const status = statusFromText(value);
  Message[status.tone](value);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
