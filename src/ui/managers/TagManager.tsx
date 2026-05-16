import { createBase, upsertEntity } from "../../domain/operations";
import type { Tag as LedgerTag } from "../../domain/types";
import { DynamicTagList } from "../DynamicTagList";
import { removeEntity, requireName, runUpdate } from "./managerActions";
import type { ManagerProps } from "./ManagerCommon";

export function TagManager({ data, setData, setMessage }: ManagerProps) {
  const save = (name: string) => runUpdate(() => {
    requireName(name);
    const tag = { ...createBase(), name };
    setData(upsertEntity(data, "tags", tag));
  }, setMessage);
  const remove = (tag: LedgerTag) => {
    try {
      removeEntity({ data, setData, setMessage, key: "tags", id: tag.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "标签删除失败");
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="font-semibold text-[var(--color-text)]">标签</h2>
      <DynamicTagList
        values={data.tags.map((tag) => tag.name)}
        addLabel="新增标签"
        placeholder="标签"
        onAdd={save}
        onRemove={(name) => {
          const tag = data.tags.find((item) => item.name === name);
          if (tag) remove(tag);
        }}
      />
    </section>
  );
}
