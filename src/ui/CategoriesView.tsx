import { useState } from "react";
import type { AppData } from "../domain/types";
import { ErrorBanner, PageHeader, SuccessBanner } from "./common";
import { CategoryManager } from "./managers/CategoryManager";
import { TagManager } from "./managers/TagManager";

export function CategoriesView(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const [message, setMessage] = useState("");
  return (
    <section className="space-y-5">
      <PageHeader title="分类标签" />
      <div className="hidden min-h-[32rem] grid-cols-[minmax(20rem,1.35fr)_minmax(20rem,1fr)] gap-4 lg:grid">
        <CategoryManager data={props.data} setData={props.setData} setMessage={setMessage} />
        <TagManager data={props.data} setData={props.setData} setMessage={setMessage} />
      </div>
      <div className="space-y-5 lg:hidden">
        <CategoryManager data={props.data} setData={props.setData} setMessage={setMessage} />
        <TagManager data={props.data} setData={props.setData} setMessage={setMessage} />
      </div>
      <ErrorBanner message={message.includes("失败") || message.includes("无法") ? message : ""} />
      <SuccessBanner message={message && !message.includes("失败") && !message.includes("无法") ? message : ""} />
    </section>
  );
}
