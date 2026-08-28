import { InfoIcon } from "@/lib/icons";
import { daysBetween, daysUntil, formatFull, parseISODate } from "@/lib/dates";
import type { TimelineEvent } from "@/domain/types";

/** F06 전년도 처리 사례 — 시간순 실제 수행 단계. */
export function PreviousTimeline({ events, officialDueDate }: { events: TimelineEvent[]; officialDueDate: string }) {
  if (events.length === 0) {
    return (
      <section className="card card-pad">
        <div className="card-head">
          <span className="lead"><h2 className="t-h2">전년도 처리 순서</h2></span>
        </div>
        <p className="t-cap">전년도 처리 사례가 아직 기록되지 않았습니다.</p>
      </section>
    );
  }

  const span = daysBetween(parseISODate(events[0].date), parseISODate(events[events.length - 1].date));

  return (
    <section className="card card-pad">
      <div className="card-head">
        <span className="lead"><h2 className="t-h2">전년도 처리 순서</h2></span>
      </div>
      <div className="tl">
        {events.map((e, i) => (
          <div className="tl-i" key={i}>
            <div className="d">{formatFull(e.date).replaceAll(".", ".")}</div>
            <div className="x">{e.event}</div>
          </div>
        ))}
      </div>
      <div className="notice flat" style={{ marginTop: 10 }}>
        <InfoIcon />
        <span>
          접수부터 제출까지 <b className="num">{span}일</b>이 걸렸습니다. 오늘 기준 남은 기간은{" "}
          <b className="num">{daysUntil(officialDueDate)}일</b>입니다.
        </span>
      </div>
    </section>
  );
}
