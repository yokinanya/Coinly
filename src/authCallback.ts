import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

broadcastResponseToMainFrame()
  .then(() => setStatus("授权已完成，可以关闭此窗口。"))
  .catch((error: unknown) => setStatus(errorMessage(error)));

function setStatus(message: string): void {
  const element = document.getElementById("status");
  if (element) element.textContent = message;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `授权回调处理失败：${error.message}`;
  return "授权回调处理失败";
}
