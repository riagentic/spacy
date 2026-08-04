// Display helpers — pure, browser-safe.
const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/** 1536 → "1.5 KB". Three significant-ish digits: readable at a glance. */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  const value = bytes / 1024 ** unit;
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
};

/** Share of a whole, clamped to 0–100. */
export const share = (part: number, whole: number): number =>
  whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;

/** 0–100 → "42%". */
export const formatShare = (percent: number): string =>
  `${Math.round(percent)}%`;
