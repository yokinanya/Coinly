import { useState } from "react";
import type { AppData } from "../domain/types";
import { ErrorBanner, PageHeader, SuccessBanner } from "./common";
import { RecurringRuleManager } from "./managers/RecurringRuleManager";

export function RecurringView(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const [message, setMessage] = useState("");
  return (
    <section className="space-y-5">
      <PageHeader title="订阅" />
      <ErrorBanner message={message.includes("失败") || message.includes("无法") ? message : ""} />
      <SuccessBanner message={message && !message.includes("失败") && !message.includes("无法") ? message : ""} />
      <RecurringRuleManager data={props.data} setData={props.setData} setMessage={setMessage} />
    </section>
  );
}
