import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { getNotifications } from "@/services/notificationsService";
import { qk } from "@/state/queryKeys";
import { useToast } from "@/state/ToastContext";
import { AlertIcon, InfoIcon } from "@/lib/icons";
import type { NotificationKind } from "@/domain/types";

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

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const query = useQuery({ queryKey: qk.notifications(), queryFn: ({ signal }) => getNotifications(signal) });
  const navigate = useNavigate();
  const { toast } = useToast();

  return (
    <Panel
      titleId="notif-panel-title"
      title="알림"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            닫기
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              toast("모두 읽음으로 표시했습니다 (시연)");
            }}
          >
            모두 읽음
          </button>
        </>
      }
    >
      <div className="notice" style={{ margin: "14px 24px" }}>
        <InfoIcon />
        <span>
          지금 보이는 알림은 <strong>예시 데이터</strong>입니다. 읽음 처리와 실시간 알림 기능은 준비 중입니다.
        </span>
      </div>
      <QueryBoundary
        query={query}
        isEmpty={(d) => d.length === 0}
        emptyTitle="새 알림이 없습니다"
      >
        {(items) =>
          items.map((n) => (
            <button
              key={n.id}
              className={`notif${n.isNew ? " new" : ""}`}
              onClick={() => {
                if (n.relatedTaskId) {
                  navigate(`/tasks/${n.relatedTaskId}`);
                  onClose();
                }
              }}
            >
              <span className="ni" style={{ background: KIND_BG[n.kind], color: KIND_FG[n.kind] }}>
                <AlertIcon />
              </span>
              <span>
                <span className="nt">{n.title}</span>
                <span className="nm">{n.message}</span>
              </span>
            </button>
          ))
        }
      </QueryBoundary>
    </Panel>
  );
}
