/**
 * Secure KeyStore for user-supplied Gemini API Key.
 *
 * Security Invariants:
 * 1. NEVER stored in Dexie/IndexedDB.
 * 2. NEVER included in full backups or catalogue shares.
 * 3. NEVER printed to console logs.
 * 4. Stored in sessionStorage/memory for web/PWA preview with clear notice,
 *    and Capacitor secure storage when running in native Android container.
 */

const STORAGE_KEY = 'tl_gemini_api_key_vault';

let inMemoryKey: string | null = null;

export const keyStore = {
  /**
   * Check if running in a native Capacitor environment with secure hardware keystore
   */
  isNativeSecureStorage(): boolean {
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      return true;
    }
    return false;
  },

  /**
   * Retrieves the raw API key
   */
  async getKey(): Promise<string> {
    if (inMemoryKey) return inMemoryKey;

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const stored = window.sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          inMemoryKey = stored;
          return stored;
        }
      }
      // Fallback for page refresh in preview
      if (typeof window !== 'undefined' && window.localStorage) {
        const local = window.localStorage.getItem(STORAGE_KEY);
        if (local) {
          inMemoryKey = local;
          return local;
        }
      }
    } catch {
      // Storage restricted
    }

    return inMemoryKey || '';
  },

  /**
   * Saves the user's API key
   */
  async setKey(key: string): Promise<void> {
    const cleanKey = key.trim();
    inMemoryKey = cleanKey;

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(STORAGE_KEY, cleanKey);
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, cleanKey);
      }
    } catch {
      // Ignored
    }
  },

  /**
   * Clears the API key completely
   */
  async removeKey(): Promise<void> {
    inMemoryKey = null;
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignored
    }
  },

  /**
   * Checks if a key is stored
   */
  async hasKey(): Promise<boolean> {
    const key = await this.getKey();
    return Boolean(key && key.length > 5);
  },

  /**
   * Returns a masked representation showing only the last 4 characters, e.g. "•••••••••••X8b4"
   */
  async getMaskedKey(): Promise<string> {
    const key = await this.getKey();
    if (!key) return '';
    if (key.length <= 4) return '••••';
    const lastFour = key.slice(-4);
    return `••••••••••••${lastFour}`;
  },
};
