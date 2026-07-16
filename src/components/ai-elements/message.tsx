import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MessageRole = "assistant" | "system" | "user";

export function Message(props: HTMLAttributes<HTMLDivElement> & { readonly from: MessageRole }) {
  const { className, from, ...rest } = props;
  return (
    <div
      className={cn("group flex w-full max-w-[95%] flex-col gap-2", from === "user" ? "ml-auto items-end" : "items-start", className)}
      data-role={from}
      {...rest}
    />
  );
}

export function MessageContent(props: HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "min-w-0 max-w-full text-sm leading-6",
        "group-data-[role=user]:rounded-md group-data-[role=user]:bg-(--color-surface-muted) group-data-[role=user]:px-3 group-data-[role=user]:py-2",
        className,
      )}
      {...rest}
    />
  );
}

export function MessageActions(props: HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div className={cn("flex items-center gap-1", className)} {...rest} />;
}

export function MessageAction(props: ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string }) {
  const { children, className, label, ...rest } = props;
  return (
    <Button className={cn("size-11 min-h-11 p-0", className)} variant="ghost" aria-label={label} title={label} {...rest}>
      {children}
    </Button>
  );
}

export const MessageResponse = memo(function MessageResponse(props: { readonly children: string; readonly isAnimating?: boolean; readonly className?: string }) {
  return (
    <Streamdown
      className={cn("ai-message-response size-full break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", props.className)}
      isAnimating={props.isAnimating}
    >
      {props.children}
    </Streamdown>
  );
});
