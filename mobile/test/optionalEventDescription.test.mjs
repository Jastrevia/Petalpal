import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('EventPanel copy and required indicator constraints', () => {
  const code = fs.readFileSync('mobile/src/components/features/EventsPanel.tsx', 'utf8');

  // 1. English copy contains 'What happened? (Optional)'
  assert.ok(
    code.includes("what: 'What happened? (Optional)'"),
    'English label must be "What happened? (Optional)"'
  );

  // 2. Chinese copy contains '发生了什么？（选填）'
  assert.ok(
    code.includes("what: '发生了什么？（选填）'"),
    'Chinese label must be "发生了什么？（选填）"'
  );

  // 3. What happened field has no required asterisk
  assert.ok(
    code.includes('<Text style={styles.sectionTitle}>{copy.what}</Text>'),
    'What happened title must not include required asterisk'
  );
  assert.ok(
    !code.includes('{copy.what} <Text accessibilityLabel={copy.required} style={styles.required}>*</Text>'),
    'Asterisk must be removed from what happened section'
  );

  // 4. Mood selection retains required asterisk
  assert.ok(
    code.includes('{copy.choose} <Text accessibilityLabel={copy.required} style={styles.required}>*</Text>'),
    'Mood selection must retain required asterisk'
  );

  // 5. Save button disabled condition does not check content.trim()
  assert.ok(
    code.includes('disabled={journal.busy || voice.active || !journal.mood}'),
    'Save button must only require journal.mood and not journal.content.trim()'
  );
});

test('useEventJournal saveEvent allows empty content', () => {
  const code = fs.readFileSync('mobile/src/hooks/useEventJournal.ts', 'utf8');
  assert.ok(
    code.includes('if (busy || !session || !mood) return;'),
    'saveEvent must only require session and mood, not content.trim()'
  );
});

test('FlowerHistory and FlowerDetailModal display cleanly without fake descriptions', () => {
  const bookhouse = fs.readFileSync('mobile/src/app/bookhouse.tsx', 'utf8');
  assert.ok(
    !bookhouse.includes("'No written entry attached.'"),
    'Bookhouse must not display fake placeholder text "No written entry attached."'
  );
  assert.ok(
    bookhouse.includes('{Boolean(detail.content) && <Text selectable style={s.body}>{detail.content}</Text>}'),
    'Bookhouse renders entry text only when content is present'
  );

  const modal = fs.readFileSync('mobile/src/components/garden/planting/FlowerDetailModal.tsx', 'utf8');
  assert.ok(
    modal.includes('Boolean(sourceEvent.text?.trim())'),
    'FlowerDetailModal renders event text only when content is non-empty'
  );
});

test('Backend ai-jobs handles empty content and mood-only event validation', async () => {
  const jobsCode = fs.readFileSync('lib/ai-jobs.js', 'utf8');

  // Verify normalizeEventContent allows null/undefined and empty string
  assert.ok(
    jobsCode.includes('if (value === null || value === undefined) {\r\n    return "";\r\n  }') ||
    jobsCode.includes('if (value === null || value === undefined) {\n    return "";\n  }'),
    'normalizeEventContent must safely return empty string for null or undefined'
  );

  // Verify validation requires at least mood or content
  assert.ok(
    jobsCode.includes('if (!normalizedContent && !primaryGardenMood) {'),
    'Must validate that either mood or content is provided'
  );

  // Verify memory job is not enqueued for empty content
  assert.ok(
    jobsCode.includes('const memoryJobNeeded = memoryProcessingAllowed && Boolean(normalizedContent);'),
    'Memory extraction must not be enqueued when content is empty'
  );
});

test('Backend server.js eventEmotionResult abstains on empty event text', async () => {
  const serverCode = fs.readFileSync('server.js', 'utf8');
  assert.ok(
    serverCode.includes('if (!text || !text.trim()) {') &&
    serverCode.includes('{ status: "SUCCESS", labels: [], latencyMs: 0, fallbackReason: null, consentUpdatedAt: createdConsentUpdatedAt }'),
    'Empty event text must immediately succeed with empty labels (abstain)'
  );
});
