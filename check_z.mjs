import { launchHeadlessChrome, createCDPClient } from './mobile/test/browserAutomation.mjs';

async function test() {
  let chromeProc;
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    if (!res.ok) throw new Error();
  } catch {
    chromeProc = await launchHeadlessChrome();
  }
  const cdp = await createCDPClient();
  await cdp.send('Page.navigate', { url: 'http://localhost:8081/fairy-loading-test' });
  await new Promise(r => setTimeout(r, 2000));
  const evalRes = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const card = document.querySelector('[data-testid="loading-invitation-card"]');
        const fairy = document.querySelector('[data-testid="fairy-loading-root"]');
        const mat = document.querySelector('[data-testid="invitation-materials-image"]');
        return {
          card: !!card,
          fairy: !!fairy,
          mat: !!mat,
          fairyZ: fairy ? window.getComputedStyle(fairy).zIndex : null,
          matZ: mat ? window.getComputedStyle(mat.parentElement).zIndex : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Result:', evalRes.result.value);
  process.exit(0);
}
test().catch(err => { console.error(err); process.exit(1); });
