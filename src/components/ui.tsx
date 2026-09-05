"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/* --------------------------------- Header -------------------------------- */

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  /** true = router.back(), 문자열 = 해당 경로로 이동 */
  back?: boolean | string;
  action?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-bg/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
      {back ? (
        typeof back === "string" ? (
          <Link href={back} aria-label="뒤로" className="-ml-2 p-2 text-muted">
            <ChevronLeft size={22} />
          </Link>
        ) : (
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => router.back()}
            className="-ml-2 p-2 text-muted"
          >
            <ChevronLeft size={22} />
          </button>
        )
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        {subtitle ? (
          <p className="truncate text-xs text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

/* --------------------------------- Button -------------------------------- */

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "surface" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent text-accent-fg font-semibold active:brightness-90",
  surface:
    "bg-surface-2 text-text border border-border active:bg-border",
  ghost: "text-muted active:text-text",
  danger: "bg-danger/15 text-danger border border-danger/30 active:bg-danger/25",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-sm rounded-lg",
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-14 px-5 text-base rounded-2xl",
};

export function Button({
  variant = "surface",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 transition disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  );
}

/* ---------------------------------- Card --------------------------------- */

export function Card({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={`rounded-2xl border border-border bg-surface ${className}`}
    />
  );
}

/* ------------------------------- EmptyState ------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="text-muted">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/* --------------------------------- Spinner -------------------------------- */

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-muted">
      불러오는 중…
    </div>
  );
}

/* --------------------------------- Toggle --------------------------------- */

export function Toggle({
  label,
  note,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void | Promise<void>;
}) {
  const on = checked && !disabled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {note ? <span className="block text-xs text-muted">{note}</span> : null}
      </span>
      <span
        aria-hidden
        className={`relative h-6 w-10 shrink-0 rounded-full transition ${
          on ? "bg-accent" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
            on ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
