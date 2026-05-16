import type { AppData, Category, EntityBase, Transaction, TransactionDraft } from "./types";
import { DEFAULT_CURRENCIES } from "./constants";

export const APP_SCHEMA_VERSION = 1;

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return uuidFromRandomBytes();
}

export function entityBase(): EntityBase {
  const timestamp = nowIso();
  return { id: createId(), createdAt: timestamp, updatedAt: timestamp };
}

export function createTransaction(draft: TransactionDraft): Transaction {
  return { ...entityBase(), ...draft };
}

export function bumpVersion(data: AppData): AppData {
  return { ...data, updatedAt: nowIso(), localVersion: data.localVersion + 1 };
}

export function touchEntity<T extends EntityBase>(entity: T): T {
  return { ...entity, updatedAt: nowIso() };
}

export function initialData(): AppData {
  const createdAt = nowIso();
  const accountId = createId();
  const categories = defaultCategories(createdAt);

  return {
    schemaVersion: APP_SCHEMA_VERSION,
    updatedAt: createdAt,
    currencies: DEFAULT_CURRENCIES,
    accounts: [
      {
        id: accountId,
        createdAt,
        updatedAt: createdAt,
        name: "日常账户",
        kind: "other",
        currency: "CNY",
      },
    ],
    categories,
    tags: [],
    transactions: [],
    recurringRules: [],
    budgets: [],
    statements: [],
    localVersion: 1,
  };
}

function defaultCategories(createdAt: string): readonly Category[] {
  return [
    category(createdAt, "餐饮", "expense"),
    category(createdAt, "交通", "expense"),
    category(createdAt, "娱乐", "expense"),
    category(createdAt, "医疗", "expense"),
    category(createdAt, "订阅", "expense"),
    category(createdAt, "工资", "income"),
    category(createdAt, "奖金", "income"),
    category(createdAt, "报销", "income"),
  ];
}

function category(createdAt: string, name: string, direction: Category["direction"]): Category {
  return { ...baseWithTime(createdAt), name, direction };
}

function baseWithTime(createdAt: string): EntityBase {
  return { id: createId(), createdAt, updatedAt: createdAt };
}

function uuidFromRandomBytes(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
