import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { IssueState } from "@/components/ui/States";
import { deleteExperienceNote, getExperienceNotes, updateExperienceNote } from "@/services/notesService";
import { getAsyncActionStatus, getIssueViewStatus, getUiIssue } from "@/services/errorPresentation";
import { useAssignment } from "@/state/AssignmentContext";
import { useToast } from "@/state/ToastContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon } from "@/lib/icons";
import type { ExperienceNote, NoteVisibility } from "@/domain/types";
import type { MutationContextToken } from "@/api/mutation-context.js";

const VISIBILITY_LABEL: Record<NoteVisibility, { label: string; tone: string }> = {
  private: { label: "나만 보기", tone: "" },
  handover: { label: "후임자 전달", tone: "warn" },
  organization: { label: "학교 조직지식", tone: "ok" },
};

interface EditDraft {
  noteId: string;
  body: string;
  visibility: NoteVisibility;
}

interface UpdateInput {
  note: ExperienceNote;
  body: string;
  visibility: NoteVisibility;
}

interface MutationSnapshot {
  previous?: ExperienceNote[];
  key: readonly unknown[];
  token: MutationContextToken;
}

function fieldMessage(error: unknown, fieldName: string): string | undefined {
  return getUiIssue(error)?.fieldErrors?.find((field) => field.field === fieldName)?.message;
}

