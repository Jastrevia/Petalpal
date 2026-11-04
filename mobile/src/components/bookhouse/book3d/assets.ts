import { useEffect, useState } from 'react';
import { Skia, useImage, type SkImage, type SkTypefaceFontProvider } from '@shopify/react-native-skia';
import { loadAsset, type AssetSource } from './loadAsset';

// Baked from the original spine artwork (see scripts/journal-books/README.md).
const COVERS = [
  require('../../../../assets/bookhouse/journal/cover-01.webp'), require('../../../../assets/bookhouse/journal/cover-02.webp'),
  require('../../../../assets/bookhouse/journal/cover-03.webp'), require('../../../../assets/bookhouse/journal/cover-04.webp'),
  require('../../../../assets/bookhouse/journal/cover-05.webp'), require('../../../../assets/bookhouse/journal/cover-06.webp'),
  require('../../../../assets/bookhouse/journal/cover-07.webp'), require('../../../../assets/bookhouse/journal/cover-08.webp'),
  require('../../../../assets/bookhouse/journal/cover-09.webp'), require('../../../../assets/bookhouse/journal/cover-10.webp'),
  require('../../../../assets/bookhouse/journal/cover-11.webp'), require('../../../../assets/bookhouse/journal/cover-12.webp'),
];
const SPINES = [
  require('../../../../assets/bookhouse/journal/spine-01.webp'), require('../../../../assets/bookhouse/journal/spine-02.webp'),
  require('../../../../assets/bookhouse/journal/spine-03.webp'), require('../../../../assets/bookhouse/journal/spine-04.webp'),
  require('../../../../assets/bookhouse/journal/spine-05.webp'), require('../../../../assets/bookhouse/journal/spine-06.webp'),
  require('../../../../assets/bookhouse/journal/spine-07.webp'), require('../../../../assets/bookhouse/journal/spine-08.webp'),
  require('../../../../assets/bookhouse/journal/spine-09.webp'), require('../../../../assets/bookhouse/journal/spine-10.webp'),
  require('../../../../assets/bookhouse/journal/spine-11.webp'), require('../../../../assets/bookhouse/journal/spine-12.webp'),
];
const SPINE_ATLAS = require('../../../../assets/bookhouse/journal/spine-atlas.webp');
const GRAIN = require('../../../../assets/bookhouse/journal/leather-grain.webp');
const EDGES = require('../../../../assets/bookhouse/journal/page-edges.webp');
const PARCHMENT = require('../../../../assets/bookhouse/journal/parchment.webp');

// Cloth colours sampled from each spine; leather faces are the shared grain tinted with these.
export const CLOTH = ['#D6BF9B', '#86906A', '#B2735B', '#3B5E5E', '#77596A', '#C59250', '#687D8F', '#D3BB93', '#38605A', '#A5523E', '#A3879A', '#2E4428'];
export const LIGHT_CLOTH = new Set([1, 8]);
export function clothRgb(month: number): [number, number, number] {
  const h = CLOTH[month - 1];
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  // Leather is a little deeper than the painted cloth.
  const k = LIGHT_CLOTH.has(month) ? .95 : .82;
  return [c[0] * k, c[1] * k, c[2] * k];
}
/** The month's cell in spine-atlas.webp (6 × 2 cells, January top-left). */
export function atlasSpineRect(month: number, atlasWidth: number, atlasHeight: number): [number, number, number, number] {
  const w = atlasWidth / 6, h = atlasHeight / 2, i = month - 1;
  return [(i % 6) * w + .5, Math.floor(i / 6) * h + .5, w - 1, h - 1];
}

export const FLOWERS = ['Snowdrop', 'Violet', 'Daffodil', 'Wisteria', 'Rose', 'Foxglove', 'Larkspur', 'Hydrangea', 'Sunflower', 'Marigold', 'Chrysanthemum', 'Holly'];
export const LATIN = ['Galanthus nivalis', 'Viola odorata', 'Narcissus', 'Wisteria sinensis', 'Rosa', 'Digitalis purpurea', 'Delphinium',
  'Hydrangea macrophylla', 'Helianthus annuus', 'Tagetes', 'Chrysanthemum', 'Ilex aquifolium'];

