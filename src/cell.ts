// Cell — the whole app state; UI and server both import from here.
// Methods run on the server (dep/aio/docs/state/the-bridge.md), which is why
// the Deno-only IO is dynamic-imported from ./disk.server.ts.
//
// SAFETY (.katana/app.md): spacy is an analyzer. There is deliberately NO
// method here that deletes, moves, truncates or writes anything — the only
// verbs are measure (`refresh`, `open`) and show (`reveal`).
import { cell, log, type MethodDraftMeta } from "aio";
import {
  type Entry,
  isAbsolute,
  mountOf,
  type Partition,
  TOP_N,
} from "./disk.ts";

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

/** Wire guard for every path argument: `am dispatch`, a WS client or an agent
 *  can send anything, and an absolute path (`/…` or `C:/…`) also rules out a
 *  `-flag` reaching `du` or the opener (dep/aio/docs/state/methods.md § Guarding the arguments). */
const absolutePath = (v: unknown): true | string =>
  (typeof v === "string" && isAbsolute(v)) || "an absolute path";

const reason = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** A failure is shown (`s.error`) AND logged — one record per failed call. */
const fail = (s: DiskState, method: string, e: unknown): void => {
  s.error = reason(e);
  log.error("disk", `${method} failed`, { error: s.error });
};

export const disk = cell("disk", {
  // Live facts about the disk right now — a restored snapshot would only ever
  // be stale, so nothing here is worth persisting.
  persist: "none",
  state: initial,
  // Newest navigation wins, and Cancel always gets the user out: either one
  // aborts a running `open` — and with it the `du` it spawned — at dispatch
  // time (dep/aio/docs/state/methods.md § Cancellation, "self").
  cancelOn: { open: ["self", "disk:cancel"] },
  // `du` over a full partition takes minutes by nature — exempt `open` from the
  // default method timeout (dep/aio/docs/state/methods.md, "How long may an
  // async method run?"). Cancel and supersession still bound it.
  long: ["open"],
  args: { open: [absolutePath], reveal: [absolutePath] },
  methods: {
    /** Re-measure every partition. Keeps the current folder if it still exists. */
    async refresh(s: DiskState) {
      s.error = null;
      try {
        const io = await import("./disk.server.ts");
        const partitions = await io.listPartitions();
        s.partitions = partitions;
        // aio-ok: re-reads the path on purpose — a navigation made while df ran
        // is the one to validate against the fresh partitions.
        if (s.path && mountOf(s.path, partitions) === null) {
          s.mount = null;
          s.path = null;
          s.entries = [];
        }
      } catch (e) {
        fail(s, "refresh", e);
      }
    },
    /** Show the biggest folders inside `path` (a mount, or any folder below it). */
    async open(s: DiskState & MethodDraftMeta, path: string) {
      s.path = path;
      // A path outside every listed partition is its own root, so the trail
      // and ↑ Up stay consistent instead of inheriting an unrelated mount.
      s.mount = mountOf(path, s.partitions) ?? path;
      s.entries = [];
      s.scanning = true;
      s.error = null;
      try {
        const io = await import("./disk.server.ts");
        const entries = await io.scanFolders(path, s.$signal, TOP_N);
        if (s.$signal.aborted) return; // superseded — the newer call owns state
        s.entries = entries;
        s.scanning = false;
      } catch (e) {
        if (s.$signal.aborted) return;
        fail(s, "open", e);
        s.scanning = false;
      }
    },
    /** Open `path` in the desktop file manager. Shows — never changes — it. */
    async reveal(s: DiskState, path: string) {
      try {
        const io = await import("./disk.server.ts");
        await io.revealInFileManager(path);
      } catch (e) {
        fail(s, "reveal", e);
      }
    },
    /**
     * Back to the partition overview. `du` over a full partition can take
     * minutes — the user must always be able to leave; `cancelOn` above kills
     * the running scan.
     */
    cancel(s: DiskState) {
      s.mount = null;
      s.path = null;
      s.entries = [];
      s.scanning = false;
      s.error = null;
    },
  },
});
