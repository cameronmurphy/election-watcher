import { INJECT } from "./inject.ts";

const NEEDLE_URL =
  "https://www.nytimes.com/interactive/2026/11/03/us/elections/results-needle-senate-house-forecast.html";
const DEFAULT_WIDTH = 520;
const FULL_SIZE = [1180, 820] as const;
const TICK_MS = 500;
const FIND_TIMEOUT_MS = 25_000;
const RELOAD_MS = 15 * 60_000; // Safety net in case the page's own polling stalls.

type Mode = "needles" | "full";
type Screen = { x: number; y: number; width: number; height: number };
type Tick = { found: boolean; gated?: boolean; ratio?: number; screen?: Screen };

// BrowserWindow isn't in `deno types` yet, so it has no type declarations to check against.
// deno-lint-ignore no-explicit-any
const BrowserWindow = (Deno as any).BrowserWindow;

// A small local page shows immediately, so startup doesn't wait on a server.
Deno.serve(() =>
  new Response(
    `<body style="margin:0;height:100vh;display:grid;place-items:center;font:500 13px -apple-system,'Segoe UI',sans-serif;color:#666">Loading needles…</body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  )
);

// The first BrowserWindow adopts the already-open startup window, which ignores
// creation-only options like `frameless`. So close that one and open a real one.
// It ignores close() and hide() until it has finished opening, hence the delay below.
const startup = new BrowserWindow();

const win = new BrowserWindow({
  title: "Election Watcher",
  width: DEFAULT_WIDTH,
  height: 190,
  frameless: true,
  alwaysOnTop: true,
});

let mode: Mode = "needles";
let placed = false;
let autoFull = false; // Full page was forced by a sign-in wall, not chosen by the user.
let screenArea: Screen | null = null;
let lastSeen = Date.now();
let compact: { size: [number, number]; position: [number, number] } | null = null;
let dragOrigin: [number, number] | null = null;

const pair = (v: unknown): [number, number] => {
  if (Array.isArray(v)) return [v[0], v[1]];
  const o = v as Record<string, number>;
  return "width" in o ? [o.width, o.height] : [o.x, o.y];
};

async function setMode(next: Mode) {
  if (next === mode) return;
  mode = next;
  lastSeen = Date.now();
  if (next === "full") {
    compact = { size: pair(win.getSize()), position: pair(win.getPosition()) };
    win.setSize(...FULL_SIZE);
    win.setPosition((screenArea?.x ?? 0) + 60, (screenArea?.y ?? 0) + 60);
    return;
  }
  if (compact) {
    win.setSize(...compact.size);
    win.setPosition(...compact.position);
  }
  await win.navigate(NEEDLE_URL);
}

win.bind("ewClose", () => Deno.exit(0));
win.bind("ewSetMode", (m: unknown) => {
  if (m === "needles" || m === "full") setMode(m);
});
win.bind("ewDragStart", () => {
  dragOrigin = pair(win.getPosition());
});
win.bind("ewDragBy", (dx: unknown, dy: unknown) => {
  if (dragOrigin && typeof dx === "number" && typeof dy === "number") {
    win.setPosition(dragOrigin[0] + dx, dragOrigin[1] + dy);
  }
});

// The page may not see the pointer while another app is active; the native events do.
const hover = (on: boolean) =>
  win.executeJs(`window.__ew && window.__ew.hover(${on}), 0`).catch(() => {});
win.addEventListener("mouseenter", () => hover(true));
win.addEventListener("mouseleave", () => hover(false));
win.addEventListener("close", () => Deno.exit(0));

async function tick() {
  let result: Tick | undefined;
  try {
    const reply = await win.executeJs(
      `${INJECT}; window.__ew ? window.__ew.tick(${JSON.stringify(mode)}) : { found: false }`,
    );
    if (reply?.ok) result = reply.value;
  } catch {
    return; // Mid-navigation; the next tick tries again.
  }
  if (!result) return;
  if (result.screen) screenArea = result.screen;

  if (mode === "full") {
    // Signed in: the wall has gone, so go back to the needles without being asked.
    if (autoFull && result.found) {
      autoFull = false;
      await setMode("needles");
    }
    return;
  }

  if (result.found) {
    lastSeen = Date.now();
    if (!placed && result.ratio && result.screen) {
      placed = true;
      const height = Math.round(DEFAULT_WIDTH / result.ratio);
      const { x, y, width, height: screenHeight } = result.screen;
      win.setSize(DEFAULT_WIDTH, height);
      win.setPosition(x + width - DEFAULT_WIDTH - 24, y + screenHeight - height - 24);
    }
  } else if (result.gated || Date.now() - lastSeen > FIND_TIMEOUT_MS) {
    // A sign-in wall or bot check, which the user has to handle themselves.
    autoFull = true;
    await setMode("full");
  }
}

setTimeout(() => {
  startup.close();
  win.navigate(NEEDLE_URL);
  lastSeen = Date.now();
  setInterval(tick, TICK_MS);
}, 300);

setInterval(() => {
  if (mode === "needles") win.reload();
}, RELOAD_MS);
