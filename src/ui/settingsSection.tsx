import type { ReactNode } from "react";

export function SettingsSection(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="panel grid w-full gap-4 p-4 lg:grid-cols-[10rem_minmax(0,1fr)]">
      <h2 className="font-semibold text-(--color-text)">{props.title}</h2>
      <div className="min-w-0 space-y-4">{props.children}</div>
    </section>
  );
}
