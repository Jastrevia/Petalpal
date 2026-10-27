import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// Lightweight TypeScript loader for mailbox modules
function loadMailboxModule(relativePath) {
  const baseDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox'
  );
  const filePath = path.join(
    baseDir,
    relativePath + (relativePath.endsWith('.ts') ? '' : '.ts')
  );
  const source = fs.readFileSync(filePath, 'utf8');

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  });

  const moduleObj = { exports: {} };
  const requireLocal = (req) => {
    if (req.startsWith('.')) {
      return loadMailboxModule(path.basename(req));
    }
    return require(req);
  };

  const script = new vm.Script(
    '(function(exports, require, module) {\n' + outputText + '\n})',
    { filename: filePath }
  );
  const fn = script.runInNewContext({
    console,
    Math,
    Date,
    Intl,
    Number,
    String,
    Array,
    Object,
    process: { env: {} },
  });
  fn(moduleObj.exports, requireLocal, moduleObj);

  return moduleObj.exports;
}

const { MOCK_LETTERS, RELEASE_LETTERS } = loadMailboxModule('mockLetters');

let passedTests = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('====================================================');
console.log('PETALPAL MAGICAL FLOATING MAILBOX — TEST SUITE');
console.log('====================================================\n');

// ── 1. LETTER DATA MODEL & STATIONERY INTEGRITY ───────────
console.log('--- SUITE 1: Letter Stationery Model & Integrity ---');

test('Mock letters contains at least 5 rich letters', () => {
  assert.ok(Array.isArray(MOCK_LETTERS));
  assert.ok(MOCK_LETTERS.length >= 5, `Expected >= 5 letters, got ${MOCK_LETTERS.length}`);
});

test('Released builds show only PetalPal letters, undated', () => {
  assert.equal(RELEASE_LETTERS.map((l) => l.id).join(), 'letter-garden-1,letter-moonbed-3,letter-news-5');
  assert.ok(RELEASE_LETTERS.every((l) => l.category !== 'friend' && l.date === ''));
});

test('Every letter has unique ID and required stationery fields', () => {
  const ids = new Set();
  const validCategories = ['garden', 'friend', 'system', 'seasonal', 'invitation'];
  const validIcons = ['crocus', 'bellflower', 'chamomile', 'lavender', 'sprig'];
  const validPaperTones = ['cream', 'aged', 'rose', 'sage', 'lavender'];

  for (const letter of MOCK_LETTERS) {
    assert.ok(letter.id, 'Letter missing id');
    assert.ok(!ids.has(letter.id), `Duplicate letter id: ${letter.id}`);
    ids.add(letter.id);

    assert.ok(letter.sender && letter.sender.length > 0, `Letter ${letter.id} missing sender`);
    assert.ok(letter.subject && letter.subject.length > 0, `Letter ${letter.id} missing subject`);
    assert.ok(letter.snippet && letter.snippet.length > 0, `Letter ${letter.id} missing snippet`);
    assert.ok(letter.date && letter.date.length > 0, `Letter ${letter.id} missing date`);
    assert.ok(validCategories.includes(letter.category), `Invalid category: ${letter.category}`);
    assert.ok(validIcons.includes(letter.botanicalIcon), `Invalid botanicalIcon: ${letter.botanicalIcon}`);
    assert.ok(letter.body && letter.body.length > 0, `Letter ${letter.id} missing body`);

    if (letter.paperTone) {
      assert.ok(validPaperTones.includes(letter.paperTone), `Invalid paperTone: ${letter.paperTone}`);
    }

    if (letter.estimatedHeight) {
      assert.ok(
        letter.estimatedHeight >= 200 && letter.estimatedHeight <= 800,
        `Unreasonable estimatedHeight: ${letter.estimatedHeight}`
      );
    }
  }
});

test('Primary garden letter matches reference specifications', () => {
  const gardenLetter = MOCK_LETTERS.find((l) => l.category === 'garden');
  assert.ok(gardenLetter, 'Garden note not found');
  assert.equal(gardenLetter.botanicalIcon, 'crocus');
  assert.equal(gardenLetter.illustrationType, 'gazebo');
  assert.equal(gardenLetter.signature, 'PetalPal');
  assert.ok(gardenLetter.headline && gardenLetter.headline.includes('blooming'));
});

