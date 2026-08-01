// Thin CLI client — live view of a running server's state over WebSocket.
// Used by `deno task dev:remote:cli` (against a dev server) and compiled by
// `compile:remote:cli` into a standalone client binary. No local server.
import { connectCli } from "aio/server";

const url = Deno.args[0] || "ws://localhost:8000/ws";
console.log(`connecting to ${url} ...`);
const app = connectCli(url);
await app.ready;
console.log("state:", JSON.stringify(app.state, null, 2));
app.subscribe(() => console.log("state:", JSON.stringify(app.state)));
