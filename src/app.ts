// Entry — zero-config: cells self-register on import; the client (electron)
// and version come from deno.json, appId is pinned here so a rename of the
// folder or title never starts over with fresh state.
import { disk } from "./cell.ts";
import { globalCSS } from "./ui/theme.ts";
import { aio } from "aio";

await aio.run({
  appId: "spacy",
  ui: {
    width: 900,
    height: 640,
    // The reset, in <head>: dark from the FIRST paint, before the bundle mounts.
    head: `<style>${globalCSS}</style>`,
  },
  // Measure the partitions right away, so the window opens on real numbers.
  // (Folder scans stay on demand — `du` over a whole partition is not free.)
  onStart: () => disk.refresh(),
});
