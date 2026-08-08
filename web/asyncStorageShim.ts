/**
 * Web stand-in for `@react-native-async-storage/async-storage`.
 *
 * The build aliases the native package to this file, so the exact same store
 * (persist middleware included) runs in the browser prototype and on device.
 * Falls back to an in-memory map when localStorage is unavailable (private
 * mode, sandboxed iframe) so the game still runs, just without a save.
 */

const memory = new Map<string, string>();

function backing(): Storage | null {
  try {
    const probe = '__merge_restore_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = backing();

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return store !== null ? store.getItem(key) : (memory.get(key) ?? null);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (store !== null) store.setItem(key, value);
    else memory.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (store !== null) store.removeItem(key);
    else memory.delete(key);
  },
};

export default AsyncStorage;
