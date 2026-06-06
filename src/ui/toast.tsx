import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "error";
type ToastItem = { readonly id: string; readonly text: string; readonly tone: Tone };

export function ToastViewport() {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  useEffect(() => subscribeToToasts(setToasts), []);
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => <div key={toast.id} className={cn("toast", `alert-${toast.tone}`)} role={toast.tone === "error" ? "alert" : "status"}>{toast.text}</div>)}
    </div>
  );
}

function subscribeToToasts(setToasts: Dispatch<SetStateAction<readonly ToastItem[]>>) {
  const listener = (event: Event) => addToast(event as CustomEvent<{ readonly text: string; readonly tone: Tone }>, setToasts);
  window.addEventListener("coinly-toast", listener);
  return () => window.removeEventListener("coinly-toast", listener);
}

function addToast(event: CustomEvent<{ readonly text: string; readonly tone: Tone }>, setToasts: Dispatch<SetStateAction<readonly ToastItem[]>>): void {
  const id = crypto.randomUUID();
  setToasts((current) => [...current.slice(-2), { id, text: event.detail.text, tone: event.detail.tone }]);
  window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2600);
}
