// The two arrangements of a journal page:
//  • preview — on the right page of the whole spread: date, title, a few lines, "Tap the page to read" (pages.ts);
//  • reading — the page brought close: the full entry reflowed at a comfortable size, scrolling under a fixed header.
// The reading arrangement is drawn twice from these numbers: live React Native text while the reader is on the page,
// and a Skia picture of the same page (at the same scroll position) whenever the leaf itself has to move — a turn, or
// leaning back out. Both use EB Garamond at the same sizes, so the hand-over is not visible.

export type ReadingMetrics = {
  width: number; height: number;
  padLeft: number; padRight: number; padTop: number; padBottom: number;
  weekday: { size: number; line: number; spacing: number };
  date: { size: number; line: number };
  grown: { size: number; line: number };
  title: { size: number; line: number; maxLines: number; gap: number };
  rule: { gap: number };
  body: { size: number; line: number; paragraphGap: number };
  actions: { size: number };
};

const round = (n: number) => Math.round(n * 2) / 2;

/** Text sizes follow the page width (a phone's page is ~360–420 pt wide) within comfortable reading bounds. */
export function readingMetrics(width: number, height: number): ReadingMetrics {
  const k = Math.max(.92, Math.min(1.2, width / 370));
  const body = round(Math.max(16.5, Math.min(20, 17.5 * k)));
  return {
    width, height,
    // The gutter side keeps clear of the binding's curve and the gilt corners.
    padLeft: Math.round(width * .118), padRight: Math.round(width * .1),
    padTop: Math.round(height * .082), padBottom: Math.round(height * .075),
    weekday: { size: round(11.5 * k), line: Math.round(16 * k), spacing: 2.4 },
    date: { size: round(19 * k), line: Math.round(25 * k) },
    grown: { size: round(13 * k), line: Math.round(18 * k) },
    title: { size: round(23 * k), line: Math.round(29 * k), maxLines: 2, gap: Math.round(6 * k) },
    rule: { gap: Math.round(11 * k) },
    body: { size: body, line: Math.round(body * 1.55), paragraphGap: 0 },
    actions: { size: 36 },
  };
}

/** Journals have no title field: the opening line is the title; the rest is the body. A long opening line is
 *  shortened for the title and kept whole in the body, so no words are ever lost. */
export function entryParts(content: string, titleLength = 60) {
  const text = content.replace(/\r\n?/g, '\n').trim();
  const firstLine = text.split('\n').map(part => part.trim()).find(Boolean) || '';
  const single = firstLine.replace(/\s+/g, ' ');
  if (!single) return { title: '', body: '' };
  if (single.length <= titleLength) {
    const rest = text.slice(text.indexOf(firstLine) + firstLine.length).replace(/^\s*\n/, '').trim();
    return { title: single, body: rest };
  }
  const cut = single.slice(0, titleLength);
  const space = cut.lastIndexOf(' ');
  const title = `${(space > titleLength * .6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?，。、；：！？]+$/u, '')}…`;
  return { title, body: text };
}

/** A journal being written: an optional title and the body. */
export type Draft = { title: string; body: string };
/** Journals are stored as one text: an optional first line as the title, a blank line, then the body. An opening line
 *  too long for a title stays in the body, so editing never loses or moves words. */
export function splitJournal(content: string): Draft {
  const text = content.replace(/\r\n?/g, '\n').trim();
  if (!text) return { title: '', body: '' };
  const newline = text.indexOf('\n');
  const first = (newline < 0 ? text : text.slice(0, newline)).trim();
  if (first.length > 60) return { title: '', body: text };
  return { title: first, body: newline < 0 ? '' : text.slice(newline + 1).replace(/^\s*\n/, '').trimEnd() };
}
export function joinJournal(d: Draft) {
  const title = d.title.replace(/\s+/g, ' ').trim(), body = d.body.trim();
  return title && body ? `${title}\n\n${body}` : title || body;
}
