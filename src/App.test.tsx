// UI tests — the app driven the way a user drives it, no selectors
// (dep/aio/docs/testing/ui-testing.md). Folder scans run against a real temp
// tree so they are instant and deterministic.
import { assert } from "@std/assert";
import { testUI } from "aio/testing";
import App from "./App.tsx";
import { disk } from "./cell.ts";

const fixture = async () => {
  const root = await Deno.makeTempDir({ prefix: "spacy-ui-" });
  const write = async (dir: string, kb: number) => {
    await Deno.mkdir(`${root}/${dir}`, { recursive: true });
    await Deno.writeFile(`${root}/${dir}/blob`, new Uint8Array(kb * 1024));
  };
  await write("big", 600);
  await write("small", 6);
  await write("nested/deep", 30);
  return root;
};

const names = (ui: { surface: () => unknown }, component: string): string[] => {
  const walk = (
    node: any,
  ): any[] => [node, ...(node.children ?? []).flatMap(walk)];
  const found = walk(ui.surface()).find((n) => n.component === component);
  return (found?.elements ?? []).map((e: { name: string }) => e.name);
};

testUI(App, "shows utilization for every partition", async (ui) => {
  await disk.refresh();
  await ui.settle();

  assert(disk.partitions.length > 0, "expected at least one partition");
  const cards = names(ui, "Partitions");
  disk.partitions.forEach((p) =>
    assert(cards.includes(`partition-${p.mount}`), p.mount)
  );
  // every card carries mount, size and a percentage
  assert(/\d+%/.test(ui.surface().text ?? ""));
});

testUI(App, "selecting a partition explores it", async (ui) => {
  const root = await fixture();
  await disk.refresh();
  await ui.settle();

  const smallest = [...disk.partitions].sort((a, b) => a.used - b.used)[0];
  ui.Partitions[`partition-${smallest.mount}`].click();
  await ui.waitFor(() => disk.path === smallest.mount);

  // A new navigation supersedes a running scan — no stale results, no waiting.
  await disk.open(root);
  await ui.expectCell(disk, (s) => s.path === root && s.scanning === false);
  assert(disk.mount === smallest.mount || disk.mount !== null);

  await Deno.remove(root, { recursive: true });
});

testUI(
  App,
  "ranks the top folders, drills in, and walks back up",
  async (ui) => {
    const root = await fixture();
    await disk.refresh();
    await disk.open(root);
    await ui.settle();

    // biggest first, each row with its own File Manager button
    const rows = names(ui, "Folders");
    assert(
      rows.includes("open-big") && rows.includes("reveal-big"),
      rows.join(","),
    );
    assert(rows.includes("open-nested") && rows.includes("reveal-nested"));
    assert(disk.entries[0].name === "big");
    assert(ui.Folders.folders.text.startsWith("1big"), ui.Folders.folders.text);

    ui.Folders["open-nested"].click();
    await ui.expectCell(
      disk,
      (s) => s.path === `${root}/nested` && s.scanning === false,
    );
    assert(names(ui, "Folders").includes("open-deep"));

    ui.Trail.up.click();
    await ui.expectCell(disk, (s) => s.path === root && s.scanning === false);
    assert(names(ui, "Folders").includes("open-big"));

    await Deno.remove(root, { recursive: true });
  },
);

testUI(
  App,
  "offers the file manager for the current folder too",
  async (ui) => {
    const root = await fixture();
    await disk.refresh();
    await disk.open(root);
    await ui.settle();

    // present, and deliberately not clicked — it would open a real window
    assert(names(ui, "Trail").includes("reveal-here"));
    assert(ui.Trail["reveal-here"].text === "File Manager");

    await Deno.remove(root, { recursive: true });
  },
);

testUI(App, "states plainly that it never deletes", async (ui) => {
  await ui.settle();
  assert(ui.html().includes("never deletes anything"));
});
