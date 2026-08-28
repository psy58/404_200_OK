import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { getNotifications, markAllNotificationsRead } from "@/services/notificationsService";
import { qk } from "@/state/queryKeys";
import { useToast } from "@/state/ToastContext";
import { AlertIcon } from "@/lib/icons";
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

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const query = useQuery({ queryKey: qk.notifications(), queryFn: ({ signal }) => getNotifications(signal) });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: qk.notifications() });
      toast(`${count}개 알림을 읽음으로 표시했습니다`);
    },
    onError: (error: Error) => toast(error.message),
  });

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
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            모두 읽음
          </button>
        </>
      }
    >
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
                  navigate(`/tasks/${n.relatedTaskId}`, { state: taskNavigationState("/home", "알림") });
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
