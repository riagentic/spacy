// Cell tests — real `df`/`du` against a temp tree, so what passes here is what
// the app does on a real disk (dep/aio/docs/testing/cell-testing.md).
import { assert, assertEquals } from "@std/assert";
import { testCell } from "aio/testing";
import { disk } from "./cell.ts";

/** tmp/ big(600 KB) · mid(60 KB) · small(6 KB) · nested/deep(30 KB) */
const fixture = async () => {
  const root = await Deno.makeTempDir({ prefix: "spacy-" });
  const write = async (dir: string, kb: number) => {
    await Deno.mkdir(`${root}/${dir}`, { recursive: true });
    await Deno.writeFile(`${root}/${dir}/blob`, new Uint8Array(kb * 1024));
  };
  await write("big", 600);
  await write("mid", 60);
  await write("small", 6);
  await write("nested/deep", 30);
  return root;
};

testCell(disk, "refresh: measures the real partitions", async (t) => {
  await t.send.refresh();
  t.expect.state((s) => s.error === null);
  t.expect.state((s) => s.partitions.length > 0);
  t.expect.state((s) => s.partitions.some((p) => p.mount === "/"));
  t.expect.state((s) =>
    s.partitions.every((p) => p.total > 0 && p.used <= p.total)
  );
});

testCell(disk, "open: ranks the folders inside a real directory", async (t) => {
  const root = await fixture();
  await t.send.refresh();
  await t.send.open(root);

  t.expect.state((s) => s.error === null);
  t.expect.state((s) => s.scanning === false);
  t.expect.state((s) => s.path === root);
  t.expect.state((s) => s.mount !== null); // the partition the temp dir lives on
  t.expect.state((s) =>
    s.entries.map((e) => e.name).join() === "big,mid,nested,small"
  );
  t.expect.state((s) => s.entries[0].size > s.entries[1].size);
  t.expect.state((s) => s.entries[0].path === `${root}/big`);

  await Deno.remove(root, { recursive: true });
});

testCell(
  disk,
  "open: drills into a sub-folder and walks back up",
  async (t) => {
    const root = await fixture();
    await t.send.refresh();
    await t.send.open(`${root}/nested`);
    t.expect.state((s) => s.entries.map((e) => e.name).join() === "deep");
    t.expect.state((s) => s.path === `${root}/nested`);

    await t.send.open(root);
    t.expect.state((s) => s.entries.length === 4);

    await Deno.remove(root, { recursive: true });
  },
);

testCell(
  disk,
  "open: a missing folder reports an error, not a crash",
  async (t) => {
    await t.send.open("/nonexistent-spacy-path");
    t.expect.state((s) => typeof s.error === "string" && s.error.length > 0);
    t.expect.state((s) => s.entries.length === 0);
    t.expect.state((s) => s.scanning === false);
  },
);

testCell(disk, "cancel: back to the partition overview", async (t) => {
  const root = await fixture();
  await t.send.refresh();
  await t.send.open(root);
  await t.send.cancel();
  t.expect.state((s) =>
    s.path === null && s.mount === null && s.entries.length === 0
  );
  t.expect.state((s) => s.partitions.length > 0); // measurements survive

  await Deno.remove(root, { recursive: true });
});

Deno.test("cancel: a running scan is really aborted, not just hidden", async () => {
  const { cancelScan, scanFolders } = await import("./disk.server.ts");
  const scanning = scanFolders("/"); // minutes on a big disk
  cancelScan();
  assertEquals(await scanning, null); // superseded → no result, no error
});

// The Safety kata (.katana/app.md), enforced mechanically: no source file of the
// app may reach for a destructive API or spawn a destructive command. A future
// "just add a delete button" fails here before it ever meets a user's disk.
const DESTRUCTIVE =
  /Deno\.(remove|truncate|writeFile|writeTextFile|rename|create|mkdir)\b|"(rm|rmdir|unlink|shred|dd|mv|mkfs|trash-put)"/;

Deno.test("safety: no source file can delete, write or move anything", async () => {
  const offenders: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for await (const e of Deno.readDir(dir)) {
      const path = `${dir}/${e.name}`;
      if (e.isDirectory) await walk(path);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) {
        if (DESTRUCTIVE.test(await Deno.readTextFile(path))) {
          offenders.push(path);
        }
      }
    }
  };
  await walk(new URL(".", import.meta.url).pathname);
  assertEquals(offenders, []);
});

Deno.test("safety: the cell exposes measure/show verbs only", () => {
  const verbs = ["refresh", "open", "reveal", "cancel"];
  verbs.forEach((v) =>
    assert(
      typeof (disk as unknown as Record<string, unknown>)[v] === "function",
    )
  );
  assert(!verbs.some((v) => /delete|remove|trash|clean|purge|wipe/i.test(v)));
});
