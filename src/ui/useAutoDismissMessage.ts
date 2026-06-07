import { useEffect } from "react";
import type { StatusMessage } from "./common";

const SUCCESS_MESSAGE_DISMISS_MS = 3200;

export function useAutoDismissStatus(status: StatusMessage | undefined, clear: () => void, delay = SUCCESS_MESSAGE_DISMISS_MS): void {
  useEffect(() => {
    if (!status?.text || status.tone !== "success") return undefined;
    const timer = window.setTimeout(clear, delay);
    return () => window.clearTimeout(timer);
  }, [clear, delay, status?.text, status?.tone]);
}

export function useAutoDismissText(message: string, clear: () => void, delay = SUCCESS_MESSAGE_DISMISS_MS): void {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(clear, delay);
    return () => window.clearTimeout(timer);
  }, [clear, delay, message]);
}