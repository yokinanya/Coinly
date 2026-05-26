import type { ReactNode } from "react";

export function FadeIn(props: { readonly children: ReactNode }) {
  return <div className="w-full min-w-0 animate-[fade-panel_160ms_ease-out]">{props.children}</div>;
}

export function PageTransition(props: { readonly children: ReactNode }) {
  return <div className="w-full min-w-0 animate-[fade-page_180ms_ease-out]">{props.children}</div>;
}