/** MOCK_ONLY note review controller with versioned update/delete and exact rollback. */
export function ReviewModal({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const { context, user, school, captureMutationContext, isMutationContextCurrent } = useAssignment();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({
    queryKey: context ? qk.notes(context) : ["notes", "disabled"],
    queryFn: ({ signal }) => getExperienceNotes(context!, user?.displayName ?? "", signal),
    enabled: !!context,
  });

  function invalidateRelated(note: ExperienceNote) {
    if (!context) return;
    void queryClient.invalidateQueries({ queryKey: qk.tasks(context) });
    void queryClient.invalidateQueries({ queryKey: qk.taskDetail(context, note.taskId) });
    if (school) void queryClient.invalidateQueries({ queryKey: qk.handover(context, school.academicYear) });
  }

  const updateMutation = useMutation<ExperienceNote[], Error, UpdateInput, MutationSnapshot>({
    mutationFn: ({ note, body, visibility }) => {
      if (!context || !user) throw new Error("담당 업무 맥락을 확인해 주세요.");
      return updateExperienceNote(context, user.displayName, {
        taskId: note.taskId,
        noteId: note.id,
        text: body,
        visibility,
        expectedVersion: note.version,
      });
    },
    onMutate: async ({ note, body, visibility }) => {
      if (!context) throw new Error("담당 업무 맥락을 확인해 주세요.");
      const key = qk.notes(context);
      const token = captureMutationContext(context, ["experience-note", note.id]);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ExperienceNote[]>(key);
      queryClient.setQueryData<ExperienceNote[]>(key, (current = []) => current.map((item) => (
        item.id === note.id ? { ...item, body: body.trim(), visibility } : item
      )));
      return { previous, key, token };
    },
    onSuccess: (notes, input, snapshot) => {
      if (!snapshot || !isMutationContextCurrent(snapshot.token)) return;
      queryClient.setQueryData(snapshot.key, notes);
      invalidateRelated(input.note);
      setDraft(null);
      toast("경험 메모를 수정했습니다");
    },
    onError: (_error, _input, snapshot) => {
      if (!snapshot || !isMutationContextCurrent(snapshot.token)) return;
      if (snapshot.previous) queryClient.setQueryData(snapshot.key, snapshot.previous);
      toast("메모를 수정하지 못했습니다. 작성 중인 내용은 유지됩니다.", "error");
    },
  });

  const deleteMutation = useMutation<ExperienceNote[], Error, ExperienceNote, MutationSnapshot>({
    mutationFn: (note) => {
      if (!context || !user) throw new Error("담당 업무 맥락을 확인해 주세요.");
      return deleteExperienceNote(context, user.displayName, {
        taskId: note.taskId,
        noteId: note.id,
        expectedVersion: note.version,
      });
    },
    onMutate: async (note) => {
      if (!context) throw new Error("담당 업무 맥락을 확인해 주세요.");
      const key = qk.notes(context);
      const token = captureMutationContext(context, ["experience-note", note.id]);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ExperienceNote[]>(key);
      queryClient.setQueryData<ExperienceNote[]>(key, (current = []) => current.filter((item) => item.id !== note.id));
      return { previous, key, token };
    },
    onSuccess: (notes, note, snapshot) => {
      if (!snapshot || !isMutationContextCurrent(snapshot.token)) return;
      queryClient.setQueryData(snapshot.key, notes);
      invalidateRelated(note);
      setDeleteConfirmationId(null);
      toast("경험 메모를 삭제했습니다");
    },
    onError: (_error, _note, snapshot) => {
      if (!snapshot || !isMutationContextCurrent(snapshot.token)) return;
      if (snapshot.previous) queryClient.setQueryData(snapshot.key, snapshot.previous);
      toast("메모를 삭제하지 못했습니다. 기존 메모를 복원했습니다.", "error");
    },
  });

  const updateActionStatus = getAsyncActionStatus(updateMutation);
  const deleteActionStatus = getAsyncActionStatus(deleteMutation);

  return (
    <Modal
      titleId="review-modal-title"
      wide
      eyebrow="인수인계 전 메모 검토"
      title="1년치 메모 검토"
      description="기록할 때는 자유롭게, 전달할 때는 신중하게. 내가 작성한 메모만 수정하거나 삭제할 수 있습니다."
      onClose={onClose}
      footer={<button className="btn btn-quiet" onClick={onClose}>닫기</button>}
    >
      <QueryBoundary query={query} isEmpty={(notes) => notes.length === 0} emptyTitle="검토할 메모가 없습니다">
        {(notes) => (
          <>
            {notes.map((note) => {
              const label = VISIBILITY_LABEL[note.visibility];
              const editing = draft?.noteId === note.id;
              const confirmingDelete = deleteConfirmationId === note.id;
              const updateIssue = updateMutation.variables?.note.id === note.id ? getUiIssue(updateMutation.error) : undefined;
              const deleteIssue = deleteMutation.variables?.id === note.id ? getUiIssue(deleteMutation.error) : undefined;
              const textError = editing ? fieldMessage(updateMutation.error, "text") : undefined;
              const fieldId = `note-text-${note.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;

              return (
                <article className="mini-note" style={{ marginBottom: 12 }} key={note.id} aria-busy={(editing && updateMutation.isPending) || (confirmingDelete && deleteMutation.isPending)}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`chip ${label.tone}`}>{label.label}</span>
                    <span className="chip">{note.taskTitle}</span>
                    <span className="t-cap num" style={{ marginLeft: "auto" }}>{note.academicYear}학년도</span>
                  </div>

                  {editing && draft ? (
                    <div className="note-editor" data-action-status={updateActionStatus}>
                      <label className="eyebrow" htmlFor={fieldId}>메모 내용</label>
                      <textarea
                        id={fieldId}
                        rows={4}
                        value={draft.body}
                        aria-invalid={Boolean(textError)}
                        aria-describedby={textError ? `${fieldId}-error` : undefined}
                        onChange={(event) => setDraft((current) => current ? { ...current, body: event.target.value } : current)}
                      />
                      {textError && <p className="field-error" id={`${fieldId}-error`} role="alert">{textError}</p>}
                      <label className="eyebrow" htmlFor={`${fieldId}-visibility`}>공개 범위</label>
                      <select
                        id={`${fieldId}-visibility`}
                        value={draft.visibility}
                        onChange={(event) => setDraft((current) => current ? { ...current, visibility: event.target.value as NoteVisibility } : current)}
                      >
                        {Object.entries(VISIBILITY_LABEL).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
                      </select>
                      <div className="note-actions">
                        <button className="btn btn-quiet btn-sm" disabled={updateMutation.isPending} onClick={() => { updateMutation.reset(); setDraft(null); }}>취소</button>
                        <button className="btn btn-primary btn-sm" disabled={!draft.body.trim() || updateMutation.isPending} onClick={() => updateMutation.mutate({ note, body: draft.body, visibility: draft.visibility })}>
                          {updateMutation.isPending ? "저장 중…" : "변경 저장"}
                        </button>
                      </div>
                      {updateIssue && (
                        <IssueState status={getIssueViewStatus(updateIssue, updateMutation.error)} issue={updateIssue} onRecover={updateIssue.recoveryAction === "reload-latest" ? () => { void query.refetch(); } : undefined} />
                      )}
                    </div>
                  ) : <p>{note.body}</p>}

                  {!editing && note.isMine && !confirmingDelete && (
                    <div className="note-actions">
                      <button className="btn btn-quiet btn-sm" onClick={() => { updateMutation.reset(); setDraft({ noteId: note.id, body: note.body, visibility: note.visibility }); }}>표현·공개범위 수정</button>
                      <button className="btn btn-quiet btn-sm" onClick={() => { deleteMutation.reset(); setDeleteConfirmationId(note.id); }}>삭제</button>
                    </div>
                  )}
                  {!editing && !note.isMine && <p className="t-cap">이전 담당자가 전달한 메모는 읽기 전용입니다.</p>}

                  {confirmingDelete && (
                    <div className="notice" role="alert" data-action-status={deleteActionStatus}>
                      <InfoIcon />
                      <span>
                        <strong>이 메모를 삭제할까요?</strong> 삭제한 메모는 현재 세션에서 복구할 수 없습니다.
                        <span className="note-actions">
                          <button className="btn btn-quiet btn-sm" disabled={deleteMutation.isPending} onClick={() => setDeleteConfirmationId(null)}>취소</button>
                          <button className="btn btn-primary btn-sm" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(note)}>{deleteMutation.isPending ? "삭제 중…" : "삭제 확인"}</button>
                        </span>
                      </span>
                    </div>
                  )}
                  {deleteIssue && <IssueState status={getIssueViewStatus(deleteIssue, deleteMutation.error)} issue={deleteIssue} onRecover={deleteIssue.recoveryAction === "reload-latest" ? () => { void query.refetch(); } : undefined} />}
                </article>
              );
            })}
            <div className="notice">
              <InfoIcon />
              <span>현재 저장은 <strong>MOCK_ONLY · 세션 경계</strong>입니다. 최종 전달 승인과 audit는 실제 백엔드 계약 후 적용됩니다.</span>
            </div>
          </>
        )}
      </QueryBoundary>
    </Modal>
  );
}
