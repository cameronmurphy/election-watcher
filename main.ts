import { INJECT } from "./inject.ts";

// The homepage's compact needles, rather than the forecast page, which sits behind a
// registration wall. The app shows that wall if it appears; it never hides it.
const NEEDLE_URL = "https://www.nytimes.com/";
const DEFAULT_WIDTH = 520;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720; // NYT switches to a flat desktop layout at about 740px.
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
let contentRatio: number | null = null;

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

// The page measures in CSS pixels. The window API may not, on scaled Windows displays, so
// each gesture works out the difference from the window's width as both sides see it.
const gesture = (pageWidth: unknown) => {
  const size = pair(win.getSize());
  const scale = typeof pageWidth === "number" && pageWidth > 0 ? size[0] / pageWidth : 1;
  return { size, position: pair(win.getPosition()), scale };
};
let active: ReturnType<typeof gesture> | null = null;

win.bind("ewDragStart", (pageWidth: unknown) => {
  active = gesture(pageWidth);
});
win.bind("ewDragBy", (dx: unknown, dy: unknown) => {
  if (active && typeof dx === "number" && typeof dy === "number") {
    win.setPosition(
      Math.round(active.position[0] + dx * active.scale),
      Math.round(active.position[1] + dy * active.scale),
    );
  }
});

win.bind("ewResizeStart", (pageWidth: unknown) => {
  active = gesture(pageWidth);
});
win.bind("ewResizeBy", (edge: unknown, dx: unknown, dy: unknown) => {
  if (!active || typeof edge !== "string" || typeof dx !== "number" || typeof dy !== "number") {
    return;
  }
  const [startWidth, startHeight] = active.size;
  const [startX, startY] = active.position;
  const ratio = contentRatio ?? startWidth / startHeight;
  const minWidth = MIN_WIDTH * active.scale;

  // Keeps the needles' proportions, so a corner follows whichever axis moved further.
  const fromX = edge.includes("e")
    ? startWidth + dx * active.scale
    : edge.includes("w")
    ? startWidth - dx * active.scale
    : null;
  const fromY = edge.includes("s")
    ? (startHeight + dy * active.scale) * ratio
    : edge.includes("n")
    ? (startHeight - dy * active.scale) * ratio
    : null;
  const candidates = [fromX, fromY].filter((v): v is number => v !== null);
  if (!candidates.length) return;

  const maxWidth = MAX_WIDTH * active.scale;
  const width = Math.round(Math.min(maxWidth, Math.max(minWidth, ...candidates)));
  const height = Math.round(width / ratio);
  win.setSize(width, height);
  // The edges being dragged move; the opposite ones stay where they are.
  win.setPosition(
    edge.includes("w") ? startX + startWidth - width : startX,
    edge.includes("n") ? startY + startHeight - height : startY,
  );
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
  if (result.ratio) contentRatio = result.ratio;

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
