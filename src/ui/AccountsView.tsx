import { useState } from "react";
import type { AppData } from "../domain/types";
import { ErrorBanner, PageHeader, SuccessBanner } from "./common";
import { AccountManager } from "./managers/AccountManager";

export function AccountsView(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const [message, setMessage] = useState("");
  return (
    <section className="space-y-5">
      <PageHeader title="账户" />
      <ErrorBanner message={message.includes("失败") || message.includes("无法") ? message : ""} />
      <SuccessBanner message={message && !message.includes("失败") && !message.includes("无法") ? message : ""} />
      <AccountManager data={props.data} setData={props.setData} setMessage={setMessage} />
    </section>
  );
}
