// Domain core — pure, total, browser-safe: no IO, no Deno APIs, no @std/*.
// (Cell files and everything they pull in are bundled for the browser —
// dep/aio/docs/build/imports.md §1. The IO lives in ./disk.server.ts.)
// Paths use `/` on every OS; a Windows drive root is `C:/` (Windows APIs take
// `/`), so one set of path helpers serves Linux, macOS and Windows.

export type Partition = {
  device: string;
  fstype: string;
  mount: string;
  total: number;
  used: number;
  free: number;
};

export type Entry = { path: string; name: string; size: number };

/** How many folders a scan reports — "top 10" per .katana/app.md. */
export const TOP_N = 10;

/** Kernel/virtual filesystems: real mounts for the OS, noise for a space analyzer. */
const PSEUDO_FS = new Set([
  "autofs",
  "binfmt_misc",
  "bpf",
  "cgroup",
  "cgroup2",
  "configfs",
  "debugfs",
  "devfs",
  "devpts",
  "devtmpfs",
  "efivarfs",
  "fuse.gvfsd-fuse",
  "fuse.portal",
  "fusectl",
  "hugetlbfs",
  "mqueue",
  "nsfs",
  "overlay",
  "proc",
  "pstore",
  "ramfs",
  "securityfs",
  "sysfs",
  "tmpfs",
  "tracefs",
]);

/**
 * Encrypted overlays whose contents are opaque: the names are ciphertext and the
 * plaintext is already counted on the partition underneath. Nothing to diagnose.
 * (An *unlocked* LUKS volume — `/dev/mapper/…` carrying ext4/btrfs/xfs — is not
 * one of these: it behaves exactly like any other disk, so it stays.)
 */
const ENCRYPTED_FS =
  /^(fuse\.)?(ecryptfs|encfs|cryfs|gocryptfs|securefs|veracrypt)$/;

/** Read-only images (snap, ISO, AppImage payload): 100% full by construction. */
const IMAGE_FS = new Set(["cramfs", "erofs", "iso9660", "squashfs", "udf"]);

/** Where the OS mounts app bundles — every byte is the bundle, not your data. */
const BUNDLE_MOUNT = /^(\/snap\/|\/var\/lib\/snapd\/snap\/|\/tmp\/\.mount_)/;

/**
 * Would deleting a file here give bytes back? That is the only question spacy
 * can help with, so it is the only kind of partition it lists.
 *
 * A running AppImage is the motivating case: it appears as a full-to-the-byte
 * FUSE mount (`fuse.foo-x86_64.AppImage`, 156 MB / 156 MB, 0 free) that no user
 * can ever reclaim. The `free === 0` test is scoped to FUSE precisely so a real
 * disk that genuinely filled up — the moment spacy matters most — still shows.
 */
export const isReclaimable = (p: Partition): boolean =>
  p.total > 0 &&
  !PSEUDO_FS.has(p.fstype) &&
  !IMAGE_FS.has(p.fstype) &&
  !ENCRYPTED_FS.test(p.fstype) &&
  !BUNDLE_MOUNT.test(p.mount) &&
  !(p.fstype.startsWith("fuse.") && p.free === 0);

