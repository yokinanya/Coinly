import type { TransactionDraft } from "../domain/types";
import type { CategoryTagSuggestion } from "./validation";

export function parseDraftContent(content: string): TransactionDraft {
  return parseJson(content, extractJsonObject, "AI 返回的 JSON 无法解析") as TransactionDraft;
}

export function parseDraftArrayContent(content: string): readonly TransactionDraft[] {
  const parsed = parseJson(content, extractJsonArray, "AI 返回的 JSON 数组无法解析");
  if (!Array.isArray(parsed)) throw new Error("AI 返回的内容不是 JSON 数组");
  return parsed as TransactionDraft[];
}

export function parseSuggestionContent(content: string): CategoryTagSuggestion {
  return parseJson(content, extractJsonObject, "AI 返回的分类标签建议无法解析") as CategoryTagSuggestion;
}

function parseJson(content: string, extract: (value: string) => string, message: string): unknown {
  try {
    return JSON.parse(extract(content)) as unknown;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("AI 未返回")) throw error;
    const detail = error instanceof Error ? `${message}：${error.message}` : message;
    throw new Error(detail, { cause: error });
  }
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) return fenced;
  const object = balancedJson(trimmed, "{", "}");
  if (object) return object;
  throw new Error("AI 未返回 TransactionDraft JSON 对象");
}

function extractJsonArray(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced?.startsWith("[") && fenced.endsWith("]")) return fenced;
  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  if (firstArray < 0 || (firstObject >= 0 && firstObject < firstArray)) throw new Error("AI 未返回 TransactionDraft JSON 数组");
  const array = balancedJson(trimmed, "[", "]");
  if (array) return array;
  throw new Error("AI 未返回 TransactionDraft JSON 数组");
}

function balancedJson(value: string, open: "{" | "[", close: "}" | "]"): string | undefined {
  const start = value.indexOf(open);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0) return value.slice(start, index + 1);
  }
  return undefined;
}
