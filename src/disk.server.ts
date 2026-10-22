// Server-only IO — Deno subprocesses and fs reads. Cell methods dynamic-import
// this file, so the `.server.ts` suffix keeps it out of the browser bundle
// entirely (dep/aio/docs/build/imports.md §2).
//
// READ-ONLY BY CONSTRUCTION: spacy only ever measures (`df`, `mount`, `du`,
// statfs, PowerShell `Get-CimInstance`, directory reads) and shows (aio's
// `openExternal`). Nothing here can write, move or remove a file — see
// .katana/app.md ("Safety").
import {
  type Entry,
  parseDf,
  parseDu,
  parseMount,
  parseWinDisks,
  type Partition,
  rank,
  reclaimable,
  TOP_N,
  trimSlash,
} from "./disk.ts";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

/** stdout of `cmd`. Non-zero exit with output is fine (`du` on unreadable
 *  subtrees still reports everything it could measure — partial truth beats an
 *  error screen); no output at all is the failure. */
const stdoutOf = async (
  cmd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> => {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
    signal,
  }).output();
  const out = decode(stdout);
  if (out.trim()) return out;
  const err = decode(stderr).trim();
  throw new Error(
    `${cmd} failed (exit ${code})${err ? `: ${err.split("\n")[0]}` : ""}`,
  );
};

/** macOS: the browsable volumes from `mount`, sized by statfs. */
const macPartitions = async (signal: AbortSignal): Promise<Partition[]> => {
  const { statfs } = await import("node:fs/promises");
  const sized = await Promise.all(
    parseMount(await stdoutOf("mount", [], signal)).map(async (m) => {
      const f = await statfs(m.mount).catch(() => null);
      return f && {
        ...m,
        total: f.blocks * f.bsize,
        used: (f.blocks - f.bfree) * f.bsize,
        free: f.bavail * f.bsize,
      };
    }),
  );
  return reclaimable(sized.filter((p) => p !== null));
};

const WIN_DISKS = "ConvertTo-Json -Compress -InputObject @(Get-CimInstance " +
  "Win32_LogicalDisk | Select-Object DeviceID,FileSystem,Size,FreeSpace,DriveType)";

const measure = async (signal: AbortSignal): Promise<Partition[]> => {
  switch (Deno.build.os) {
    case "windows":
      return parseWinDisks(
        await stdoutOf("powershell", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          WIN_DISKS,
        ], signal),
      );
    case "darwin":
      return macPartitions(signal);
    default:
      // -P: stable one-line POSIX records · -T: fstype (drops pseudo-fs) · -B1: bytes
      return parseDf(await stdoutOf("df", ["-PT", "-B1"], signal));
  }
};

const DF_TIMEOUT_MS = 10_000;

/** Every real partition with its utilization. */
export const listPartitions = async (): Promise<Partition[]> => {
  // Bounded: a dead network mount (NFS/CIFS/SMB) blocks df/statfs forever —
  // possibly in an unkillable state, so the deadline is raced, not just signalled.
  const signal = AbortSignal.timeout(DF_TIMEOUT_MS);
  const deadline = new Promise<null>((r) =>
    signal.addEventListener("abort", () => r(null), { once: true })
  );
  const res = await Promise.race([measure(signal), deadline]);
  if (res === null || signal.aborted) {
    throw new Error(
      `df timed out after ${
        DF_TIMEOUT_MS / 1000
      }s — a network mount is not responding`,
    );
  }
  return res;
};

/** Bytes under `path`, never following a link or junction (no double count,
 *  no escape from the tree). Unreadable subtrees count as what was readable. */
const sizeOf = async (path: string, signal: AbortSignal): Promise<number> => {
  let total = 0;
  for await (const e of Deno.readDir(path)) {
    signal.throwIfAborted();
    const child = `${trimSlash(path)}/${e.name}`;
    if (e.isDirectory && !e.isSymlink) {
      total += await sizeOf(child, signal).catch((err) => {
        if (signal.aborted) throw err;
        return 0;
      });
    } else if (e.isFile) {
      total += (await Deno.lstat(child).catch(() => null))?.size ?? 0;
    }
  }
  return total;
};

/** Windows has no `du`: walk each direct subfolder. */
const winScan = async (path: string, signal: AbortSignal): Promise<Entry[]> => {
  const dirs: Entry[] = [];
  for await (const e of Deno.readDir(path)) {
    if (!e.isDirectory || e.isSymlink) continue;
    dirs.push({ path: `${trimSlash(path)}/${e.name}`, name: e.name, size: 0 });
  }
  return Promise.all(dirs.map(async (d) => ({
    ...d,
    size: await sizeOf(d.path, signal).catch((err) => {
      if (signal.aborted) throw err;
      return 0;
    }),
  })));
};

/**
 * The `top` biggest folders directly inside `path`. Aborting `signal` stops the
 * work — kills `du` — (the cell passes `s.$signal`, so a newer navigation or
 * Cancel stops the IO, not just the result).
 */
export const scanFolders = async (
  path: string,
  signal: AbortSignal,
  top: number = TOP_N,
): Promise<Entry[]> => {
  switch (Deno.build.os) {
    case "windows":
      return rank(await winScan(path, signal), top);
    case "darwin":
      // BSD du: -x same mount · -d 1 direct children · -k KiB
      return parseDu(
        await stdoutOf("du", ["-x", "-d", "1", "-k", path], signal),
        path,
        top,
        1024,
      );
    default:
      // GNU du: -x same mount · depth 1 direct children · bytes
      return parseDu(
        await stdoutOf(
          "du",
          ["-x", "--max-depth=1", "--block-size=1", path],
          signal,
        ),
        path,
        top,
      );
  }
};

/**
 * Show `path` in the desktop's own file manager (Cinnamon → nemo, macOS →
 * Finder, Windows → Explorer) via aio's per-OS `openExternal`
 * (dep/aio/docs/state/methods.md § Long-running server work). It only opens a
 * window, and rejects when the opener fails.
 */
export const revealInFileManager = async (path: string): Promise<void> => {
  const info = await Deno.stat(path).catch(() => null);
  if (!info?.isDirectory) throw new Error(`not a folder: ${path}`);
  const { openExternal } = await import("aio/server");
  await openExternal(
    Deno.build.os === "windows" ? path.replaceAll("/", "\\") : path,
  );
};
