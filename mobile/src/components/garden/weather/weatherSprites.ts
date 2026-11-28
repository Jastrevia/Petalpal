import { Image, drawAsImage, useImage, type SkImage } from '@shopify/react-native-skia';
import { createElement, useEffect, useMemo, useState, type ReactElement } from 'react';
import { GARDEN_WORLD_HEIGHT, GARDEN_WORLD_WIDTH } from '../gardenMapLayout';

// Shared by the weather layers: small painted sprites drawn once into images, and a coarse
// water/land grid so falling rain, snow and leaves know where they land.

export const MASK_W = 160, MASK_H = 120;

export function useSprite(element: ReactElement | null, width: number, height: number) {
  const [image, setImage] = useState<SkImage | null>(null);
  const ready = element !== null;
  useEffect(() => {
    if (!element) return;
    let alive = true;
    void drawAsImage(element, { width, height }).then(img => { if (alive) setImage(img); });
    return () => { alive = false; };
    // Fixed artwork: draw once, as soon as its inputs exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return image;
}

/** A coarse water/land grid (1 = water) read once from the water field's own surface mask. */
export function useWaterGrid() {
  const mask = useImage(require('../water/assets/water-surface-mask.png'));
  const small = useSprite(mask ? createElement(Image, { image: mask, x: 0, y: 0, width: MASK_W, height: MASK_H, fit: 'fill' }) : null, MASK_W, MASK_H);
  return useMemo(() => {
    if (!small) return null;
    const pixels = small.readPixels();
    if (!pixels) return null;
    const grid = new Array<number>(MASK_W * MASK_H);
    const scale = pixels instanceof Float32Array ? 1 : 255;
    for (let i = 0; i < grid.length; i++) grid[i] = pixels[i * 4] / scale > 0.5 ? 1 : 0;
    return grid;
  }, [small]);
}

export function onWater(grid: number[], x: number, y: number) {
  'worklet';
  const gx = Math.min(MASK_W - 1, Math.max(0, Math.floor((x / GARDEN_WORLD_WIDTH) * MASK_W)));
  const gy = Math.min(MASK_H - 1, Math.max(0, Math.floor((y / GARDEN_WORLD_HEIGHT) * MASK_H)));
  return grid[gy * MASK_W + gx] === 1;
}
