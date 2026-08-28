import type { SourceType } from "@/domain/types";
import { BankIcon, PenIcon, SealIcon } from "@/lib/icons";

/**
 * Renders the 공식/학교사례/경험 distinction with a label + icon, never
 * color alone (docs/01 §6.4, §14.1 ACC01).
 */
const CONFIG: Record<SourceType, { label: string; cls: string; Icon: typeof SealIcon }> = {
  official: { label: "공식 근거", cls: "official", Icon: SealIcon },
  school_case: { label: "학교사례", cls: "school", Icon: BankIcon },
  experience: { label: "경험 메모", cls: "exp", Icon: PenIcon },
};

export function SourceTag({ type }: { type: SourceType }) {
  const { label, cls, Icon } = CONFIG[type];
  return (
    <span className={`src ${cls}`}>
      <Icon width={12} height={12} />
      {label}
    </span>
  );
}
