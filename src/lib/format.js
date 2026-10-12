export function money(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function num(n, dp = 4) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: dp });
}

export function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "moderately_aggressive" -> "Moderately aggressive"
export function human(s) {
  if (!s) return "—";
  const t = String(s).replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Names as seeded by the backend (scripts/_fixtures.py). Codes are the source of truth;
// if the instructor's Appendix E renames a portfolio, only this list needs updating.
export const PORTFOLIOS = [
  { code: "P1", name: "Capital Preservation" },
  { code: "P2", name: "Conservative Income" },
  { code: "P3", name: "Moderately Conservative" },
  { code: "P4", name: "Balanced" },
  { code: "P5", name: "Moderately Aggressive" },
  { code: "P6", name: "Growth" },
  { code: "P7", name: "Aggressive Growth" },
  { code: "P8", name: "Maximum Growth" },
];
export const portfolioName = (code) => PORTFOLIOS.find((p) => p.code === code)?.name || code || "—";
