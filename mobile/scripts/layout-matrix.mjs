// npm run test:layout — screenshots of the key screens at every device size PetalPal supports
// (iPhone, iPhone landscape, iPad portrait/landscape/split, desktop), against the local preview
// (npm run web:local, fake data), plus an overflow check: the page wider or taller than the window,
// or controls that should be visible sitting partly off-screen. Reuses a fake-data preview already
// running on :8081 (or LOCAL_PREVIEW_PORT), otherwise starts one and stops it afterwards. PNGs go to mobile/layout-matrix/ (gitignored).
// Chrome's engine only; real Safari and native iOS still need a device or the simulator.
//   node scripts/layout-matrix.mjs [base-url] [--only=ipad] [--screens=sign-in,events]
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const PORT = Number(process.env.LOCAL_PREVIEW_PORT || 8081);
const BASE = process.argv.find(arg => arg.startsWith('http')) ?? `http://localhost:${PORT}`;
const ONLY = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const SCREENS = process.argv.find(arg => arg.startsWith('--screens='))?.slice(10).split(',');
const OUT = path.join(mobile, 'layout-matrix');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const SIZES = [
  ['iphone-se', 375, 667], ['iphone-pro-max', 440, 956], ['iphone-landscape', 956, 440],
  ['ipad-mini', 744, 1133], ['ipad-air-portrait', 820, 1180], ['ipad-air-landscape', 1180, 820],
  ['ipad-pro-13-portrait', 1032, 1376], ['ipad-pro-13-landscape', 1376, 1032], ['ipad-split-third', 375, 1032],
  ['desktop', 1440, 900], ['desktop-hd', 1920, 1080],
];
const desktop = name => name.startsWith('desktop');

// Playwright lives with the Cloudflare tooling in the main checkout (worktrees share it), as in phone-smoke.mjs.
const root = path.resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(), '..');
const playwrightPath = [path.join(root, 'deploy/cloudflare/node_modules/playwright/index.mjs'),
  path.resolve(mobile, '../deploy/cloudflare/node_modules/playwright/index.mjs')].find(existsSync);
if (!playwrightPath) throw new Error('Playwright not found: run npm ci in deploy/cloudflare first.');
const { chromium } = await import(pathToFileURL(playwrightPath).href);

