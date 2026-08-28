import { SourceTag } from "@/components/ui/SourceTag";
import { InfoIcon } from "@/lib/icons";
import type { EvidenceLink } from "@/domain/types";

const VERIFICATION_LABEL: Record<EvidenceLink["verificationState"], string> = {
  verified: "검증 완료",
  "review-required": "담당자 검토 필요",
  stale: "재검증 필요",
  conflicted: "근거 충돌",
  missing: "근거 누락",
};

function dateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

/** F05 관련 공문·근거 연결: 공문 → 매뉴얼 → 법령/학교사례 체인. */
export function EvidenceChain({ chain, guidelineChangeNotice }: { chain: EvidenceLink[]; guidelineChangeNotice?: string }) {
  return (
    <section className="card card-pad">
      <div className="card-head">
        <span className="lead">
          <h2 className="t-h2">공문 → 매뉴얼 → 법령 연결</h2>
        </span>
      </div>
      {chain.length === 0 ? (
        <p className="t-cap">이 업무에 연결된 근거 문서가 아직 없습니다.</p>
      ) : (
        <div className="chain">
          {chain.map((c, i) => (
            <div className={`chain-i${c.sourceType === "school_case" ? " src-school" : ""}`} key={i}>
              <span className="cl">{c.level}</span>
              <span className="cn">{c.title}</span>
              <span className="cd">{c.detail}</span>
              <dl className="evidence-meta">
                {c.documentNumber && <div><dt>문서번호</dt><dd>{c.documentNumber}</dd></div>}
                {c.issuer && <div><dt>발행기관</dt><dd>{c.issuer}</dd></div>}
                {c.issuedAt && <div><dt>발행일</dt><dd className="num">{dateOnly(c.issuedAt)}</dd></div>}
                {c.pageRange && <div><dt>인용 쪽</dt><dd>{c.pageRange}</dd></div>}
                {c.versionLabel && <div><dt>버전</dt><dd>{c.versionLabel}</dd></div>}
                {c.verifiedAt && <div><dt>검증일</dt><dd className="num">{dateOnly(c.verifiedAt)}</dd></div>}
                {c.verifiedBy && <div><dt>검증자</dt><dd>{c.verifiedBy}</dd></div>}
                <div><dt>검증 상태</dt><dd>{VERIFICATION_LABEL[c.verificationState]}</dd></div>
                <div><dt>원문 상태</dt><dd>{c.originalAvailable ? "연결 가능" : "연결 준비 중"}</dd></div>
              </dl>
              <span style={{ display: "inline-flex", marginTop: 8 }}>
                <SourceTag type={c.sourceType} />
              </span>
            </div>
          ))}
        </div>
      )}
      {guidelineChangeNotice && (
        <div className="notice" style={{ marginTop: 16 }}>
          <InfoIcon />
          <span>
            <strong>작년과 달라진 내용이 있습니다.</strong> {guidelineChangeNotice}
          </span>
        </div>
      )}
    </section>
  );
}
