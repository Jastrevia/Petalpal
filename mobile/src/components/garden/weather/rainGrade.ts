// Overcast grade for the whole painted Garden while it rains: the same picture, re-lit by a grey
// sky. Less saturation, a cool cast and wet, darker values (wet paint and stone go deeper, not paler). It is applied as the
// scene layer's colour matrix (with the night matrix when both are on), so every painted layer is
// graded together instead of a translucent sheet lying on top.
const LUMA = [0.2126, 0.7152, 0.0722];
const SATURATION = 0.72;
const GAIN = [0.74, 0.79, 0.86];
const LIFT = [0.03, 0.042, 0.062];

function overcast(): number[] {
  const m: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const sat = (row === col ? SATURATION : 0) + (1 - SATURATION) * LUMA[col];
      m.push(sat * GAIN[row]);
    }
    m.push(0, LIFT[row]);
  }
  m.push(0, 0, 0, 1, 0);
  return m;
}

export const RAIN_MATRIX = overcast();
export const IDENTITY_MATRIX = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0];

/** Colour matrix that applies `first`, then `second` (both 4x5, Skia order). */
export function composeColorMatrix(first: number[], second: number[]): number[] {
  'worklet';
  const out = new Array<number>(20).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? second[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += second[r * 5 + k] * first[k * 5 + c];
      out[r * 5 + c] = v;
    }
  }
  return out;
}

export function mixColorMatrix(a: number[], b: number[], t: number): number[] {
  'worklet';
  return a.map((value, i) => value + (b[i] - value) * t);
}
