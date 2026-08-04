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

/** Every real partition with its utilization. */
export const listPartitions = async (): Promise<Partition[]> => {
  // -P: stable one-line POSIX records · -T: fstype (used to drop pseudo-fs) · -B1: bytes
  const { code, out, err } = await run("df", ["-PT", "-B1"]);
  if (!out.trim()) fail("df", code, err);
  return parseDf(out);
};

// A newer scan supersedes the running one — abort the stale `du` instead of
// letting it burn IO for a folder nobody is looking at any more.
let inFlight: AbortController | null = null;

/**
 * The `top` biggest folders directly inside `path`.
 * Returns `null` when a newer scan superseded this one.
 */
export const scanFolders = async (
  path: string,
  top: number = TOP_N,
): Promise<Entry[] | null> => {
  inFlight?.abort();
  const scan = new AbortController();
  inFlight = scan;
  try {
    // -x: never cross into another mount · depth 1: direct children only · bytes
    const { code, out, err } = await run(
      "du",
      ["-x", "--max-depth=1", "--block-size=1", path],
      scan.signal,
    );
    // du exits non-zero on unreadable subtrees but still reports everything it
    // could measure — partial truth beats an error screen.
    if (!out.trim()) fail("du", code, err);
    return parseDu(out, path, top);
  } catch (e) {
    if (scan.signal.aborted) return null;
    throw e;
  } finally {
    if (inFlight === scan) inFlight = null;
  }
};

/** Stop the running scan (the user changed their mind, or navigated away). */
export const cancelScan = (): void => {
  inFlight?.abort();
};

/**
 * Show `path` in the desktop's own file manager (Cinnamon → nemo, GNOME →
 * nautilus, …). `xdg-open` is the standard indirection for "whatever the user
 * configured"; it only opens a window.
 */
export const revealInFileManager = async (path: string): Promise<void> => {
  const info = await Deno.stat(path).catch(() => null);
  if (!info?.isDirectory) throw new Error(`not a folder: ${path}`);
  const child = new Deno.Command("xdg-open", {
    args: [path],
    stdout: "null",
    stderr: "null",
  }).spawn();
  child.unref(); // the file manager outlives spacy
};
