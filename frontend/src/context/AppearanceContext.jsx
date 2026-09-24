import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { appearanceApi } from '../lib/api';
import {
  DEFAULT_APPEARANCE,
  applyAppearance,
  cacheAppearance,
  readCachedAppearance,
} from '../lib/theme';

const AppearanceContext = createContext({
  appearance: DEFAULT_APPEARANCE,
  update: async () => {},
  preview: () => {},
  reset: async () => {},
  saving: false,
});

/**
 * The signed-in person's look of the interface, applied to the whole page.
 *
 * It opens in the look last used in this browser, then takes the person's
 * own from the server once they are signed in. A change is applied at once
 * and saved to their login, so it follows them to any device.
 */
export function AppearanceProvider({ children }) {
  const { admin } = useAuth();
  const [appearance, setAppearance] = useState(readCachedAppearance);
  const [saving, setSaving] = useState(false);
  const latest = useRef(appearance);
  latest.current = appearance;
  // The last look the server has kept, to go back to if a save fails -
  // not whatever is being previewed on screen at the time.
  const saved = useRef(appearance);

  // Signed in: the person's own choices replace the browser's last ones.
  useEffect(() => {
    if (!admin?.id) return undefined;
    let cancelled = false;
    appearanceApi
      .get()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const mine = { ...DEFAULT_APPEARANCE, ...data };
        saved.current = mine;
        setAppearance(mine);
        cacheAppearance(mine);
      })
      .catch(() => {
        // Keeps the look already on screen.
      });
    return () => {
      cancelled = true;
    };
  }, [admin?.id]);

  // On screen, and again whenever the device switches light and dark while
  // "system" is chosen.
  useEffect(() => {
    applyAppearance(appearance);
    if (appearance.mode !== 'system' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyAppearance(latest.current);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, [appearance]);

  const save = useCallback(async (next, changes) => {
    setAppearance(next);
    cacheAppearance(next);
    setSaving(true);
    try {
      await appearanceApi.save(changes);
      saved.current = next;
    } catch (err) {
      // Not kept on the server, so not kept here either.
      setAppearance(saved.current);
      cacheAppearance(saved.current);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const update = useCallback(
    (changes) => save({ ...latest.current, ...changes }, changes),
    [save]
  );

  // Shown on screen only, while a colour is still being picked; update()
  // saves it once the person settles on one.
  const preview = useCallback((changes) => setAppearance({ ...latest.current, ...changes }), []);

  const reset = useCallback(() => save(DEFAULT_APPEARANCE, DEFAULT_APPEARANCE), [save]);

  return (
    <AppearanceContext.Provider value={{ appearance, update, preview, reset, saving }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export const useAppearance = () => useContext(AppearanceContext);
