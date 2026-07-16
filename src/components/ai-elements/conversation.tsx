import { ArrowDown } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Conversation(props: ComponentProps<typeof StickToBottom>) {
  const { className, ...rest } = props;
  return <StickToBottom className={cn("relative min-h-0 flex-1 overflow-y-hidden", className)} initial="smooth" resize="smooth" role="log" {...rest} />;
}

export function ConversationContent(props: ComponentProps<typeof StickToBottom.Content>) {
  const { className, ...rest } = props;
  return <StickToBottom.Content className={cn("mx-auto flex w-full max-w-3xl flex-col gap-5 px-1 py-4 sm:px-4", className)} {...rest} />;
}

export function ConversationScrollButton(props: ComponentProps<typeof Button>) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const scroll = useCallback(() => scrollToBottom(), [scrollToBottom]);
  if (isAtBottom) return null;
  return (
    <Button
      className={cn("absolute bottom-3 left-1/2 size-10 min-h-10 -translate-x-1/2 rounded-full p-0 shadow-sm", props.className)}
      variant="default"
      aria-label="滚动到最新消息"
      title="滚动到最新消息"
      onClick={scroll}
    >
      <ArrowDown size={16} aria-hidden="true" />
    </Button>
  );
}
