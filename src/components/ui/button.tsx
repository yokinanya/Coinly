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
  primary: "border-[var(--color-accent)] bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]",
  default: "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]",
  danger: "border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:border-[var(--color-danger)] hover:bg-[var(--color-danger-hover)]",
  ghost: "border-transparent bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]",
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
