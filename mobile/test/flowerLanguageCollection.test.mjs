import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

test('Flower Language Collection JSON verification', () => {
  const jsonPath = path.join(root, 'mobile/src/data/flowerLanguageCollection.json');
  assert.ok(fs.existsSync(jsonPath), 'JSON file exists at mobile/src/data/flowerLanguageCollection.json');

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.collectionId, 'flower-language-collection');
  assert.equal(data.categories.length, 8, 'Exactly 8 categories');

  const expectedTabs = [
    'Happy',
    'Anger',
    'Anxiety',
    'Calm',
    'Love',
    'Sad',
    'Surprise',
    'Tiredness',
  ];

  const actualTabs = data.categories.map(c => c.tab);
  assert.deepEqual(actualTabs, expectedTabs, 'All 8 bookmark labels match exactly');

  let totalPages = 0;
  let totalFlowers = 0;
  let totalCategoryIntros = 0;

  for (const cat of data.categories) {
    assert.ok(cat.id, 'category has id');
    assert.ok(cat.title.en && cat.title.zh, `category ${cat.id} has bilingual title`);
    assert.ok(cat.moods.en && cat.moods.zh, `category ${cat.id} has bilingual moods`);
    assert.ok(cat.intro.en && cat.intro.zh, `category ${cat.id} has bilingual intro`);

    for (const page of cat.pages) {
      totalPages++;
      if (page.type === 'category') {
        totalCategoryIntros++;
        assert.ok(page.title.en && page.title.zh, `cat page has bilingual title`);
        assert.ok(page.intro.en && page.intro.zh, `cat page has bilingual intro`);
      } else if (page.type === 'flower') {
        totalFlowers++;
        assert.ok(page.flowerId, 'flower has flowerId');
        assert.ok(page.imageFile, 'flower has imageFile');
        assert.ok(page.name.en && page.name.zh, `${page.flowerId} has bilingual name`);
        assert.ok(page.meaning.en && page.meaning.zh, `${page.flowerId} has bilingual meaning`);
        assert.ok(page.description.en && page.description.zh, `${page.flowerId} has bilingual description`);
      }
    }
  }

  assert.equal(totalCategoryIntros, 8, 'Exactly 8 category introduction pages');
  assert.equal(totalFlowers, 26, 'Exactly 26 flower pages');
  assert.equal(totalPages, 34, 'Total 34 content pages (8 intros + 26 flowers)');
});

test('All 26 flower PNG assets exist in Resources folders and match exact filenames', () => {
  const jsonPath = path.join(root, 'mobile/src/data/flowerLanguageCollection.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const resourcesDir = path.join(root, 'Resources');

  const expectedFiles = [
    'Coreopsis.png',
    'Daisy.png',
    'Gerbera Daisy.png',
    'Sunflower.png',
    'Gentian.png',
    'Petunia.png',
    'Poppy.png',
    'Chamomile.png',
    'Snowdrop.png',
    'Chinese-Violet-Cress.png',
    'Lavender.png',
    'Olive.png',
    'white-Magnolia.png',
    'Hydrangea.png',
    'Rose.png',
    'Anemone.png',
    'Bluebell.png',
    'Heather.png',
    'Tumi.png',
    'Bird of Paradise.png',
    'Tulip.png',
    'White-Rose.png',
    'Yellow-Daffodil.png',
    'Aster.png',
    'Dandelion.png',
    'Yellow-Rapeseed-Flower.png',
  ];

  assert.equal(expectedFiles.length, 26, '26 expected flower image files');

  const subdirs = fs.readdirSync(resourcesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(resourcesDir, d.name));

  for (const filename of expectedFiles) {
    let found = false;
    for (const dir of subdirs) {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate)) {
        found = true;
        const stats = fs.statSync(candidate);
        assert.ok(stats.size > 0, `${filename} is not empty`);
        break;
      }
    }
    assert.ok(found, `Asset ${filename} must exist in Resources`);
  }
});

