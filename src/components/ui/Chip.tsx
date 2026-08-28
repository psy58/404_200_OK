import type { ReactNode } from "react";

type ChipTone = "default" | "ok" | "warn" | "danger" | "navy" | "gam";

export function Chip({ tone = "default", children, numeric }: { tone?: ChipTone; children: ReactNode; numeric?: boolean }) {
  const cls = ["chip", tone !== "default" ? tone : ""].filter(Boolean).join(" ");
  return <span className={cls}>{numeric ? <span className="num">{children}</span> : children}</span>;
}
