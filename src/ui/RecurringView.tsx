import { useState } from "react";
import type { AppData } from "../domain/types";
import { ErrorBanner, PageHeader, SuccessBanner } from "./common";
import { useAutoDismissText } from "./useAutoDismissMessage";
import { RecurringRuleManager } from "./managers/RecurringRuleManager";

export function RecurringView(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const [message, setMessage] = useState("");
  const errorMessage = message.includes("失败") || message.includes("无法") ? message : "";
  const successMessage = message && !errorMessage ? message : "";
  useAutoDismissText(successMessage, () => setMessage(""));
  return (
    <section className="space-y-5">
      <PageHeader title="订阅" />
      <ErrorBanner message={errorMessage} />
      <SuccessBanner message={successMessage} />
      <RecurringRuleManager data={props.data} setData={props.setData} setMessage={setMessage} />
    </section>
  );
}
