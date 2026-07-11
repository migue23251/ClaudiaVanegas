/**
 * Timezone helpers for America/Bogota (Colombia, UTC-5, no DST).
 *
 * All "boundary" helpers return UTC Date objects suitable for direct use in
 * SQL WHERE clauses against timestamptz columns.  The key insight:
 *   Bogotá midnight (00:00:00 COT) = 05:00:00 UTC
 *   Bogotá end-of-day (23:59:59.999 COT) = next day 04:59:59.999 UTC
 */

const TZ = "America/Bogota";
const COT_OFFSET_H = 5; // UTC − COT = +5 h

/** Returns an object with year/month(0-based)/day/hour/minute in Bogotá local time. */
export function bogotaNow(): { y: number; m: number; d: number; h: number; min: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value, 10);
  const h = get("hour") === 24 ? 0 : get("hour"); // Intl can return 24 for midnight in some environments
  return { y: get("year"), m: get("month") - 1, d: get("day"), h, min: get("minute") };
}

/** Start of a given month (0-based) in Bogotá, as a UTC Date. */
export function bogotaMonthStart(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 1, COT_OFFSET_H, 0, 0));
}

/** End of a given month (0-based) in Bogotá, as a UTC Date (inclusive, millisecond precision). */
export function bogotaMonthEnd(y: number, m: number): Date {
  // Next month's start in COT minus 1 ms
  return new Date(Date.UTC(y, m + 1, 1, COT_OFFSET_H, 0, 0) - 1);
}

/** Start of a calendar day in Bogotá (00:00:00 COT), as a UTC Date. */
export function bogotaDayStart(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, COT_OFFSET_H, 0, 0));
}

/** End of a calendar day in Bogotá (23:59:59.999 COT), as a UTC Date. */
export function bogotaDayEnd(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d + 1, COT_OFFSET_H, 0, 0) - 1);
}

/** Today's date as a YYYY-MM-DD string in Bogotá timezone. */
export function bogotaToday(): string {
  const { y, m, d } = bogotaNow();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Format a UTC Date/string for display in Bogotá timezone (Spanish Colombia locale). */
export function formatBogota(date: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(date).toLocaleString("es-CO", { timeZone: TZ, ...opts });
}
