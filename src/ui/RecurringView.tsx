import { useState } from "react";
import type { AppData } from "../domain/types";
import { useAutoDismissText } from "./useAutoDismissMessage";
import { RecurringRuleManager } from "./managers/RecurringRuleManager";

export function RecurringView(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const [message, setMessage] = useState("");
  const errorMessage = message.includes("失败") || message.includes("无法") ? message : "";
  const successMessage = message && !errorMessage ? message : "";
  useAutoDismissText(successMessage, () => setMessage(""));
  return (
    <RecurringRuleManager data={props.data} setData={props.setData} message={message} setMessage={setMessage} />
  );
}
