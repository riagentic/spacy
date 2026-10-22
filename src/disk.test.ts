// The parsers and path math — pure in, pure out, no disk needed.
import { assertEquals } from "@std/assert";
import {
  isAbsolute,
  isReclaimable,
  mountOf,
  parentOf,
  parseDf,
  parseDu,
  parseMount,
  parseWinDisks,
  trailOf,
} from "./disk.ts";
import { formatBytes, formatShare, share } from "./format.ts";

const DF =
  `Filesystem     Type     1B-blocks          Used     Available Capacity Mounted on
/dev/nvme0n1p2 ext4  491252776960  291452776960  174800000000      63% /
tmpfs          tmpfs  16777216000       2097152   16775118848       1% /dev/shm
udev           devtmpfs 8388608000           0    8388608000        0% /dev
/dev/nvme0n1p1 vfat      536870912     100663296     436207616      19% /boot/efi
/dev/sdb1      fuseblk 2000398934016 1200000000000 800398934016     60% /media/dev/My Disk
none           overlay  491252776960 291452776960 174800000000      63% /var/lib/docker/overlay
`;

Deno.test("parseDf: real partitions only, ordered by mount", () => {
  const parts = parseDf(DF);
  assertEquals(parts.map((p) => p.mount), [
    "/",
    "/boot/efi",
    "/media/dev/My Disk",
  ]);
});

Deno.test("parseDf: mounts may contain spaces", () => {
  const usb = parseDf(DF).find((p) => p.device === "/dev/sdb1")!;
  assertEquals(usb.mount, "/media/dev/My Disk");
  assertEquals(usb.fstype, "fuseblk");
  assertEquals(usb.total, 2000398934016);
  assertEquals(usb.used, 1200000000000);
  assertEquals(usb.free, 800398934016);
});

// Everything a real desktop mounts that you can never free a byte on.
const NOISE =
  `Filesystem            Type                      1B-blocks         Used    Available Capacity Mounted on
spacy-x86_64.AppImage fuse.spacy-x86_64.AppImage 156106752    156106752            0     100% /tmp/.mount_spacy-HHNnkL
/dev/loop3            squashfs                    75497472     75497472            0     100% /snap/core22/1621
/dev/sr0              iso9660                   4696719360   4696719360            0     100% /media/dev/Ubuntu
/home/.ecryptfs/u/.Private ecryptfs           491252776960 291452776960 174800000000    63% /home/u
/dev/mapper/cryptHome btrfs                  2410399399936 1783309815808 623211065344   75% /home
/dev/sda1             ext4                    491252776960 491252776960            0    100% /data
`;

Deno.test("parseDf: only partitions you can actually free space on", () => {
  // The encrypted overlay and every read-only image are gone; the unlocked LUKS
  // volume and the genuinely-full ext4 disk — the two that matter — remain.
  assertEquals(parseDf(NOISE).map((p) => p.mount), ["/data", "/home"]);
});

Deno.test("isReclaimable: full ≠ unreclaimable, unless it is a bundle", () => {
  const p = (fstype: string, mount: string, free: number) => ({
    device: "x",
    fstype,
    mount,
    total: 1000,
    used: 1000 - free,
    free,
  });
  assertEquals(isReclaimable(p("xfs", "/", 0)), true); // full real disk: show it
  assertEquals(isReclaimable(p("fuse.app.AppImage", "/mnt/x", 0)), false);
  assertEquals(isReclaimable(p("fuse.sshfs", "/mnt/remote", 500)), true);
  assertEquals(isReclaimable(p("ext4", "/snap/core/1", 500)), false);
  assertEquals(isReclaimable(p("ext4", "/", 500)), true);
});

Deno.test("parseDf: header and junk lines are ignored", () => {
  assertEquals(
    parseDf("Filesystem Type 1B-blocks Used Available Capacity Mounted on\n\n"),
    [],
  );
});

const DU = `4096000\t/home/dev/.cache
12288000\t/home/dev/code
1024\t/home/dev/code/deep
2048000\t/home/dev/.local
20480000\t/home/dev
`;

Deno.test("parseDu: direct children only, biggest first, base excluded", () => {
  assertEquals(parseDu(DU, "/home/dev").map((e) => e.name), [
    "code",
    ".cache",
    ".local",
  ]);
  assertEquals(parseDu(DU, "/home/dev")[0].size, 12288000);
  assertEquals(parseDu(DU, "/home/dev")[0].path, "/home/dev/code");
});

Deno.test("parseDu: honours the top-N cap", () => {
  assertEquals(parseDu(DU, "/home/dev", 2).map((e) => e.name), [
    "code",
    ".cache",
  ]);
});

Deno.test("parseDu: works at the filesystem root", () => {
  const out = "900\t/usr\n100\t/var\n1000\t/\n";
  assertEquals(parseDu(out, "/").map((e) => e.path), ["/usr", "/var"]);
});

Deno.test("parseDu: BSD du -k reports KiB", () => {
  const out = "8\t/Users/me/a\n4\t/Users/me/b\n12\t/Users/me\n";
  assertEquals(parseDu(out, "/Users/me", 10, 1024).map((e) => e.size), [
    8192,
    4096,
  ]);
});

// macOS `mount` (Sonoma): sealed system, OS-internal volumes, the Data volume,
// a mounted disk image, an external disk, a network share.
const MOUNT = `/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)
devfs on /dev (devfs, local, nobrowse)
/dev/disk3s6 on /System/Volumes/VM (apfs, local, noexec, journaled, noatime, nobrowse)
/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled, nobrowse, protect, root data)
map auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)
/dev/disk5s1 on /Volumes/Installer (hfs, local, nodev, nosuid, read-only, noowners, quarantine, mounted by me)
/dev/disk4s1 on /Volumes/My Disk (exfat, local, nodev, nosuid, noowners, mounted by me)
//me@nas/share on /Volumes/share (smbfs, nodev, nosuid, mounted by me)
`;

