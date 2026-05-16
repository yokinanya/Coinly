import { useState } from "react";
import type { AppData } from "../domain/types";
import { ErrorBanner, PageHeader, SuccessBanner } from "./common";
import { BudgetManager } from "./managers/BudgetManager";

export function BudgetView(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const { data } = props;
  const [message, setMessage] = useState("");
  return (
    <section className="space-y-5">
      <PageHeader title="预算" />
      <BudgetManager data={data} setData={props.setData} setMessage={setMessage} />
      <ErrorBanner message={message.includes("失败") || message.includes("无法") ? message : ""} />
      <SuccessBanner message={message && !message.includes("失败") && !message.includes("无法") ? message : ""} />
    </section>
  );
}
