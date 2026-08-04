// The top folders inside the current one — ranked, with a bar relative to the
// biggest of them. Name drills in; "File Manager" hands the folder to the desktop.
import type { Entry } from "../disk.ts";
import { formatBytes, formatShare, share } from "../format.ts";
import { button, c, clip, fill, mono, t, track } from "./theme.ts";

type Props = {
  entries: readonly Entry[];
  /** Size of the partition, for the "x% of disk" column. */
  partitionTotal: number;
  scanning: boolean;
  onOpen: (path: string) => void;
  onReveal: (path: string) => void;
};

const Note = ({ text }: { text: string }) => (
  <div
    style={{
      color: c.dim,
      fontSize: t.md,
      padding: "1.4rem 0",
      textAlign: "center",
    }}
  >
    {text}
  </div>
);

export function Folders(
  { entries, partitionTotal, scanning, onOpen, onReveal }: Props,
) {
  if (scanning) return <Note text="scanning…" />;
  if (entries.length === 0) return <Note text="No sub-folders here." />;

  const biggest = entries[0].size;
  return (
    <div
      t="folders"
      style={{ display: "flex", flexDirection: "column", gap: "2px" }}
    >
      {entries.map((e, i) => (
        <div
          key={e.path}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.7rem",
            padding: "0.45rem 0.6rem",
            borderRadius: "8px",
            background: i % 2 ? "transparent" : "#0f1620",
          }}
        >
          <span
            style={{
              color: c.dim,
              fontFamily: mono,
              fontSize: t.sm,
              width: "1.4rem",
              flex: "0 0 auto",
            }}
          >
            {i + 1}
          </span>
          <button
            type="button"
            t={`open-${e.name}`}
            onClick={() => onOpen(e.path)}
            title={`open ${e.path}`}
            style={{
              ...button,
              ...clip,
              border: "none",
              color: c.text,
              flex: "1 1 6rem",
              textAlign: "left",
              fontSize: t.md,
              padding: "0.2rem 0",
            }}
          >
            {e.name}
          </button>
          <div style={{ ...track, flex: "0 0 8rem" }}>
            <div style={fill(share(e.size, biggest), c.accent)} />
          </div>
          <span
            style={{
              color: c.text,
              fontFamily: mono,
              fontSize: t.sm,
              width: "5.5rem",
              flex: "0 0 auto",
              textAlign: "right",
            }}
          >
            {formatBytes(e.size)}
          </span>
          <span
            style={{
              color: c.dim,
              fontFamily: mono,
              fontSize: t.sm,
              width: "3.2rem",
              flex: "0 0 auto",
              textAlign: "right",
            }}
          >
            {formatShare(share(e.size, partitionTotal))}
          </span>
          <button
            type="button"
            t={`reveal-${e.name}`}
            onClick={() => onReveal(e.path)}
            title={`open ${e.path} in the file manager`}
            style={{ ...button, flex: "0 0 auto" }}
          >
            File Manager
          </button>
        </div>
      ))}
    </div>
  );
}
