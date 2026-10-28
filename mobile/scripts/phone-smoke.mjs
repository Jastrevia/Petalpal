// npm run test:phone — the app on emulated phones (iPhone and Android sizes, touch, phone user
// agents), driven through what testers do, against the local preview (npm run web:local, fake
// data). Fails on anything a phone user would see break: the calendar or bottom icons missing or
// covered, a panel that cannot close, the page left shifted after typing, an uncaught error, or
// the Garden animating too slowly. Chrome's engine only: real iPhone Safari still needs a phone
// (npm run web:phone) for the last check.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = process.argv.find(arg => arg.startsWith('http')) ?? 'http://localhost:8081';
// Headless Chrome on a laptop renders WebGL in software (a blank page tops out near 55 fps), so
// this floor catches a Garden that is clearly stuck, not the frame rate a phone's GPU reaches.
const MIN_FPS = Number(process.env.PHONE_SMOKE_MIN_FPS || 15);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Playwright lives with the Cloudflare tooling in the main checkout (worktrees share it).
const root = path.resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(), '..');
const playwrightPath = [path.join(root, 'deploy/cloudflare/node_modules/playwright/index.mjs'),
  path.resolve('../deploy/cloudflare/node_modules/playwright/index.mjs')].find(existsSync);
if (!playwrightPath) throw new Error('Playwright not found: run npm ci in deploy/cloudflare first.');
const { chromium, devices } = await import(pathToFileURL(playwrightPath).href);

const PHONES = [['iPhone 13', devices['iPhone 13']], ['Pixel 7', devices['Pixel 7']], ['iPhone SE (small)', devices['iPhone SE']]];
const results = [];
const check = (phone, name, ok, detail = '') => { results.push({ phone, name, ok, detail }); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

// True when the element is inside the screen and is what a tap at its centre would hit.
async function tappable(page, locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return { ok: false, why: 'not on screen' };
  const view = page.viewportSize();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (cx < 0 || cy < 0 || cx > view.width || cy > view.height) return { ok: false, why: `outside the screen at ${Math.round(cx)},${Math.round(cy)}` };
  const hit = await locator.evaluate((element, [x, y]) => {
    const top = document.elementFromPoint(x, y);
    if (top && (element === top || element.contains(top))) return null;
    const label = top?.closest('[aria-label],[data-testid]');
    return top ? `${top.tagName.toLowerCase()} ${label?.getAttribute('data-testid') || label?.getAttribute('aria-label') || ''}`.trim() : 'nothing';
  }, [cx, cy]);
  return hit === null ? { ok: true } : { ok: false, why: `covered by ${hit}` };
}

async function fps(page, ms = 3000) {
  return page.evaluate(duration => new Promise(resolve => {
    let frames = 0; const start = performance.now();
    const tick = now => { frames++; if (now - start < duration) requestAnimationFrame(tick); else resolve(frames * 1000 / (now - start)); };
    requestAnimationFrame(tick);
  }), ms);
}

const browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: ['--use-gl=angle', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
try {
  for (const [phone, device] of PHONES.filter(([name]) => !process.env.PHONE_SMOKE_ONLY || name.includes(process.env.PHONE_SMOKE_ONLY))) {
    console.log(`\n${phone} (${device.viewport.width}×${device.viewport.height})`);
    const context = await browser.newContext({ ...device });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('pageerror', error => { if (process.env.PHONE_SMOKE_STACKS) console.log(String(error.stack).split('\n').slice(0, 12).join('\n')); });
    page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource|ERR_NAME_NOT_RESOLVED/.test(message.text())) errors.push(message.text()); });
    // The preview never calls the real internet; anything else is refused.
    await page.route('**/*', route => new URL(route.request().url()).hostname === new URL(BASE).hostname ? route.continue() : route.abort());

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.getByRole('textbox', { name: 'Email address' }).fill('preview@example.invalid', { timeout: 120_000 });
    await page.getByRole('textbox', { name: 'Password' }).fill('preview-only');
    await page.getByRole('textbox', { name: 'Password' }).press('Enter');

    const calendar = page.locator('[aria-label^="Open Garden calendar"]');
    await calendar.waitFor({ timeout: 90_000 }).catch(() => {});
    // The daily check-in card (first open of the day) shrinks into the calendar; let it finish.
    await page.waitForTimeout(5000);
    let r = await tappable(page, calendar); check(phone, 'calendar visible and tappable', r.ok, r.why);
    for (const id of ['events', 'friends', 'fairy', 'profile']) {
      r = await tappable(page, page.getByTestId(`hud-${id}`)); check(phone, `bottom icon "${id}" visible and tappable`, r.ok, r.why);
    }
    await page.waitForTimeout(8000); // Let AUTO quality settle (it steps down within a few seconds).
    const speed = await fps(page); check(phone, `Garden animates smoothly (≥ ${MIN_FPS} fps)`, speed >= MIN_FPS, `${speed.toFixed(0)} fps`);

    // Every panel: its × is on top, it closes, and a tap outside closes it too.
    for (const id of ['events', 'friends', 'profile']) {
      await page.getByTestId(`hud-${id}`).click();
      const close = page.getByRole('button', { name: 'Close' }).last();
      await close.waitFor({ timeout: 10_000 }).catch(() => {});
      r = await tappable(page, close); check(phone, `${id} panel: × visible and tappable`, r.ok, r.why);
      await close.click().catch(() => {});
      await page.waitForTimeout(600);
      r = await tappable(page, calendar); check(phone, `${id} panel closed, Garden back`, r.ok, r.why);
    }

    // Typing then leaving the field must not leave the page shifted.
    await page.getByTestId('hud-events').click();
    const field = page.getByRole('textbox', { name: 'What happened?' });
    await field.waitFor({ timeout: 10_000 }).catch(() => {});
    await field.tap().catch(() => {});
    await page.keyboard.type('Phone smoke test');
    await page.evaluate(() => { window.scrollTo(0, 120); (document.activeElement)?.blur?.(); });
    await page.waitForTimeout(500);
    const scrolled = await page.evaluate(() => window.scrollY || document.documentElement.scrollTop);
    check(phone, 'page back in place after typing', scrolled === 0, scrolled ? `still shifted ${scrolled}px` : '');
    await page.getByRole('button', { name: 'Close' }).last().click().catch(() => {});
    await page.waitForTimeout(600);

    // A friend's Garden and back: the calendar and icons return.
    await page.getByTestId('hud-friends').click();
    const visit = page.getByRole('button', { name: /^Visit .*Garden$/ }).first();
    const canVisit = await visit.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    check(phone, 'friend list shows a Garden to visit', canVisit);
    if (canVisit) {
      await visit.click();
      await page.getByRole('button', { name: 'Return to My Garden' }).first().click({ timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(4000);
      r = await tappable(page, calendar); check(phone, 'calendar back after visiting a friend', r.ok, r.why);
      r = await tappable(page, page.getByTestId('hud-events')); check(phone, 'icons back after visiting a friend', r.ok, r.why);
    }
    check(phone, 'no uncaught errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    const skipped = await page.evaluate(() => globalThis.__gardenSkippedImages ?? 0);
    if (skipped) console.log(`  · ${skipped} draw(s) of a released image were skipped (safety net, no crash)`);
    await context.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter(item => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) { console.log('Failed:'); failed.forEach(item => console.log(`  ${item.phone}: ${item.name} — ${item.detail}`)); process.exitCode = 1; }
