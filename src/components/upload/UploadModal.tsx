import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { uploadDocument } from "@/services/uploadsService";
import { useToast } from "@/state/ToastContext";
import { InfoIcon, FileIcon, UploadIcon } from "@/lib/icons";
import type { RawUploadRecord } from "@/domain/raw-schemas";

type RowState = { name: string; size: number; status: "대기" | "업로드 중" | "저장됨" | "실패"; error?: string };

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
        setRows((r) => r.map((row, j) => (j === i ? { ...row, status: "저장됨" } : row)));
      } catch (err) {
        setRows((r) =>
          r.map((row, j) => (j === i ? { ...row, status: "실패", error: (err as Error).message } : row)),
        );
      }
    }
    setPhase("done");
    toast(`${saved}/${files.length}개 파일을 서버에 저장했습니다`);
  }

  const sizeLabel = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const doneCount = rows.filter((r) => r.status === "저장됨").length;

  return (
    <Modal
      titleId="upload-modal-title"
      wide
      eyebrow="문서 업로드"
      title="문서 업로드"
      description="파일은 서버에 저장되며, 분석·색인은 다음 인제스트 실행 때 문서함과 검색에 반영됩니다."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            {phase === "done" ? "닫기" : "취소"}
          </button>
          {phase === "done" && (
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
              <span className={`chip ${f.status === "저장됨" ? "ok" : f.status === "실패" ? "warn" : ""}`}>{f.status}</span>
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
