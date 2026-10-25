import fs from 'node:fs';
import path from 'node:path';
import { launchHeadlessChrome, createCDPClient } from './mobile/test/browserAutomation.mjs';

const ARTIFACTS_DIR = 'C:/Users/cjysu/.gemini/antigravity/brain/29c68174-3514-4da4-a283-62d907ccd0b5';

async function run() {
  console.log('--- Starting PetalPal Login Preview Automation ---');
  let chromeProc;
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    if (!res.ok) throw new Error();
    console.log('Reusing existing Chrome instance on port 9222');
  } catch {
    console.log('Launching headless Chrome on port 9222...');
    chromeProc = await launchHeadlessChrome();
  }

  const cdp = await createCDPClient();
  console.log('Connected to CDP client');

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // 1. Mobile Viewport (412 x 892)
  console.log('Setting mobile viewport (412x892)...');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 892,
    deviceScaleFactor: 2,
    mobile: true,
  });

  console.log('Navigating to http://localhost:8081/login-preview ...');
  await cdp.send('Page.navigate', { url: 'http://localhost:8081/login-preview' });
  await new Promise((r) => setTimeout(r, 3500));

  // Screenshot 1: Mobile Initial State
  const snap1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file1 = path.join(ARTIFACTS_DIR, 'screen_1_login_preview_mobile.png');
  fs.writeFileSync(file1, Buffer.from(snap1.result.data, 'base64'));
  console.log('Saved:', file1);

  // 2. Desktop Widescreen Viewport (1200 x 800)
  console.log('Setting desktop widescreen viewport (1200x800)...');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 800,
    deviceScaleFactor: 1.5,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 1200));

  // Screenshot 2: Desktop Initial State
  const snap2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file2 = path.join(ARTIFACTS_DIR, 'screen_2_login_preview_desktop.png');
  fs.writeFileSync(file2, Buffer.from(snap2.result.data, 'base64'));
  console.log('Saved:', file2);

  // Switch back to mobile for form interaction testing
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 412,
    height: 892,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await new Promise((r) => setTimeout(r, 600));

  // 3. Test Empty Form Validation (Click "Log In" while empty)
  console.log('Testing empty form submission validation...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"], button'));
        const loginBtn = btns.find(b => b.innerText && b.innerText.includes('Log In'));
        if (loginBtn) loginBtn.click();
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 800));

  const snap3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file3 = path.join(ARTIFACTS_DIR, 'screen_3_login_validation_errors.png');
  fs.writeFileSync(file3, Buffer.from(snap3.result.data, 'base64'));
  console.log('Saved:', file3);

  // 4. Test Typing in Email and Password
  console.log('Typing valid email and password...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const emailInput = inputs.find(i => i.placeholder && i.placeholder.includes('Email'));
        const passwordInput = inputs.find(i => i.placeholder && i.placeholder.includes('Password'));
        
        function setNativeValue(element, value) {
          const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
          const prototype = Object.getPrototypeOf(element);
          const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
          } else if (valueSetter) {
            valueSetter.call(element, value);
          } else {
            element.value = value;
          }
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (emailInput) setNativeValue(emailInput, 'clover@petalpal.garden');
        if (passwordInput) setNativeValue(passwordInput, 'secretGardenPass');
        return { email: !!emailInput, pass: !!passwordInput };
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 800));

  const snap4 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file4 = path.join(ARTIFACTS_DIR, 'screen_4_login_inputs_filled.png');
  fs.writeFileSync(file4, Buffer.from(snap4.result.data, 'base64'));
  console.log('Saved:', file4);

  // 5. Test Password Visibility Toggle
  console.log('Toggling password visibility...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const eyeBtn = document.querySelector('[data-testid="toggle-password-visibility"]') ||
                       document.querySelector('div[aria-label*="password"], div[aria-label*="Password"]');
        if (eyeBtn) eyeBtn.click();
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 600));

  const snap5 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file5 = path.join(ARTIFACTS_DIR, 'screen_5_password_unmasked.png');
  fs.writeFileSync(file5, Buffer.from(snap5.result.data, 'base64'));
  console.log('Saved:', file5);

  // 6. Test Valid Login Submission & Success Feedback
  console.log('Submitting valid form...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"], button'));
        const loginBtn = btns.find(b => b.innerText && b.innerText.includes('Log In'));
        if (loginBtn) loginBtn.click();
      })()
    `,
  });
  // Wait for loading simulation to complete (1.2s delay in component)
  await new Promise((r) => setTimeout(r, 1600));

  const snap6 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file6 = path.join(ARTIFACTS_DIR, 'screen_6_login_success_banner.png');
  fs.writeFileSync(file6, Buffer.from(snap6.result.data, 'base64'));
  console.log('Saved:', file6);

  // 7. Test Global Help & Feedback trigger on login screen
  console.log('Opening Help & Feedback panel from top-right trigger...');
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const allBtns = Array.from(document.querySelectorAll('div[role="button"], button'));
        const helpBtn = allBtns.find(b => b.innerText && (b.innerText.includes('Help') || b.innerText.includes('Feedback'))) ||
                        document.querySelector('div[aria-label*="Help"]');
        if (helpBtn) helpBtn.click();
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 1000));

  const snap7 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file7 = path.join(ARTIFACTS_DIR, 'screen_7_login_help_feedback_open.png');
  fs.writeFileSync(file7, Buffer.from(snap7.result.data, 'base64'));
  console.log('Saved:', file7);

  console.log('--- All Tests Completed Successfully ---');
  cdp.ws.close();
  if (chromeProc) chromeProc.kill();
}

run().catch((e) => {
  console.error('Error running test script:', e);
  process.exit(1);
});
