import fs from 'node:fs';
import path from 'node:path';
import { launchHeadlessChrome, createCDPClient } from './mobile/test/browserAutomation.mjs';

const ARTIFACTS_DIR = 'C:/Users/cjysu/.gemini/antigravity/brain/29c68174-3514-4da4-a283-62d907ccd0b5';

async function run() {
  console.log('--- Launching Chrome for Entrance Visual Inspection ---');
  let chromeProc;
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    if (!res.ok) throw new Error();
  } catch {
    chromeProc = await launchHeadlessChrome();
  }

  const cdp = await createCDPClient();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  async function capture(name) {
    const snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(ARTIFACTS_DIR, name);
    fs.writeFileSync(file, Buffer.from(snap.result.data, 'base64'));
    console.log('Saved screenshot:', name);
  }

  async function setViewport(w, h, isMobile, dsf = 2) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: dsf,
      mobile: isMobile,
    });
    await cdp.send('Runtime.evaluate', { expression: "window.dispatchEvent(new Event('resize'))" });
    await new Promise((r) => setTimeout(r, 600));
  }

  async function resetAndSeek(label) {
    console.log(`Seeking frame: ${label}...`);
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          // Reset first to clear any running state
          const resetBtn = Array.from(document.querySelectorAll('div[role="button"], button')).find(b => b.innerText && b.innerText.includes('Reset Entrance'));
          if (resetBtn) resetBtn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 300));

    // Open inspect frames if not open
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const expandBtn = Array.from(document.querySelectorAll('div[role="button"], button')).find(b => b.innerText && b.innerText.includes('Inspect frames +'));
          if (expandBtn) expandBtn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 300));

    // Click the requested still label
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('div[role="button"], button')).find(b => b.innerText && b.innerText.trim() === '${label}');
          if (btn) btn.click();
        })()
      `,
    });
    await new Promise((r) => setTimeout(r, 600));
  }

  // 1. Mobile Viewport (412 x 892)
  console.log('--- MOBILE VIEWPORT (412 x 892) ---');
  await setViewport(412, 892, true, 2);
  await cdp.send('Page.navigate', { url: 'http://localhost:8081/login-preview' });
  await new Promise((r) => setTimeout(r, 3000));

  // 1. Closed gates before login
  await resetAndSeek('Closed');
  await capture('screen_1_mobile_closed_before_login.png');

  // 2. Gates halfway open
  await resetAndSeek('Halfway');
  await capture('screen_2_mobile_gates_halfway.png');

  // 3. Fully opened gates before camera movement
  await resetAndSeek('Open');
  await capture('screen_3_mobile_gates_open.png');

  // 4. Midway through the unified scene zoom
  await resetAndSeek('Entering');
  await capture('screen_4_mobile_zoom_midway.png');

  // 5. Final camera-push frame
  await resetAndSeek('Complete');
  await capture('screen_5_mobile_zoom_final.png');

  // 2. Desktop Viewport (1200 x 800)
  console.log('--- DESKTOP VIEWPORT (1200 x 800) ---');
  await setViewport(1200, 800, false, 1.5);
  await new Promise((r) => setTimeout(r, 600));

  // 1. Closed gates before login
  await resetAndSeek('Closed');
  await capture('screen_6_desktop_closed_before_login.png');

  // 2. Gates halfway open
  await resetAndSeek('Halfway');
  await capture('screen_7_desktop_gates_halfway.png');

  // 3. Fully opened gates before camera movement
  await resetAndSeek('Open');
  await capture('screen_8_desktop_gates_open.png');

  // 4. Midway through the unified scene zoom
  await resetAndSeek('Entering');
  await capture('screen_9_desktop_zoom_midway.png');

  // 5. Final camera-push frame
  await resetAndSeek('Complete');
  await capture('screen_10_desktop_zoom_final.png');

  cdp.ws.close();
  if (chromeProc) chromeProc.kill();
  console.log('Finished capturing all verification stills.');
}

run().catch((e) => {
  console.error('Error running test script:', e);
  process.exit(1);
});
