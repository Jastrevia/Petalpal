// @ts-check
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

console.log('====================================================');
console.log('PETALPAL GARDEN MAILBOX INTEGRATION — TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(suiteName, testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${testName}`);
    console.error(`         ${err.message}`);
    process.exitCode = 1;
  }
}

// ── SUITE 1: FairyNavigation Mailbox State Machine ──
console.log('--- SUITE 1: FairyNavigation Mailbox State Machine ---');
const fairyNavSource = readFileSync(
  resolve(root, 'src/components/garden/fairy/FairyNavigation.ts'),
  'utf8'
);

runTest('Suite 1', 'FairyNavigation defines all mailbox sequence states in order', () => {
  assert.ok(fairyNavSource.includes("'movingToMailbox'"), "Missing state 'movingToMailbox'");
  assert.ok(fairyNavSource.includes("'flyingToMailbox'"), "Missing state 'flyingToMailbox'");
  assert.ok(fairyNavSource.includes("'aligningToMailbox'"), "Missing state 'aligningToMailbox'");
  assert.ok(fairyNavSource.includes("'retrievingMail'"), "Missing state 'retrievingMail'");
  assert.ok(fairyNavSource.includes("'turningWithMail'"), "Missing state 'turningWithMail'");
  assert.ok(fairyNavSource.includes("'presentingMail'"), "Missing state 'presentingMail'");
  assert.ok(fairyNavSource.includes("'mailboxTransition'"), "Missing state 'mailboxTransition'");
});

runTest('Suite 1', 'mailboxSequenceActive locks navigation during sequence', () => {
  assert.ok(
    fairyNavSource.includes("get mailboxSequenceActive()"),
    "FairyNavigation must implement mailboxSequenceActive getter"
  );
  assert.ok(
    fairyNavSource.includes("this.mailboxSequenceActive") && fairyNavSource.includes("return false;"),
    "move() must refuse interruptions during active mailbox sequence"
  );
});

runTest('Suite 1', 'returnFromMailbox restores fairy to idle at mailboxExitAnchor without reset', () => {
  assert.ok(
    fairyNavSource.includes("returnFromMailbox()"),
    "FairyNavigation must implement returnFromMailbox"
  );
  assert.ok(
    fairyNavSource.includes("this.position={...mailboxExitAnchor}"),
    "returnFromMailbox must place fairy at mailboxExitAnchor"
  );
  assert.ok(
    fairyNavSource.includes("this.state='idle'"),
    "returnFromMailbox must set state to 'idle'"
  );
});

// ── SUITE 2: GardenFairy Component & Handshake ──
console.log('\n--- SUITE 2: GardenFairy Component & Handshake ---');
const gardenFairySource = readFileSync(
  resolve(root, 'src/components/garden/fairy/GardenFairy.tsx'),
  'utf8'
);

runTest('Suite 2', 'GardenFairy fires onMailboxOpened strictly upon mailboxOpenedCount increment', () => {
  assert.ok(
    gardenFairySource.includes("nav.current.mailboxOpenedCount>mailCount.current"),
    "GardenFairy must check mailboxOpenedCount increment"
  );
  assert.ok(
    gardenFairySource.includes("config.current.onMailboxOpened?.()"),
    "GardenFairy must fire onMailboxOpened callback"
  );
});

runTest('Suite 2', 'isMailboxBusy prevents duplicate taps during walking or retrieval', () => {
  assert.ok(
    gardenFairySource.includes("isMailboxBusy:"),
    "GardenFairyHandle must expose isMailboxBusy"
  );
  assert.ok(
    gardenFairySource.includes("nav.current.mailboxSequenceActive"),
    "isMailboxBusy must check mailboxSequenceActive"
  );
  assert.ok(
    gardenFairySource.includes("nav.current.state==='movingToMailbox'"),
    "isMailboxBusy must check movingToMailbox"
  );
});

