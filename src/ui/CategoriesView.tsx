import { useState } from "react";
import type { AppData } from "../domain/types";
import { ErrorBanner, PageHeader, SuccessBanner } from "./common";
import { CategoryManager } from "./managers/CategoryManager";
import { TagManager } from "./managers/TagManager";
import { Splitter } from "./metis";

export function CategoriesView(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const [message, setMessage] = useState("");
  return (
    <section className="space-y-5">
      <PageHeader title="分类标签" />
      <div className="hidden min-h-[32rem] lg:block">
        <Splitter>
          <Splitter.Panel defaultSize="58%" min="20rem" resizable={false}>
            <div className="pr-4">
              <CategoryManager data={props.data} setData={props.setData} setMessage={setMessage} />
            </div>
          </Splitter.Panel>
          <Splitter.Panel min="20rem" resizable={false}>
            <div className="pl-4">
              <TagManager data={props.data} setData={props.setData} setMessage={setMessage} />
            </div>
          </Splitter.Panel>
        </Splitter>
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
