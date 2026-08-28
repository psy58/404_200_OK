import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { saveExperienceNoteMockOnly } from "@/services/notesService";
import { useToast } from "@/state/ToastContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon, CheckIcon } from "@/lib/icons";
import type { NoteVisibility } from "@/domain/types";
import { KIND_LABEL, type CommunityPostKind } from "@/features/notes/communityData";

const VISIBILITY_OPTIONS: { value: NoteVisibility; label: string; hint: string }[] = [
  { value: "private", label: "나만 보기", hint: "연말 검토 전까지 비공개" },
  { value: "handover", label: "후임자 전달", hint: "인수인계 전달 후보" },
  { value: "organization", label: "학교 조직지식", hint: "승인 후 학교에 축적" },
];

/**
 * F10 경험 메모 작성 (최소형, "선생님들의 감"). Save is MOCK_ONLY — see
 * services/notesService.ts — so this never claims real persistence.
 */
export function NoteComposerModal({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const [kind, setKind] = useState<CommunityPostKind>("tip");
  const [visibility, setVisibility] = useState<NoteVisibility>("private");
  const [body, setBody] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: saveExperienceNoteMockOnly,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.notes() });
      onClose();
      toast("저장했습니다 (시연)");
    },
  });

  return (
    <Modal
      titleId="note-modal-title"
      eyebrow="업무에 연결해 공유"
      title="질문·감·자료 남기기"
      description="질문·노하우·자료를 선택한 업무와 함께 나눕니다."
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn-primary"
            disabled={!body.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "연결 중…" : "업무에 연결해 공유"}
          </button>
        </>
      }
    >
      <span className="eyebrow">공유 형식</span>
      <div className="share-kind-grid">
        {(["question", "tip", "resource"] as const).map((value) => (
          <button key={value} className="share-kind" aria-pressed={kind === value} onClick={() => setKind(value)}>
            <b>{KIND_LABEL[value]}</b>
            <span>{value === "question" ? "동료에게 묻고 답을 모아요" : value === "tip" ? "짧은 노하우와 주의사항" : "계획서·가정통신문·체크리스트"}</span>
          </button>
        ))}
      </div>

      <span className="eyebrow" style={{ marginTop: 22 }}>내용</span>
      <textarea
        rows={5}
        style={{
          width: "100%",
          marginTop: 10,
          padding: 14,
          border: "1px solid var(--line)",
          borderRadius: 11,
          resize: "vertical",
          outline: "none",
          fontSize: 14,
          lineHeight: 1.7,
        }}
        placeholder={kind === "question" ? "예: 자기부담금 가정통신문을 어떻게 안내하셨나요?" : "예: 10월 초부터 학부모 문의가 많아져 추천 기준을 미리 자세히 적어 두는 게 좋았어요."}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        data-task-id={taskId}
      />
      <div className="community-fields">
        <label>업무 태그<select defaultValue={taskId ?? "t11"}><option value="t11">영재교육 › 영재학급 선발·배정</option><option value="t2">과학정보 › AI 교육주간 운영</option><option value="t1">과학정보 › 학교정보공시 자료 확정</option></select></label>
        <label>학교급<select defaultValue="초등"><option>초등</option><option>중등</option><option>고등</option></select></label>
        <label>연도<select defaultValue="2026"><option>2026</option><option>2025</option></select></label>
        <label>자료 유형<select defaultValue={kind === "resource" ? "가정통신문" : "업무 팁"}><option>업무 팁</option><option>질문·답변</option><option>계획서</option><option>가정통신문</option><option>체크리스트</option></select></label>
        <label>근거 성격<select defaultValue="경험"><option>공식</option><option>경험</option><option>참고</option></select></label>
      </div>
      <div style={{ marginTop: 20 }}>
        <span className="eyebrow">공개 범위</span>
        <div className="opt-grid" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
          {VISIBILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="opt"
              aria-pressed={visibility === opt.value}
              onClick={() => setVisibility(opt.value)}
            >
              <span className="tick"><CheckIcon /></span>
              <span className="ot">{opt.label}</span>
              <span className="om">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="notice" style={{ marginTop: 18 }}>
        <InfoIcon />
        <span>
          학생·학부모·교직원을 특정할 수 있는 표현은 저장 전 검사합니다. 민감한 내용은 <strong>나만 보기</strong>로
          남기고 연말 검토에서 다시 판단하세요.
        </span>
      </div>
    </Modal>
  );
}
