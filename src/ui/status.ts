import type { StatusMessage } from "./common";

export function statusFromText(text: string): StatusMessage {
  if (text.includes("失败") || text.includes("错误") || text.includes("无法") || text.includes("请先")) {
    return { tone: "error", text };
  }
  if (text.includes("冲突") || text.includes("差异") || text.includes("旧明文") || text.includes("不可逆")) {
    return { tone: "warning", text };
  }
  if (text.includes("已") || text.includes("成功")) {
    return { tone: "success", text };
  }
  return { tone: "info", text };
}