// Only the fake-data preview: its proxy adds the fixtures script, so nothing reaches real accounts.
// Another checkout's preview on the same port would test that checkout's code: pick another
// LOCAL_PREVIEW_PORT then.
async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const html = res.ok ? await res.text() : '';
    if (html && !html.includes('__local-preview-fixtures.js')) throw new Error(`${url} is not the fake-data preview (npm run web:local); set LOCAL_PREVIEW_PORT to a free port.`);
    return Boolean(html);
  } catch (error) { if (String(error.message).includes('fake-data')) throw error; return false; }
}
let preview = null;
if (!(await reachable(BASE))) {
  if (BASE !== `http://localhost:${PORT}`) throw new Error(`Nothing answers at ${BASE}.`);
  console.log(`Starting npm run web:local on :${PORT} …`);
  preview = spawn(process.execPath, [path.join(here, 'web-local/start.mjs')], { cwd: mobile, stdio: 'ignore', detached: true,
    env: { ...process.env, LOCAL_PREVIEW_PORT: String(PORT) } });
  const until = Date.now() + 180_000;
  while (!(await reachable(BASE))) {
    if (Date.now() > until) { process.kill(-preview.pid, 'SIGINT'); throw new Error('The local preview did not start within 3 minutes.'); }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// What the page shows that a user would see as broken: a horizontal (or, where the screen is not meant
// to scroll, vertical) page scroll, and controls cut off by the window edge. Controls inside a scroll
// view are skipped (scrolling reaches them); so is anything hidden, transparent or zero-sized.
async function overflow(page, { scrolls }) {
  return page.evaluate(scrollsAllowed => {
    const vw = window.innerWidth, vh = window.innerHeight, doc = document.documentElement;
    const problems = [];
    const docWidth = Math.max(doc.scrollWidth, document.body.scrollWidth);
    const docHeight = Math.max(doc.scrollHeight, document.body.scrollHeight);
    if (docWidth > vw + 1) problems.push(`page is ${docWidth}px wide in a ${vw}px window`);
    if (!scrollsAllowed && docHeight > vh + 1) problems.push(`page is ${docHeight}px tall in a ${vh}px window`);
    const inScroller = element => {
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if ((/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1)
          || (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1)) return true;
      }
      return false;
    };
    const shown = element => {
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return false;
      }
      return true;
    };
    // The Garden's month signs are world objects that pan with the camera; off-screen is where they belong.
    const worldObject = /^(Open Pavilion for|Move|Enter Treehouse) /;
    const controls = document.querySelectorAll('[role="button"],button,input,textarea,[role="radio"],[role="checkbox"],[role="link"],a[href]');
    const cut = [];
    for (const element of controls) {
      const box = element.getBoundingClientRect();
      if (box.width < 2 || box.height < 2 || !shown(element)) continue;
      const out = box.left < -1 || box.top < -1 || box.right > vw + 1 || box.bottom > vh + 1;
      if (!out || inScroller(element)) continue;
      const fully = box.right <= 0 || box.left >= vw || box.bottom <= 0 || box.top >= vh;
      const label = element.getAttribute('aria-label') || element.getAttribute('data-testid') || element.textContent?.trim().slice(0, 30) || element.tagName.toLowerCase();
      if (worldObject.test(label)) continue;
      // Under another page (the Garden beneath the account pages or a panel): not what the user sees.
      const x = Math.min(vw - 1, Math.max(0, box.left + box.width / 2)), y = Math.min(vh - 1, Math.max(0, box.top + box.height / 2));
      const top = document.elementFromPoint(x, y);
      if (top && !element.contains(top) && !top.contains(element)) continue;
      cut.push(`${fully ? 'off-screen' : 'cut off'}: "${label}" at ${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}×${Math.round(box.height)}`);
    }
    if (cut.length) problems.push(...cut.slice(0, 6), ...(cut.length > 6 ? [`…and ${cut.length - 6} more`] : []));
    return problems;
  }, scrolls);
}

// First-open cards that stand between sign-in and the screens to capture. Never a panel's own controls.
const FIRST_RUN = /^(Keep it|Into the garden|Come back later|Not now|Later|Maybe later|Got it)$/;
// The Petal Ring is mounted more than once (the daily check-in and the dock), so only a visible copy counts.
const ringLater = page => page.locator('text="Come back later" >> visible=true').first();
const ringOpen = page => ringLater(page).isVisible().catch(() => false);
const firstRunCard = page => page.getByRole('button', { name: FIRST_RUN }).first().isVisible().catch(() => false)
  .then(async shown => shown || ringOpen(page));
const DEBUG = Boolean(process.env.LAYOUT_DEBUG);
async function settle(page) {
  for (let round = 0; round < 8 && await firstRunCard(page); round++) {
    if (DEBUG) console.log('    settle:', await page.getByRole('button', { name: FIRST_RUN }).allInnerTexts().catch(() => []), 'ring', await ringOpen(page),
      await page.locator('text="Come back later"').count());
    // The top card first: the Petal Ring covers the AI question's buttons.
    if (await ringOpen(page)) await ringLater(page).click({ force: true, timeout: 5000 }).catch(() => {});
    else await page.getByRole('button', { name: FIRST_RUN }).first().click({ timeout: 5000 })
      .catch(() => page.getByRole('button', { name: FIRST_RUN }).first().click({ force: true, timeout: 5000 }).catch(() => {}));
    await page.waitForTimeout(2500);
  }
}

