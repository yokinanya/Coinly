import { Plus } from "lucide-react";
import { useState } from "react";
import { Tag } from "./metis";

export function DynamicTagList(props: {
  readonly values: readonly string[];
  readonly addLabel: string;
  readonly placeholder?: string;
  readonly onAdd: (value: string) => void;
  readonly onRemove: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const save = () => {
    if (!value.trim()) {
      setAdding(false);
      return;
    }
    props.onAdd(value);
    setValue("");
    setAdding(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {props.values.map((item) => (
        <Tag key={item} closable className="px-3 py-1 text-sm" onClose={() => props.onRemove(item)}>{item}</Tag>
      ))}
      {adding
        ? (
          <input
            autoFocus
            className="min-h-8 w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            placeholder={props.placeholder}
            value={value}
            onBlur={save}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") {
                setValue("");
                setAdding(false);
              }
            }}
          />
        )
        : <Tag className="cursor-pointer px-3 py-1 text-sm" onClick={() => setAdding(true)}><Plus size={14} />{props.addLabel}</Tag>}
    </div>
  );
}
