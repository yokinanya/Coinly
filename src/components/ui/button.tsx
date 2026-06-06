import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "default" | "danger" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly htmlType?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "border-(--color-accent) bg-(--color-accent) text-white hover:bg-(--color-accent-hover)",
  default: "border-(--color-border) bg-(--color-surface) text-(--color-text) hover:bg-(--color-surface-muted)",
  danger: "border-(--color-danger-border) bg-(--color-danger-soft) text-(--color-danger) hover:border-(--color-danger) hover:bg-(--color-danger-hover)",
  ghost: "border-transparent bg-transparent text-(--color-text) hover:bg-(--color-surface-muted)",
};

export function Button(props: ButtonProps) {
  const { children, className, disabled, htmlType, icon, loading, type, variant = "default", ...rest } = props;
  return (
    <button
      className={cn("ui-button", VARIANT_CLASS[variant], className)}
      disabled={disabled || loading}
      type={htmlType ?? type ?? "button"}
      {...rest}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
