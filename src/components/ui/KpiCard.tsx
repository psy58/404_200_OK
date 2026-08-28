import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDownIcon, ArrowRightIcon } from "@/lib/icons";

interface KpiCardProps {
  accent: string;
  title: string;
  value: number;
  meta: string;
  linkLabel: string;
  to: string;
  variant?: "down" | "right";
}

export function KpiCard({ accent, title, value, meta, linkLabel, to, variant = "down" }: KpiCardProps) {
  const Icon: ReactNode = variant === "down" ? <ChevronDownIcon /> : <ArrowRightIcon />;
  return (
    <Link className="kpi" style={{ ["--acc" as string]: accent }} to={to}>
      <span className="kt">{title}</span>
      <span className="kn">
        <b className="num">{value}</b>
        <i>건</i>
      </span>
      <span className="km">{meta}</span>
      <span className="kl">
        {linkLabel} {Icon}
      </span>
    </Link>
  );
}
