// Domain core — pure, total, browser-safe: no IO, no Deno APIs, no @std/*.
// (Cell files and everything they pull in are bundled for the browser —
// dep/aio/docs/build/imports.md §1. The IO lives in ./disk.server.ts.)
// POSIX paths only: spacy targets Linux desktops (df / du / xdg-open).

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

/** `df -PT -B1` stdout → reclaimable partitions, deduped by mount, mount-ordered. */
export const parseDf = (stdout: string): Partition[] => {
  const seen = new Set<string>();
  return stdout
    .split("\n")
    .flatMap((line): Partition[] => {
      const m = DF_LINE.exec(line);
      if (!m) return [];
      const [, device, fstype, total, used, free, , mount] = m;
      if (seen.has(mount)) return [];
      seen.add(mount);
      const p: Partition = {
        device,
        fstype,
        mount,
        total: Number(total),
        used: Number(used),
        free: Number(free),
      };
      return isReclaimable(p) ? [p] : [];
    })
    .sort((a, b) => a.mount.localeCompare(b.mount));
};

/** `/` → `""`, `/home/` → `/home` — so `${base}/${name}` composes everywhere. */
const trimSlash = (path: string): string => path.replace(/\/+$/, "");

/**
 * `du -x --max-depth=1 --block-size=1 <base>` stdout → the `top` biggest direct
 * subfolders, largest first. The `base` line itself and any deeper path are
 * dropped, so the result is exactly "folders inside base, ranked by size".
 */
export const parseDu = (stdout: string, base: string, top = TOP_N): Entry[] => {
  const dir = trimSlash(base);
  return stdout
    .split("\n")
    .flatMap((line): Entry[] => {
      const tab = line.indexOf("\t");
      if (tab < 0) return [];
      const size = Number(line.slice(0, tab));
      const path = trimSlash(line.slice(tab + 1));
      if (!Number.isFinite(size) || !path.startsWith(`${dir}/`)) return [];
      const name = path.slice(dir.length + 1);
      return name.includes("/") ? [] : [{ path, name, size }];
    })
    .sort((a, b) => b.size - a.size)
    .slice(0, top);
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
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "/" : path.slice(0, cut);
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