export type ShelfImages = ReturnType<typeof useShelfImages>;
export function useShelfImages() {
  return { atlas: useImage(SPINE_ATLAS), grain: useImage(GRAIN), edges: useImage(EDGES) };
}
// The monthly books' pictures, decoded once and shared while the Treehouse (or any monthly book) is open, so opening,
// closing and switching months never wait for the same files again; released when the last user lets go.
type Source = Exclude<AssetSource, null | undefined>;
const decoded = new Map<Source, SkImage>();
const decoding = new Map<Source, Promise<SkImage | null>>();
let openBooks = 0;
function decode(source: Source) {
  const hit = decoded.get(source);
  if (hit) return Promise.resolve(hit);
  let job = decoding.get(source);
  if (!job) {
    job = loadAsset(source, data => Skia.Image.MakeImageFromEncoded(data)).then(image => {
      decoding.delete(source);
      if (image && openBooks > 0) decoded.set(source, image);
      return image;
    }, () => { decoding.delete(source); return null; });
    decoding.set(source, job);
  }
  return job;
}
function useBookImage(source: Source) {
  const [image, setImage] = useState<SkImage | null>(() => decoded.get(source) ?? null);
  useEffect(() => {
    let alive = true;
    const hit = decoded.get(source);
    if (hit) setImage(hit);
    else void decode(source).then(value => { if (alive) setImage(value); });
    return () => { alive = false; };
  }, [source]);
  return image;
}
/** The shared parchment and fonts once decoded (for painting the shared papers ahead of time). */
export function sharedPaperSources() { const parchment = decoded.get(PARCHMENT); return parchment && sharedFonts ? { parchment, fonts: sharedFonts } : null; }
/** Keeps the shared pictures and fonts while held (the Treehouse holds them for as long as it is open). */
export function retainBookImages() {
  openBooks++;
  let held = true;
  return () => { if (!held) return; held = false; if (--openBooks === 0) { decoded.clear(); decoding.clear(); sharedFonts = null; } };
}
export function useBookImages(month: number) {
  useEffect(() => retainBookImages(), []);
  return {
    cover: useBookImage(COVERS[month - 1]), spine: useBookImage(SPINES[month - 1]), grain: useBookImage(GRAIN),
    edges: useBookImage(EDGES), parchment: useBookImage(PARCHMENT),
  };
}
/** While nothing moves, decode the fonts, the shared papers' pictures and these months' covers and spines ahead of time
 *  (in the order given), one file at a time, so opening or switching to them starts at once. Returns a cancel function. */
export function preloadBookImages(months: number[], onShared?: () => void) {
  let cancelled = false;
  const shared = [PARCHMENT, GRAIN, EDGES].filter(f => !decoded.has(f)).length;
  const files = [PARCHMENT, GRAIN, EDGES, ...months.flatMap(m => [COVERS[m - 1], SPINES[m - 1]])].filter(f => !decoded.has(f));
  const next = (i: number) => {
    if (cancelled || openBooks === 0) return;
    // The fonts and the shared paper are in: the papers every book shares can be painted now (onShared).
    if (i === shared) { onShared?.(); if (cancelled) return; }
    if (i >= files.length) return;
    void decode(files[i]).then(() => setTimeout(() => next(i + 1), 120));
  };
  void loadJournalFonts().then(() => setTimeout(() => next(0), 120));
  return () => { cancelled = true; };
}
// Web bundles resolve font files to URL strings, which Skia's loader expects wrapped as { uri }.
const asset = (module: number | string) => (typeof module === 'string' ? { uri: module } : module) as number;
const GARAMOND = [asset(require('../../../../assets/fonts/EBGaramond-Regular.ttf')), asset(require('../../../../assets/fonts/EBGaramond-MediumItalic.ttf'))];
// Shared like the pictures above while any book is open (a switch to another month never waits for the fonts again).
let sharedFonts: SkTypefaceFontProvider | null = null;
let loadingFonts: Promise<SkTypefaceFontProvider | null> | null = null;
function loadJournalFonts() {
  if (sharedFonts) return Promise.resolve(sharedFonts);
  if (!loadingFonts) {
    loadingFonts = Promise.all(GARAMOND.map(source => loadAsset(source, data => Skia.Typeface.MakeFreeTypeFaceFromData(data)))).then(faces => {
      loadingFonts = null;
      if (faces.some(face => !face)) return null;
      const provider = Skia.TypefaceFontProvider.Make();
      faces.forEach(face => provider.registerFont(face!, 'EB Garamond'));
      if (openBooks > 0) sharedFonts = provider;
      return provider;
    }, () => { loadingFonts = null; return null; });
  }
  return loadingFonts;
}
export function useJournalFonts() {
  const [fonts, setFonts] = useState<SkTypefaceFontProvider | null>(() => sharedFonts);
  useEffect(() => {
    let alive = true;
    if (sharedFonts) setFonts(sharedFonts);
    else void loadJournalFonts().then(value => { if (alive) setFonts(value); });
    return () => { alive = false; };
  }, []);
  return fonts;
}
