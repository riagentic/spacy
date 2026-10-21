// Thin CLI client — live view of a running server's state over WebSocket.
// `deno task dev:remote:cli ws://host:port/ws` against a server started with
// `--expose`. No local server. Logs go through aio's logger (aio/log keeps the
// renderer and build code out of this process).
import { connectCli } from "aio/server";
import { log } from "aio/log";

// No default URL: an aio server picks a FREE port, so a hard-coded one connects
// to nothing — or to a different app.
const url = Deno.args[0];
if (!url) {
  log.error(
    "cli",
    "usage: client <ws://host:port/ws> — the port is on the server's boot line, or: deno task am instances",
  );
  Deno.exit(2);
}
log.info("cli", `connecting to ${url}`);
// Bounded: a dead URL fails with a message instead of hanging forever.
const app = connectCli(url, { readyTimeoutMs: 10_000 });
await app.ready;
log.info("cli", "state:", { state: app.state });
app.subscribe(() => log.info("cli", "state:", { state: app.state }));
