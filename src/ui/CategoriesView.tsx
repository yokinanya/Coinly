import { useState } from "react";
import type { AppData } from "../domain/types";
import { ErrorBanner, PageHeader, SuccessBanner } from "./common";
import { useAutoDismissText } from "./useAutoDismissMessage";
import { CategoryManager } from "./managers/CategoryManager";
import { TagManager } from "./managers/TagManager";

export function CategoriesView(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const [message, setMessage] = useState("");
  const errorMessage = message.includes("失败") || message.includes("无法") ? message : "";
  const successMessage = message && !errorMessage ? message : "";
  useAutoDismissText(successMessage, () => setMessage(""));
  return (
    <section className="space-y-5">
      <PageHeader title="分类标签" />
      <div className="hidden min-h-128 grid-cols-[minmax(20rem,1.35fr)_minmax(20rem,1fr)] gap-4 lg:grid">
        <CategoryManager data={props.data} setData={props.setData} setMessage={setMessage} />
        <TagManager data={props.data} setData={props.setData} setMessage={setMessage} />
      </div>
      <div className="space-y-5 lg:hidden">
        <CategoryManager data={props.data} setData={props.setData} setMessage={setMessage} />
        <TagManager data={props.data} setData={props.setData} setMessage={setMessage} />
      </div>
      <ErrorBanner message={errorMessage} />
      <SuccessBanner message={successMessage} />
    </section>
  );
}
