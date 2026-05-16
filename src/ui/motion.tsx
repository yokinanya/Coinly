import type { ReactNode } from "react";
import { Transition } from "./metis";

const MOTION_DEADLINE = 240;
const FADE_ENTER = { transition: "opacity 160ms ease-out, transform 160ms ease-out" };
const FADE_FROM = { opacity: 0, transform: "translateY(6px)" };
const FADE_TO = { opacity: 1, transform: "translateY(0)" };
const PAGE_ENTER = { transition: "opacity 180ms ease-out, transform 180ms ease-out" };
const PAGE_FROM = { opacity: 0, transform: "translateY(8px)" };
const PAGE_TO = { opacity: 1, transform: "translateY(0)" };

export function FadeIn(props: { readonly children: ReactNode }) {
  return (
    <Transition visible appear deadline={MOTION_DEADLINE} enter={FADE_ENTER} enterFrom={FADE_FROM} enterTo={FADE_TO}>
      {(motionProps, ref) => <div ref={ref} style={motionProps.style}>{props.children}</div>}
    </Transition>
  );
}

export function PageTransition(props: { readonly children: ReactNode }) {
  return (
    <Transition visible appear deadline={MOTION_DEADLINE} enter={PAGE_ENTER} enterFrom={PAGE_FROM} enterTo={PAGE_TO}>
      {(motionProps, ref) => <div ref={ref} style={motionProps.style}>{props.children}</div>}
    </Transition>
  );
}
