import { Asset } from 'expo-asset';
import { Platform, Share } from 'react-native';
import type { PetalCardFace } from '../../services/petalCardDraw';

// Sharing today's petal card. Instagram, WeChat and RedNote have no way for a web page to post
// for someone, and X and Reddit links cannot carry a picture, so the card goes out as an image
// through the phone's own share sheet, where all of those apps are. Where the browser cannot
// share files (most desktops), the image is saved instead, to post from the photos.
// 1080 × 1350 (4:5) is the tallest picture an Instagram post shows uncropped, and X, Reddit,
// WeChat and RedNote show it whole too. Nothing personal is on it: no name, no number, no date.
export const SHARE_SIZE = { width: 1080, height: 1350 };

const COPY = {
  en: { kicker: "TODAY'S PETAL CARD", caption: (name: string, line: string) => `Today's petal card from PetalPal: ${name} — “${line}”` },
  'zh-Hans': { kicker: '今日花语卡', caption: (name: string, line: string) => `今天在 PetalPal 抽到的花语卡：${name}——「${line}」` },
};

export type PreparedShare = { file: File | null; caption: string };
export type ShareOutcome = 'shared' | 'saved' | 'cancelled' | 'failed';

const SERIF = '"Iowan Old Style", Georgia, "Songti SC", "Noto Serif SC", serif';

// Splits into lines no wider than `width`: by words, or by characters where there are no spaces.
function wrap(context: CanvasRenderingContext2D, text: string, width: number) {
  const units = /\s/.test(text) ? text.split(/(\s+)/) : [...text];
  const lines: string[] = [];
  let line = '';
  for (const unit of units) {
    const next = line + unit;
    if (line.trim() && context.measureText(next).width > width) { lines.push(line.trim()); line = unit.trimStart(); }
    else line = next;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function loadImage(uri: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image); image.onerror = reject; image.src = uri;
  });
}

// Draws the share picture: the card's own painting on the petal ring's night sky, its name and
// line, and the reflection-only note.
export async function drawShareImage(face: PetalCardFace, art: number, locale: 'en' | 'zh-Hans', disclaimer: string) {
  const { width: W, height: H } = SHARE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('No canvas');
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#17123A'); sky.addColorStop(1, '#2A2160');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  c.fillStyle = '#FFFFFF55';
  for (let i = 0; i < 60; i++) {
    const s = i % 5 === 0 ? 4 : 2.5;
    c.beginPath(); c.arc(((i * 37) % 97 + 1.5) / 100 * W, ((i * 53) % 89 + 2) / 100 * H, s / 2, 0, Math.PI * 2); c.fill();
  }

  const asset = Asset.fromModule(art);
  const image = await loadImage(asset.uri);
  const ch = 860, cw = ch * image.width / image.height, x = (W - cw) / 2, y = 96, r = 30;
  c.save();
  c.shadowColor = '#F3DFA8AA'; c.shadowBlur = 48;
  c.beginPath(); c.roundRect(x, y, cw, ch, r); c.fillStyle = '#17123A'; c.fill();
  c.restore();
  c.save(); c.beginPath(); c.roundRect(x, y, cw, ch, r); c.clip(); c.drawImage(image, x, y, cw, ch); c.restore();
  c.lineWidth = 3; c.strokeStyle = '#F3DFA8'; c.beginPath(); c.roundRect(x, y, cw, ch, r); c.stroke();

  const copy = COPY[locale];
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#C9C0E8'; c.font = `26px ${SERIF}`;
  if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = '6px';
  c.fillText(copy.kicker, W / 2, 1022);
  if ('letterSpacing' in c) (c as unknown as { letterSpacing: string }).letterSpacing = '0px';
  c.fillStyle = '#F3DFA8'; c.font = `54px ${SERIF}`;
  c.fillText(face.name, W / 2, 1092);
  c.fillStyle = '#F6EDDB'; c.font = `italic 36px ${SERIF}`;
  wrap(c, face.line, 900).slice(0, 3).forEach((line, i) => c.fillText(line, W / 2, 1150 + i * 48));
  c.fillStyle = '#9F96C8'; c.font = `22px ${SERIF}`;
  c.fillText(`PetalPal · ${disclaimer}`, W / 2, H - 44);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('No image');
  return new File([blob], `petalpal-${face.id}.jpg`, { type: 'image/jpeg' });
}

// Made as soon as the card is revealed, so the tap on Share can open the share sheet at once
// (Safari only allows it straight from the tap).
export async function prepareShare(face: PetalCardFace, art: number | undefined, locale: 'en' | 'zh-Hans'): Promise<PreparedShare> {
  const caption = COPY[locale].caption(face.name, face.line);
  if (Platform.OS !== 'web' || !art || typeof document === 'undefined') return { file: null, caption };
  try { return { file: await drawShareImage(face, art, locale, face.disclaimer), caption }; }
  catch { return { file: null, caption }; }
}

export async function sharePrepared({ file, caption }: PreparedShare): Promise<ShareOutcome> {
  if (Platform.OS !== 'web') {
    try { const result = await Share.share({ message: caption }); return result.action === Share.dismissedAction ? 'cancelled' : 'shared'; }
    catch { return 'failed'; }
  }
  if (file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: caption }); return 'shared'; }
    catch (error) { if ((error as Error)?.name === 'AbortError') return 'cancelled'; }
  }
  if (!file) {
    if (!navigator.share) return 'failed';
    try { await navigator.share({ text: caption }); return 'shared'; }
    catch (error) { return (error as Error)?.name === 'AbortError' ? 'cancelled' : 'failed'; }
  }
  // No file sharing here: save the picture to post it from the photos.
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'saved';
}
