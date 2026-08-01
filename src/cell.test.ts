// A starter test — `deno task test`. Cells are pure, so they test in isolation
// (no server, no DOM) with the testCell harness.
import { testCell } from "aio/testing";
import { counter } from "./cell.ts";

testCell(counter, "increments, adds, and resets", (t) => {
  t.send.increment();
  t.send.increment(5);
  t.expect.state((s) => s.count === 6);
  t.send.reset();
  t.expect.state((s) => s.count === 0);
});
