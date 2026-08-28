import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/state/ToastContext";
import { InfoIcon, FileIcon, UploadIcon } from "@/lib/icons";
import { useAssignment } from "@/state/AssignmentContext";
import { clearDraft, readDraft } from "@/state/hakmatongDemo";
import { createAssignment } from "@/services/assignmentsService";
import { getUploads, uploadDocument } from "@/services/uploadsService";
import type { RawUploadRecord } from "@/domain/raw-schemas";

const STEPS = ["선택", "업로드", "안전 확인", "내용 읽기", "분석", "검토"] as const;

interface UploadRow {
  file: File;
  record?: RawUploadRecord;
  error?: string;
}

const STATUS_LABEL: Record<RawUploadRecord["status"], string> = {
  received: "처리 중",
  analyzed: "분석 완료",
  indexed: "색인 완료",
  failed: "처리 실패",
};

/**
 * F04 파일 전체 업로드·분석 (MVP P0 per 영상 지시서/구현 보충안 §2, §7).
 * SPEC_ALIGNMENT_REQUIRED against docs/01 §7.1's metadata-only MVP — see
 * docs/requirements-traceability-design.md §2. 디자인의 단계·상태 표현은
 * 유지하고 실제 업로드·변환·분할·색인 상태만 서비스 계층에서 받는다.
 */
