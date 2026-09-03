// en-GB abbreviates September to "Sept" — four letters where every other month
// is three, which ragged-edges every dated column in the app. Trim the month
// part rather than switching locale, which would flip the day/month order.
function trimMonth(fmt: Intl.DateTimeFormat, d: Date): string {
  return fmt
    .formatToParts(d)
    .map((p) => (p.type === "month" ? p.value.slice(0, 3) : p.value))
    .join("");
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const DAY_WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short", day: "2-digit", month: "short",
});

/** "02 Sep" — the app's standard short date. */
export function fmtDay(d: string | number | Date): string {
  return trimMonth(DAY, new Date(d));
}

/** "Wed 02 Sep" — for the calendar tooltip. */
export function fmtDayWeekday(d: string | number | Date): string {
  return trimMonth(DAY_WEEKDAY, new Date(d));
}
