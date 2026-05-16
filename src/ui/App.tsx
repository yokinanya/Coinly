import { Plus } from "lucide-react";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppData, SyncSettings, ThemeMode } from "../domain/types";
import { saveData, type SaveToken } from "../storage/indexedDb";
import type { StoredVaultState } from "../storage/indexedDb";
import { syncData, type SyncResult } from "../sync/syncClient";
import { AccountsView } from "./AccountsView";
import { BudgetView } from "./BudgetView";
import { CategoriesView } from "./CategoriesView";
import { DashboardView } from "./DashboardView";
import { EntryDialog } from "./EntryView";
import { RecurringView } from "./RecurringView";
import { SettingsView } from "./SettingsView";
import { StatsView } from "./StatsView";
import type { StatsFilter } from "./StatsView";
import { TransactionsView } from "./TransactionsView";
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

export function App() {
  const [data, setData] = useState<AppData>();
  const [storedVault, setStoredVault] = useState<StoredVaultState>();
  const saveTokenRef = useRef<SaveToken>({ version: 0 });
  const [saveToken, setSaveToken] = useState<SaveToken>({ version: 0 });
  const [viewId, setViewId] = useState<ViewId>(() => viewFromPath(window.location.pathname));
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [syncResolution, setSyncResolution] = useState<SyncResolution>();
  const [status, setStatus] = useState<StatusMessage>({ tone: "info", text: "正在加载本地账本" });
  const syncTimerRef = useRef<number | undefined>(undefined);
  const syncingRef = useRef(false);
  const updateSaveToken = useCallback((token: SaveToken) => {
    saveTokenRef.current = token;
    setSaveToken(token);
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

  const content = useMemo(() => renderView({ viewId, data, token: saveToken, setData, setStatus, setViewId, setMobileMoreOpen }), [viewId, data, saveToken]);

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
      <NavigationSidebar viewId={viewId} mobileMoreOpen={mobileMoreOpen} setViewId={setViewId} setMobileMoreOpen={setMobileMoreOpen} />
      <main className="w-full px-4 pb-[calc(var(--mobile-nav-height)+var(--safe-bottom)+1rem)] pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] pt-[calc(1.25rem+var(--safe-top))] md:ml-60 md:w-[calc(100%-15rem)] md:px-8 md:pb-8 md:pt-[calc(1.25rem+var(--safe-top))]">
        {shouldShowStatus(status) && <div className="mb-4"><StatusBar status={status} /></div>}
        <PageTransition key={viewId}>{content}</PageTransition>
      </main>
      <button
        className="fixed bottom-[calc(var(--mobile-nav-height)+var(--safe-bottom)+1rem)] right-[max(1rem,var(--safe-right))] z-30 grid h-14 w-14 place-items-center rounded-full bg-[var(--color-accent)] text-white shadow-lg transition hover:bg-[var(--color-accent-hover)] md:bottom-6"
        type="button"
        aria-label="记账"
        title="记账"
        onClick={() => setEntryOpen(true)}
      >
        <Plus size={24} />
      </button>
      <EntryDialog open={entryOpen} data={data} setData={setData} setStatus={setStatus} onClose={() => setEntryOpen(false)} />
      <SyncResolutionPanel
        resolution={syncResolution}
        data={data}
        settings={data.syncSettings ?? EMPTY_SYNC_SETTINGS}
        applyRemote={setData}
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
  if (result.status === "remote-newer" && result.remoteData) {
    options.setData(result.remoteData);
    options.setMessage("已使用较新的远端账本覆盖本地");
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
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
  readonly setViewId: (id: ViewId) => void;
  readonly setMobileMoreOpen: (open: boolean) => void;
}) {
  if (!options.data) {
    return null;
  }
  const props = { data: options.data, setData: options.setData };
  if (options.viewId === "transactions") return <TransactionsView {...props} />;
  if (options.viewId === "accounts") return <AccountsView {...props} />;
  if (options.viewId === "budget") return <BudgetView {...props} />;
  if (options.viewId === "stats") return <StatsView data={options.data} onFilter={(filter) => navigateToTransactions(filter, options.setViewId, options.setMobileMoreOpen)} />;
  if (options.viewId === "categories") return <CategoriesView {...props} />;
  if (options.viewId === "recurring") return <RecurringView {...props} />;
  if (options.viewId === "settings") return <SettingsView {...props} token={options.token} />;
  return <DashboardView {...props} />;
}

function navigateToTransactions(
  filter: StatsFilter,
  setViewId: (id: ViewId) => void,
  setMobileMoreOpen: (open: boolean) => void,
): void {
  const params = new URLSearchParams();
  if (filter.categoryId) params.set("categoryId", filter.categoryId);
  if (filter.tagId) params.set("tagId", filter.tagId);
  if (filter.currency) params.set("currency", filter.currency);
  window.history.pushState(null, "", `${VIEW_PATHS.transactions}?${params.toString()}`);
  setViewId("transactions");
  setMobileMoreOpen(false);
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
