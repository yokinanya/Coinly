import { deleteEntity } from "../../domain/operations";
import type { AppData } from "../../domain/types";
import type { CollectionKey, SetData } from "./ManagerCommon";

export function removeEntity(options: {
  readonly data: AppData;
  readonly setData: SetData;
  readonly setMessage: (value: string) => void;
  readonly key: CollectionKey;
  readonly id: string;
}) {
  return runUpdate(() => options.setData(deleteEntity(options.data, options.key, options.id)), options.setMessage);
}

export function runUpdate(action: () => void, setMessage: (value: string) => void): boolean {
  try {
    action();
    setMessage("已保存");
    return true;
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "操作失败");
    return false;
  }
}

export function requireName(value: string): void {
  if (!value.trim()) throw new Error("名称不能为空");
}

export function requirePositive(value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error("金额必须大于 0");
}

export function optionalNumber(value: string): number | undefined {
  return value ? Number(value) : undefined;
}
