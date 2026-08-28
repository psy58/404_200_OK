/**
 * Date helpers ported from the approved gam_dashboard_desktop.html demo.
 * TODAY is fixed for the demo/mock backend, matching the original fixture
 * data (2026-08-28). A real backend integration should read the server or
 * client clock instead of this constant.
 */

export const TODAY = new Date(2026, 7, 28);

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** `8.31` style short format used in list rows. */
export function formatShort(s: string): string {
  const d = parseISODate(s);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

/** `2026.08.31` style full format used in detail/legend views. */
export function formatFull(s: string): string {
  const d = parseISODate(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Days from TODAY until the given ISO date (negative = already past). */
export function daysUntil(s: string): number {
  return daysBetween(TODAY, parseISODate(s));
}

export const MONTHS = ["3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월", "1월", "2월"];
