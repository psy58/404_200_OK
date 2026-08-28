import type { ReactNode } from "react";
import type { RecoveryAction, UiIssue, ViewStatus } from "@/api/ui-api-boundary-v2";
import { FileIcon, AlertIcon, InfoIcon } from "@/lib/icons";

const STATUS_TITLE: Record<ViewStatus, string> = {
  idle: "요청 대기 중",
  loading: "불러오는 중",
  ready: "준비되었습니다",
  empty: "표시할 내용이 없습니다",
  "no-result": "검색 결과가 없습니다",
  partial: "일부 내용만 불러왔습니다",
  stale: "최신 확인이 필요합니다",
  unauthorized: "다시 로그인이 필요합니다",
  forbidden: "접근 권한이 없습니다",
  "not-found": "요청한 내용을 찾을 수 없습니다",
  conflict: "다른 변경과 충돌했습니다",
  "validation-error": "입력 내용을 확인해 주세요",
  "rate-limited": "잠시 후 다시 시도해 주세요",
  "server-error": "요청을 처리하지 못했습니다",
  offline: "네트워크에 연결할 수 없습니다",
  disabled: "아직 사용할 수 없습니다",
};

const RECOVERY_LABEL: Partial<Record<RecoveryAction, string>> = {
  retry: "다시 시도",
  "reload-latest": "최신 내용 불러오기",
  reapply: "내 변경 다시 적용",
  "go-to-list": "목록으로 돌아가기",
  "clear-filters": "필터 초기화",
  reauthenticate: "다시 로그인",
  "request-access": "권한 요청",
  "contact-support": "지원 문의",
};

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

/** Full UI_API_BOUNDARY_V2 issue renderer using the existing notice/error language. */
export function IssueState({
  status,
  issue,
  onRecover,
}: {
  status: ViewStatus;
  issue?: UiIssue;
  onRecover?: (action: RecoveryAction) => void;
}) {
  const action = issue?.recoveryAction;
  const actionLabel = action ? RECOVERY_LABEL[action] : undefined;
  const isNotice = status === "partial" || status === "stale" || status === "disabled" || status === "idle";
  const details = (
    <>
      <strong>{issue?.title ?? STATUS_TITLE[status]}</strong>{" "}
      {issue?.userMessage}
      {issue?.retryAfter && <span className="issue-meta">재시도 가능 시점: {issue.retryAfter}</span>}
      {issue?.supportId && <span className="issue-meta">지원 ID: {issue.supportId}</span>}
      {issue?.fieldErrors && issue.fieldErrors.length > 0 && (
        <ul className="field-errors" aria-label="입력 오류 목록">
          {issue.fieldErrors.map((field) => <li key={`${field.field}:${field.message}`}><strong>{field.field}</strong>: {field.message}</li>)}
        </ul>
      )}
      {action && action !== "none" && actionLabel && onRecover && (
        <button className="btn btn-quiet btn-sm issue-action" onClick={() => onRecover(action)}>{actionLabel}</button>
      )}
    </>
  );

  if (isNotice) {
    return <div className={`notice ${status === "disabled" ? "flat" : "info"}`} role="status"><InfoIcon /><span>{details}</span></div>;
  }
  return (
    <div className="error-state" role="alert">
      <span className="ei"><AlertIcon width={20} height={20} /></span>
      <div className="issue-copy">{details}</div>
    </div>
  );
}
