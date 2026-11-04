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
  const PAD = 12;
  // Needles are drawn at a set width and scaled to fit. The map has no set width: it sizes
  // itself from its on-screen box, so scaling it would make it draw too small.
  const VIEWS = {
    map: { selector: '.national-map-component-wrapper', count: 1 },
    needles: { selector: '.needle-wrapper', count: 2, width: 300 },
  };

  const page = new CSSStyleSheet();
  page.replaceSync([
    'html[data-ew-mode="compact"], html[data-ew-mode="compact"] body { overflow: hidden !important; background: #fff !important; }',
    'html[data-ew-mode="compact"] body *:not([data-ew], [data-ew] *) { visibility: hidden !important; pointer-events: none !important; }',
    'html[data-ew-mode="compact"] [data-ew] { position: fixed !important; visibility: visible !important; margin: 0 !important; width: var(--ew-width) !important; max-width: none !important; top: var(--ew-top) !important; transform: scale(var(--ew-scale)) !important; transform-origin: 0 0 !important; pointer-events: none !important; }',
    'html[data-ew-mode="compact"] [data-ew="0"] { left: var(--ew-left0) !important; }',
    'html[data-ew-mode="compact"] [data-ew="1"] { left: var(--ew-left1) !important; }',
    'html[data-ew-mode="compact"] [data-ew] .full-results-link { display: none !important; }',
    // The hover bar has its own Senate and House buttons in the same spot.
    'html[data-ew-hover] [data-ew] .toggle { visibility: hidden !important; }',
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
    '#chamber { display: none; gap: 2px; }',
    '.chambers #chamber { display: flex; }',
    '.chambers #host { display: none; }',
    '#chamber .on { background: #fff; color: #111; }',
    '#back { display: none; }',
    '.full #layer { display: none; }',
    '.full #back { display: flex; }',
    '.grip { position: absolute; }',
    '[data-edge="n"], [data-edge="s"] { left: 14px; right: 14px; height: 6px; cursor: ns-resize; }',
    '[data-edge="e"], [data-edge="w"] { top: 14px; bottom: 14px; width: 6px; cursor: ew-resize; }',
    '[data-edge="n"] { top: 0; } [data-edge="s"] { bottom: 0; }',
    '[data-edge="e"] { right: 0; } [data-edge="w"] { left: 0; }',
    '[data-edge$="e"][data-edge^="n"], [data-edge$="w"][data-edge^="n"], [data-edge$="e"][data-edge^="s"], [data-edge$="w"][data-edge^="s"] { width: 14px; height: 14px; }',
    '[data-edge="nw"] { top: 0; left: 0; cursor: nwse-resize; } [data-edge="se"] { bottom: 0; right: 0; cursor: nwse-resize; }',
    '[data-edge="ne"] { top: 0; right: 0; cursor: nesw-resize; } [data-edge="sw"] { bottom: 0; left: 0; cursor: nesw-resize; }',
  ].join('\n'));
  root.adoptedStyleSheets = [ui];
  root.innerHTML =
    '<div id="wrap">' +
      '<div id="layer"><div id="scrim"></div><div id="bar">' +
        '<button id="expand" title="Show the full page"><svg viewBox="0 0 14 14"><path d="M12 12 2.5 2.5M2.5 9V2.5H9"/></svg></button>' +
        '<span id="host">www.nytimes.com</span>' +
        '<div id="chamber"><button data-chamber="Senate">Senate</button><button data-chamber="House">House</button></div>' +
        '<button id="close"><svg viewBox="0 0 14 14"><path d="M2 2l10 10M12 2 2 12"/></svg>Close</button>' +
      '</div>' +
      ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map((e) => '<div class="grip" data-edge="' + e + '"></div>').join('') +
      '</div>' +
      '<button id="back">Back</button>' +
    '</div>';
  const $ = (id) => root.getElementById(id);
  const wrap = $('wrap');
  document.documentElement.appendChild(host);

  $('close').onclick = () => api.ewClose();
  $('expand').onclick = () => api.ewSetFull(true);
  $('back').onclick = () => api.ewSetFull(false);
  for (const b of root.querySelectorAll('[data-chamber]')) {
    b.onclick = () => {
      sessionStorage.setItem(CHAMBER_KEY, b.dataset.chamber);
      window.__ew.tick(lastView, lastFull);
    };
  }
  for (const b of root.querySelectorAll('button')) b.onpointerdown = (e) => e.stopPropagation();

  // Frameless webviews have no native drag region, so the window is moved by hand.
  // Screen coordinates stay valid while the window moves underneath the pointer.
  const track = (el, begin, move) => {
    let start = null, pending = null;
    el.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      start = { x: e.screenX, y: e.screenY };
      begin();
    };
    el.onpointermove = (e) => {
      if (!start) return;
      const flush = !pending;
      pending = { x: e.screenX - start.x, y: e.screenY - start.y };
      if (flush) requestAnimationFrame(() => { move(pending.x, pending.y); pending = null; });
    };
    el.onpointerup = el.onpointercancel = () => { start = null; };
  };
  track($('layer'), () => api.ewDragStart(innerWidth), (x, y) => api.ewDragBy(x, y));

  // Frameless windows on Windows have no native resize border.
  for (const grip of root.querySelectorAll('.grip')) {
    const edge = grip.dataset.edge;
    track(grip, () => api.ewResizeStart(innerWidth), (x, y) => api.ewResizeBy(edge, x, y));
  }
  addEventListener('resize', () => window.__ew.tick(lastView, lastFull));

  // Windows keeps Win+N for itself, so Ctrl+N is the equivalent there. Unhandled, Ctrl+N
  // would open a browser window on Windows.
  addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'n') return;
    e.preventDefault();
    if (!e.repeat) api.ewSwapView();
  }, true);

  document.documentElement.addEventListener('pointerenter', () => window.__ew.hover(true));
  document.documentElement.addEventListener('pointerleave', () => window.__ew.hover(false));

  let lastView = 'map', lastFull = false;
  const CHAMBER_KEY = '__ew_chamber'; // Survives the safety-net reload.

  const find = (view) => {
    const { selector, count, width } = VIEWS[view];
    const els = [...document.querySelectorAll(selector)]
      .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
      .slice(0, count);
    return els.length === count ? { view, width, els } : null;
  };

  // NYT may drop either one from the homepage, so show the other rather than nothing.
  const pick = (view) => {
    const other = view === 'map' ? 'needles' : 'map';
    const shown = find(view) || (document.readyState === 'complete' ? find(other) : null);
    const keep = shown ? shown.els : [];
    document.querySelectorAll('[data-ew]').forEach((el) => {
      if (!keep.includes(el)) el.removeAttribute('data-ew');
    });
    keep.forEach((el, i) => {
      if (el.getAttribute('data-ew') !== String(i)) el.setAttribute('data-ew', String(i));
    });
    return shown;
  };

  // Mirrors NYT's Senate/House toggle, which sits under the window's drag layer.
  const syncChamber = (map) => {
    const nyt = map ? [...map.querySelectorAll('.toggle button')] : [];
    const label = (b) => b.textContent.trim();
    const wanted = sessionStorage.getItem(CHAMBER_KEY);
    const target = nyt.find((b) => label(b) === wanted);
    if (target && !target.classList.contains('active')) target.click();
    const active = target || nyt.find((b) => b.classList.contains('active'));
    wrap.classList.toggle('chambers', nyt.length > 1);
    for (const b of root.querySelectorAll('[data-chamber]')) {
      b.classList.toggle('on', !!active && label(active) === b.dataset.chamber);
    }
  };

  window.__ew = {
    hover(on) {
      wrap.classList.toggle('hover', on);
      document.documentElement.toggleAttribute('data-ew-hover', on);
    },
    tick(view, full) {
      lastView = view;
      lastFull = full;
      const html = document.documentElement;
      wrap.classList.toggle('full', full);
      const shown = pick(view);
      // NYT's sign-in wall must stay visible: the page sits behind it in the DOM, and
      // isolating part of it would hide the wall rather than let the user sign in.
      const gate = document.querySelector('#gateway-content');
      const gated = !!gate && gate.getBoundingClientRect().height > 0;
      html.dataset.ewMode = !full && shown && !gated ? 'compact' : 'full';
      if (!shown || gated) return { found: false, gated };

      syncChamber(shown.view === 'map' ? shown.els[0] : null);
      const count = shown.els.length;
      const width = shown.width ?? innerWidth - PAD * 2;
      html.style.setProperty('--ew-width', width + 'px');
      const height = Math.max(...shown.els.map((el) => el.offsetHeight));
      const w = width * count + PAD * (count + 1), h = height + PAD * 2;
      const scale = shown.width ? Math.min(innerWidth / w, innerHeight / h) : 1;
      const x = (innerWidth - w * scale) / 2, y = Math.max(0, (innerHeight - h * scale) / 2);
      html.style.setProperty('--ew-scale', scale);
      html.style.setProperty('--ew-top', (y + PAD * scale) + 'px');
      shown.els.forEach((_, i) => {
        html.style.setProperty('--ew-left' + i, (x + (PAD + (width + PAD) * i) * scale) + 'px');
      });
      return {
        found: true,
        ratio: w / h,
        screen: { x: screen.availLeft, y: screen.availTop, width: screen.availWidth, height: screen.availHeight },
      };
    },
  };
})();
`;