export function UploadModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [serverNote, setServerNote] = useState("");
  const [savingDuty, setSavingDuty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const { toast } = useToast();
  const { refreshCustomAssignments } = useAssignment();
  const draft = readDraft();
  const isNewDutyFlow = !!draft;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  async function runUpload(selectedFiles: File[]) {
    if (selectedFiles.length === 0) return;
    const workingRows: UploadRow[] = selectedFiles.map((file) => ({ file }));
    setRows(workingRows);
    setStep(1);
    setServerNote("");

    for (let index = 0; index < workingRows.length; index += 1) {
      try {
        const record = await uploadDocument(workingRows[index].file);
        workingRows[index] = { ...workingRows[index], record };
        setServerNote(record.note);
      } catch (error) {
        workingRows[index] = { ...workingRows[index], error: (error as Error).message };
      }
      if (mountedRef.current) setRows([...workingRows]);
    }

    if (!mountedRef.current) return;
    setStep(3);
    const uploadedIds = workingRows.flatMap((row) => row.record ? [row.record.id] : []);

    for (let attempt = 0; attempt < 20 && uploadedIds.length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      if (!mountedRef.current) return;
      try {
        const records = await getUploads();
        const byId = new Map(records.map((record) => [record.id, record]));
        for (let index = 0; index < workingRows.length; index += 1) {
          const id = workingRows[index].record?.id;
          const record = id ? byId.get(id) : undefined;
          if (record) {
            workingRows[index] = { ...workingRows[index], record };
            if (record.note) setServerNote(record.note);
          }
        }
        setRows([...workingRows]);
        const statuses = workingRows.flatMap((row) => row.record ? [row.record.status] : []);
        if (statuses.some((status) => status === "analyzed" || status === "indexed")) setStep(4);
        if (statuses.length === uploadedIds.length && statuses.every((status) => status !== "received")) break;
      } catch (error) {
        setServerNote((error as Error).message);
        break;
      }
    }

    if (!mountedRef.current) return;
    setStep(5);
    const savedCount = workingRows.filter((row) => row.record && row.record.status !== "failed").length;
    toast(`${savedCount}/${workingRows.length}개 파일을 서버에서 처리했습니다`);
  }

  const pct = Math.min(100, step * 20);
  const sizeLabel = (size: number) => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  const finishNewDuty = async () => {
    if (!draft || savingDuty) return;
    setSavingDuty(true);
    try {
      const month = String(draft.assignedMonth).padStart(2, "0");
      const assignment = await createAssignment({
        name: draft.name,
        activeFrom: `${draft.assignedYear}-${month}-01`,
        note: `${draft.assignedMonth}월부터 새로 담당`,
      });
      refreshCustomAssignments(assignment.id);
      clearDraft();
      onClose();
      toast(`${draft.name} 업무를 추가했습니다`);
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setSavingDuty(false);
    }
  };

  return (
    <Modal
      titleId="upload-modal-title"
      wide
      eyebrow={isNewDutyFlow ? `${draft?.name} · ${draft?.assignedYear}년 ${draft?.assignedMonth}월부터 담당` : "파일 업로드·분석"}
      title={isNewDutyFlow ? "관련 자료를 추가해주세요" : "문서 업로드·분석"}
      description={isNewDutyFlow ? "기존에 받은 공문이나 전임자 자료가 있다면 올려주세요. GAM이 업무 흐름을 정리해드릴게요." : "분석 결과는 사람이 승인하기 전까지 초안이며, 자동으로 확정 업무가 되지 않습니다."}
      onClose={onClose}
      footer={
        <>
          {step > 0 && step < 5 && (
            <button className="btn btn-quiet" onClick={onClose}>
              취소
            </button>
          )}
          {step >= 5 && (
            <>
              <button className="btn btn-quiet" onClick={onClose}>
                나중에 검토
              </button>
              <button
                className="btn btn-primary"
                disabled={savingDuty}
                onClick={() => {
                  if (isNewDutyFlow) finishNewDuty(); else { onClose(); toast("초안 검토를 완료했습니다"); }
                }}
              >
                {isNewDutyFlow ? "업무 감 잡기" : "초안 검토 완료"}
              </button>
            </>
          )}
        </>
      }
    >
      <div className="steps" style={{ marginBottom: 18 }} aria-live="polite">
        {STEPS.map((s, i) => (
          <span key={s} className={`s ${i < step ? "ok" : i === step ? "on" : ""}`}>
            {s}
          </span>
        ))}
      </div>

      {step === 0 ? (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".hwp,.hwpx,.pdf,.docx,.xlsx,.xls,.csv,.zip"
            style={{ display: "none" }}
            onChange={(event) => runUpload(Array.from(event.target.files ?? []))}
          />
          <div
            className={`drop${dragOver ? " over" : ""}`}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); runUpload(Array.from(e.dataTransfer.files)); }}
          >
            <UploadIcon width={30} height={30} stroke="#2C6DAE" strokeWidth={1.7} />
            <p className="t-h2" style={{ margin: "12px 0 5px" }}>{isNewDutyFlow ? "PDF 파일을 여기로 끌어다 놓기" : "에듀파인에서 받은 파일을 여기에 놓으세요"}</p>
            <p className="t-cap">{isNewDutyFlow ? "PDF · 내가 추가한 자료" : "HWP · PDF · DOCX · XLSX · CSV · ZIP · 파일당 20MB · 최대 30개"}</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => inputRef.current?.click()}>
              파일 선택
            </button>
          </div>
          <div className="notice" style={{ marginTop: 18 }}>
            <InfoIcon />
            <span>
              <strong>개인정보 주의.</strong> 학생·교직원 명단, 인사 자료, 민원 당사자 정보가 포함된 문서는 올리지
              마세요. 파일은 서버에서 검사·격리 후 처리되며 본문은 브라우저에 저장하지 않습니다.
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="t-h2">파일 {rows.length}개</span>
            <span className="t-cap num">{pct}% · {STEPS[Math.min(step, 5)]}</span>
          </div>
          <div className="prog" style={{ margin: "10px 0 14px" }}>
            <span className="bar"><i style={{ width: `${pct}%` }} /></span>
          </div>
          {rows.map((row) => (
            <div className="frow" key={`${row.file.name}-${row.file.size}`}>
              <span className="fic"><FileIcon /></span>
              <span>
                <span className="fn">{row.file.name}</span>
                <span className="fm">{sizeLabel(row.file.size)}{row.error ? ` · ${row.error}` : ""}</span>
              </span>
              <span className={`chip ${row.error || row.record?.status === "failed" ? "warn" : row.record?.status === "analyzed" || row.record?.status === "indexed" ? "ok" : ""}`}>
                {row.error ? "실패" : row.record ? STATUS_LABEL[row.record.status] : "업로드 중"}
              </span>
            </div>
          ))}

          {step >= 5 && (
            <>
              <div className="divider" />
              <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 14 }}>
                <span className="t-h2">{isNewDutyFlow ? `${draft?.name} 업무 자료를 처리했어요` : "문서 처리 결과"}</span>
                <span className="chip warn">검토 필요</span>
              </div>
              {rows.map((row) => (
                <div className="draft" key={`result-${row.file.name}-${row.file.size}`}>
                  <div className="dt">{row.file.name}</div>
                  <div className="dm">{row.error ?? row.record?.note ?? (serverNote || "서버 처리 결과를 확인해 주세요.")}</div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
