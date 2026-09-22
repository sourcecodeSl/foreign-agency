import { PDFDocument, rgb } from 'pdf-lib';

/**
 * The filled agreement: the original PDF, every page of it, with the saved
 * values written onto its blanks in English, Hebrew and Sinhala.
 *
 * PDF text drawing cannot shape Sinhala (its vowel signs join and reorder
 * around the consonant), so each value is drawn by the browser - which
 * shapes Sinhala and Hebrew properly - onto a canvas at high resolution, and
 * that picture is placed on the blank. The server says where each blank is
 * (AgreementLayout::blanks), as [page, left, right, line, secondLine?] in PDF
 * points from the bottom left. A value the paper already prints - the
 * salary - comes as { cover: [[page, left, right, line], ...] } instead: the
 * printed text there is whited out and the new text written across it.
 */

/** The size values are written in, and the smallest a long one shrinks to. */
export const FONT_PT = 10;
const MIN_FONT_PT = 6.5;
/** Pixels per point: sharp when printed. */
const SCALE = 4;
/** Room left at each end of a blank. */
const INSET = 3;
/** How far above the underscore line the text sits. */
const RAISE = 2.5;

const FONT_FAMILY = "Arial, 'Nirmala UI', 'Iskoola Pota', 'Noto Sans Sinhala', 'Noto Sans Hebrew', sans-serif";

/**
 * Sinhala letters stand taller than Latin and Hebrew at the same size; this
 * evens them out. Numbers in the Sinhala column stay the size of the rest.
 */
const SINHALA = /[඀-෿]/;
const SINHALA_SIZE = 0.86;

const fontAt = (pt, text) =>
  '600 ' + pt * (SINHALA.test(text) ? SINHALA_SIZE : 1) * SCALE + 'px ' + FONT_FAMILY;

/**
 * Where a value goes on its blank: one line, or - when it does not fit and
 * the blank has a second line - split at a word onto both. A value too long
 * even so is written smaller.
 *
 * `measure(text, pt)` gives a text's width in points; it is passed in so the
 * rule can be checked without a browser.
 *
 * @return {{ pt: number, lines: { text: string, y: number }[] }}
 */
export function placeValue(text, blank, measure) {
  const [, left, right, line, second] = blank;
  const room = right - left - INSET * 2;
  const value = String(text).trim();

  if (measure(value, FONT_PT) <= room) return { pt: FONT_PT, lines: [{ text: value, y: line }] };

  const words = value.split(/\s+/);
  if (second && words.length > 1) {
    // The most words that fit on the first line, the rest on the second.
    let split = words.length - 1;
    while (split > 1 && measure(words.slice(0, split).join(' '), FONT_PT) > room) split--;
    const first = words.slice(0, split).join(' ');
    const rest = words.slice(split).join(' ');
    const pt = Math.max(MIN_FONT_PT, Math.min(FONT_PT, (FONT_PT * room) / Math.max(measure(first, FONT_PT), measure(rest, FONT_PT))));
    return { pt, lines: [{ text: first, y: line }, { text: rest, y: second }].filter((l) => l.text) };
  }

  const pt = Math.max(MIN_FONT_PT, (FONT_PT * room) / measure(value, FONT_PT));
  return { pt, lines: [{ text: value, y: line }] };
}

/**
 * Text written across the stretches of line a printed value took, in order,
 * breaking at spaces; written smaller until it all fits.
 *
 * @return {{ pt: number, lines: { text: string, segment: number[] }[] }}
 */
export function flowValue(text, segments, measure) {
  const words = String(text).trim().split(/\s+/);

  for (let pt = FONT_PT; ; pt = Math.round((pt - 0.25) * 100) / 100) {
    const lines = [];
    let next = 0;
    for (const segment of segments) {
      const room = segment[2] - segment[1];
      let line = '';
      while (next < words.length) {
        const tried = line ? line + ' ' + words[next] : words[next];
        // A word too long for an empty line goes on anyway, and shrinks the size.
        if (line && measure(tried, pt) > room) break;
        line = tried;
        next++;
      }
      if (line) lines.push({ text: line, segment });
    }
    const fits = next === words.length && lines.every((l) => measure(l.text, pt) <= l.segment[2] - l.segment[1]);
    if (fits) return { pt, lines };
    if (pt <= MIN_FONT_PT) {
      // Never drop a word: what is left runs on at the end of the last line.
      if (next < words.length && lines.length) {
        const last = lines[lines.length - 1];
        lines[lines.length - 1] = { ...last, text: [last.text, ...words.slice(next)].join(' ') };
      }
      return { pt, lines };
    }
  }
}

/** How far below and above a printed line's baseline its text reaches, to white it out. */
const COVER_BELOW = 4;
const COVER_ABOVE = 10;

let canvas;
function context() {
  canvas ||= document.createElement('canvas');
  return canvas.getContext('2d');
}

