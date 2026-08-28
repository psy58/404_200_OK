import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { getNotifications } from "@/services/notificationsService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { AlertIcon, InfoIcon } from "@/lib/icons";
import type { NotificationKind } from "@/domain/types";
import { taskNavigationState } from "@/lib/taskNavigation";

const KIND_BG: Record<NotificationKind, string> = {
  due: "var(--danger-bg)",
  prep: "var(--warn-bg)",
  doc: "var(--navy-050)",
  evidence_update: "var(--navy-050)",
  analysis_complete: "var(--ok-bg)",
};
const KIND_FG: Record<NotificationKind, string> = {
  due: "var(--danger-ink)",
  prep: "var(--warn-ink)",
  doc: "var(--navy-700)",
  evidence_update: "var(--navy-700)",
  analysis_complete: "var(--ok-ink)",
};

/** P1 notification UI, fail-closed until persistence/authz operations exist. */
export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { context } = useAssignment();
  const query = useQuery({
    queryKey: context ? qk.notifications(context) : ["notifications", "disabled"],
    queryFn: ({ signal }) => getNotifications(context!, signal),
    enabled: !!context,
  });

  return (
    <Panel
      titleId="notif-panel-title"
      title="알림"
      onClose={onClose}
      footer={<button className="btn btn-quiet" onClick={onClose}>닫기</button>}
    >
      <QueryBoundary query={query}>
        {(result) => (
          <>
            {result.status === "disabled" && (
              <div className="notice" style={{ margin: "14px 24px" }} role="status">
                <InfoIcon />
                <span><strong>{result.issue?.title ?? "알림 계약이 필요합니다."}</strong> {result.issue?.userMessage}</span>
              </div>
            )}
            {result.status !== "disabled" && result.items.length === 0 && (
              <div className="empty" style={{ margin: 24 }}><p className="t-h2">새 알림이 없습니다</p></div>
            )}
            {result.items.map((item) => (
              <button
                key={item.id}
                className={`notif${item.isNew ? " new" : ""}`}
                onClick={() => {
                  if (item.relatedTaskId) {
                    navigate(`/tasks/${item.relatedTaskId}`, { state: taskNavigationState("/home", "알림") });
                    onClose();
                  }
                }}
              >
                <span className="ni" style={{ background: KIND_BG[item.kind], color: KIND_FG[item.kind] }}><AlertIcon /></span>
                <span><span className="nt">{item.title}</span><span className="nm">{item.message}</span></span>
              </button>
            ))}
          </>
        )}
      </QueryBoundary>
    </Panel>
  );
}
