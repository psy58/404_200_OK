import { SourceTag } from "@/components/ui/SourceTag";
import { InfoIcon } from "@/lib/icons";
import type { EvidenceLink } from "@/domain/types";

/** F05 관련 공문·근거 연결: 공문 → 매뉴얼 → 법령/학교사례 체인. */
export function EvidenceChain({ chain, guidelineChangeNotice }: { chain: EvidenceLink[]; guidelineChangeNotice?: string }) {
  return (
    <section className="card card-pad">
      <div className="card-head">
        <span className="lead">
          <h2 className="t-h2">공문 → 매뉴얼 → 법령 연결</h2>
        </span>
        <span className="t-cap">여러 사이트를 따라다니지 않아도 됩니다</span>
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
