// Theme — plain data, no framework. One palette, one scale, so every surface
// in the app looks like it came from the same place.
export const c = {
  bg: "#0b1017",
  panel: "#141c26",
  panelHi: "#1b2634",
  line: "#243244",
  text: "#e6edf5",
  dim: "#8ba0b8",
  accent: "#2dd4bf",
  danger: "#f87171",
} as const;

/** One type scale. Root is 16px, so 1rem = 16px everywhere below. */
export const t = {
  xs: "0.8125rem", // 13px — captions
  sm: "0.9375rem", // 15px — secondary text, buttons
  md: "1rem", //      16px — body
  lg: "1.125rem", //  18px — emphasis
  xl: "1.5rem", //    24px — the wordmark
} as const;

/** Global reset. Rendered through AIR (`<style>` in App) rather than injected
 *  via `ui.head`, so it applies in every client — electron, browser, tests.
 *
 *  Two things it must kill, both of which showed as a white frame in Electron:
 *  the default 8px `body` margin (white html gutter around a dark app), and
 *  the light-theme native scrollbars (`color-scheme` defaults to light). */
export const globalCSS = `
:root { color-scheme: dark }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0; height: 100%; background: ${c.bg}; color: ${c.text}; overflow: hidden }
body > * { height: 100% }
::-webkit-scrollbar { width: 10px; height: 10px }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: ${c.bg} }
::-webkit-scrollbar-thumb { background: ${c.line}; border-radius: 8px }
::-webkit-scrollbar-thumb:hover { background: #35485f }
button { font: inherit }
`.trim();

/** Calm → warning → critical, by how full something is. */
export const usageColor = (percent: number): string =>
  percent >= 90 ? c.danger : percent >= 70 ? "#fbbf24" : c.accent;

export const track = {
  height: "8px",
  borderRadius: "999px",
  background: "#0a0f16",
  overflow: "hidden",
} as const;

export const fill = (percent: number, color: string) => ({
  width: `${Math.max(percent, percent > 0 ? 2 : 0)}%`,
  height: "100%",
  borderRadius: "999px",
  background: color,
  transition: "width .25s ease",
});

export const card = {
  background: c.panel,
  border: `1px solid ${c.line}`,
  borderRadius: "10px",
} as const;

export const button = {
  background: "transparent",
  border: `1px solid ${c.line}`,
  color: c.dim,
  borderRadius: "8px",
  padding: "0.4rem 0.75rem",
  fontSize: t.sm,
  cursor: "pointer",
  whiteSpace: "nowrap",
} as const;

/** One line, clipped instead of stretching its container. */
export const clip = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: "0",
} as const;

export const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
