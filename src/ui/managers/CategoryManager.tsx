import { useState } from "react";
import { createBase, upsertEntity } from "../../domain/operations";
import type { Category } from "../../domain/types";
import { ConfirmDialog, EmptyState } from "../common";
import { Button, List } from "../metis";
import { removeEntity, requireName, runUpdate } from "./managerActions";
import { Field, ManagerDrawer, SelectField } from "./ManagerCommon";
import type { ManagerProps } from "./ManagerCommon";

export function CategoryManager({ data, setData, setMessage }: ManagerProps) {
  const [draft, setDraft] = useState<Category>(defaultCategory());
  const [pending, setPending] = useState<Category>();
  const [open, setOpen] = useState(false);
  const parents = data.categories.filter((item) => !item.parentId).map((item) => item.id);
  const labels = Object.fromEntries(data.categories.map((item) => [item.id, item.name]));
  const save = () => runUpdate(() => {
    requireName(draft.name);
    setData(upsertEntity(data, "categories", { ...draft, updatedAt: new Date().toISOString() }));
  }, setMessage) && setOpen(false);
  const remove = () => {
    if (!pending) return;
    removeEntity({ data, setData, setMessage, key: "categories", id: pending.id });
    setPending(undefined);
  };

  return (
    <section className="space-y-4">
      <PanelHeader title="分类" onCreate={() => editCategory(defaultCategory(), setDraft, setOpen)} />
      {data.categories.length === 0 && <EmptyState>暂无分类。</EmptyState>}
      <List
        bordered
        dataSource={[...data.categories]}
        rowKey="id"
        renderItem={(category) => <CategoryRow category={category} labels={labels} onEdit={(item) => editCategory(item, setDraft, setOpen)} onDelete={setPending} />}
      />
      <ManagerDrawer open={open} title="分类" onClose={() => setOpen(false)} onSave={save}>
        <Field label="名称" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <SelectField label="方向" value={draft.direction} options={["expense", "income"]} labels={CATEGORY_DIRECTION_LABELS} onChange={(direction) => setDraft({ ...draft, direction: direction as Category["direction"] })} />
        <SelectField label="父分类" value={draft.parentId ?? ""} options={["", ...parents]} labels={labels} onChange={(parentId) => setDraft({ ...draft, parentId: parentId || undefined })} />
      </ManagerDrawer>
      <ConfirmDialog open={Boolean(pending)} title="确认删除" description={pending ? `确认删除“${pending.name}”？有关联交易时会被阻止。` : ""} onCancel={() => setPending(undefined)} onConfirm={remove} />
    </section>
  );
}

function CategoryRow(props: {
  readonly category: Category;
  readonly labels: Record<string, string>;
  readonly onEdit: (category: Category) => void;
  readonly onDelete: (category: Category) => void;
}) {
  const direction = props.category.direction === "expense" ? "支出" : "收入";
  const parent = props.category.parentId ? props.labels[props.category.parentId] : "无";
  return (
    <List.Item actions={[
      <Button key="edit" onClick={() => props.onEdit(props.category)}>编辑</Button>,
      <Button key="delete" variant="danger" onClick={() => props.onDelete(props.category)}>删除</Button>,
    ]}>
      <List.Item.Meta title={props.category.name} description={`${direction} · 父分类：${parent}`} />
    </List.Item>
  );
}

function PanelHeader(props: { readonly title: string; readonly onCreate: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold text-[var(--color-text)]">{props.title}</h2>
      <Button variant="primary" onClick={props.onCreate}>新建</Button>
    </div>
  );
}

function defaultCategory(): Category {
  return { ...createBase(), name: "新分类", direction: "expense" };
}

const CATEGORY_DIRECTION_LABELS: Record<Category["direction"], string> = {
  expense: "支出",
  income: "收入",
};

function editCategory(category: Category, setDraft: (category: Category) => void, setOpen: (open: boolean) => void) {
  setDraft(category);
  setOpen(true);
}
