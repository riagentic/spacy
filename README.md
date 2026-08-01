# spacy

An [aio](https://github.com/riagentic/aio) app (counter template).

> **Cloned this repo?** The framework link, `.env`, and `node_modules` are
> gitignored — run `am fix` once (after installing `am` via the aio install
> script) to repair them, then `deno task dev` works.

```sh
deno task dev              # run — browser (also dev:browser, dev:electron, dev:android)
deno task test             # run the starter test
deno task compile          # build a single binary (also compile:browser)
deno task compile:electron # build a desktop AppImage
deno task compile:android  # build an Android APK (needs ANDROID_HOME + Gradle)
```

State lives in `src/cell.ts`, UI in `src/App.tsx`, entry in `src/app.ts`.
Manage a running app with `deno task am` (status, state, logs, …).