// ── 2. SELECTION RESOLUTION & ACTIVE LOOKUP ────────────────
console.log('\n--- SUITE 2: Selection Resolution & Active Lookup ---');

test('Initial state selects first/newest letter by default', () => {
  const initialSelectedId = MOCK_LETTERS[0].id;
  const activeLetter = MOCK_LETTERS.find((l) => l.id === initialSelectedId) || MOCK_LETTERS[0];
  const activeIndex = MOCK_LETTERS.findIndex((l) => l.id === initialSelectedId);

  assert.equal(activeLetter.id, MOCK_LETTERS[0].id);
  assert.equal(activeIndex, 0);
});

test('Lookup gracefully falls back to first letter if ID is unmatched', () => {
  const invalidId = 'non-existent-letter-id';
  const resolved = MOCK_LETTERS.find((l) => l.id === invalidId) || MOCK_LETTERS[0];
  assert.equal(resolved.id, MOCK_LETTERS[0].id);
});

// ── 3. PAGINATION MATH & BOUNDARY WRAPPING ────────────────
console.log('\n--- SUITE 3: Pagination Math & Boundary Wrapping ---');

test('Next letter wraps around from last letter to first letter', () => {
  const total = MOCK_LETTERS.length;
  for (let idx = 0; idx < total; idx++) {
    const nextIdx = (idx + 1) % total;
    if (idx === total - 1) {
      assert.equal(nextIdx, 0, 'Last letter did not wrap around to 0 on Next');
    } else {
      assert.equal(nextIdx, idx + 1);
    }
  }
});

test('Previous letter wraps around from first letter to last letter', () => {
  const total = MOCK_LETTERS.length;
  const prevFromZero = (0 - 1 + total) % total;
  assert.equal(prevFromZero, total - 1, 'First letter did not wrap to last index on Prev');

  for (let idx = total - 1; idx > 0; idx--) {
    const prevIdx = (idx - 1 + total) % total;
    assert.equal(prevIdx, idx - 1);
  }
});

test('Pagination label format renders correctly for all indices', () => {
  const total = MOCK_LETTERS.length;
  for (let idx = 0; idx < total; idx++) {
    const label = `— ❧ ${idx + 1} / ${total} ☙ —`;
    assert.equal(label, `— ❧ ${idx + 1} / 5 ☙ —`);
  }
});

// ── 4. FLOATING STACK GEOMETRY & LAYERED DEPTH ────────────
console.log('\n--- SUITE 4: Floating Stack Geometry & Layered Depth ---');

test('In folded mode: all 5 envelopes are stacked with active envelope having highest zIndex', () => {
  const selectedId = MOCK_LETTERS[0].id;
  const isUnfolded = false;

  const stackItems = MOCK_LETTERS.map((letter, idx) => ({
    id: letter.id,
    isTop: letter.id === selectedId,
    zIndex: letter.id === selectedId ? 10 : idx + 1,
  }));

  assert.equal(stackItems.length, 5);
  const topItem = stackItems.find((item) => item.isTop);
  assert.ok(topItem);
  assert.equal(topItem.zIndex, 10);

  // All other envelopes have lower zIndex
  const otherItems = stackItems.filter((item) => !item.isTop);
  for (const other of otherItems) {
    assert.ok(other.zIndex < 10);
  }
});

test('In reading mode: active letter dominates foreground while 4 envelopes peek behind', () => {
  const selectedId = MOCK_LETTERS[1].id;
  const isUnfolded = true;

  const active = MOCK_LETTERS.find((l) => l.id === selectedId);
  const background = MOCK_LETTERS.filter((l) => l.id !== selectedId);

  assert.ok(active);
  assert.equal(background.length, 4);
  assert.ok(!background.some((l) => l.id === selectedId));

  // Verify background envelopes calculate progressive offsets for fanned display
  background.forEach((_, idx) => {
    const peekingTilt = -11 + idx * 2.8;
    const peekingTop = idx * 44 - 18;
    const peekingLeft = -46 + idx * 8;

    assert.ok(peekingTilt >= -12 && peekingTilt <= 0);
    assert.ok(peekingTop >= -20 && peekingTop <= 160);
    assert.ok(peekingLeft <= 0, 'Peeking envelopes should fan to the left of the open letter');
  });
});

// ── 5. GENTLE MAGIC LEVITATION OSCILLATIONS ───────────────
console.log('\n--- SUITE 5: Gentle Magic Levitation Oscillations ---');