// `df -PT -B1`: POSIX mode guarantees one record per line —
// device fstype total used free capacity% mount (the mount may contain spaces).
const DF_LINE = /^(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(\S.*)$/;

/** Any OS's partition records → the reclaimable ones, deduped by mount, mount-ordered. */
export const reclaimable = (ps: readonly Partition[]): Partition[] =>
  ps
    .filter((p, i) => ps.findIndex((q) => q.mount === p.mount) === i)
    .filter(isReclaimable)
    .sort((a, b) => a.mount.localeCompare(b.mount));

/** Linux: `df -PT -B1` stdout → reclaimable partitions. */
export const parseDf = (stdout: string): Partition[] =>
  reclaimable(
    stdout.split("\n").flatMap((line): Partition[] => {
      const m = DF_LINE.exec(line);
      if (!m) return [];
      const [, device, fstype, total, used, free, , mount] = m;
      return [{
        device,
        fstype,
        mount,
        total: Number(total),
        used: Number(used),
        free: Number(free),
      }];
    }),
  );

export type Mounted = { device: string; mount: string; fstype: string };

// macOS `mount`: `<device> on <mount> (<fstype>, <flag>, <flag>…)`.
const MOUNT_LINE = /^(.+?) on (\/.*) \(([^,()]+)((?:, [^,()]+)*)\)$/;

/** The one macOS data volume — `/Users` and friends live on it (firmlinks). */
const MAC_DATA = "/System/Volumes/Data";

/**
 * macOS: `mount` stdout → the volumes worth measuring (sizes come from
 * statfs). Read-only volumes (the sealed system `/`, disk images) hold nothing
 * to reclaim; `nobrowse` ones are OS internals (VM, Preboot, …) — except the
 * Data volume, which is where every user byte is.
 */
export const parseMount = (stdout: string): Mounted[] =>
  stdout.split("\n").flatMap((line): Mounted[] => {
    const m = MOUNT_LINE.exec(line.trim());
    if (!m) return [];
    const [, device, mount, fstype, rest] = m;
    const flags = rest.split(", ");
    const hidden = flags.includes("nobrowse") && mount !== MAC_DATA;
    return flags.includes("read-only") || hidden
      ? []
      : [{ device, mount, fstype }];
  });

/** Windows `Win32_LogicalDisk` drive types: removable, fixed, network. */
const WIN_DRIVE_TYPES = new Set([2, 3, 4]);

type WinDisk = {
  DeviceID: string;
  FileSystem: string | null;
  Size: number | null;
  FreeSpace: number | null;
  DriveType: number;
};

/** Windows: `Win32_LogicalDisk` as JSON → reclaimable partitions (`C:/` …). */
export const parseWinDisks = (json: string): Partition[] =>
  reclaimable(
    ([JSON.parse(json)].flat() as WinDisk[])
      .filter((d) => WIN_DRIVE_TYPES.has(d.DriveType))
      .map((d) => ({
        device: d.DeviceID,
        fstype: d.FileSystem ?? "",
        mount: `${d.DeviceID}/`,
        total: d.Size ?? 0,
        used: (d.Size ?? 0) - (d.FreeSpace ?? 0),
        free: d.FreeSpace ?? 0,
      })),
  );

/** An absolute path on any OS spacy runs on: `/…` or a drive root `C:/…`. */
export const isAbsolute = (path: string): boolean =>
  /^(\/|[A-Za-z]:\/)/.test(path);

/** `/` → `""`, `/home/` → `/home`, `C:/` → `C:` — so `${base}/${name}` composes everywhere. */
export const trimSlash = (path: string): string => path.replace(/\/+$/, "");

/** The `top` biggest entries, largest first. */
export const rank = (entries: readonly Entry[], top = TOP_N): Entry[] =>
  [...entries].sort((a, b) => b.size - a.size).slice(0, top);

/**
 * `du` depth-1 stdout (`<size>\t<path>` lines, sizes in `unit` bytes: 1 for
 * GNU `--block-size=1`, 1024 for BSD `-k`) → the `top` biggest direct
 * subfolders, largest first. The `base` line itself and any deeper path are
 * dropped, so the result is exactly "folders inside base, ranked by size".
 */
export const parseDu = (
  stdout: string,
  base: string,
  top = TOP_N,
  unit = 1,
): Entry[] => {
  const dir = trimSlash(base);
  return rank(
    stdout.split("\n").flatMap((line): Entry[] => {
      const tab = line.indexOf("\t");
      if (tab < 0) return [];
      const size = Number(line.slice(0, tab)) * unit;
      const path = trimSlash(line.slice(tab + 1));
      if (!Number.isFinite(size) || !path.startsWith(`${dir}/`)) return [];
      const name = path.slice(dir.length + 1);
      return name.includes("/") ? [] : [{ path, name, size }];
    }),
    top,
  );
};

/** The partition a path lives on — the longest mount that prefixes it. */
export const mountOf = (
  path: string,
  partitions: readonly Partition[],
): string | null =>
  partitions
    .filter((p) =>
      path === p.mount || path.startsWith(`${trimSlash(p.mount)}/`)
    )
    .reduce<string | null>(
      (
        best,
        p,
      ) => (best === null || p.mount.length > best.length ? p.mount : best),
      null,
    );

/** One level up, clamped to the partition root (`null` when already there). */
export const parentOf = (path: string, mount: string): string | null => {
  if (path === mount || !path.startsWith(`${trimSlash(mount)}/`)) return null;
  const up = path.slice(0, path.lastIndexOf("/"));
  return up.length < mount.length ? mount : up;
};

/** Breadcrumb from the partition root down to `path`, each segment navigable. */
export const trailOf = (path: string, mount: string): Entry[] => {
  const root: Entry = { path: mount, name: mount, size: 0 };
  if (path === mount || !path.startsWith(`${trimSlash(mount)}/`)) return [root];
  return path
    .slice(trimSlash(mount).length + 1)
    .split("/")
    .filter(Boolean)
    .reduce<Entry[]>((trail, name) => {
      const parent = trimSlash(trail[trail.length - 1].path);
      return [...trail, { path: `${parent}/${name}`, name, size: 0 }];
    }, [root]);
};