const results = [];
async function shoot(page, size, screen, { scrolls = false } = {}) {
  if (SCREENS && !SCREENS.includes(screen)) return;
  await page.waitForTimeout(1200);
  // A busy machine can stall one screenshot; record it and go on rather than end the run.
  const shot = await page.screenshot({ path: path.join(OUT, `${size}--${screen}.png`), timeout: 30_000 }).then(() => null, error => error);
  const problems = shot ? [`screenshot failed: ${String(shot.message).split('\n')[0]}`] : await overflow(page, { scrolls }).catch(error => [`check failed: ${String(error.message).split('\n')[0]}`]);
  results.push({ size, screen, problems });
  console.log(`  ${problems.length ? '✗' : '✓'} ${screen}${problems.length ? '' : ''}`);
  for (const problem of problems) console.log(`      ${problem}`);
}
async function missed(size, screen, why) {
  if (SCREENS && !SCREENS.includes(screen)) return;
  results.push({ size, screen, problems: [`could not reach the screen: ${why}`] });
  console.log(`  ✗ ${screen} — could not reach it: ${why}`);
}

// A partial run (--only / --screens) keeps the other sizes' screenshots.
if (!ONLY && !SCREENS) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: ['--use-gl=angle', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
try {
  for (const [size, width, height] of SIZES.filter(([name]) => !ONLY || ONLY.some(part => name.includes(part)))) {
    console.log(`\n${size} (${width}×${height})`);
    const touch = !desktop(size);
    const newContext = async () => {
      const fresh = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
      fresh.setDefaultTimeout(15_000); // no single step may hang the run
      // The preview never calls the real internet; anything else is refused.
      await fresh.route('**/*', route => new URL(route.request().url()).hostname === new URL(BASE).hostname ? route.continue() : route.abort());
      return fresh;
    };
    let context = null;
    // One size going wrong (a crash, a stuck page) is reported and the run moves on to the next size.
    try {
    context = await newContext();

    // Signed out: the guest Garden, then the account pages a guest reaches from it.
    let page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 240_000 });
    const guestBar = page.getByTestId('guest-navigation');
    if (await guestBar.waitFor({ timeout: 150_000 }).then(() => true, () => false)) {
      await page.waitForTimeout(3000);
      await shoot(page, size, 'guest-garden');
      await guestBar.getByRole('button').first().click({ force: true, timeout: 10_000 }).catch(() => {});
    } else await missed(size, 'guest-garden', 'no guest bottom bar');
    const nameField = page.getByRole('textbox', { name: 'Username / PP number' });
    if (await nameField.waitFor({ timeout: 20_000 }).then(() => true, () => false)) {
      await page.waitForTimeout(2500); // the invitation's entrance
      await shoot(page, size, 'sign-in', { scrolls: true });
      await page.getByText('Create account', { exact: true }).click({ force: true, timeout: 10_000 }).catch(() => {});
      const create = page.getByTestId('create-account');
      if (await create.waitFor({ timeout: 10_000 }).then(() => true, () => false)) {
        await shoot(page, size, 'create-account', { scrolls: true });
        await page.getByRole('textbox', { name: 'Account name' }).fill('layout_matrix');
        const secrets = page.locator('input[type="password"]');
        await secrets.nth(0).fill('LayoutMatrix2026');
        await secrets.nth(1).fill('LayoutMatrix2026');
        await create.click({ force: true, timeout: 10_000 }).catch(() => {});
        if (await page.getByRole('radio', { name: 'Avatar 1', exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false)) {
          await shoot(page, size, 'welcome', { scrolls: true });
        } else {
          await page.screenshot({ path: path.join(OUT, `${size}--welcome-missing.png`) });
          await missed(size, 'welcome', 'no avatar picker after Create account');
        }
      } else await missed(size, 'create-account', 'Create account did not open the page');
    } else await missed(size, 'sign-in', 'no sign-in form');
    await context.close();

    // Signed in with the preview account: Events and Me over the Garden. A fresh context: the create-account
    // pages above leave a new preview account behind, which would sign in to a first-time welcome instead.
    if (!SCREENS || SCREENS.some(name => ['first-avatar', 'first-avatar-gift', 'first-open-card', 'garden', 'events', 'me'].includes(name))) {
      context = await newContext();
      page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 240_000 });
      await page.getByTestId('guest-navigation').getByRole('button').first().click({ timeout: 150_000 }).catch(() => {});
      const field = page.getByRole('textbox', { name: 'Username / PP number' });
      if (await field.waitFor({ timeout: 20_000 }).then(() => true, () => false)) {
        await field.fill('preview@example.invalid');
        await page.getByRole('textbox', { name: 'Password' }).fill('preview-only');
        await page.getByRole('textbox', { name: 'Password' }).press('Enter');
        const events = page.getByTestId('hud-events');
        if (await events.waitFor({ timeout: 90_000 }).then(() => true, () => false)) {
          await page.waitForTimeout(6000); // the daily check-in card settles into the calendar
          // A first sign-in asks for the first avatar before the Garden; capture it, then take the first one.
          const begin = page.getByRole('button', { name: 'Begin with this one' });
          if (await begin.isVisible().catch(() => false)) {
            await shoot(page, size, 'first-avatar', { scrolls: true });
            await page.getByRole('radio').first().click({ force: true, timeout: 10_000 }).catch(() => {});
            await begin.click({ force: true, timeout: 10_000 }).catch(() => {});
            const done = page.getByRole('button', { name: 'Into the garden' });
            if (await done.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
              await shoot(page, size, 'first-avatar-gift', { scrolls: true });
              await done.click({ force: true, timeout: 10_000 }).catch(() => {});
            }
            await page.waitForTimeout(3000);
          }
          // Then the day's first-open cards (a keepsake, the Petal Ring, the AI question): capture one, close them all.
          if (await firstRunCard(page)) await shoot(page, size, 'first-open-card', { scrolls: true });
          await settle(page);
          await shoot(page, size, 'garden');
          for (const [id, screen] of [['events', 'events'], ['profile', 'me']]) {
            // force: the newcomer glow keeps the icons moving, so they never count as "stable". A waiting
            // card (a level-up) can take the first tap instead of the panel, so tap again after closing it.
            // The panel's own content, not just a Close: the Petal Ring (also with a Close) can open over it.
            const marker = id === 'events' ? page.getByText('Choose your mood').first() : page.getByText('Garden Privacy').first();
            for (let tap = 0; tap < 5 && !(await marker.isVisible().catch(() => false)); tap++) {
              await settle(page);
              await page.getByTestId(`hud-${id}`).click({ force: true, timeout: 10_000 }).catch(() => {});
              await page.waitForTimeout(2500);
              if (DEBUG) console.log(`    tapped ${id}: ring`, await ringOpen(page), 'marker', await marker.isVisible().catch(() => false));
              await settle(page);
            }
            if (await marker.isVisible().catch(() => false)) await shoot(page, size, screen, { scrolls: true });
            else {
              await page.screenshot({ path: path.join(OUT, `${size}--${screen}-missing.png`) }).catch(() => {});
              await missed(size, screen, `the ${id} panel did not open`);
            }
            await page.getByRole('button', { name: 'Close' }).last().click({ force: true, timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(800);
          }
        } else for (const screen of ['garden', 'events', 'me']) await missed(size, screen, 'the signed-in Garden did not open');
      } else for (const screen of ['garden', 'events', 'me']) await missed(size, screen, 'no sign-in form');
      await page.close();
    }
    } catch (error) {
      results.push({ size, screen: '(run)', problems: [`stopped early: ${String(error.message).split('\n')[0]}`] });
      console.log(`  ✗ stopped early: ${String(error.message).split('\n')[0]}`);
    }
    await context?.close().catch(() => {});
  }
} finally {
  await browser.close();
  if (preview) process.kill(-preview.pid, 'SIGINT');
}
const failed = results.filter(item => item.problems.length);
console.log(`\n${results.length - failed.length}/${results.length} screens without layout problems. Screenshots: ${path.relative(process.cwd(), OUT) || OUT}/`);
if (failed.length) process.exitCode = 1;