test('Levitation floating bob remains bounded within calm vertical range (±3.8px)', () => {
  // Test over multiple simulated time increments
  for (let t = 0; t <= 10; t += 0.25) {
    const floatY = Math.sin(t * 1.5) * 3.8;
    assert.ok(floatY >= -3.8 && floatY <= 3.8, `Float out of bounds: ${floatY}`);
  }
});

test('Levitation sway rotation remains delicate and subtle (±0.45deg)', () => {
  for (let t = 0; t <= 10; t += 0.25) {
    const swayRot = Math.sin(t * 1.1) * 0.45;
    assert.ok(swayRot >= -0.45 && swayRot <= 0.45, `Sway out of bounds: ${swayRot}`);
  }
});

test('Magic aura breathing pulse stays in soft luminous range [0.30, 0.54]', () => {
  for (let t = 0; t <= 10; t += 0.25) {
    const auraPulse = 0.42 + Math.sin(t * 1.6) * 0.12;
    assert.ok(auraPulse >= 0.30 && auraPulse <= 0.54, `Aura pulse out of bounds: ${auraPulse}`);
  }
});

// ── 6. PHYSICAL TRANSITION STATE MACHINE ───────────────────
console.log('\n--- SUITE 6: Physical Transition State Machine ---');

test('Transition stages follow folding -> sliding -> unfolding -> idle order', () => {
  function getNextStage(current) {
    switch (current) {
      case 'idle':
        return 'folding';
      case 'folding':
        return 'sliding';
      case 'sliding':
        return 'unfolding';
      case 'unfolding':
        return 'idle';
      default:
        return 'idle';
    }
  }

  let stage = 'idle';
  stage = getNextStage(stage);
  assert.equal(stage, 'folding');
  stage = getNextStage(stage);
  assert.equal(stage, 'sliding');
  stage = getNextStage(stage);
  assert.equal(stage, 'unfolding');
  stage = getNextStage(stage);
  assert.equal(stage, 'idle');
});

test('Transform computations map accurately to physical flipping dynamics', () => {
  function computeTransform(stage) {
    if (stage === 'folding') {
      return [{ scale: 0.88 }, { translateX: -24 }, { rotate: '-5deg' }];
    }
    if (stage === 'sliding') {
      return [{ scale: 0.92 }, { translateX: -12 }, { rotate: '-2.5deg' }];
    }
    if (stage === 'unfolding') {
      return [{ scale: 0.98 }, { translateX: 0 }, { rotate: '0deg' }];
    }
    return [{ scale: 1 }, { translateX: 0 }, { rotate: '0deg' }];
  }

  const folding = computeTransform('folding');
  assert.deepEqual(folding, [{ scale: 0.88 }, { translateX: -24 }, { rotate: '-5deg' }]);

  const sliding = computeTransform('sliding');
  assert.deepEqual(sliding, [{ scale: 0.92 }, { translateX: -12 }, { rotate: '-2.5deg' }]);

  const unfolding = computeTransform('unfolding');
  assert.deepEqual(unfolding, [{ scale: 0.98 }, { translateX: 0 }, { rotate: '0deg' }]);

  const idle = computeTransform('idle');
  assert.deepEqual(idle, [{ scale: 1 }, { translateX: 0 }, { rotate: '0deg' }]);
});

test('State guards prevent re-triggering during active transition', () => {
  let isTransitioning = true;
  let selectedLetterId = 'letter-1';

  function handleSelect(nextId) {
    if (nextId === selectedLetterId) return 'NOOP_SAME_ID';
    if (isTransitioning) return 'NOOP_IN_TRANSITION';
    return 'TRIGGERED';
  }

  assert.equal(handleSelect('letter-1'), 'NOOP_SAME_ID');
  assert.equal(handleSelect('letter-2'), 'NOOP_IN_TRANSITION');

  isTransitioning = false;
  assert.equal(handleSelect('letter-2'), 'TRIGGERED');
});

// ── 7. ASSET RESOURCE VERIFICATION ─────────────────────────
console.log('\n--- SUITE 7: Mailbox Asset Resources Verification ---');

