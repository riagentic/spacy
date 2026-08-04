// Breadcrumb — where you are, and one click back to anywhere above.
import type { Entry } from "../disk.ts";
import { button, c, t } from "./theme.ts";

type Props = {
  trail: readonly Entry[];
  onOpen: (path: string) => void;
  onUp: (() => void) | null;
  onReveal: () => void;
};

export function Trail({ trail, onOpen, onUp, onReveal }: Props) {
  const here = trail.length - 1;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        t="up"
        onClick={() => onUp?.()}
        disabled={onUp === null}
        style={{
          ...button,
          opacity: onUp ? "1" : "0.35",
          cursor: onUp ? "pointer" : "default",
        }}
      >
        ↑ Up
      </button>
      {trail.map((seg, i) => (
        <span
          key={seg.path}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          {i > 0 && <span style={{ color: c.line }}>›</span>}
          <button
            type="button"
            onClick={() => onOpen(seg.path)}
            style={{
              ...button,
              border: "none",
              padding: "0.25rem 0.2rem",
              color: i === here ? c.text : c.dim,
              fontSize: t.md,
            }}
          >
            {seg.name}
          </button>
        </span>
      ))}
      <button
        type="button"
        t="reveal-here"
        onClick={onReveal}
        style={{ ...button, marginLeft: "auto" }}
      >
        File Manager
      </button>
    </div>
  );
}
