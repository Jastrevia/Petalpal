import fs from 'node:fs';
import path from 'node:path';
import { launchHeadlessChrome, createCDPClient } from './mobile/test/browserAutomation.mjs';

const ARTIFACTS_DIR = 'C:/Users/cjysu/.gemini/antigravity/brain/079854b1-4128-4356-9182-9fbbd80c86b5';
const RECORDING_DIR = path.join(ARTIFACTS_DIR, 'runtime_frames');
fs.mkdirSync(RECORDING_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('--- Starting 15-Second Runtime Animation Recording ---');
  let chromeProc;
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    if (!res.ok) throw new Error();
  } catch {
    console.log('Launching headless Chrome on port 9222...');
    chromeProc = await launchHeadlessChrome();
  }
  const cdp = await createCDPClient();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Set desktop viewport focused on the invitation card
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 900,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const testUrl = 'http://localhost:8081/fairy-loading-test';
  await cdp.send('Page.navigate', { url: testUrl });
  await sleep(3500);

  // Sample 60 frames across 15,000 ms (one every 250 ms)
  const totalFrames = 60;
  const intervalMs = 250;
  console.log(`Sampling ${totalFrames} actual runtime frames across 15,000 ms...`);

  for (let i = 0; i < totalFrames; i++) {
    const targetMs = i * intervalMs;
    // Seek to exact millisecond
    await cdp.send('Runtime.evaluate', {
      expression: `window.__SEEK_FAIRY && window.__SEEK_FAIRY(${targetMs});`,
    });
    await sleep(60);

    const snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const frameNumber = String(i).padStart(3, '0');
    const framePath = path.join(RECORDING_DIR, `frame_${frameNumber}.png`);
    fs.writeFileSync(framePath, Buffer.from(snap.result.data, 'base64'));

    if (i % 10 === 0 || i === totalFrames - 1) {
      console.log(`Captured frame ${i + 1}/${totalFrames} (t = ${(targetMs / 1000).toFixed(2)}s)`);
    }
  }

  console.log('All 60 runtime frames captured successfully in', RECORDING_DIR);
  process.exit(0);
}

run().catch((e) => {
  console.error('Recording failed:', e);
  process.exit(1);
});
