# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## 🎯 What this is

`spacy` — a compact **Electron** disk-space analyzer on
[aio](https://github.com/riagentic/aio). Spec of record: `.katana/app.md`.

- Partition utilization → pick one → **top 10 folders** → click a folder to
  drill in (breadcrumb + ↑ Up)
- Only **reclaimable** partitions are listed (`isReclaimable` in `src/disk.ts`)
  — pseudo-fs, read-only images, snap/AppImage bundle mounts and encrypted
  overlays are dropped. Unlocked LUKS (`/dev/mapper/*` + a normal fs) stays: it
  is ordinary storage. `free === 0` only disqualifies FUSE mounts, so a
  genuinely full disk still shows.
- "File Manager" per row → `xdg-open` (Cinnamon → nemo)
- 🔒 **Read-only by construction.** Only `df`, `du`, `xdg-open` ever run;
  `src/cell.test.ts` fails the build if any source file reaches for a
  destructive API.

## ⚙️ Commands

```sh
deno task dev              # run (browser client); dev:electron, dev:android, dev:cli, dev:service
deno task test             # deno test -A
deno task lint             # aiol — the aio project linter (style/coupling/perf); --safe-fix available
deno task doctor           # config sanity (run first when anything is weird)
deno task am <cmd>         # app manager: status, state, dispatch, surface, trigger, logs, migrations
deno task compile:electron # AppImage; also compile (binary), compile:android, compile:cli
deno task install:electron # required for electron dev — never `npm install electron` (breaks Deno symlinks)
```

Single test file: `deno test -A src/cell.test.ts` · single case:
`--filter "name"`.

⚠️ `dep/` (framework symlink), `node_modules/`, `.env` are gitignored. On a
fresh clone run `am fix` once.

## 🏗️ Architecture

Framework lives at `dep/aio` → `~/.local/lib/aio-versions/v1.0.0-alpha42`
(pinned by `aioVersion` in `deno.json`). Its own `CLAUDE.md` and `docs/` there
are the authority — `docs/basics/pitfalls.md`, `docs/state/`,
`docs/testing/ui-testing.md`, `docs/clients/electron.md`.

One state model drives server, persistence, and UI:

| File                      | Role                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/disk.ts`             | Pure domain — `parseDf`/`parseDu`, `mountOf`/`parentOf`/`trailOf`. No IO, browser-safe.                                                         |
| `src/disk.server.ts`      | The only IO: `df`, `du`, `xdg-open`. **Dynamic-imported** from cell methods so it never enters the browser bundle (`docs/build/imports.md` §2). |
| `src/cell.ts`             | `disk` cell — `refresh`/`open`/`reveal`/`clear`. `persist: "none"` (live facts go stale).                                                       |
| `src/App.tsx` + `src/ui/` | Presentational components (props in, callbacks out) + `theme.ts`. Framework mounts `App.tsx`.                                                   |
| `src/app.ts`              | Entry — `aio.run({ client: "electron", ui: {…} })`, then one `disk.refresh()`.                                                                  |
| `src/client.ts`           | Thin CLI client over WS (`dev:remote:cli`), from the template.                                                                                  |

Flow: method call → reduce (immer draft) → broadcast delta to clients → effects.
JSX is aio's own AIR renderer (`jsxImportSource: "aio"`), not React.

Scan semantics worth knowing: `du -x --max-depth=1` is one process per folder
view; a newer navigation aborts the running one (`inFlight` in `disk.server.ts`)
and `open` drops results whose `path` is no longer current. `du` on a full
partition can take minutes — that's inherent, the UI shows `scanning …`.

## 🧭 Conventions that bite

- **Cell name = wire + persistence identity.** `cell("disk", …)` keys persisted
  state and the `disk:open` action. Renaming orphans data — bump `version` +
  `onMigrate` instead.
- **Deno APIs / `@std/*` in anything a cell imports break the browser bundle** —
  put them in `*.server.ts` and `await import()` them from a method.
- **Pin `appId`** in `deno.json` before data matters; it's otherwise inferred
  from title/dir name, and a rename starts with fresh state.
- **Sync methods mutate `s`**; the return value is for effects only. Async
  methods batch writes and are read-your-writes — never hold `const x = s.items`
  across an `await`.
- **Everything persists and broadcasts by default** (`persist: "all"`,
  `ui: "all"`). Exclude caches/secrets explicitly.
- **Unknown `deno.json`/`aio.run()` keys are boot-fatal** by design.
- Dev, prod, and the test harnesses are equally strict — illegal in-place
  mutation throws everywhere. A green test means what production means.

## 🧪 Testing

- Cells:
  `testCell(disk, "name", async t => { await t.send.open(dir); t.expect.state(s => …) })`
  — `src/cell.test.ts` scans a **real temp tree**, so the assertions are about
  real `df`/`du` output.
- UI: `testUI(App, "name", async ui => …)` — handles come from the `t=` props:
  `ui.Partitions["partition-/boot"]`, `ui.Folders["open-big"]`, `ui.Trail.up`.
  Actions queue un-awaited; **await observations** (`ui.settle()`, `expectCell`,
  `waitFor`).
- Never click a partition card for a _big_ mount in a test (real `du`); drive
  `disk.open(tmpDir)` instead, or click and immediately supersede.
- `reveal`/"File Manager" is asserted present, never clicked — it opens a real
  window.
- Live app: `am surface 0 --json` to observe, `am trigger 0 "<path>" <action>`
  to act.
- Always dispatch-test methods — rendering initial state proves nothing.

## 📐 Katas

`.katana/*.md` are this project's quality specs. `/use-katana` audits the repo
against them; treat `.katana/app.md` as the product requirements of record.
