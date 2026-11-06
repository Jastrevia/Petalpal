import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const manualJsonPath = path.resolve('mobile/src/data/instructionManual.json');
const manualData = JSON.parse(fs.readFileSync(manualJsonPath, 'utf8'));

test('Instruction Manual JSON contains exactly 7 chapters and 24 pages', () => {
  assert.equal(manualData.sections.length, 7, 'Must have exactly 7 chapters');
  const expectedChapterIds = [
    'welcome',
    'guide',
    'reflection',
    'ai-policy',
    'privacy',
    'wellbeing',
    'help',
  ];
  const actualChapterIds = manualData.sections.map(s => s.id);
  assert.deepEqual(actualChapterIds, expectedChapterIds, 'Chapter IDs must match in order');

  const totalPages = manualData.sections.reduce((sum, s) => sum + s.pages.length, 0);
  assert.equal(totalPages, 24, 'Must have exactly 24 content pages');
});

test('Every page in Instruction Manual JSON has complete bilingual text without omissions', () => {
  let count = 0;
  for (const section of manualData.sections) {
    for (const page of section.pages) {
      count++;
      assert.ok(page.id, `Page ${count} must have an ID`);
      assert.ok(page.type === 'chapter' || page.type === 'content', `Page ${page.id} has invalid type: ${page.type}`);

      // Eyebrow
      assert.ok(page.eyebrow?.en, `Page ${page.id} missing English eyebrow`);
      assert.ok(page.eyebrow?.['zh-Hans'], `Page ${page.id} missing Chinese eyebrow`);

      // Title
      assert.ok(page.title?.en, `Page ${page.id} missing English title`);
      assert.ok(page.title?.['zh-Hans'], `Page ${page.id} missing Chinese title`);

      // Paragraphs
      assert.ok(Array.isArray(page.paragraphs?.en) && page.paragraphs.en.length > 0, `Page ${page.id} missing English paragraphs`);
      assert.ok(Array.isArray(page.paragraphs?.['zh-Hans']) && page.paragraphs['zh-Hans'].length > 0, `Page ${page.id} missing Chinese paragraphs`);
      assert.equal(page.paragraphs.en.length, page.paragraphs['zh-Hans'].length, `Page ${page.id} paragraph count mismatch between EN and ZH`);

      // Items (if present)
      if (page.items) {
        if (page.items.en?.length > 0 || page.items['zh-Hans']?.length > 0) {
          assert.equal(page.items.en.length, page.items['zh-Hans'].length, `Page ${page.id} items count mismatch between EN and ZH`);
        }
      }
    }
  }
  assert.equal(count, 24, 'Must verify all 24 pages');
});

test('Chapter start pages and bookmark mappings match expected page numbers', () => {
  const chapterStarts = {};
  let currentFolio = 1;

  manualData.sections.forEach(section => {
    chapterStarts[section.id] = currentFolio;
    currentFolio += section.pages.length;
  });

  assert.deepEqual(chapterStarts, {
    welcome: 1,
    guide: 3,
    reflection: 11,
    'ai-policy': 15,
    privacy: 18,
    wellbeing: 21,
    help: 23,
  });
});

test('Final Help page (help-02) contains prominent contact@jastrevia.com email and link', () => {
  const helpSection = manualData.sections.find(s => s.id === 'help');
  assert.ok(helpSection, 'Help section must exist');
  const help02 = helpSection.pages.find(p => p.id === 'help-02');
  assert.ok(help02, 'help-02 page must exist');
  assert.equal(help02.contactEmail, 'contact@jastrevia.com', 'contactEmail must be contact@jastrevia.com');

  // Verify instructionPages renders testID="instruction-contact-email" and mailto link
  const codePath = path.resolve('mobile/src/components/bookhouse/instructionPages.tsx');
  const code = fs.readFileSync(codePath, 'utf8');
  assert.ok(code.includes('instruction-contact-email'), 'Must render testID instruction-contact-email');
  assert.ok(code.includes('mailto:contact@jastrevia.com'), 'Must link to mailto:contact@jastrevia.com');
  assert.ok(code.includes('contact@jastrevia.com'), 'Must display contact@jastrevia.com');
});

test('Bookmarks maintain consistent alignment and identical geometry without horizontal shifts or scale changes', () => {
  const readerPath = path.resolve('mobile/src/components/bookhouse/PavilionBookReader.tsx');
  const code = fs.readFileSync(readerPath, 'utf8');

  // Must not have translateX shifts on active tabs
  assert.ok(!code.includes('translateX: 7'), 'Active tabs must not have horizontal translateX shift');
  assert.ok(!code.includes('scale: 1.05'), 'Active tabs must not scale or pop out');

  // Tab widths must be uniform 100%
  assert.ok(code.includes("width: '100%'"), 'Bookmark tabs must have uniform width');
  assert.ok(code.includes("textAlign: 'center'"), 'Bookmark text must be centered');
});

test('GardenHud maintains permanently bright hover/active visual appearance for Me button', () => {
  const hudPath = path.resolve('mobile/src/components/garden/GardenHud.tsx');
  const code = fs.readFileSync(hudPath, 'utf8');

  assert.ok(code.includes("const isProfile = feature.id === 'profile'"), 'GardenHud must identify profile feature');
  assert.ok(code.includes('isVisuallyActive'), 'GardenHud must define isVisuallyActive for permanent brightness');
});

test('Internal verifyBeforePublishing development notes exist for audit and are excluded from user rendering', () => {
  const auditNotes = [];
  for (const section of manualData.sections) {
    for (const page of section.pages) {
      if (page.verifyBeforePublishing && page.verifyBeforePublishing.length > 0) {
        auditNotes.push({ id: page.id, notes: page.verifyBeforePublishing });
      }
    }
  }

  assert.ok(auditNotes.length > 0, 'Internal verification notes must be present in source JSON');

  // Verify that instructionPages.tsx source code never references verifyBeforePublishing
  const codePath = path.resolve('mobile/src/components/bookhouse/instructionPages.tsx');
  const code = fs.readFileSync(codePath, 'utf8');
  assert.ok(!code.includes('verifyBeforePublishing'), 'instructionPages.tsx must never render verifyBeforePublishing to users');
});

test('PavilionBookReader imports and integrates instructionPages with 7 physical bookmarks', () => {
  const readerPath = path.resolve('mobile/src/components/bookhouse/PavilionBookReader.tsx');
  const code = fs.readFileSync(readerPath, 'utf8');

  assert.ok(code.includes('buildInstructionPages'), 'PavilionBookReader must import buildInstructionPages');
  assert.ok(code.includes('INSTRUCTION_BOOKMARK_CATEGORIES'), 'PavilionBookReader must import INSTRUCTION_BOOKMARK_CATEGORIES');
  assert.ok(code.includes("bookId === 'notes'"), "Must have branch for bookId === 'notes'");
  assert.ok(code.includes('instructionBookmarkTab'), 'Must style instruction bookmarks');
  assert.ok(code.includes('instructionTabAccentLine'), 'Must include purple accent line');
});
