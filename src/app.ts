// Entry — zero-config: cells self-register on import; appId/version/baseDir
// are inferred from deno.json + this file's location.
import { disk } from "./cell.ts";
import { globalCSS } from "./ui/theme.ts";
import { aio } from "aio";

await aio.run({
  appId: "spacy",
  appVersion: "0.1.0",
  client: "electron", // desktop app (also the default) — .katana/app.md
  ui: {
    width: 900,
    height: 640,
    // Same CSS the App renders through AIR — one source, two delivery paths.
    // Here it buys a dark FIRST PAINT, before the bundle mounts.
    head: `<style>${globalCSS}</style>`,
  },
});

// Measure the partitions right away, so the window opens on real numbers.
// (Folder scans stay on demand — `du` over a whole partition is not free.)
await disk.refresh();
