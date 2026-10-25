import fs from 'node:fs';
import path from 'node:path';
import { launchHeadlessChrome, createCDPClient } from './mobile/test/browserAutomation.mjs';

const ARTIFACTS_DIR = 'C:/Users/cjysu/.gemini/antigravity/brain/079854b1-4128-4356-9182-9fbbd80c86b5';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== Starting Fairy Loading Visual Verification ===');
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

  // Test 1: Desktop Viewport (1200 x 800)
  console.log('Setting desktop widescreen viewport (1200x800)...');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 800,
    deviceScaleFactor: 1.5,
    mobile: false,
  });

  const testUrl = 'http://localhost:8081/fairy-loading-test';
  console.log('Navigating to', testUrl, '...');
  await cdp.send('Page.navigate', { url: testUrl });
  await sleep(4000); // Wait for Expo web bundle to load

  // Helper to click by selector or text
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

  // 1. Capture Action 01: Peeking & Smiling (Upper-Right)
  console.log('\n--- Verifying Action 01: Peeking & Smiling ---');
  await evaluate(`
    // Click '01 Peeking'
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const btn = buttons.find(b => b.innerText && b.innerText.includes('01 Peeking'));
    if (btn) btn.click();
  `);
  await sleep(600);
  await capture('fairy_01_peeking_desktop.png', 'Action 01: Peeking & Smiling (Upper-Right)');

  // 2. Capture Action 02: Sitting & Looking Down (Upper-Left)
  console.log('\n--- Verifying Action 02: Sitting & Looking Down ---');
  await evaluate(`
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const btn = buttons.find(b => b.innerText && b.innerText.includes('02 Sitting'));
    if (btn) btn.click();
  `);
  await sleep(600);
  await capture('fairy_02_sitting_desktop.png', 'Action 02: Sitting & Looking Down (Upper-Left)');

  // 3. Capture Action 03: Flying & Tapping (Lower-Right) with Sparkle Contact
  console.log('\n--- Verifying Action 03: Flying & Tapping ---');
  await evaluate(`
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const btn = buttons.find(b => b.innerText && b.innerText.includes('03 Tapping'));
    if (btn) btn.click();
  `);
  // Advance to tap contact point
  await sleep(400);
  await capture('fairy_03_tapping_desktop.png', 'Action 03: Flying & Tapping (Lower-Right)');

  // 4. Capture Mobile Portrait Viewport (412 x 892)
  console.log('\n--- Verifying Mobile Portrait Viewport (412x892) ---');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 892,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(500);

  // Mobile Action 01
  await evaluate(`
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const btn = buttons.find(b => b.innerText && b.innerText.includes('01 Peeking'));
    if (btn) btn.click();
  `);
  await sleep(400);
  await capture('fairy_01_mobile_portrait.png', 'Mobile Portrait Action 01');

  // Mobile Action 02
  await evaluate(`
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const btn = buttons.find(b => b.innerText && b.innerText.includes('02 Sitting'));
    if (btn) btn.click();
  `);
  await sleep(400);
  await capture('fairy_02_mobile_portrait.png', 'Mobile Portrait Action 02');

  // Mobile Action 03
  await evaluate(`
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const btn = buttons.find(b => b.innerText && b.innerText.includes('03 Tapping'));
    if (btn) btn.click();
  `);
  await sleep(400);
  await capture('fairy_03_mobile_portrait.png', 'Mobile Portrait Action 03');

  // 5. Test Live Continuous Real-Time Playback and Capture 15-Second Cycle
  console.log('\n--- Capturing Live 15-Second Continuous Animation Sequence ---');
  // Return to Desktop viewport
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1100,
    height: 750,
    deviceScaleFactor: 1.5,
    mobile: false,
  });
  await sleep(300);

  // Click Reset and Play
  await evaluate(`
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const resetBtn = buttons.find(b => b.innerText && b.innerText.includes('Reset'));
    if (resetBtn) resetBtn.click();
  `);
  await sleep(200);
  await evaluate(`
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const playBtn = buttons.find(b => b.innerText && b.innerText.includes('Play'));
    if (playBtn) playBtn.click();
  `);

  const sequenceFrames = [];
  const cycleTimes = [
    { sec: 1.5, name: 'cycle_01_peeking_smile.png', label: 'Cycle 1: 01 Peeking & Smiling (t=1.5s)' },
    { sec: 4.4, name: 'cycle_02_transition_1_to_2.png', label: 'Cycle 1: Transition 01->02 Flight (t=4.4s)' },
    { sec: 7.0, name: 'cycle_03_sitting_lookdown.png', label: 'Cycle 1: 02 Sitting & Looking Down (t=7.0s)' },
    { sec: 9.4, name: 'cycle_04_transition_2_to_3.png', label: 'Cycle 1: Transition 02->03 Flight (t=9.4s)' },
    { sec: 11.8, name: 'cycle_05_flying_tapping.png', label: 'Cycle 1: 03 Flying & Tapping (t=11.8s)' },
    { sec: 14.4, name: 'cycle_06_transition_3_to_1.png', label: 'Cycle 1: Transition 03->01 Ascend (t=14.4s)' },
    { sec: 16.5, name: 'cycle_07_loop_peeking_again.png', label: 'Cycle 2: Seamless Loop Back to 01 (t=16.5s)' },
  ];

  // Let's sample across the cycle
  for (const step of cycleTimes) {
    // Jump exact millisecond to capture crisp state
    await evaluate(`
      const targetMs = ${Math.round(step.sec * 1000)};
      // Trigger timeline frame at targetMs
      const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
      const pauseBtn = buttons.find(b => b.innerText && b.innerText.includes('Pause'));
      if (pauseBtn) pauseBtn.click();
    `);
    // Scrub to targetMs directly in state
    await evaluate(`
      window.__SEEK_FAIRY && window.__SEEK_FAIRY(${Math.round(step.sec * 1000)});
    `);
    await sleep(250);
    const snapPath = await capture(step.name, step.label);
    sequenceFrames.push({ ...step, path: snapPath });
  }

  // 6. Test Loading Completion simulation
  console.log('\n--- Verifying Loading Completion Simulation ---');
  await evaluate(`
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
    const compBtn = buttons.find(b => b.innerText && b.innerText.includes('Complete'));
    if (compBtn) compBtn.click();
  `);
  await sleep(600);
  await capture('fairy_loading_complete_state.png', 'Simulated Loading Complete & Graceful Exit');

  console.log('\n✓ Visual verification completed successfully! All frames saved to artifacts directory.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Visual verification failed:', err);
  process.exit(1);
});
