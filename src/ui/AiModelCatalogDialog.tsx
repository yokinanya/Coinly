import { useDeferredValue, useEffect, useState } from "react";
import { fetchAiProviderModels } from "../ai/providerModels";
import type { AiProviderSettings } from "../domain/types";
import { ErrorBanner, TextField } from "./common";
import { Button, Modal } from "./components";

export function AiModelCatalogDialog(props: {
  readonly provider: AiProviderSettings;
  readonly existingModelIds: readonly string[];
  readonly onClose: () => void;
  readonly onImport: (modelIds: readonly string[]) => void;
}) {
  const [models, setModels] = useState<readonly string[]>([]);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const visibleModels = deferredQuery ? models.filter((model) => model.toLowerCase().includes(deferredQuery)) : models;
  useEffect(() => {
    let current = true;
    fetchAiProviderModels(props.provider)
      .then((modelIds) => {
        if (!current) return;
        const existing = new Set(props.existingModelIds);
        setModels(modelIds.filter((modelId) => !existing.has(modelId)));
      })
      .catch((reason: unknown) => current && setError(reason instanceof Error ? reason.message : "获取模型失败"))
      .finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [props.existingModelIds, props.provider]);
  const toggle = (modelId: string) => setSelected((current) => current.includes(modelId) ? current.filter((item) => item !== modelId) : [...current, modelId]);
  const visibleSelected = visibleModels.filter((model) => selected.includes(model));
  const toggleVisible = () => {
    const visible = new Set(visibleModels);
    setSelected(visibleSelected.length === visibleModels.length
      ? selected.filter((model) => !visible.has(model))
      : [...new Set([...selected, ...visibleModels])]);
  };
  return (
    <Modal
      open
      title={`从 ${props.provider.name} 获取模型`}
      width="min(680px, calc(100vw - 2rem))"
      footer={<div className="flex justify-end gap-2"><Button onClick={props.onClose}>取消</Button><Button variant="primary" disabled={selected.length === 0} onClick={() => props.onImport(selected)}>导入选中 {selected.length || ""}</Button></div>}
      onCancel={props.onClose}
    >
      <div className="space-y-3">
        <ErrorBanner message={error} />
        {loading ? <p className="text-sm text-(--color-text-secondary)" role="status">正在获取模型…</p> : (
          <>
            <TextField label="搜索模型" value={query} placeholder="输入模型 ID" onChange={setQuery} />
            <div className="flex items-center justify-between gap-3 text-xs text-(--color-text-secondary)">
              <span>{models.length} 个可导入模型</span>
              <Button className="ai-provider-action px-2" disabled={visibleModels.length === 0} onClick={toggleVisible}>{visibleSelected.length === visibleModels.length && visibleModels.length > 0 ? "取消全选" : "全选当前"}</Button>
            </div>
            {models.length === 0 && !error ? <p className="rounded-md border border-(--color-border) p-3 text-sm text-(--color-text-secondary)">提供商返回的模型均已添加。</p> : (
              <div className="ai-model-catalog" role="group" aria-label="可导入模型">
                {visibleModels.map((model) => (
                  <label key={model} className="ai-model-catalog-item">
                    <input type="checkbox" checked={selected.includes(model)} onChange={() => toggle(model)} />
                    <span className="min-w-0 break-all">{model}</span>
                  </label>
                ))}
                {models.length > 0 && visibleModels.length === 0 && <p className="p-3 text-sm text-(--color-text-secondary)">没有匹配的模型。</p>}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}