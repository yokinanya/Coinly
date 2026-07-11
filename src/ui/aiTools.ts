import { BarChart3, BookOpen, Pencil, Tags, type LucideIcon } from "lucide-react";

export type AiToolMode = "entry" | "analysis" | "ask" | "suggest";

export interface AiToolOption {
  readonly mode: AiToolMode;
  readonly command: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

const TOOL_TRIGGER = /(^|\s)@([^\s@]*)$/u;
const TOOL_MENTION = /(^|\s)@([^\s@]+)(?=\s|$)/u;

export const AI_TOOL_OPTIONS: readonly AiToolOption[] = [
  { mode: "ask", command: "问账", label: "问账", description: "查询消费、收入和交易", icon: BookOpen },
  { mode: "entry", command: "记账", label: "记账", description: "解析描述并生成交易候选", icon: Pencil },
  { mode: "analysis", command: "分析", label: "分析", description: "生成账本趋势与建议", icon: BarChart3 },
  { mode: "suggest", command: "补全", label: "补全", description: "补全最近交易的分类标签", icon: Tags },
];

export function aiToolQuery(value: string): string | undefined {
  return value.match(TOOL_TRIGGER)?.[2];
}

export function matchingAiTools(query: string): readonly AiToolOption[] {
  const normalized = query.trim().toLowerCase();
  return AI_TOOL_OPTIONS.filter((tool) => !normalized || tool.command.includes(normalized) || tool.label.toLowerCase().includes(normalized));
}

export function insertAiToolMention(value: string, tool: AiToolOption): string {
  return value.replace(TOOL_TRIGGER, `$1@${tool.command} `);
}

export function explicitAiTool(value: string): AiToolOption | undefined {
  const command = value.match(TOOL_MENTION)?.[2];
  return AI_TOOL_OPTIONS.find((tool) => tool.command === command);
}

export function stripAiToolMention(value: string): string {
  return explicitAiTool(value) ? value.replace(TOOL_MENTION, "").trim() : value.trim();
}