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
          알림은 P1 실기능입니다. 현재 화면은 <strong>시연 데이터</strong>이며 실제 발송·읽음 처리·중복 방지는 백엔드
          연결 후 동작합니다.
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
