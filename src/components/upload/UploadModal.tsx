import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { prepareUpload } from "@/services/uploadService";
import { useAssignment } from "@/state/AssignmentContext";
import { getSafeErrorMessage } from "@/services/errorPresentation";
import { InfoIcon, FileIcon, UploadIcon } from "@/lib/icons";

const STEPS = ["선택", "업로드", "안전 확인", "내용 읽기", "분석", "검토"] as const;

/** Actual multipart upload wired through the V2 runtime boundary; background processing remains explicit. */
export function UploadModal({ onClose }: { onClose: () => void }) {
  const { context } = useAssignment();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const mutation = useMutation({
    mutationFn: (selected: File[]) => {
      if (!context) throw new Error("담당 업무 맥락을 먼저 확인해 주세요.");
      return prepareUpload(context, selected);
    },
  });

  function selectFiles(selected: FileList | null) {
    const next = Array.from(selected ?? []);
    if (next.length === 0) return;
    setFiles(next);
    mutation.mutate(next);
  }

  const result = mutation.data;
  const issue = result?.issue;
  return (
    <Modal
      titleId="upload-modal-title"
      wide
      eyebrow="파일 업로드·분석"
      title="문서 업로드·분석"
      description="분석 결과는 사람이 승인하기 전까지 초안이며, 자동으로 확정 업무가 되지 않습니다."
      onClose={onClose}
      footer={<button className="btn btn-quiet" onClick={onClose}>닫기</button>}
    >
      <div className="steps" style={{ marginBottom: 18 }} aria-live="polite">
        {STEPS.map((step, index) => <span key={step} className={`s ${index === 0 ? "on" : ""}`}>{step}</span>)}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept=".hwp,.pdf,.docx,.xlsx,.csv,.zip"
        onChange={(event) => selectFiles(event.target.files)}
      />
      <div
        className={`drop${dragOver ? " over" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragOver(false); }}
        onDrop={(event) => { event.preventDefault(); setDragOver(false); selectFiles(event.dataTransfer.files); }}
      >
        <UploadIcon width={30} height={30} stroke="#2C6DAE" strokeWidth={1.7} />
        <p className="t-h2" style={{ margin: "12px 0 5px" }}>에듀파인에서 받은 파일을 여기에 놓으세요</p>
        <p className="t-cap">HWP · PDF · DOCX · XLSX · CSV · ZIP · 업로드 후 서버에서 변환·분석합니다</p>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => inputRef.current?.click()} disabled={mutation.isPending}>
          {mutation.isPending ? "서버로 전송 중…" : "파일 선택"}
        </button>
      </div>
      {files.map((file) => (
        <div className="frow" key={`${file.name}:${file.lastModified}`}>
          <span className="fic"><FileIcon /></span>
          <span><span className="fn">{file.name}</span><span className="fm">{Math.ceil(file.size / 1024).toLocaleString()} KB</span></span>
          <span className="chip">{result?.status === "disabled" ? "전송 안 함" : mutation.isPending ? "전송 중" : result?.state === "failed" ? "처리 실패" : result ? "서버 접수·처리 중" : "선택됨"}</span>
        </div>
      ))}
      {(issue || mutation.isError) && (
        <div className="notice" style={{ marginTop: 18 }} role="alert">
          <InfoIcon />
          <span><strong>{issue?.title ?? "업로드를 시작하지 못했습니다."}</strong> {issue?.userMessage ?? getSafeErrorMessage(mutation.error)}</span>
        </div>
      )}
      <div className="notice" style={{ marginTop: 18 }}>
        <InfoIcon />
        <span><strong>개인정보 주의.</strong> 파일 본문은 브라우저 저장소나 로그에 저장하지 않습니다. 서버 검사·격리 계약이 없으면 전송을 시작하지 않습니다.</span>
      </div>
    </Modal>
  );
}
