import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { AppData, TransactionDraft } from "../domain/types";
import { validateTransactionDraft as validateDomainDraft } from "../domain/operations";
import { Checkbox, Modal } from "./components";
import { Button } from "./components";
import { money } from "./format";
import { TransactionForm } from "./TransactionForm";
import type { AiCandidate } from "./aiSession";

export function AiCandidateReview(props: {
  readonly data: AppData;
  readonly candidates: readonly AiCandidate[];
  readonly onChange: (candidates: readonly AiCandidate[]) => void;
  readonly onSave: () => void;
}) {
  const [editingId, setEditingId] = useState<string>();
  const editing = props.candidates.find((candidate) => candidate.id === editingId);
  const selectedCount = props.candidates.filter((candidate) => candidate.selected && candidate.draft).length;
  const update = (id: string, change: (candidate: AiCandidate) => AiCandidate) => {
    props.onChange(props.candidates.map((candidate) => candidate.id === id ? change(candidate) : candidate));
  };
  return (
    <section className="ai-candidate-review" aria-label="待确认交易">
      <header>
        <div><h3>待确认交易</h3><p>{props.candidates.length} 笔候选，保存前可编辑或取消选择</p></div>
        <Button variant="primary" disabled={selectedCount === 0} onClick={props.onSave}>保存所选（{selectedCount}）</Button>
      </header>
      <div className="ai-candidate-list">
        {props.candidates.map((candidate) => (
          <CandidateRow
            key={candidate.id}
            data={props.data}
            candidate={candidate}
            toggle={(selected) => update(candidate.id, (current) => ({ ...current, selected }))}
            edit={() => setEditingId(candidate.id)}
            remove={() => props.onChange(props.candidates.filter((item) => item.id !== candidate.id))}
          />
        ))}
      </div>
      {editing?.draft && (
        <CandidateEditor
          data={props.data}
          candidate={editing}
          initialDraft={editing.draft}
          close={() => setEditingId(undefined)}
          save={(draft) => {
            update(editing.id, (current) => ({ ...current, draft, raw: draft, errors: [], selected: true }));
            setEditingId(undefined);
          }}
        />
      )}
    </section>
  );
}

function CandidateRow(props: {
  readonly data: AppData;
  readonly candidate: AiCandidate;
  readonly toggle: (selected: boolean) => void;
  readonly edit: () => void;
  readonly remove: () => void;
}) {
  const draft = props.candidate.draft;
  const account = draft ? props.data.accounts.find((item) => item.id === draft.accountId)?.name ?? "未匹配账户" : "无法解析";
  const category = draft?.categoryId ? props.data.categories.find((item) => item.id === draft.categoryId)?.name : undefined;
  return (
    <article className="ai-candidate-row" data-candidate-id={props.candidate.id} tabIndex={-1}>
      <Checkbox checked={props.candidate.selected} disabled={!draft} ariaLabel="选择这笔交易" onChange={props.toggle} />
      <div className="min-w-0 flex-1">
        {draft ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong className="tabular-nums">{money(draft.amount, draft.currency)}</strong>
              <span className="text-xs text-(--color-text-muted)">{draft.occurredAt}</span>
            </div>
            <p className="mt-1 truncate text-sm text-(--color-text-secondary)">{account}{category ? ` · ${category}` : ""}{draft.note ? ` · ${draft.note}` : ""}</p>
            {props.candidate.sourceImageIndexes?.length
              ? <p className="mt-1 text-xs text-(--color-text-muted)">来源图片：{props.candidate.sourceImageIndexes.map((index) => index + 1).join("、")}</p>
              : null}
          </>
        ) : <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(props.candidate.raw, null, 2)}</pre>}
        {props.candidate.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-(--color-error)">{props.candidate.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button className="size-11 min-h-11 p-0" variant="ghost" disabled={!draft} aria-label="编辑交易" title="编辑交易" onClick={props.edit}><Pencil size={15} aria-hidden="true" /></Button>
        <Button className="size-11 min-h-11 p-0" variant="ghost" aria-label="移除交易" title="移除交易" onClick={props.remove}><Trash2 size={15} aria-hidden="true" /></Button>
      </div>
    </article>
  );
}

function CandidateEditor(props: {
  readonly data: AppData;
  readonly candidate: AiCandidate;
  readonly initialDraft: TransactionDraft;
  readonly close: () => void;
  readonly save: (draft: TransactionDraft) => void;
}) {
  const [draft, setDraft] = useState(props.initialDraft);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const save = () => {
    const result = validateDomainDraft(props.data, draft);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    props.save(draft);
  };
  return (
    <Modal
      open
      title="编辑候选交易"
      width="min(48rem, calc(100vw - 2rem))"
      onCancel={props.close}
      footer={<><Button onClick={props.close}>取消</Button><Button variant="primary" onClick={save}>保存修改</Button></>}
    >
      {errors.length > 0 && <div className="alert alert-error mb-4" role="alert">{errors.join("；")}</div>}
      <TransactionForm data={props.data} draft={draft} onChange={setDraft} onSubmit={save} submitLabel="保存修改" embedded />
    </Modal>
  );
}
