import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

/**
 * Every request shows as loading: a read moves the bar along the top, a
 * change holds a SweetAlert loading dialog until the server answers, and the
 * background poll of the bell shows nothing at all.
 */
describe('loading indicators', () => {
  let release;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCK', 'false');
    localStorage.clear();

    // Each request waits until the test lets it through.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve(
                new Response(JSON.stringify({ success: true, data: {} }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                })
              );
          })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('holds a loading dialog while a change is on its way', async () => {
    const api = await import('../lib/api');

    const pending = api.candidateApi.setPassed(1, true);
    expect(await screen.findByText('Please wait...')).toBeTruthy();

    release();
    await pending;
    await waitFor(() => expect(screen.queryByText('Please wait...')).toBeNull());
  });

  it('counts a read for the top bar, but not the background poll', async () => {
    const api = await import('../lib/api');
    const { subscribeToLoading } = await import('../lib/loading');
    const counts = [];
    subscribeToLoading((n) => counts.push(n));

    const read = api.candidateApi.list();
    expect(counts.at(-1)).toBe(1);
    release();
    await read;
    expect(counts.at(-1)).toBe(0);

    const poll = api.notificationsApi.list();
    expect(counts.at(-1)).toBe(0);
    release();
    await poll;

    // A read never opens the blocking dialog.
    expect(screen.queryByText('Please wait...')).toBeNull();
  });
});
