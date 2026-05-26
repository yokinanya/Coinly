type Tone = "info" | "success" | "warning" | "error";

export const Message = {
  info: (text: string) => showToast(text, "info"),
  success: (text: string) => showToast(text, "success"),
  warning: (text: string) => showToast(text, "warning"),
  error: (text: string) => showToast(text, "error"),
};

export const Notification = Message;

function showToast(text: string, tone: Tone): void {
  window.dispatchEvent(new CustomEvent("coinly-toast", { detail: { text, tone } }));
}
