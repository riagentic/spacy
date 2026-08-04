// Cell — the whole app state; UI and server both import from here.
// Methods run on the server (dep/aio/docs/state/the-bridge.md), which is why
// the Deno-only IO is dynamic-imported from ./disk.server.ts.
//
// SAFETY (.katana/app.md): spacy is an analyzer. There is deliberately NO
// method here that deletes, moves, truncates or writes anything — the only
// verbs are measure (`refresh`, `open`) and show (`reveal`).
import { cell } from "aio";
import { type Entry, mountOf, type Partition, TOP_N } from "./disk.ts";

type DiskState = {
  partitions: Partition[];
  /** Mount of the partition being explored. */
  mount: string | null;
  /** Folder currently shown — the partition root, or anywhere below it. */
  path: string | null;
  /** The TOP_N biggest folders directly inside `path`, largest first. */
  entries: Entry[];
  scanning: boolean;
  error: string | null;
};

const initial: DiskState = {
  partitions: [],
  mount: null,
  path: null,
  entries: [],
  scanning: false,
  error: null,
};

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export const disk = cell("disk", {
  // Live facts about the disk right now — a restored snapshot would only ever
  // be stale, so nothing here is worth persisting.
  persist: "none",
  state: initial,
  methods: {
    /** Re-measure every partition. Keeps the current folder if it still exists. */
    async refresh(s: DiskState) {
      s.error = null;
      try {
        const io = await import("./disk.server.ts");
        s.partitions = await io.listPartitions();
        if (s.path && mountOf(s.path, s.partitions) === null) {
          s.mount = null;
          s.path = null;
          s.entries = [];
        }
      } catch (e) {
        s.error = reason(e);
      }
    },

    /** Show the biggest folders inside `path` (a mount, or any folder below it). */
    async open(s: DiskState, path: string) {
      s.path = path;
      s.mount = mountOf(path, s.partitions) ?? s.mount;
      s.entries = [];
      s.scanning = true;
      s.error = null;
      try {
        const io = await import("./disk.server.ts");
        const entries = await io.scanFolders(path, TOP_N);
        // A newer navigation won: `null` from a superseded scan, or `s.path`
        // already moved on. Either way this result is no longer the truth.
        if (entries === null || s.path !== path) return;
        s.entries = entries;
      } catch (e) {
        if (s.path === path) s.error = reason(e);
      } finally {
        if (s.path === path) s.scanning = false;
      }
    },

    /** Open `path` in the desktop file manager. Shows — never changes — it. */
    async reveal(s: DiskState, path: string) {
      try {
        const io = await import("./disk.server.ts");
        await io.revealInFileManager(path);
      } catch (e) {
        s.error = reason(e);
      }
    },

    /**
     * Stop any running scan and go back to the partition overview. `du` over a
     * full partition can take minutes — the user must always be able to leave.
     */
    async cancel(s: DiskState) {
      const io = await import("./disk.server.ts");
      io.cancelScan();
      s.mount = null;
      s.path = null;
      s.entries = [];
      s.scanning = false;
      s.error = null;
    },
  },
});
