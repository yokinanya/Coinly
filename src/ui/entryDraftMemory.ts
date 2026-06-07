import type { AppData, TransactionDraft } from "../domain/types";
import { initialTransactionDraft } from "./transactionDraft";

export function initialEntryDraft(data: AppData): TransactionDraft {
  const firstAccount = data.accounts[0];
  const recent = data.uiSettings?.recentEntry;
  const account = data.accounts.find((item) => item.id === recent?.accountId) ?? firstAccount;
  const categoryId = validExpenseCategoryId(data, recent?.categoryId);
  return {
    ...initialTransactionDraft(account?.id ?? "", recent?.currency ?? account?.currency ?? "CNY"),
    categoryId,
    tagIds: recent?.tagIds ?? [],
  };
}

export function withRecentEntry(data: AppData, draft: TransactionDraft): AppData {
  return {
    ...data,
    uiSettings: {
      ...data.uiSettings,
      theme: data.uiSettings?.theme ?? "system",
      recentEntry: {
        accountId: draft.accountId,
        currency: draft.currency,
        categoryId: draft.categoryId,
        tagIds: draft.tagIds,
      },
    },
  };
}

function validExpenseCategoryId(data: AppData, categoryId?: string): string | undefined {
  const category = data.categories.find((item) => item.id === categoryId);
  return category?.direction === "expense" ? category.id : undefined;
}