test('Flower assets TS mapping contains all 26 flowers', () => {
  const tsPath = path.join(root, 'mobile/src/data/flowerAssets.ts');
  assert.ok(fs.existsSync(tsPath));
  const tsContent = fs.readFileSync(tsPath, 'utf8');

  const expectedFiles = [
    'Coreopsis.png',
    'Daisy.png',
    'Gerbera Daisy.png',
    'Sunflower.png',
    'Gentian.png',
    'Petunia.png',
    'Poppy.png',
    'Chamomile.png',
    'Snowdrop.png',
    'Chinese-Violet-Cress.png',
    'Lavender.png',
    'Olive.png',
    'white-Magnolia.png',
    'Hydrangea.png',
    'Rose.png',
    'Anemone.png',
    'Bluebell.png',
    'Heather.png',
    'Tumi.png',
    'Bird of Paradise.png',
    'Tulip.png',
    'White-Rose.png',
    'Yellow-Daffodil.png',
    'Aster.png',
    'Dandelion.png',
    'Yellow-Rapeseed-Flower.png',
  ];

  for (const f of expectedFiles) {
    assert.ok(tsContent.includes(`'${f}'`), `flowerAssets.ts must map ${f}`);
  }
});

test('All mapped flower assets are bundled WebP images with alpha transparency', () => {
  const tsPath = path.join(root, 'mobile/src/data/flowerAssets.ts');
  const tsContent = fs.readFileSync(tsPath, 'utf8');

  // Keys are the collection's imageFile names; the art is the Garden's painted clusters (WebP).
  const regex = /'([^']+\.png)':\s*require\('([^']+)'\)/g;
  let match;
  let count = 0;
  while ((match = regex.exec(tsContent)) !== null) {
    count++;
    const [_, key, relPath] = match;
    const resolvedPath = path.resolve(path.dirname(tsPath), relPath);
    assert.ok(resolvedPath.startsWith(path.join(root, 'mobile/assets') + path.sep), `${key} is bundled from mobile/assets`);
    assert.ok(fs.existsSync(resolvedPath), `File exists for ${key}: ${resolvedPath}`);

    // RIFF....WEBP, then either VP8X with the alpha flag (0x10) or lossless VP8L (alpha in its header).
    const buf = fs.readFileSync(resolvedPath).subarray(0, 32);
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF', `${key} is a WebP`);
    assert.equal(buf.toString('ascii', 8, 12), 'WEBP', `${key} is a WebP`);
    const chunk = buf.toString('ascii', 12, 16);
    const hasAlpha = chunk === 'VP8X' ? (buf[20] & 0x10) !== 0 : chunk === 'VP8L' ? (buf[24] & 0x10) !== 0 : false;
    assert.ok(hasAlpha, `Asset for ${key} must carry alpha transparency (${chunk})`);
  }
  assert.equal(count, 26, 'Verified all 26 flower assets for alpha transparency');
});

test('Bilingual bookmark categories match user requirements', () => {
  const tsPath = path.join(root, 'mobile/src/components/bookhouse/flowerLanguagePages.tsx');
  const content = fs.readFileSync(tsPath, 'utf8');

  const expectedBilingualBookmarks = [
    { id: 'happy', en: 'Happy', zh: '快乐' },
    { id: 'anger', en: 'Anger', zh: '愤怒' },
    { id: 'anxiety', en: 'Anxiety', zh: '焦虑' },
    { id: 'calm', en: 'Calm', zh: '平静' },
    { id: 'love', en: 'Love', zh: '关爱' },
    { id: 'sad', en: 'Sad', zh: '悲伤' },
    { id: 'surprise', en: 'Surprise', zh: '惊喜' },
    { id: 'tiredness', en: 'Tiredness', zh: '疲惫' },
  ];

  for (const b of expectedBilingualBookmarks) {
    assert.ok(content.includes(`id: '${b.id}'`), `BOOKMARK_CATEGORIES includes ${b.id}`);
    assert.ok(content.includes(`en: '${b.en}'`), `BOOKMARK_CATEGORIES includes en: ${b.en}`);
    assert.ok(content.includes(`'zh-Hans': '${b.zh}'`), `BOOKMARK_CATEGORIES includes zh-Hans: ${b.zh}`);
  }
});

