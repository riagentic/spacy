// Thin CLI client — live view of a running server's state over WebSocket.
// Used by `deno task dev:remote:cli` (against a dev server) and compiled by
// `compile:remote:cli` into a standalone client binary. No local server.
import { connectCli } from "aio/server";
import { log } from "aio";

const url = Deno.args[0] || "ws://localhost:8000/ws";
log.info("cli", `connecting to ${url}`);
const app = connectCli(url);
await app.ready;
log.info("cli", "state:", { state: app.state });
app.subscribe(() => log.info("cli", "state:", { state: app.state }));
