// Runs inside NYT's page (main world), so everything here is defensive: it never moves
// NYT's DOM nodes, only re-styles them, and it can safely run again after a reload.
//
// `bindings` is also visible to NYT's own scripts. Each one in main.ts therefore does
// only something harmless: move the window, switch view, or quit.
export const INJECT = String.raw`
(() => {
  // Stay out of the loading page and any third-party sign-in page.
  if (window.__ew || !/(^|\.)nytimes\.com$/.test(location.hostname)) return;
  const api = bindings;
  const WIDTH = 300, PAD = 12;

  const page = new CSSStyleSheet();
  page.replaceSync([
    'html[data-ew-mode="needles"], html[data-ew-mode="needles"] body { overflow: hidden !important; background: #fff !important; }',
    'html[data-ew-mode="needles"] body *:not([data-ew], [data-ew] *) { visibility: hidden !important; pointer-events: none !important; }',
    'html[data-ew-mode="needles"] [data-ew] { position: fixed !important; visibility: visible !important; margin: 0 !important; width: ' + WIDTH + 'px !important; max-width: none !important; top: var(--ew-top) !important; transform: scale(var(--ew-scale)) !important; transform-origin: 0 0 !important; pointer-events: none !important; }',
    'html[data-ew-mode="needles"] [data-ew="0"] { left: var(--ew-left0) !important; }',
    'html[data-ew-mode="needles"] [data-ew="1"] { left: var(--ew-left1) !important; }',
    '#__ew_host { position: fixed; z-index: 2147483647; visibility: visible !important; inset: 0; }',
    'html[data-ew-mode="full"] #__ew_host { inset: auto 14px 14px auto; }',
  ].join('\n'));
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, page];

  const host = document.createElement('div');
  host.id = '__ew_host';
  const root = host.attachShadow({ mode: 'closed' });
  const ui = new CSSStyleSheet();
  ui.replaceSync([
    ':host { all: initial; font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #fff; user-select: none; -webkit-user-select: none; }',
    '#layer { position: fixed; inset: 0; cursor: default; }',
    '#scrim { position: absolute; inset: 0; background: rgba(0,0,0,.5); opacity: 0; transition: opacity 140ms ease; }',
    '#bar { position: absolute; inset: 10px 10px auto; display: flex; align-items: center; justify-content: space-between; opacity: 0; transition: opacity 140ms ease; }',
    '.hover #scrim, .hover #bar { opacity: 1; }',
    '#host { text-shadow: 0 1px 3px rgba(0,0,0,.6); }',
    'button { display: flex; align-items: center; gap: 6px; height: 30px; min-width: 30px; padding: 0 9px; border: 0; border-radius: 7px; background: rgba(30,30,30,.88); color: inherit; font: inherit; }',
    'button:hover { background: rgba(70,70,70,.95); }',
    'svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }',
    '#back { display: none; }',
    '.full #layer { display: none; }',
    '.full #back { display: flex; }',
  ].join('\n'));
  root.adoptedStyleSheets = [ui];
  root.innerHTML =
    '<div id="wrap">' +
      '<div id="layer"><div id="scrim"></div><div id="bar">' +
        '<button id="expand" title="Show the full page"><svg viewBox="0 0 14 14"><path d="M12 12 2.5 2.5M2.5 9V2.5H9"/></svg></button>' +
        '<span id="host">www.nytimes.com</span>' +
        '<button id="close"><svg viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12"/></svg>Close</button>' +
      '</div></div>' +
      '<button id="back">Back to needles</button>' +
    '</div>';
  const $ = (id) => root.getElementById(id);
  const wrap = $('wrap');
  document.documentElement.appendChild(host);

  $('close').onclick = () => api.ewClose();
  $('expand').onclick = () => api.ewSetMode('full');
  $('back').onclick = () => api.ewSetMode('needles');
  for (const b of root.querySelectorAll('button')) b.onpointerdown = (e) => e.stopPropagation();

  // Frameless webviews have no native drag region, so the window is moved by hand.
  // Screen coordinates stay valid while the window moves underneath the pointer.
  const layer = $('layer');
  let start = null, pending = null;
  layer.onpointerdown = (e) => {
    if (e.button !== 0) return;
    layer.setPointerCapture(e.pointerId);
    start = { x: e.screenX, y: e.screenY };
    api.ewDragStart();
  };
  layer.onpointermove = (e) => {
    if (!start) return;
    const flush = !pending;
    pending = { x: e.screenX - start.x, y: e.screenY - start.y };
    if (flush) requestAnimationFrame(() => { api.ewDragBy(pending.x, pending.y); pending = null; });
  };
  layer.onpointerup = layer.onpointercancel = () => { start = null; };

  document.documentElement.addEventListener('pointerenter', () => window.__ew.hover(true));
  document.documentElement.addEventListener('pointerleave', () => window.__ew.hover(false));

  const pick = () => {
    const marked = [...document.querySelectorAll('[data-ew]')];
    if (marked.length === 2) return marked;
    marked.forEach((el) => el.removeAttribute('data-ew'));
    const found = [...document.querySelectorAll('.needle-wrapper')]
      .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
      .slice(0, 2);
    if (found.length < 2) return null;
    found.forEach((el, i) => el.setAttribute('data-ew', String(i)));
    return found;
  };

  window.__ew = {
    hover: (on) => wrap.classList.toggle('hover', on),
    tick(mode) {
      const html = document.documentElement;
      wrap.classList.toggle('full', mode === 'full');
      const needles = pick();
      // NYT's sign-in wall must stay visible: the needles sit behind it in the DOM, and
      // isolating them would hide the wall rather than let the user sign in.
      const gate = document.querySelector('#gateway-content');
      const gated = !!gate && gate.getBoundingClientRect().height > 0;
      html.dataset.ewMode = mode === 'needles' && needles && !gated ? 'needles' : 'full';
      if (!needles || gated) return { found: false, gated };

      const height = Math.max(...needles.map((el) => el.offsetHeight));
      const w = WIDTH * 2 + PAD * 3, h = height + PAD * 2;
      const scale = Math.min(innerWidth / w, innerHeight / h);
      const x = (innerWidth - w * scale) / 2, y = (innerHeight - h * scale) / 2;
      html.style.setProperty('--ew-scale', scale);
      html.style.setProperty('--ew-top', (y + PAD * scale) + 'px');
      html.style.setProperty('--ew-left0', (x + PAD * scale) + 'px');
      html.style.setProperty('--ew-left1', (x + (WIDTH + PAD * 2) * scale) + 'px');
      return {
        found: true,
        ratio: w / h,
        screen: { x: screen.availLeft, y: screen.availTop, width: screen.availWidth, height: screen.availHeight },
      };
    },
  };
})();
`;