Deno.test("parseMount: macOS volumes you can free space on", () => {
  const vols = parseMount(MOUNT).filter((m) =>
    isReclaimable({ ...m, total: 1, used: 0, free: 1 })
  );
  assertEquals(vols.map((m) => m.mount), [
    "/System/Volumes/Data",
    "/Volumes/My Disk",
    "/Volumes/share",
  ]);
  assertEquals(vols[1], {
    device: "/dev/disk4s1",
    mount: "/Volumes/My Disk",
    fstype: "exfat",
  });
});

Deno.test("parseWinDisks: fixed, removable and network drives as C:/", () => {
  const json = JSON.stringify([
    {
      DeviceID: "C:",
      FileSystem: "NTFS",
      Size: 1000,
      FreeSpace: 400,
      DriveType: 3,
    },
    {
      DeviceID: "D:",
      FileSystem: "CDFS",
      Size: 700,
      FreeSpace: 0,
      DriveType: 5,
    },
    {
      DeviceID: "E:",
      FileSystem: null,
      Size: null,
      FreeSpace: null,
      DriveType: 2,
    },
    {
      DeviceID: "Z:",
      FileSystem: "NTFS",
      Size: 50,
      FreeSpace: 5,
      DriveType: 4,
    },
  ]);
  const parts = parseWinDisks(json);
  assertEquals(parts.map((p) => p.mount), ["C:/", "Z:/"]);
  assertEquals(parts[0], {
    device: "C:",
    fstype: "NTFS",
    mount: "C:/",
    total: 1000,
    used: 600,
    free: 400,
  });
  // a single disk arrives as an object, not an array
  assertEquals(parseWinDisks(JSON.stringify(JSON.parse(json)[0])).length, 1);
});

Deno.test("Windows paths: drive roots compose like /", () => {
  const out = "500\tC:/Users\n200\tC:/Windows\n";
  assertEquals(parseDu(out, "C:/").map((e) => e.path), [
    "C:/Users",
    "C:/Windows",
  ]);
  assertEquals(
    mountOf(
      "C:/Users/me",
      parseWinDisks(
        JSON.stringify({
          DeviceID: "C:",
          FileSystem: "NTFS",
          Size: 9,
          FreeSpace: 1,
          DriveType: 3,
        }),
      ),
    ),
    "C:/",
  );
  assertEquals(parentOf("C:/Users/me", "C:/"), "C:/Users");
  assertEquals(parentOf("C:/Users", "C:/"), "C:/");
  assertEquals(parentOf("C:/", "C:/"), null);
  assertEquals(trailOf("C:/Users/me", "C:/").map((s) => s.path), [
    "C:/",
    "C:/Users",
    "C:/Users/me",
  ]);
});

Deno.test("isAbsolute: POSIX and drive roots, never a flag or relative", () => {
  assertEquals(["/", "/home", "C:/", "d:/x"].map(isAbsolute), [
    true,
    true,
    true,
    true,
  ]);
  assertEquals(["-rf", "home", "C:", "C:x", ""].map(isAbsolute), [
    false,
    false,
    false,
    false,
    false,
  ]);
});

const PARTS = parseDf(DF);

Deno.test("mountOf: the longest mount that owns the path", () => {
  assertEquals(mountOf("/home/dev/code", PARTS), "/");
  assertEquals(mountOf("/boot/efi/EFI", PARTS), "/boot/efi");
  assertEquals(mountOf("/boot/efi", PARTS), "/boot/efi");
  assertEquals(mountOf("/bootleg", PARTS), "/");
  assertEquals(mountOf("relative", PARTS), null);
});

Deno.test("parentOf: stops at the partition root", () => {
  assertEquals(parentOf("/home/dev/code", "/"), "/home/dev");
  assertEquals(parentOf("/home", "/"), "/");
  assertEquals(parentOf("/", "/"), null);
  assertEquals(parentOf("/boot/efi/EFI", "/boot/efi"), "/boot/efi");
  assertEquals(parentOf("/boot/efi", "/boot/efi"), null);
});

Deno.test("trailOf: breadcrumb from mount down to path", () => {
  assertEquals(trailOf("/home/dev", "/").map((s) => s.path), [
    "/",
    "/home",
    "/home/dev",
  ]);
  assertEquals(trailOf("/home/dev", "/").map((s) => s.name), [
    "/",
    "home",
    "dev",
  ]);
  assertEquals(trailOf("/boot/efi/EFI/x", "/boot/efi").map((s) => s.path), [
    "/boot/efi",
    "/boot/efi/EFI",
    "/boot/efi/EFI/x",
  ]);
  assertEquals(trailOf("/", "/").map((s) => s.path), ["/"]);
});

Deno.test("formatBytes: readable at every scale", () => {
  assertEquals(formatBytes(0), "0 B");
  assertEquals(formatBytes(-1), "0 B");
  assertEquals(formatBytes(512), "512 B");
  assertEquals(formatBytes(1536), "1.50 KB");
  assertEquals(formatBytes(15 * 1024 ** 2), "15.0 MB");
  assertEquals(formatBytes(491252776960), "458 GB");
});

Deno.test("share: clamped, zero-safe", () => {
  assertEquals(share(1, 4), 25);
  assertEquals(share(5, 4), 100);
  assertEquals(share(1, 0), 0);
  assertEquals(formatShare(share(2, 3)), "67%");
});
