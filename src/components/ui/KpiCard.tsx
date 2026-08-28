import type { MouseEvent, ReactNode } from "react";
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
  scrollTarget?: string;
}

export function KpiCard({ accent, title, value, meta, linkLabel, to, variant = "down", scrollTarget }: KpiCardProps) {
  const Icon: ReactNode = variant === "down" ? <ChevronDownIcon /> : <ArrowRightIcon />;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!scrollTarget || window.location.pathname !== to) return;

    const target = document.getElementById(scrollTarget);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `${to}#${scrollTarget}`);
  };

  return (
    <Link className="kpi" style={{ ["--acc" as string]: accent }} to={to} onClick={handleClick}>
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