/** A text's width in points, as the browser will draw it. */
function measure(text, pt) {
  const ctx = context();
  ctx.font = fontAt(pt, text);
  return ctx.measureText(text).width / SCALE;
}

/** One line of text as a PNG, with its size in points and where its baseline sits. */
function picture(text, pt, lang) {
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const ctx = context();
  ctx.font = fontAt(pt, text);
  const width = Math.ceil(ctx.measureText(text).width) + 4;
  const height = Math.ceil(pt * SCALE * 1.6);
  const baseline = Math.round(pt * SCALE * 1.2);

  canvas.width = width;
  canvas.height = height;
  // Resizing a canvas resets its state.
  ctx.font = fontAt(pt, text);
  ctx.direction = dir;
  ctx.textAlign = dir === 'rtl' ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0b1f4d';
  ctx.clearRect(0, 0, width, height);
  ctx.fillText(text, dir === 'rtl' ? width - 2 : 2, baseline);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: width / SCALE,
    height: height / SCALE,
    // Points from the bottom of the picture up to the baseline.
    below: (height - baseline) / SCALE,
  };
}

/**
 * Where a picture goes in its box: as large as fits, never stretched,
 * centred.
 */
export function fitBox(width, height, [left, bottom, right, top]) {
  const scale = Math.min((right - left) / width, (top - bottom) / height);
  const w = width * scale;
  const h = height * scale;
  return { x: left + (right - left - w) / 2, y: bottom + (top - bottom - h) / 2, width: w, height: h };
}

/** A picture as PNG, whatever it came as: pdf-lib reads PNG and JPEG only, not WEBP. */
async function asPng(blob) {
  const bitmap = await createImageBitmap(blob);
  const surface = document.createElement('canvas');
  surface.width = bitmap.width;
  surface.height = bitmap.height;
  surface.getContext('2d').drawImage(bitmap, 0, 0);
  return { dataUrl: surface.toDataURL('image/png'), width: bitmap.width, height: bitmap.height };
}

/**
 * The original PDF's bytes, filled with an agreement's values.
 *
 * @param {ArrayBuffer} original the uploaded PDF
 * @param {object} blanks field => language => blank
 * @param {object} values field => { en, he, si }
 * @param {object} [marks] { boxes: { seal, signature }, pictures: { seal?: Blob, signature?: Blob } }:
 *   the company seal and the signature, put at the foot of every page
 */
export async function fillAgreementPdf(original, blanks, values, marks) {
  const pdf = await PDFDocument.load(original);
  const pages = pdf.getPages();

  for (const [key, byLang] of Object.entries(blanks || {})) {
    const value = values?.[key];
    if (!value) continue;

    for (const [lang, blank] of Object.entries(byLang)) {
      const text = (value[lang] || '').trim();
      if (!text) continue;

      if (blank.cover) {
        await writeOver(pdf, pages, blank.cover, text, lang);
        continue;
      }

      const page = pages[blank[0] - 1];
      if (!page) continue;

      const [, left, right] = blank;
      const { pt, lines } = placeValue(text, blank, measure);

      for (const line of lines) {
        const img = picture(line.text, pt, lang);
        const png = await pdf.embedPng(img.dataUrl);
        const x = lang === 'he' ? right - INSET - img.width : left + INSET;
        page.drawImage(png, { x, y: line.y + RAISE - img.below, width: img.width, height: img.height });
      }
    }
  }

  for (const [type, blob] of Object.entries(marks?.pictures || {})) {
    const box = marks.boxes?.[type];
    if (!blob || !box) continue;
    const picture = await asPng(blob);
    const png = await pdf.embedPng(picture.dataUrl);
    const place = fitBox(picture.width, picture.height, box);
    // Every page carries them, beside its page number.
    pages.forEach((page) => page.drawImage(png, place));
  }

  return pdf.save();
}

/** Whites out what the paper prints on these lines and writes the text there instead. */
async function writeOver(pdf, pages, segments, text, lang) {
  for (const [page, left, right, line] of segments) {
    pages[page - 1]?.drawRectangle({
      x: left,
      y: line - COVER_BELOW,
      width: right - left,
      height: COVER_BELOW + COVER_ABOVE,
      color: rgb(1, 1, 1),
    });
  }

  const { pt, lines } = flowValue(text, segments, measure);
  for (const { text: part, segment } of lines) {
    const [pageNo, left, right, line] = segment;
    const page = pages[pageNo - 1];
    if (!page) continue;
    const img = picture(part, pt, lang);
    const png = await pdf.embedPng(img.dataUrl);
    // On the printed baseline, flush with where the old text began.
    const x = lang === 'he' ? right - img.width + 2 : left;
    page.drawImage(png, { x, y: line - img.below, width: img.width, height: img.height });
  }
}
