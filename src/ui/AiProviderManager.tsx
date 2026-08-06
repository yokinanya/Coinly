import { Check, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { defaultAiSettings, normalizeAiSettings, type NormalizedAiModelSettings, type NormalizedAiProviderSettings } from "../ai/settings";
import { resolveAiModelCapabilities } from "../ai/modelCapabilities";
import { createId } from "../domain/factory";
import type { Account, AiModelSettings, AiProviderSettings, AiSettings } from "../domain/types";
import { ConfirmDialog, ErrorBanner, TextField } from "./common";
import { Button, Modal, Select, Switch } from "./components";
import { AiModelCatalogDialog } from "./AiModelCatalogDialog";

export function AiProviderManagerDialog(props: {
  readonly settings?: AiSettings;
  readonly accounts?: readonly Account[];
  readonly onClose: () => void;
  readonly onSave: (settings: AiSettings) => void;
}) {
  const [draft, setDraft] = useState(() => normalizeAiSettings(props.settings ?? defaultAiSettings()));
  const [error, setError] = useState("");
  const save = () => {
    try {
      validateProviderSettings(draft);
      if (draft.defaultPaymentAccountId && !props.accounts?.some((account) => account.id === draft.defaultPaymentAccountId)) {
        throw new Error("AI 默认支付账户不存在");
      }
      props.onSave(normalizeAiSettings(draft));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI 提供商配置无效");
    }
  };
  return (
    <Modal
      open
      title="提供商管理"
      width="min(980px, calc(100vw - 2rem))"
      bodyClassName="ai-provider-dialog-body"
      footer={<div className="flex justify-end gap-2"><Button onClick={props.onClose}>取消</Button><Button variant="primary" onClick={save}>保存配置</Button></div>}
      onCancel={props.onClose}
    >
      <div className="ai-provider-dialog-content">
        <ErrorBanner message={error} />
        {props.accounts && (
          <label className="block rounded-md border border-(--color-border) p-3">
            <span className="label">AI 默认账户</span>
            <p className="mb-2 mt-1 text-xs text-(--color-text-secondary)">仅在 AI 记账未识别到明确账户时使用。</p>
            <Select
              aria-label="AI 默认账户"
              value={draft.defaultPaymentAccountId ?? ""}
              options={[
                { value: "", label: "不设置" },
                ...props.accounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.currency}` })),
              ]}
              onChange={(value) => setDraft(normalizeAiSettings({ ...draft, defaultPaymentAccountId: String(value) || undefined }))}
            />
          </label>
        )}
        <AiProviderManager settings={draft} onChange={(settings) => setDraft(normalizeAiSettings(settings))} />
      </div>
    </Modal>
  );
}

export function AiProviderManager(props: { readonly settings: AiSettings; readonly onChange: (settings: AiSettings) => void }) {
  const settings = normalizeAiSettings(props.settings);
  const [selectedId, setSelectedId] = useState(settings.activeProviderId);
  const [pendingDelete, setPendingDelete] = useState<{ readonly providerId: string; readonly modelId?: string }>();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [modelFeedback, setModelFeedback] = useState("");
  const feedbackTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
  const selected = settings.providers.find((provider) => provider.id === selectedId) ?? settings.providers[0];
  const applyProviders = (providers: readonly AiProviderSettings[], activeProviderId = settings.activeProviderId, activeModelId = settings.activeModelId) => {
    props.onChange(normalizeAiSettings({ ...settings, providers, activeProviderId, activeModelId }));
  };
  const updateProvider = (patch: Partial<AiProviderSettings>) => {
    applyProviders(settings.providers.map((provider) => provider.id === selected.id ? { ...provider, ...patch } : provider));
  };
  const updateModels = (models: readonly AiModelSettings[]) => updateProvider({ models, defaultModelId: models.some((model) => model.id === selected.defaultModelId) ? selected.defaultModelId : models[0]?.id });
  const addProvider = () => {
    const providerId = createId();
    const modelId = createId();
    const provider: AiProviderSettings = {
      id: providerId,
      name: "新提供商",
      protocol: "openai-compatible",
      endpoint: "https://api.openai.com/v1",
      apiKey: "",
      models: [{ id: modelId, name: "默认模型", model: "" }],
      defaultModelId: modelId,
    };
    setSelectedId(providerId);
    applyProviders([...settings.providers, provider], providerId, modelId);
  };
  const addModel = () => {
    const id = createId();
    updateModels([...selected.models, { id, name: "新模型", model: "" }]);
    showModelFeedback("已添加新模型，请填写模型 ID。");
    revealModel(id, true);
  };
  const importModels = (modelIds: readonly string[]) => {
    const imported = modelIds.map((model) => ({ id: createId(), model }));
    updateModels([...selected.models, ...imported]);
    setCatalogOpen(false);
    showModelFeedback(`已导入 ${imported.length} 个模型。`);
    const lastModel = imported.at(-1);
    if (lastModel) revealModel(lastModel.id, false);
  };
  const showModelFeedback = (message: string) => {
    setModelFeedback(message);
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setModelFeedback(""), 2_400);
  };
  const revealModel = (id: string, focus: boolean) => {
    window.requestAnimationFrame(() => {
      const card = document.getElementById(`ai-model-${id}`);
      card?.scrollIntoView?.({ block: "center", behavior: "auto" });
      if (focus) card?.querySelector<HTMLInputElement>('[data-field-name="model-id"]')?.focus({ preventScroll: true });
    });
  };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.modelId) {
      const models = selected.models.filter((model) => model.id !== pendingDelete.modelId);
      updateModels(models);
    } else {
      const providers = settings.providers.filter((provider) => provider.id !== pendingDelete.providerId);
      const next = providers[0];
      if (next) {
        setSelectedId(next.id);
        applyProviders(providers, next.id, next.defaultModelId);
      }
    }
    setPendingDelete(undefined);
  };
  return (
    <div className="ai-provider-manager">
      <aside className="ai-provider-sidebar" aria-label="AI 提供商列表">
        <div className="ai-provider-sidebar-header"><span>提供商</span><Button className="ai-provider-action px-2" onClick={addProvider}><Plus size={14} aria-hidden="true" />新增</Button></div>
        <div className="space-y-1">
          {settings.providers.map((provider) => (
            <div className={provider.id === selected.id ? "ai-provider-card ai-provider-card-selected" : "ai-provider-card"} key={provider.id}>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(provider.id)}>
                <span className="flex items-center gap-2"><Server size={15} aria-hidden="true" /><strong className="truncate">{provider.name}</strong></span>
                <span>{provider.models.length} 个模型</span>
              </button>
            </div>
          ))}
        </div>
      </aside>
      <section className="ai-provider-editor" aria-label={`${selected.name} 配置`}>
        <div className="flex items-center justify-between gap-3 border-b border-(--color-border) pb-3">
          <div><h3 className="font-semibold text-(--color-text)">{selected.name}</h3><p className="mt-1 text-xs text-(--color-text-secondary)">OpenAI Compatible</p></div>
          <div className="flex gap-1"><Button className="ai-provider-action px-2" disabled={selected.id === settings.activeProviderId} onClick={() => applyProviders(settings.providers, selected.id, selected.defaultModelId)}>{selected.id === settings.activeProviderId ? "当前提供商" : "设为当前"}</Button><Button className="ai-provider-action ai-provider-icon-action" variant="danger" disabled={settings.providers.length === 1} aria-label={`删除提供商 ${selected.name}`} title="删除提供商" onClick={() => setPendingDelete({ providerId: selected.id })}><Trash2 size={15} aria-hidden="true" /></Button></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label="显示名称" value={selected.name} onChange={(name) => updateProvider({ name })} /></div>
          <div className="sm:col-span-2"><TextField label="Base URL" value={selected.endpoint} placeholder="https://api.example.com/v1" onChange={(endpoint) => updateProvider({ endpoint })} /></div>
          <div className="sm:col-span-2"><TextField label="API Key" type="password" autoComplete="off" value={selected.apiKey} onChange={(apiKey) => updateProvider({ apiKey })} /></div>
        </div>
        <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-semibold text-(--color-text)">模型</h4><p className="mt-1 text-xs text-(--color-text-secondary)" aria-live="polite">{modelFeedback || "可为同一提供商配置多个模型。"}</p></div><div className="flex shrink-0 gap-1"><Button className="ai-provider-action px-2" onClick={() => setCatalogOpen(true)}><RefreshCw size={14} aria-hidden="true" />获取模型</Button><Button className="ai-provider-action px-2" onClick={addModel}>{modelFeedback.startsWith("已添加") ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}{modelFeedback.startsWith("已添加") ? "已添加" : "添加模型"}</Button></div></div>
        <div className="space-y-2">
          {selected.models.map((model) => <ModelEditor key={model.id} model={model} isDefault={model.id === selected.defaultModelId} canDelete={selected.models.length > 1} update={(patch) => updateModels(selected.models.map((item) => item.id === model.id ? { ...item, ...patch } : item))} makeDefault={() => updateProvider({ defaultModelId: model.id })} remove={() => setPendingDelete({ providerId: selected.id, modelId: model.id })} />)}
        </div>
      </section>
      {catalogOpen && <AiModelCatalogDialog provider={selected} existingModelIds={selected.models.map((model) => model.model)} onClose={() => setCatalogOpen(false)} onImport={importModels} />}
      <ConfirmDialog open={Boolean(pendingDelete)} title={pendingDelete?.modelId ? "删除模型" : "删除提供商"} description={pendingDelete?.modelId ? "删除后，该模型将不再出现在会话模型列表中。" : "删除后，该提供商的连接信息和模型配置都会移除。"} onCancel={() => setPendingDelete(undefined)} onConfirm={confirmDelete} />
    </div>
  );
}

function ModelEditor(props: { readonly model: NormalizedAiModelSettings; readonly isDefault: boolean; readonly canDelete: boolean; readonly update: (patch: Partial<AiModelSettings>) => void; readonly makeDefault: () => void; readonly remove: () => void }) {
  const capabilities = resolveAiModelCapabilities(props.model);
  return (
    <article id={`ai-model-${props.model.id}`} className="ai-provider-model-card">
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
        <TextField compact label="模型显示名称" value={props.model.name ?? ""} placeholder="用于模型菜单显示" onChange={(name) => props.update({ name })} />
        <TextField compact fieldName="model-id" label="模型 ID" value={props.model.model} placeholder="gpt-4.1-mini" onChange={(model) => props.update({ model, supportsVision: undefined })} />
        <TextField compact label={`上下文 Token（当前 ${capabilities.contextBudget.inputTokens}）`} value={props.model.contextTokenBudget ?? ""} placeholder="使用模型预设" onChange={(value) => props.update({ contextTokenBudget: value.trim() ? Number(value) : undefined })} />
        <label className="block"><span className="label">多模态图片</span><div className="mt-2 flex h-9 items-center gap-2"><Switch ariaLabel={`${props.model.model || "当前模型"}支持图片`} checked={capabilities.supportsVision} onChange={(supportsVision) => props.update({ supportsVision })} /><span className="text-xs text-(--color-text-secondary)">{capabilities.supportsVision ? "支持" : "不支持"}</span></div></label>
      </div>
      <div className="ai-provider-model-actions"><Button className="ai-provider-action px-2" disabled={props.isDefault} onClick={props.makeDefault}>{props.isDefault && <Check size={14} aria-hidden="true" />}{props.isDefault ? "默认" : "设为默认"}</Button><Button className="ai-provider-action ai-provider-icon-action" variant="danger" disabled={!props.canDelete} aria-label={`删除模型 ${props.model.name || props.model.model || "未命名"}`} title="删除模型" onClick={props.remove}><Trash2 size={14} aria-hidden="true" /></Button></div>
    </article>
  );
}

function validateProviderSettings(settings: AiSettings): void {
  const normalized = normalizeAiSettings(settings);
  for (const provider of normalized.providers) validateProvider(provider);
}

function validateProvider(provider: NormalizedAiProviderSettings): void {
  if (!provider.name.trim()) throw new Error("提供商名称不能为空");
  if (!provider.endpoint.trim()) throw new Error(`${provider.name} 的 Base URL 不能为空`);
  if (provider.models.length === 0) throw new Error(`${provider.name} 至少需要一个模型`);
  if (provider.models.some((model) => !model.model.trim())) throw new Error(`${provider.name} 存在未填写模型 ID 的模型`);
}
