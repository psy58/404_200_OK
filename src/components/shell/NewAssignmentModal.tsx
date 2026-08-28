import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { saveDraft } from "@/state/hakmatongDemo";

export function NewAssignmentModal({ onClose, onNext }: { onClose: () => void; onNext: () => void }) {
  const [name, setName] = useState("");
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(8);
  const canContinue = !!name.trim() && !!year && !!month;
  return <Modal titleId="new-assignment-title" eyebrow="담당 업무 추가" title="새로운 업무 추가" description="새로 맡게 된 업무와 시작 시점을 알려주세요." onClose={onClose} footer={<><button className="btn btn-quiet" onClick={onClose}>취소</button><button className="btn btn-primary" disabled={!canContinue} onClick={() => { saveDraft({ name, assignedYear: year, assignedMonth: month }); onNext(); }}>다음</button></>}>
    <div className="new-duty-fields">
      <label>업무명<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="예) 학생맞춤통합지원" /></label>
      <label>업무 시작 시기<span className="new-duty-date"><select value={year} onChange={(event) => setYear(Number(event.target.value))}><option value={2026}>2026년</option></select><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}월</option>)}</select></span></label>
    </div>
  </Modal>;
}
