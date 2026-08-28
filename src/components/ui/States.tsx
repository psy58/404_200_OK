import type { ReactNode } from "react";
import { FileIcon, AlertIcon } from "@/lib/icons";

export function Skeleton({ height = 16, width = "100%" }: { height?: number | string; width?: number | string }) {
  return <div className="skel" style={{ height, width }} aria-hidden="true" />;
}

export function LoadingBlock({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div className="stack" style={{ gap: 12 }} role="status" aria-live="polite">
      <span className="sr">{label}</span>
      <Skeleton height={64} />
      <Skeleton height={64} />
      <Skeleton height={64} />
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: ReactNode; description?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      <span className="ei">{icon ?? <FileIcon width={20} height={20} />}</span>
      <p className="t-h2">{title}</p>
      {description && <p className="t-cap" style={{ marginTop: 6 }}>{description}</p>}
    </div>
  );
}

export function ErrorState({ title = "불러오지 못했습니다", description, onRetry }: { title?: ReactNode; description?: ReactNode; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <span className="ei">
        <AlertIcon width={20} height={20} />
      </span>
      <p className="t-h2">{title}</p>
      {description && <p className="t-cap" style={{ marginTop: 6 }}>{description}</p>}
      {onRetry && (
        <button className="btn btn-quiet btn-sm" style={{ marginTop: 14 }} onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
