// The parsers and path math — pure in, pure out, no disk needed.
import { assertEquals } from "@std/assert";
import {
  isReclaimable,
  mountOf,
  parentOf,
  parseDf,
  parseDu,
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
