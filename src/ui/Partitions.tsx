// Partition strip — utilization of every mount, one card each. Click to explore.
import type { Partition } from "../disk.ts";
import { formatBytes, formatShare, share } from "../format.ts";
import { button, c, card, clip, fill, t, track, usageColor } from "./theme.ts";

type Props = {
  partitions: readonly Partition[];
  selected: string | null;
  onSelect: (mount: string) => void;
};

export function Partitions({ partitions, selected, onSelect }: Props) {
  if (partitions.length === 0) {
    return (
      <div style={{ color: c.dim, fontSize: t.md }}>No partitions found.</div>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        // minmax(0, …) — a long mount name must clip, never widen the grid
        // (that was the phantom horizontal scrollbar).
        gridTemplateColumns: "repeat(auto-fill, minmax(min(15rem, 100%), 1fr))",
        gap: "0.6rem",
      }}
    >
      {partitions.map((p) => {
        const used = share(p.used, p.total);
        const active = p.mount === selected;
        return (
          <button
            key={p.mount}
            type="button"
            t={`partition-${p.mount}`}
            onClick={() => onSelect(p.mount)}
            title={`${p.mount} — ${p.fstype}`}
            style={{
              ...button,
              ...card,
              background: active ? c.panelHi : card.background,
              borderColor: active ? c.accent : c.line,
              color: c.text,
              display: "block",
              width: "100%",
              minWidth: "0",
              overflow: "hidden",
              textAlign: "left",
              padding: "0.7rem 0.85rem",
              fontSize: t.md,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <strong style={{ ...clip, color: active ? c.accent : c.text }}>
                {p.mount}
              </strong>
              <span
                style={{
                  ...clip,
                  color: c.dim,
                  fontSize: t.xs,
                  flex: "0 1 auto",
                }}
              >
                {p.fstype}
              </span>
            </div>
            <div style={{ ...track, margin: "0.55rem 0 0.4rem" }}>
              <div style={fill(used, usageColor(used))} />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
                color: c.dim,
                fontSize: t.sm,
              }}
            >
              <span style={clip}>
                {formatBytes(p.used)} / {formatBytes(p.total)}
              </span>
              <span style={{ color: usageColor(used) }}>
                {formatShare(used)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
