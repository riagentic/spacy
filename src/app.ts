// Entry — zero-config: cells self-register on import; appId/version/baseDir
// are inferred from deno.json + this file's location.
import "./cell.ts";
import { aio } from "aio";

await aio.run();
