// UI — export default; the framework mounts it. Cell reads here are reactive
// (dep/aio/docs/state/the-bridge.md), so the view follows the scans by itself.
import { disk } from "./cell.ts";
import { parentOf, trailOf } from "./disk.ts";
import { formatBytes } from "./format.ts";
import { Folders } from "./ui/Folders.tsx";
import { Partitions } from "./ui/Partitions.tsx";
import { Trail } from "./ui/Trail.tsx";
import { button, c, card, clip, t } from "./ui/theme.ts";

export default function App() {
  const { mount, path, partitions, entries, scanning, error } = disk;
  const partition = partitions.find((p) => p.mount === mount) ?? null;
  const up = mount && path ? parentOf(path, mount) : null;

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        background: c.bg,
        color: c.text,
        font: `${t.md}/1.5 system-ui, sans-serif`,
        padding: "1rem 1.1rem 1.2rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.7rem",
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{ margin: "0", fontSize: t.xl, letterSpacing: "0.01em" }}
        >
          spacy<span style={{ color: c.accent }}>.</span>
        </h1>
        <span style={{ ...clip, color: c.dim, fontSize: t.sm, flex: "1 1 0" }}>
          {scanning ? `scanning ${path}…` : "where your disk space went"}
        </span>
        {scanning && (
          <button
            type="button"
            t="cancel"
            onClick={() => disk.cancel()}
            style={button}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          t="refresh"
          onClick={() => disk.refresh()}
          style={button}
        >
          ⟳ Refresh
        </button>
      </header>

      <Partitions
        partitions={partitions}
        selected={mount}
        onSelect={(m) => disk.open(m)}
      />

      {error && (
        <div
          t="error"
          style={{
            ...card,
            borderColor: c.danger,
            color: c.danger,
            padding: "0.6rem 0.8rem",
            fontSize: t.sm,
          }}
        >
          {error}
        </div>
      )}

      {path && mount
        ? (
          <section
            style={{
              ...card,
              padding: "0.8rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.7rem",
            }}
          >
            <Trail
              trail={trailOf(path, mount)}
              onOpen={(p) => disk.open(p)}
              onUp={up ? () => disk.open(up) : null}
              onReveal={() => disk.reveal(path)}
            />
            <Folders
              entries={entries}
              partitionTotal={partition?.total ?? 0}
              scanning={scanning}
              onOpen={(p) => disk.open(p)}
              onReveal={(p) => disk.reveal(p)}
            />
          </section>
        )
        : (
          <div style={{ color: c.dim, fontSize: t.md, padding: "0.5rem 0" }}>
            Pick a partition to see the folders eating it.
          </div>
        )}

      <footer style={{ marginTop: "auto", color: c.dim, fontSize: t.xs }}>
        Read-only — spacy measures and shows{partition
          ? `, ${formatBytes(partition.free)} free on ${partition.mount}`
          : ""}. It never deletes anything.
      </footer>
    </div>
  );
}
