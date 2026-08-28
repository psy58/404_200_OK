import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/state/ToastContext";
import { InfoIcon, FileIcon, UploadIcon } from "@/lib/icons";

const STEPS = ["선택", "업로드", "서버 검사", "파싱", "분석", "검토 필요"] as const;
const MOCK_FILES = [
  { name: "2025_과학정보부_기안문서목록.xlsx", size: "248 KB" },
  { name: "2025_AI교육주간_운영계획.hwp", size: "1.4 MB" },
  { name: "2025_접수문서목록.csv", size: "86 KB" },
];

/**
 * F04 파일 전체 업로드·분석 (MVP P0 per 영상 지시서/구현 보충안 §2, §7).
 * SPEC_ALIGNMENT_REQUIRED against docs/01 §7.1's metadata-only MVP — see
 * docs/requirements-traceability-design.md §2. Every stage here is a client
 * simulation; there is no real upload/scan/parse/analyze backend
 * (BACKEND_CONTRACT_REQUIRED), so nothing here is reported as delivered
 * server behavior.
 */
export function UploadModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const { toast } = useToast();

  useEffect(() => () => clearInterval(timerRef.current), []);

  function runUpload() {
    clearInterval(timerRef.current);
    setStep(1);
    timerRef.current = setInterval(() => {
      setStep((s) => {
        const next = s + 1;
        if (next >= 5) {
          clearInterval(timerRef.current);
          return 5;
        }
        return next;
      });
    }, 900);
  }

  const pct = Math.min(100, step * 20);

  return (
    <Modal
      titleId="upload-modal-title"
      wide
      eyebrow="파일 업로드·분석"
      title="문서 업로드·분석"
      description="분석 결과는 사람이 승인하기 전까지 초안이며, 자동으로 확정 업무가 되지 않습니다."
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
                onClick={() => {
                  onClose();
                  toast("초안 검토를 완료했습니다");
                }}
              >
                초안 검토 완료
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
          <div
            className={`drop${dragOver ? " over" : ""}`}
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); runUpload(); }}
          >
            <UploadIcon width={30} height={30} stroke="#2C6DAE" strokeWidth={1.7} />
            <p className="t-h2" style={{ margin: "12px 0 5px" }}>에듀파인에서 받은 파일을 여기에 놓으세요</p>
            <p className="t-cap">HWP · PDF · DOCX · XLSX · CSV · ZIP · 파일당 20MB · 최대 30개</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={runUpload}>
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
            <span className="t-h2">파일 3개</span>
            <span className="t-cap num">{pct}% · {STEPS[Math.min(step, 5)]}</span>
          </div>
          <div className="prog" style={{ margin: "10px 0 14px" }}>
            <span className="bar"><i style={{ width: `${pct}%` }} /></span>
          </div>
          {MOCK_FILES.map((f, i) => (
            <div className="frow" key={f.name}>
              <span className="fic"><FileIcon /></span>
              <span>
                <span className="fn">{f.name}</span>
                <span className="fm">{f.size}</span>
              </span>
              <span className={`chip ${step >= 5 ? (i === 2 ? "warn" : "ok") : ""}`}>
                {step >= 5 ? (i === 2 ? "검토 필요" : "완료") : step >= 1 ? "처리 중" : "대기"}
              </span>
            </div>
          ))}

          {step >= 5 && (
            <>
              <div className="divider" />
              <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 14 }}>
                <span className="t-h2">AI 분석 초안</span>
                <span className="chip warn">승인 전 초안</span>
              </div>
              <div className="draft">
                <div className="dt">새 업무 후보 · AI 교육주간 운영</div>
                <div className="dm">
                  문서 4건이 같은 업무로 묶였습니다. 전년도 처리 시점은 2025.08.24, 공식 마감은 접수 공문 기준 09.02로{" "}
                  <strong>추정</strong>되었습니다. 확인이 필요합니다.
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      onClose();
                      toast("초안 검토를 완료했습니다");
                    }}
                  >
                    업무로 등록
                  </button>
                  <button className="btn btn-quiet btn-sm">수정</button>
                  <button className="btn btn-quiet btn-sm">제외</button>
                </div>
              </div>
              <div className="draft">
                <div className="dt">연결 실패 · 2025_접수문서목록.csv 3행</div>
                <div className="dm">문서번호 형식이 인식되지 않아 업무에 연결하지 못했습니다. 원본을 확인하고 다시 시도하세요.</div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button className="btn btn-quiet btn-sm">다시 시도</button>
                  <button className="btn btn-quiet btn-sm">건너뛰기</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
