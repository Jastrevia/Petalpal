import fs from 'node:fs';
import path from 'node:path';
import { launchHeadlessChrome, createCDPClient } from './mobile/test/browserAutomation.mjs';

const ARTIFACTS_DIR = 'C:/Users/cjysu/.gemini/antigravity/brain/079854b1-4128-4356-9182-9fbbd80c86b5';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== PETALPAL FAIRY SCALE VERIFICATION SCREENSHOT CAPTURE ===');
  let chromeProc;
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    if (!res.ok) throw new Error();
    console.log('Connected to existing Chrome on port 9222');
  } catch {
    console.log('Launching headless Chrome on port 9222...');
    chromeProc = await launchHeadlessChrome();
  }

  const cdp = await createCDPClient();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  async function evaluate(expr) {
    const res = await cdp.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
    });
    return res.result?.value;
  }

  async function capture(fileName, label) {
    const snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const filePath = path.join(ARTIFACTS_DIR, fileName);
    fs.writeFileSync(filePath, Buffer.from(snap.result.data, 'base64'));
    console.log(`[Captured] ${label} -> ${fileName}`);
    return filePath;
  }

  // Set Desktop Viewport (1200 x 850, deviceScaleFactor: 1)
  console.log('\n--- Setting Desktop Viewport (1200x850, scale=1) ---');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 850,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const testUrl = 'http://localhost:8081/fairy-loading-test';
  console.log('Navigating to', testUrl, '...');
  await cdp.send('Page.navigate', { url: testUrl });
  await sleep(4000); // Wait for Expo web bundle to render

  // Wait for __SEEK_FAIRY to be available
  for (let i = 0; i < 20; i++) {
    const ready = await evaluate(`typeof window.__SEEK_FAIRY === 'function'`);
    if (ready) break;
    await sleep(200);
  }

  // 1. Mandatory Capture: 2 seconds (Pose 01: Peeking & Smiling)
  console.log('\n--- Capturing 2.0s (Pose 01: Peeking & Smiling) ---');
  await evaluate(`window.__SEEK_FAIRY(2000)`);
  await sleep(400);
  await capture('fairy_scale_2s_peeking.png', 'Mandatory 2.0s: Action 01 Peeking');

  // 2. Mandatory Capture: 7 seconds (Pose 02: Sitting & Looking Down)
  console.log('\n--- Capturing 7.0s (Pose 02: Sitting & Looking Down) ---');
  await evaluate(`window.__SEEK_FAIRY(7000)`);
  await sleep(400);
  await capture('fairy_scale_7s_sitting.png', 'Mandatory 7.0s: Action 02 Sitting');

  // 3. Mandatory Capture: 12 seconds (Pose 03: Flying & Tapping)
  console.log('\n--- Capturing 12.0s (Pose 03: Flying & Tapping) ---');
  await evaluate(`window.__SEEK_FAIRY(12000)`);
  await sleep(400);
  await capture('fairy_scale_12s_tapping.png', 'Mandatory 12.0s: Action 03 Tapping');

  // 4. Capture at Tap Contact with Sparkle (11800ms)
  console.log('\n--- Capturing 11.8s (Action 03 Fingertip Tap & Sparkle Contact) ---');
  await evaluate(`window.__SEEK_FAIRY(11800)`);
  await sleep(400);
  await capture('fairy_scale_11_8s_sparkle.png', 'Action 03 Fingertip Contact Sparkle');

  // 5. Inspect Flight Transitions
  console.log('\n--- Capturing Flight Transitions ---');
  await evaluate(`window.__SEEK_FAIRY(4400)`);
  await sleep(300);
  await capture('fairy_scale_trans_01_to_02.png', 'Transition 01 -> 02 (Peeking to Sitting at 4.4s)');

  await evaluate(`window.__SEEK_FAIRY(9400)`);
  await sleep(300);
  await capture('fairy_scale_trans_02_to_03.png', 'Transition 02 -> 03 (Sitting to Tapping at 9.4s)');

  await evaluate(`window.__SEEK_FAIRY(14400)`);
  await sleep(300);
  await capture('fairy_scale_trans_03_to_01.png', 'Transition 03 -> 01 (Tapping to Peeking at 14.4s)');

  // 6. Mobile Portrait Viewport (390 x 844, scale=2)
  console.log('\n--- Capturing Mobile Portrait Viewport (390x844) ---');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(500);

  await evaluate(`window.__SEEK_FAIRY(2000)`);
  await sleep(300);
  await capture('fairy_mobile_2s_peeking.png', 'Mobile 2.0s Peeking');

  await evaluate(`window.__SEEK_FAIRY(7000)`);
  await sleep(300);
  await capture('fairy_mobile_7s_sitting.png', 'Mobile 7.0s Sitting');

  await evaluate(`window.__SEEK_FAIRY(12000)`);
  await sleep(300);
  await capture('fairy_mobile_12s_tapping.png', 'Mobile 12.0s Tapping');

  console.log('\n=== All screenshots captured successfully! ===');
  process.exit(0);
}

run().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
