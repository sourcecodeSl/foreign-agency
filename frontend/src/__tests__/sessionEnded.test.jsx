import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A session can end while a screen is open - the token expires, or a sign-in
 * somewhere else replaces it. The API client says so once, in words a person
 * can act on, and only for requests that were meant to carry a session.
 */
describe('when the session is gone', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCK', 'false');
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const answer = (status, body) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );

  it('tells the app once, and says so in plain words', async () => {
    const api = await import('../lib/api');
    const ended = vi.fn();
    api.setSessionEndedHandler(ended);
    api.tokenStore.set('stale.token');

    answer(401, { success: false, message: 'Authentication required.' });

    await expect(api.candidateApi.list()).rejects.toThrow(/session has ended/i);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('leaves a refused sign-in to the sign-in screen', async () => {
    const api = await import('../lib/api');
    const ended = vi.fn();
    api.setSessionEndedHandler(ended);

    answer(401, { success: false, message: 'Invalid username or password.' });

    await expect(api.authApi.login({ username: 'mainadmin', password: 'wrongpass' })).rejects.toThrow(
      /invalid username or password/i
    );
    expect(ended).not.toHaveBeenCalled();
  });
});
