// Server-only IO — Deno subprocesses. Cell methods dynamic-import this file, so
// the `.server.ts` suffix keeps it out of the browser bundle entirely
// (dep/aio/docs/build/imports.md §2).
//
// READ-ONLY BY CONSTRUCTION: the only three processes spacy ever starts are
// `df` (measure), `du` (measure) and `xdg-open` (show). Nothing here can write,
// move or remove a file — see .katana/app.md ("Safety").
import { type Entry, parseDf, parseDu, type Partition, TOP_N } from "./disk.ts";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

const run = async (cmd: string, args: string[], signal?: AbortSignal) => {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
    signal,
  }).output();
  return { code, out: decode(stdout), err: decode(stderr).trim() };
};

const fail = (cmd: string, code: number, err: string): never => {
  throw new Error(
    `${cmd} failed (exit ${code})${err ? `: ${err.split("\n")[0]}` : ""}`,
  );
};

const DF_TIMEOUT_MS = 10_000;

/** Every real partition with its utilization. */
export const listPartitions = async (): Promise<Partition[]> => {
  // -P: stable one-line POSIX records · -T: fstype (used to drop pseudo-fs) · -B1: bytes
  // Bounded: a dead network mount (NFS/CIFS) blocks df forever — possibly in
  // an unkillable state, so the deadline is raced, not just signalled.
  const signal = AbortSignal.timeout(DF_TIMEOUT_MS);
  const deadline = new Promise<null>((r) =>
    signal.addEventListener("abort", () => r(null), { once: true })
  );
  const res = await Promise.race([run("df", ["-PT", "-B1"], signal), deadline]);
  if (res === null || signal.aborted) {
    throw new Error(
      `df timed out after ${
        DF_TIMEOUT_MS / 1000
      }s — a network mount is not responding`,
    );
  }
  const { code, out, err } = res;
  if (!out.trim()) fail("df", code, err);
  return parseDf(out);
};

/**
 * The `top` biggest folders directly inside `path`. Aborting `signal` kills
 * the `du` process (the cell passes `s.$signal`, so a newer navigation or
 * Cancel stops the IO, not just the result).
 */
export const scanFolders = async (
  path: string,
  signal: AbortSignal,
  top: number = TOP_N,
): Promise<Entry[]> => {
  // -x: never cross into another mount · depth 1: direct children only · bytes
  const { code, out, err } = await run(
    "du",
    ["-x", "--max-depth=1", "--block-size=1", path],
    signal,
  );
  // du exits non-zero on unreadable subtrees but still reports everything it
  // could measure — partial truth beats an error screen.
  if (!out.trim()) fail("du", code, err);
  return parseDu(out, path, top);
};
/**
 * Show `path` in the desktop's own file manager (Cinnamon → nemo, GNOME →
 * nautilus, …) via aio's `openExternal` — `xdg-open` on Linux, the standard
 * indirection for "whatever the user configured" (dep/aio/docs/state/methods.md
 * § Long-running server work). It only opens a window, and rejects when the opener fails.
 */
export const revealInFileManager = async (path: string): Promise<void> => {
  const info = await Deno.stat(path).catch(() => null);
  if (!info?.isDirectory) throw new Error(`not a folder: ${path}`);
  const { openExternal } = await import("aio/server");
  await openExternal(path);
};
