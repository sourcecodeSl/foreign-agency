import { describe, it, expect } from 'vitest';
import { placeValue, flowValue, fitBox, FONT_PT, headingSize } from '../lib/agreementPdf';

// Every character is 5pt wide at the normal size, and scales with it.
const measure = (text, pt) => text.length * 5 * (pt / FONT_PT);

describe('placing a value on its blank', () => {
  it('writes a value that fits on the line, at the normal size', () => {
    expect(placeValue('N7893266', [1, 218, 377, 135], measure)).toEqual({
      pt: FONT_PT,
      lines: [{ text: 'N7893266', y: 135 }],
    });
  });

  it('wraps a long address onto the second line at a word', () => {
    // Room is 165 - 6 = 159pt: 31 characters.
    const { pt, lines } = placeValue(
      'No 316, Ginigalpelessa, Sewanagala, Moneragala District',
      [1, 218, 383, 577, 553],
      measure
    );
    expect(lines).toEqual([
      { text: 'No 316, Ginigalpelessa,', y: 577 },
      { text: 'Sewanagala, Moneragala District', y: 553 },
    ]);
    expect(pt).toBe(FONT_PT);
  });

  it('writes a long name smaller where there is no second line', () => {
    const { pt, lines } = placeValue('HEWA ALANKARAGE ANURA SAMAN KUMARA', [1, 218, 371, 233], measure);
    expect(lines).toHaveLength(1);
    expect(pt).toBeLessThan(FONT_PT);
    expect(measure(lines[0].text, pt)).toBeLessThanOrEqual(371 - 218 - 6);
  });
});

describe('writing over a printed value', () => {
  const segments = [
    [8, 323, 384, 503], // 61pt: 12 characters
    [8, 218, 384, 488], // 166pt: 33
    [8, 218, 303, 457], // 85pt: 17
  ];

  it('runs the text across the lines in order, breaking at spaces', () => {
    const text = 'NIS 7,512.40 (Seven thousand five hundred New Israeli Shekels)';
    const { pt, lines } = flowValue(text, segments, measure);
    expect(pt).toBe(FONT_PT);
    expect(lines).toEqual([
      { text: 'NIS 7,512.40', segment: segments[0] },
      { text: '(Seven thousand five hundred New', segment: segments[1] },
      { text: 'Israeli Shekels)', segment: segments[2] },
    ]);
  });

  it('writes smaller when the words do not fit the lines at the normal size', () => {
    // "NIS 17,512.40" alone is too wide for the first line at the normal size.
    const long = 'NIS 17,512.40 (Seventeen thousand five hundred twelve New Israeli Shekels)';
    const { pt, lines } = flowValue(long, segments, measure);
    expect(pt).toBeLessThan(FONT_PT);
    expect(lines.map((l) => l.text).join(' ')).toBe(long);
    lines.forEach((l) => expect(measure(l.text, pt)).toBeLessThanOrEqual(l.segment[2] - l.segment[1]));
  });

  it('never drops a word, even when it cannot fit at the smallest size', () => {
    const text = Array.from({ length: 40 }, (_, i) => 'word' + i).join(' ');
    const { lines } = flowValue(text, segments, measure);
    expect(lines.map((l) => l.text).join(' ')).toBe(text);
  });
});

describe('fitting the seal and the signature in their boxes', () => {
  const box = [62, 6, 152, 60]; // 90 wide, 54 high

  it('fits a round seal by its height, centred, never stretched', () => {
    expect(fitBox(300, 300, box)).toEqual({ x: 80, y: 6, width: 54, height: 54 });
  });

  it('fits a wide signature by its width', () => {
    const place = fitBox(500, 100, box);
    expect(place.width).toBe(90);
    expect(place.height).toBe(18);
    expect(place.y).toBe(24);
  });
});

describe('the agreement name written as the heading', () => {
  const heading = { cover: [150, 786, 460, 810], baseline: 793.4, centre: 303.5, size: 14, maxWidth: 480 };
  // Every character 7 points wide at 14pt, scaling with the size.
  const measure = (text, pt) => text.length * 7 * (pt / 14);

  it('keeps the size the paper prints its heading at', () => {
    expect(headingSize('SEC CONSTRUCTION - SRI LANKA - 2026', heading, measure)).toBe(14);
  });

  it('sets a name too wide for the page smaller, never below 8pt', () => {
    const long = 'X'.repeat(120); // 840pt at 14pt
    expect(headingSize(long, heading, measure)).toBeCloseTo(8, 5);
    expect(headingSize('X'.repeat(80), heading, measure)).toBeCloseTo(12, 5); // 560pt -> 480pt
  });
});
