import type { Transaction } from "../domain/types";

export function visibleSelectedIds(
  selectedIds: readonly string[],
  visibleRows: readonly Transaction[],
): readonly string[] {
  const visibleIds = new Set(visibleRows.map((transaction) => transaction.id));
  return selectedIds.filter((id) => visibleIds.has(id));
}

export function visibleSelectedCount(
  selectedIds: readonly string[],
  visibleRows: readonly Transaction[],
): number {
  return visibleSelectedIds(selectedIds, visibleRows).length;
}
