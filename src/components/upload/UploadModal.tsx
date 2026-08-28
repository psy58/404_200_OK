import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { getUploads, uploadDocument } from "@/services/uploadsService";
import { useToast } from "@/state/ToastContext";
import { useAssignment } from "@/state/AssignmentContext";
import { clearDraft, createHakmatongDuty, readDraft } from "@/state/hakmatongDemo";
import { createAssignment } from "@/services/assignmentsService";
import { InfoIcon, FileIcon, UploadIcon } from "@/lib/icons";
import type { RawUploadRecord } from "@/domain/raw-schemas";

type RowState = { name: string; size: number; status: string; recordId?: string; error?: string };

const SERVER_STATUS_LABEL: Record<string, string> = {
  received: "변환 중",
  analyzed: "분석됨 · 문서함 반영",
  indexed: "색인됨 · 검색 반영",
  failed: "실패",
};

/**
 * F04 문서 업로드 — 파일이 실제로 백엔드(data/uploads/)에 저장된다.
 * 정직한 범위: 저장·접수 기록까지가 이 화면의 일이고, 분석·색인은 백엔드의
 * 인제스트 파이프라인을 돌릴 때 반영된다(업로드 응답의 note가 그 사실을 말한다).
 */
export function UploadModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [phase, setPhase] = useState<"pick" | "uploading" | "done">("pick");
  const [serverNote, setServerNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  // 학맞통 시연: 새 담당 업무 추가 중이면 업로드가 그 흐름의 마지막 단계다.
  const { refreshCustomAssignments } = useAssignment();
  const draft = readDraft();
  const isNewDutyFlow = !!draft;
  const finishNewDuty = async () => {
    if (!draft) return;
    // 학맞통 리허설 데모는 그대로 두고, 그 밖의 이름은 전부 백엔드에 실제로 만든다.
    // 예전엔 학맞통이 아니면 아무 일도 없이 끝났다 — 그래서 "추가해도 안 나오던" 것.
    if (createHakmatongDuty(draft)) {
      refreshCustomAssignments();
    } else {
      try {
        const month = String(draft.assignedMonth).padStart(2, "0");
        const duty = await createAssignment({
          name: draft.name,
          activeFrom: `${draft.assignedYear}-${month}-01`,
          note: `${draft.assignedMonth}월부터 새로 담당`,
        });
        refreshCustomAssignments(duty.id);
      } catch (error) {
        toast((error as Error).message);
        return;
      }
    }
    clearDraft();
    onClose();
    toast(`${draft.name} 업무를 추가했습니다. 업무 카드는 "새 업무 추가"로 만들 수 있어요.`);
  };

  async function run(files: File[]) {
    if (!files.length) return;
    setPhase("uploading");
    setRows(files.map((f) => ({ name: f.name, size: f.size, status: "대기" })));

    let saved = 0;
    for (let i = 0; i < files.length; i += 1) {
      setRows((r) => r.map((row, j) => (j === i ? { ...row, status: "업로드 중" } : row)));
      try {
        const record: RawUploadRecord = await uploadDocument(files[i]);
        saved += 1;
        setServerNote(record.note);
        setRows((r) => r.map((row, j) => (j === i ? { ...row, status: "저장됨", recordId: record.id } : row)));
      } catch (err) {
        setRows((r) =>
          r.map((row, j) => (j === i ? { ...row, status: "실패", error: (err as Error).message } : row)),
        );
      }
    }
    setPhase("done");
    toast(`${saved}/${files.length}개 파일을 서버에 저장했습니다`);
  }

  // 변환·색인은 배경에서 진행된다. done 상태 동안 서버 상태를 따라가 칩을 갱신한다.
  useEffect(() => {
    if (phase !== "done") return;
    let stopped = false;
    const tick = async () => {
      try {
        const records = await getUploads();
        if (stopped) return;
        setRows((r) =>
          r.map((row) => {
            const record = records.find((x) => x.id === row.recordId);
            if (!record) return row;
            if (record.note) setServerNote(record.note);
            return { ...row, status: SERVER_STATUS_LABEL[record.status] ?? record.status, error: record.status === "failed" ? record.note : row.error };
          }),
        );
        const pending = records.some((x) => rowsHave(x.id) && (x.status === "received"));
        if (!pending) clearInterval(timer);
      } catch {
        /* 폴링 실패는 조용히 넘어간다 */
      }
    };
    const rowsHave = (id: string) => rows.some((r) => r.recordId === id);
    const timer = setInterval(tick, 1500);
    tick();
    return () => { stopped = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const sizeLabel = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const doneCount = rows.filter((r) => r.status !== "대기" && r.status !== "업로드 중" && r.status !== "실패").length;

  return (
    <Modal
      titleId="upload-modal-title"
      wide
      eyebrow={isNewDutyFlow ? `${draft?.name} · ${draft?.assignedYear}년 ${draft?.assignedMonth}월부터 담당` : "문서 업로드"}
      title={isNewDutyFlow ? "관련 자료를 추가해주세요" : "문서 업로드"}
      description="파일은 서버에 저장되며, 변환·분할·색인이 배경에서 진행됩니다."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            {phase === "done" ? "닫기" : "취소"}
          </button>
          {phase === "done" && isNewDutyFlow && (
            <button className="btn btn-primary" onClick={finishNewDuty}>
              업무 추가 완료
            </button>
          )}
          {phase === "done" && !isNewDutyFlow && (
            <button className="btn btn-primary" onClick={() => { setPhase("pick"); setRows([]); }}>
              더 올리기
            </button>
          )}
        </>
      }
    >
      {phase === "pick" ? (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".hwp,.hwpx,.pdf,.docx,.xlsx,.xls,.csv,.zip"
            style={{ display: "none" }}
            onChange={(e) => run(Array.from(e.target.files ?? []))}
          />
          <div
            className={`drop${dragOver ? " over" : ""}`}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); run(Array.from(e.dataTransfer.files)); }}
          >
            <UploadIcon width={30} height={30} stroke="#2C6DAE" strokeWidth={1.7} />
            <p className="t-h2" style={{ margin: "12px 0 5px" }}>에듀파인에서 받은 파일을 여기에 놓으세요</p>
            <p className="t-cap">HWP · HWPX · PDF · DOCX · XLSX · CSV · ZIP</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => inputRef.current?.click()}>
              파일 선택
            </button>
          </div>
          <div className="notice" style={{ marginTop: 18 }}>
            <InfoIcon />
            <span>
              <strong>개인정보 주의.</strong> 학생·교직원 명단, 인사 자료, 민원 당사자 정보가 포함된 문서는 올리지
              마세요.
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="t-h2">파일 {rows.length}개</span>
            <span className="t-cap num">{doneCount}/{rows.length} 저장됨</span>
          </div>
          <div className="prog" style={{ margin: "10px 0 14px" }}>
            <span className="bar"><i style={{ width: `${rows.length ? (doneCount / rows.length) * 100 : 0}%` }} /></span>
          </div>
          {rows.map((f) => (
            <div className="frow" key={f.name}>
              <span className="fic"><FileIcon /></span>
              <span>
                <span className="fn">{f.name}</span>
                <span className="fm">{sizeLabel(f.size)}{f.error ? ` · ${f.error}` : ""}</span>
              </span>
              <span className={`chip ${f.status.startsWith("색인") || f.status.startsWith("분석") || f.status === "저장됨" ? "ok" : f.status === "실패" ? "warn" : ""}`}>{f.status}</span>
            </div>
          ))}
          {phase === "done" && serverNote && (
            <div className="notice info" style={{ marginTop: 16 }}>
              <InfoIcon />
              <span>{serverNote}</span>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
