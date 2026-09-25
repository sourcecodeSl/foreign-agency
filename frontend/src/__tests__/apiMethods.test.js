import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Two methods of the same name in one API object do not fail anywhere: the
 * later one silently wins. That once sent the candidate history report to the
 * document history ("Unknown document type."), so no object may repeat one.
 */
describe('the API client', () => {
  it('never names two methods of one object the same', () => {
    const source = readFileSync(resolve(__dirname, '../lib/api.js'), 'utf8');
    const repeated = [];

    for (const [, name, body] of source.matchAll(/^export const (\w+) = \{([\s\S]*?)^\};/gm)) {
      const methods = [...body.matchAll(/^ {2}(?:async )?(\w+)\(/gm)].map((m) => m[1]);
      methods.filter((m, i) => methods.indexOf(m) !== i).forEach((m) => repeated.push(name + '.' + m));
    }

    expect(repeated).toEqual([]);
  });
});