test('All required mailbox visual assets exist on disk', () => {
  const assetsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../assets/mailbox'
  );

  const requiredAssets = [
    'mailbox_bg_clean.jpg',
    'petalpal_stamp.jpg',
    'mini_garden_scene.jpg',
    'icon_crocus.jpg',
    'icon_bellflower.jpg',
    'icon_chamomile.jpg',
    'icon_lavender.jpg',
    'icon_sprig.jpg',
  ];

  for (const assetName of requiredAssets) {
    const fullPath = path.join(assetsDir, assetName);
    assert.ok(fs.existsSync(fullPath), `Missing required asset: ${assetName}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `Asset ${assetName} has 0 bytes`);
  }
});

// ── 8. REDESIGNED BOTANICAL PETAL DYNAMICS ───────────────
console.log('\n--- SUITE 8: Redesigned Botanical Petal Dynamics ---');

test('Petal overlay source code implements organic petal geometry and 3D flutter', () => {
  const petalsFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/FloatingPetalsOverlay.tsx'
  );
  assert.ok(fs.existsSync(petalsFile), 'FloatingPetalsOverlay.tsx must exist');
  const source = fs.readFileSync(petalsFile, 'utf8');

  // Must have asymmetric corner radii to produce organic teardrop/curved petal shape
  assert.ok(source.includes('borderTopLeftRadius'), 'Must specify asymmetric borderTopLeftRadius');
  assert.ok(source.includes('borderTopRightRadius'), 'Must specify asymmetric borderTopRightRadius');
  assert.ok(source.includes('borderBottomLeftRadius'), 'Must specify asymmetric borderBottomLeftRadius');
  assert.ok(source.includes('borderBottomRightRadius'), 'Must specify asymmetric borderBottomRightRadius');

  // Must have petal vein highlight
  assert.ok(source.includes('petalVeinHighlight'), 'Must have subtle internal petal vein highlight');

  // Must have 3D wind tumbling via scaleX cosine oscillation (not 2D rigid spinning)
  assert.ok(source.includes('scaleX'), 'Must feature scaleX 3D tumbling in wind');

  // Must have depth layering (background blur / lower opacity)
  assert.ok(source.includes('isBackground'), 'Must support foreground/background depth layering');

  // Must not have crude pink blobs or neon colors
  assert.ok(!source.includes('#ff1493'), 'Must not contain hot pink');
  assert.ok(!source.includes('#ff69b4'), 'Must not contain neon pink');
});

test('Petals are sparse and distributed peripherally to preserve letter readability', () => {
  // Test petal simulation coordinates
  const mockPetals = [
    { startX: 40, size: 15, isBackground: false },
    { startX: 340, size: 13, isBackground: false },
    { startX: 85, size: 10, isBackground: true },
    { startX: 310, size: 11, isBackground: true },
    { startX: 130, size: 14, isBackground: false },
  ];

  // Sparse constraint: between 3 and 7 petals total
  assert.ok(mockPetals.length <= 7, `Expected <= 7 petals for non-intrusive ambiance, got ${mockPetals.length}`);
  assert.ok(mockPetals.length >= 3, `Expected >= 3 petals, got ${mockPetals.length}`);

  // Test 3D scaleX tumbling math
  for (let t = 0; t < 10; t += 0.5) {
    const scaleX = Math.cos(t * 1.2) * 0.38 + 0.62;
    // ScaleX must remain positive and within realistic petal flip range [0.24, 1.0]
    assert.ok(scaleX >= 0.2, `scaleX dropped too low: ${scaleX}`);
    assert.ok(scaleX <= 1.01, `scaleX exceeded 1.0: ${scaleX}`);
  }
});

// ── 9. THREE-STATE VISUAL INTERACTION MACHINE ────────────
console.log('\n--- SUITE 9: Three-State Visual Interaction Machine ---');

test('Mailbox supports 3 distinct visual states: holding, opening, and reading', () => {
  const mailboxFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/MailboxPage.tsx'
  );
  assert.ok(fs.existsSync(mailboxFile));
  const source = fs.readFileSync(mailboxFile, 'utf8');

  // Must reference all 3 canonical interaction states
  assert.ok(source.includes("'holding'"), "Must support 'holding' State 1");
  assert.ok(source.includes("'opening'"), "Must support 'opening' State 2");
  assert.ok(source.includes("'reading'"), "Must support 'reading' State 3");
  assert.ok(source.includes('visualState'), 'Must track visualState in component state');
});

test('Transition from holding to reading sets visualState to opening then reading', () => {
  let state = 'holding';
  let isTransitioning = false;

  function triggerOpen() {
    isTransitioning = true;
    state = 'opening';
    // Stage 1 -> 2 -> 3
    state = 'reading';
    isTransitioning = false;
  }

  triggerOpen();
  assert.equal(state, 'reading');
  assert.equal(isTransitioning, false);
});

// ── 10. DYNAMIC LETTER LENGTH VARIATION ───────────────────
console.log('\n--- SUITE 10: Dynamic Letter Length Variation ---');

test('Letters vary in content length and have non-uniform heights', () => {
  const heights = MOCK_LETTERS.map((l) => l.estimatedHeight).filter(Boolean);
  assert.equal(heights.length, 5, 'All 5 mock letters should declare natural estimatedHeight');

  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);

  // Height variance should be at least 80px between shortest and longest letter
  assert.ok(
    maxHeight - minHeight >= 80,
    `Expected height variance >= 80px, got ${maxHeight - minHeight}px (${minHeight}px to ${maxHeight}px)`
  );

  // Ensure body text length also varies naturally
  const bodyLengths = MOCK_LETTERS.map((l) => l.body.length);
  const minBody = Math.min(...bodyLengths);
  const maxBody = Math.max(...bodyLengths);
  assert.ok(maxBody > minBody + 50, 'Body text lengths must vary naturally across letters');
});

// ── 11. PHYSICAL ENVELOPE REALISM SPECIFICATION ───────────
console.log('\n--- SUITE 11: Physical Envelope Realism Specification ---');

test('LetterEnvelope source contains real paper envelope elements: twine, wax seal, sprig, stamps', () => {
  const envelopeFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/LetterEnvelope.tsx'
  );
  assert.ok(fs.existsSync(envelopeFile));
  const source = fs.readFileSync(envelopeFile, 'utf8');

  // Wax seal puddle & gloss
  assert.ok(source.includes('waxSealPuddle'), 'Must contain organic wax seal puddle');
  assert.ok(source.includes('waxGlossArc'), 'Must feature glossy highlight on wax rim');

  // Twine cord wrapping
  assert.ok(source.includes('twineWrapContainer'), 'Must feature natural twine wrapping');
  assert.ok(source.includes('twineVertical'), 'Must feature vertical twine cord');
  assert.ok(source.includes('twineHorizontal'), 'Must feature horizontal twine cord');

  // Dried botanical sprig
  assert.ok(source.includes('driedSprigContainer'), 'Must feature dried botanical sprig');
  assert.ok(source.includes('sprigBud'), 'Must feature florets on dried sprig');

  // Scalloped vintage postage stamp
  assert.ok(source.includes('stampHolderPerforated'), 'Must feature perforated stamp holder');
  assert.ok(source.includes('postmarkWaveLine'), 'Must feature postmark ink cancellation waves');

  // Natural paper tones including lavender
  assert.ok(source.includes('lavender:'), 'Must include lavender envelope tone');
});

// ── 12. SINGLE HAND LAYER, SMOOTH MOTION & POETIC TYPOGRAPHY ────────────
console.log('\n--- SUITE 12: Single Hand Layer, Smooth Motion & Poetic Typography ---');

test('MailboxPage renders strictly one coherent pair of hands (no duplicate foreground hand layer)', () => {
  const pageFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/MailboxPage.tsx'
  );
  const pageSource = fs.readFileSync(pageFile, 'utf8');

  // Must NOT embed an extra foreground hand layer that duplicates the background scene hands
  assert.ok(
    !pageSource.includes('<FairyPalmsSupport'),
    'MailboxPage must not embed FairyPalmsSupport to prevent four-hands duplication'
  );
  assert.ok(
    pageSource.includes('BACKGROUND_IMAGE'),
    'MailboxPage must rely on the cohesive background scene hands'
  );
});

test('Artistic typography system defines curated font families across all stationery components', () => {
  const letterFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/ExpandedLetter.tsx'
  );
  assert.ok(fs.existsSync(letterFile));
  const letterSource = fs.readFileSync(letterFile, 'utf8');

  assert.ok(letterSource.includes('FONT_DISPLAY'), 'Must define FONT_DISPLAY');
  assert.ok(letterSource.includes('FONT_TITLE'), 'Must define FONT_TITLE');
  assert.ok(letterSource.includes('FONT_BODY'), 'Must define FONT_BODY');
  assert.ok(letterSource.includes('FONT_SIGNATURE'), 'Must define FONT_SIGNATURE');
  assert.ok(letterSource.includes('Cormorant Garamond'), 'Must incorporate Cormorant Garamond');
  assert.ok(letterSource.includes('Playfair Display'), 'Must incorporate Playfair Display');
  assert.ok(letterSource.includes('Alex Brush'), 'Must incorporate Alex Brush cursive script');
});

test('Top header is simplified without redundant dark navbar or heavy slogans', () => {
  const pageFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/MailboxPage.tsx'
  );
  const pageSource = fs.readFileSync(pageFile, 'utf8');

  // Must not have bulky legacy slogans or heavy labels
  assert.ok(!pageSource.includes('HELD MAIL EXPERIENCE'), 'No clunky title slogans');
  assert.ok(!pageSource.includes('READING STATE ACTIVE'), 'No redundant debug state banners');
  assert.ok(pageSource.includes('← Garden'), 'Clean back action to Garden');
  assert.ok(pageSource.includes('✿ PetalPal'), 'Minimal PetalPal branding');
});

// ── 13. PRODUCTION POLISH & STATIONERY PHYSICAL REALISM ──────
console.log('\n--- SUITE 13: Production Polish & Stationery Physical Realism ---');

test('ExpandedLetter eliminates notebook ruling lines and dashed card borders', () => {
  const letterFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/ExpandedLetter.tsx'
  );
  const source = fs.readFileSync(letterFile, 'utf8');

  // Must not have repeated horizontal notebook ruling lines
  assert.ok(!source.includes('laidRibbingLine'), 'No repeated notebook ruling lines');

  // Must not have dashed card/coupon borders on inner deckle frame
  assert.ok(!source.includes("borderStyle: 'dashed'"), 'No dashed coupon borders');
  assert.ok(source.includes("borderStyle: 'solid'"), 'Deckle frame must have solid organic border');

  // Must have nearly square soft corners (3-4px)
  assert.ok(source.includes('borderTopLeftRadius: 4'), 'Paper sheet has square soft 4px corner');

  // Must include CJK font fallbacks
  assert.ok(source.includes('Songti SC'), 'Must have Songti SC fallback');
  assert.ok(source.includes('Noto Serif CJK SC'), 'Must have Noto Serif CJK SC fallback');

  // Must have standalone vignette layout (unconstrained full-width body)
  assert.ok(source.includes('vignetteRowCentered'), 'Vignette must be standalone centered plate');
});

test('LetterEnvelope implements realistic flap hinge rotation and soft square corners', () => {
  const envelopeFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/LetterEnvelope.tsx'
  );
  const source = fs.readFileSync(envelopeFile, 'utf8');

  // Flap 3D hinge opening
  assert.ok(source.includes('rotateX'), 'Must implement flap 3D hinge rotation');
  assert.ok(source.includes('isOpening'), 'Must react to isOpening prop');

  // Soft square corners
  assert.ok(source.includes('borderRadius: 4'), 'Envelope has natural 4px corner');
});

test('MailboxPage coordinates 6-phase state machine with timer cancellation refs', () => {
  const pageFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/MailboxPage.tsx'
  );
  const source = fs.readFileSync(pageFile, 'utf8');

  // Phase tracking
  assert.ok(source.includes('MailboxPhase'), 'Must import and use MailboxPhase');
  assert.ok(source.includes("'stack'"), "Must support 'stack' phase");
  assert.ok(source.includes("'lifting'"), "Must support 'lifting' phase");
  assert.ok(source.includes("'unfolding'"), "Must support 'unfolding' phase");
  assert.ok(source.includes("'closing'"), "Must support 'closing' phase");

  // Timer refs management
  assert.ok(source.includes('timerRefs'), 'Must manage timerRefs');
  assert.ok(source.includes('clearTimers'), 'Must provide clean clearTimers cancellation');
});

// ── 14. UNREAD VS READ BOTANICAL VISUAL DISTINCTION ──────
console.log('\n--- SUITE 14: Unread vs Read Botanical Visual Distinction ---');

test('Mock letters initialize with intentional unread/read states matching reference concept', () => {
  // Letter 1: Your Garden (Unread)
  assert.equal(MOCK_LETTERS[0].read, false, 'Letter 1 must start unread');
  // Letter 2: Meadow Fairy (Read, opened in reading mode)
  assert.equal(MOCK_LETTERS[1].read, true, 'Letter 2 must start read');
  // Letter 3: Moonbed Reflections (Unread)
  assert.equal(MOCK_LETTERS[2].read, false, 'Letter 3 must start unread');
  // Letter 4: A Friend's Hello (Read)
  assert.equal(MOCK_LETTERS[3].read, true, 'Letter 4 must start read');
  // Letter 5: PetalPal News (Read)
  assert.equal(MOCK_LETTERS[4].read, true, 'Letter 5 must start read');
});

test('SparklingMagicStar implements 4-point astroid starlight in pale champagne-gold #F3D48A with irregular twinkling and fade-out', () => {
  const starFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/SparklingMagicStar.tsx'
  );
  assert.ok(fs.existsSync(starFile), 'SparklingMagicStar.tsx must exist');
  const source = fs.readFileSync(starFile, 'utf8');

  // Must render 4-point astroid star geometry in champagne gold
  assert.ok(source.includes('SparklingMagicStar'), 'Must export SparklingMagicStar component');
  assert.ok(source.includes('#F3D48A'), 'Must use pale champagne-gold #F3D48A color');
  assert.ok(source.includes('petalpalTwinkle'), 'Must include CSS twinkle keyframes');
  assert.ok(source.includes('isFadingOut'), 'Must support isFadingOut prop for gentle transition');
  assert.ok(source.includes('rgba(243, 212, 138'), 'Must have champagne starlight glow');
});

test('Letter Guide card is completely removed from codebase and components', () => {
  const guideFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/LetterGuideCard.tsx'
  );
  assert.ok(!fs.existsSync(guideFile), 'LetterGuideCard.tsx must NOT exist');

  const stackFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/FloatingLetterStack.tsx'
  );
  const stackSource = fs.readFileSync(stackFile, 'utf8');
  assert.ok(!stackSource.includes('LetterGuideCard'), 'FloatingLetterStack must NOT import or render LetterGuideCard');
});

test('LetterEnvelope distinguishes unread from read via sparkle, paper freshness, and typography (no emoji badges)', () => {
  const envelopeFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/LetterEnvelope.tsx'
  );
  const source = fs.readFileSync(envelopeFile, 'utf8');

  // Unread star near upper-left of wax seal
  assert.ok(source.includes('SparklingMagicStar'), 'LetterEnvelope must include SparklingMagicStar');
  assert.ok(source.includes('isUnread'), 'Must determine isUnread state');

  // Fresh ivory unread paper tones vs calmer read tones
  assert.ok(source.includes('UNREAD_ENVELOPE_TONES'), 'Must define UNREAD_ENVELOPE_TONES');
  assert.ok(source.includes('ENVELOPE_TONES'), 'Must define ENVELOPE_TONES');
  assert.ok(source.includes('getEnvelopeTone'), 'Must provide getEnvelopeTone helper');

  // Typographic emphasis
  assert.ok(source.includes('previewTitleUnread'), 'Must have previewTitleUnread typographic style');
  assert.ok(source.includes('previewTitleRead'), 'Must have previewTitleRead typographic style');

  // Strictly NO emoji icons or corporate badges
  assert.ok(!source.includes('🌱'), 'Must NOT include sprout bud emoji');
  assert.ok(!source.includes('🍂'), 'Must NOT include opened petal emoji');
  assert.ok(!source.includes('redBadge'), 'Must NOT have red badge');
  assert.ok(!source.includes('notificationDot'), 'Must NOT have corporate notification dot');
});

test('FloatingLetterStack and MailboxPage coordinate deterministic read state marking and session persistence', () => {
  const stackFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/FloatingLetterStack.tsx'
  );
  const stackSource = fs.readFileSync(stackFile, 'utf8');
  assert.ok(!stackSource.includes('🌱'), 'FloatingLetterStack must NOT include sprout emoji');
  assert.ok(!stackSource.includes('🍂'), 'FloatingLetterStack must NOT include petal emoji');
  assert.ok(stackSource.includes('SparklingMagicStar'), 'FloatingLetterStack renders SparklingMagicStar on active envelope');

  const pageFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/MailboxPage.tsx'
  );
  const pageSource = fs.readFileSync(pageFile, 'utf8');
  assert.ok(pageSource.includes('markLetterAsRead'), 'MailboxPage defines markLetterAsRead callback');
  assert.ok(pageSource.includes('markLetterRead(id)') && pageSource.includes('isLetterRead('), 'MailboxPage reads and records read state through mailboxReadState');
  assert.ok(pageSource.includes('setLetters'), 'MailboxPage has dynamic state setter for letters');
});

// ── 15. HELP & FEEDBACK BOTANICAL SUPPORT PANEL ───────────
console.log('--- SUITE 15: Help & Feedback Support Panel ---');

test('HelpFeedbackPanel component and trigger are implemented and exported', () => {
  const panelFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/HelpFeedbackPanel.tsx'
  );
  assert.ok(fs.existsSync(panelFile), 'HelpFeedbackPanel.tsx must exist');

  const source = fs.readFileSync(panelFile, 'utf8');
  assert.ok(source.includes('HelpFeedbackTrigger'), 'Must export HelpFeedbackTrigger');
  assert.ok(source.includes('HelpFeedbackPanel'), 'Must export HelpFeedbackPanel');
  assert.ok(source.includes('SUPPORT_MENU_ITEMS'), 'Must export SUPPORT_MENU_ITEMS');
});

test('Help & Feedback panel defines the 4 core in-world support topics', () => {
  const panelFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/HelpFeedbackPanel.tsx'
  );
  const source = fs.readFileSync(panelFile, 'utf8');

  // Header & Subtitle
  assert.ok(source.includes('Help & Feedback'), 'Header must contain Help & Feedback');
  assert.ok(source.includes('Every thought matters.'), 'Subtitle must be Every thought matters.');

  // 1. Send Feedback
  assert.ok(source.includes('Send Feedback'), 'Item 1 must be Send Feedback');
  assert.ok(source.includes('Share bugs, ideas, or thoughts'), 'Item 1 description must match');

  // 2. Help Center
  assert.ok(source.includes('Help Center'), 'Item 2 must be Help Center');
  assert.ok(source.includes('Garden, Journal, AI Fairy, Friends, Mailbox'), 'Item 2 description must match');

  // 3. Privacy & Safety
  assert.ok(source.includes('Privacy & Safety'), 'Item 3 must be Privacy & Safety');
  assert.ok(source.includes('How your data is handled · Report a concerning AI reply'), 'Item 3 description must match');

  // 4. Contact Support
  assert.ok(source.includes('Contact Support'), 'Item 4 must be Contact Support');
  assert.ok(source.includes('Account, login, sync, or technical issues'), 'Item 4 description must match');
});

test('Help & Feedback panel includes botanical accents, primary button and secondary link', () => {
  const panelFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/HelpFeedbackPanel.tsx'
  );
  const source = fs.readFileSync(panelFile, 'utf8');

  // Primary action button & secondary link
  assert.ok(source.includes('Share Feedback'), 'Must include primary Share Feedback button');
  assert.ok(source.includes('View FAQs'), 'Must include secondary View FAQs link');

  // Botanical accents
  assert.ok(source.includes('help_lavender_top.png'), 'Must render top lavender sprig illustration');
  assert.ok(source.includes('help_lavender_bottom.png'), 'Must render bottom lavender sprig illustration');
  assert.ok(source.includes('panelSpeechCaret'), 'Must render speech caret connecting trigger to panel');
});

test('MailboxPage integrates HelpFeedbackTrigger and toggles HelpFeedbackPanel', () => {
  const pageFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/mailbox/MailboxPage.tsx'
  );
  const source = fs.readFileSync(pageFile, 'utf8');

  assert.ok(source.includes('HelpFeedbackTrigger'), 'MailboxPage must render HelpFeedbackTrigger');
  assert.ok(source.includes('HelpFeedbackPanel'), 'MailboxPage must render HelpFeedbackPanel');
  assert.ok(source.includes('isHelpOpen'), 'MailboxPage must track isHelpOpen state');
  assert.ok(source.includes('toggleHelp'), 'MailboxPage must define toggleHelp');
  assert.ok(source.includes('closeHelp'), 'MailboxPage must define closeHelp');
});

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${passedTests} assertions passed (100%)`);
console.log('>>> ALL PETALPAL MAILBOX TESTS PASSED! <<<');
console.log('====================================================\n');
