// Headless Chrome over the DevTools protocol, plus a tiny static server for the project folder.
// Node >= 22 (global WebSocket, fetch). No npm install.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve, normalize } from 'node:path';

// Any Chromium browser works (Chrome, Edge, Chromium). Set CHROME to override the search.
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA, 'C:/Program Files', 'C:/Program Files (x86)'].filter(Boolean);
  const cands = [
    ...pf.flatMap((p) => [`${p}/Google/Chrome/Application/chrome.exe`, `${p}/Microsoft/Edge/Application/msedge.exe`, `${p}/Chromium/Application/chrome.exe`]),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? [`${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`] : []),
  ];
  const dirs = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) cands.push(...dirs.map((d) => join(d, n)));
  const hit = cands.find((c) => { try { return existsSync(c); } catch { return false; } });
  if (!hit) throw new Error('No Chromium browser found (Chrome, Edge or Chromium). Install one or set CHROME to its executable.');
  return hit;
}
export const CHROME = findChrome();
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

// serve(root): the foundation folder. serve(root, projectRoot): a figure outside the foundation (--root).
// /engine/ and /fonts/ then come from the foundation, every other path from projectRoot, with the foundation as fallback.
export function serve(root, projectRoot) {
  root = resolve(root);
  const proj = projectRoot ? resolve(projectRoot) : null;
  const srv = createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let base = root;
    if (proj && !/^\/(engine|fonts)\//.test(u) && existsSync(normalize(join(proj, u)))) base = proj;
    const f = normalize(join(base, u));
    if (!f.startsWith(base) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, port: srv.address().port })));
}

export async function launch() {
  const prof = mkdtempSync(join(tmpdir(), 'schem-cdp-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run',
    '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none',
    // Without this, Chrome on Windows waits ~30 s for proxy auto-detection before the first page load (2026-10-06).
    '--no-proxy-server', 'about:blank']);
  const port = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('chrome did not start')), 20000);
    proc.stderr.on('data', (b) => { const m = /ws:\/\/[^:]+:(\d+)\//.exec(String(b)); if (m) { clearTimeout(t); res(m[1]); } });
  });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pend.set(i, (m) => m.error ? j(new Error(method + ': ' + m.error.message)) : r(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result.value; };
  // Chrome's helper processes can keep the stderr pipe open after the browser is killed, which kept the tool
  // from exiting: destroy the pipe, kill, and force the exit shortly after the tool's own cleanup.
  const close = () => { try { ws.close(); } catch {} try { proc.stderr.destroy(); } catch {} proc.kill();
    setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch {} process.exit(process.exitCode ?? 0); }, 800); };
  await send('Page.enable'); await send('Runtime.enable');
  return { send, evaluate, close };
}

// Load a figure module into the page. Returns {manifest, error}. dpi sets the device scale for screenshots.
// transparent: drop the page background (the figure's background rect and the page's white), so PNG and PDF carry no page colour.
export async function loadFigure(cdp, port, figPath, { dpi = 96, transparent = false } = {}) {
  const scale = dpi / 96;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: scale, mobile: false });
  const url = `http://127.0.0.1:${port}/engine/page.html?fig=/${figPath.replace(/\\/g, '/').replace(/^\/+/, '')}&v=${Date.now()}`;
  await cdp.send('Page.navigate', { url });
  for (let k = 0; k < 1600; k++) { if (await cdp.evaluate('window.__done === true')) break; await new Promise((r) => setTimeout(r, 50)); }
  const error = await cdp.evaluate('window.__error || null');
  const manifest = error ? null : await cdp.evaluate('window.__manifest');
  if (manifest) {
    const wpx = Math.ceil(manifest.widthMM * 96 / 25.4), hpx = Math.ceil(manifest.heightMM * 96 / 25.4);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: wpx, height: hpx, deviceScaleFactor: scale, mobile: false });
    if (transparent) {
      await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      await cdp.evaluate(`(() => {
        document.head.insertAdjacentHTML('beforeend', '<style>html,body{background:transparent!important}</style>');
        for (const r of document.querySelectorAll('#host svg rect[data-role="background"]')) r.remove();
      })()`);
    }
  }
  return { manifest, error };
}

export async function screenshot(cdp, { x = 0, y = 0, w, h, scale = 1 } = {}) {
  const clip = w ? { x, y, width: w, height: h, scale } : undefined;
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true, fromSurface: true });
  return Buffer.from(r.data, 'base64');
}

export function args(argv = process.argv.slice(2)) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; o[k] = v; }
    else o._.push(a);
  }
  return o;
}