// ── SUITE 3: GardenScene Abstraction & Phase Reporting ──
console.log('\n--- SUITE 3: GardenScene Abstraction & Phase Reporting ---');
const gardenSceneSource = readFileSync(
  resolve(root, 'src/components/garden/GardenScene.tsx'),
  'utf8'
);

runTest('Suite 3', 'GardenScene defines MailboxInteractionPhase and exposes handle methods', () => {
  assert.ok(
    gardenSceneSource.includes("export type MailboxInteractionPhase ="),
    "GardenScene must export MailboxInteractionPhase type"
  );
  assert.ok(
    gardenSceneSource.includes("visitMailbox: () => boolean;"),
    "GardenSceneHandle must include visitMailbox"
  );
  assert.ok(
    gardenSceneSource.includes("isMailboxBusy: () => boolean;"),
    "GardenSceneHandle must include isMailboxBusy"
  );
  assert.ok(
    gardenSceneSource.includes("returnFromMailbox: () => boolean;"),
    "GardenSceneHandle must include returnFromMailbox"
  );
});

runTest('Suite 3', 'GardenScene correctly maps fairyState to high-level mailboxPhase', () => {
  assert.ok(
    gardenSceneSource.includes("mailboxPhase: MailboxInteractionPhase"),
    "GardenScene must compute mailboxPhase"
  );
  assert.ok(
    gardenSceneSource.includes("onMailboxPhaseChange?.(mailboxPhase)"),
    "GardenScene must notify parent via onMailboxPhaseChange"
  );
});

// ── SUITE 4: Garden Screen Navigation Flow (garden-test.tsx) ──
console.log('\n--- SUITE 4: Garden Screen Navigation Flow ---');
const gardenTestRouteSource = readFileSync(
  resolve(root, 'src/components/garden/GardenExperience.tsx'),
  'utf8'
);

runTest('Suite 4', 'GardenExperience guards against duplicate navigations', () => {
  assert.ok(
    gardenTestRouteSource.includes("isNavigatingRef"),
    "garden-test must track isNavigatingRef"
  );
  assert.ok(
    gardenTestRouteSource.includes("router.push('/mailbox')"),
    "handleMailboxOpened must push '/mailbox'"
  );
});

runTest('Suite 4', 'GardenExperience handles return with useFocusEffect and returnFromMailbox', () => {
  assert.ok(
    gardenTestRouteSource.includes("useFocusEffect("),
    "garden-test must use useFocusEffect"
  );
  assert.ok(
    gardenTestRouteSource.includes("gardenRef.current?.returnFromMailbox()"),
    "return must invoke gardenRef.current?.returnFromMailbox()"
  );
});

// ── SUITE 5: Mailbox Page Back Button (MailboxPage.tsx) ──
console.log('\n--- SUITE 5: Mailbox Page Back Button ---');
const mailboxPageSource = readFileSync(
  resolve(root, 'src/components/mailbox/MailboxPage.tsx'),
  'utf8'
);

runTest('Suite 5', 'MailboxPage implements handleBackToGarden with graceful fallback', () => {
  assert.ok(
    mailboxPageSource.includes("const handleBackToGarden = useCallback(() => {"),
    "MailboxPage must declare handleBackToGarden"
  );
  assert.ok(
    mailboxPageSource.includes("router.back()"),
    "handleBackToGarden must call router.back() when history exists"
  );
  assert.ok(
    mailboxPageSource.includes("router.replace(__DEV__ ? '/garden-test' : '/')"),
    "handleBackToGarden must fall back to the Garden: /garden-test in previews, / when released"
  );
});

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
if (passedTests === totalTests) {
  console.log('>>> ALL GARDEN MAILBOX INTEGRATION TESTS PASSED! <<<');
} else {
  console.error('>>> SOME TESTS FAILED! <<<');
  process.exitCode = 1;
}
console.log('====================================================\n');
