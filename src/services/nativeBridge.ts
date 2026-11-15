/**
 * Native Bridge for Tour Lyrics
 * Seamlessly interfaces with Capacitor native plugins when running inside an Android APK
 * and provides robust web standards fallbacks when running in Web / PWA / AI Studio preview.
 */

export interface NativePlatformInfo {
  isNative: boolean;
  platform: 'android' | 'ios' | 'web';
}

class NativeBridge {
  private backButtonListeners: Array<() => boolean | void> = [];

  constructor() {
    this.setupHardwareBackButton();
  }

  /**
   * Determine current runtime platform safely
   */
  getPlatformInfo(): NativePlatformInfo {
    try {
      const cap = (window as any).Capacitor;
      if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
        return {
          isNative: true,
          platform: cap.getPlatform() || 'android',
        };
      }
    } catch {
      // Fallback
    }

    return {
      isNative: false,
      platform: 'web',
    };
  }

  isNative(): boolean {
    return this.getPlatformInfo().isNative;
  }

  /**
   * Keep-Awake / Screen Wake Lock
   * Uses @capacitor-community/keep-awake if native, or navigator.wakeLock if web
   */
  async setKeepAwake(enable: boolean): Promise<boolean> {
    try {
      const cap = (window as any).Capacitor;
      const keepAwakePlugin = cap?.Plugins?.KeepAwake;
      if (keepAwakePlugin) {
        if (enable) {
          await keepAwakePlugin.keepAwake();
        } else {
          await keepAwakePlugin.allowSleep();
        }
        return true;
      }
    } catch (e) {
      console.warn('Native keep-awake error:', e);
    }

    // Web Fallback
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        if (enable) {
          await (navigator as any).wakeLock.request('screen');
        }
        return true;
      }
    } catch (e) {
      console.warn('Web wakeLock error:', e);
    }

    return false;
  }

  /**
   * Hardware Back Button listener on Android
   * Handlers can return true to signal the event was handled and prevent app exit.
   */
  onHardwareBack(callback: () => boolean | void): () => void {
    this.backButtonListeners.push(callback);
    return () => {
      this.backButtonListeners = this.backButtonListeners.filter((cb) => cb !== callback);
    };
  }

  private setupHardwareBackButton() {
    try {
      const cap = (window as any).Capacitor;
      const appPlugin = cap?.Plugins?.App;
      if (appPlugin && typeof appPlugin.addListener === 'function') {
        appPlugin.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
          // Execute listeners in reverse order (most recent modal/view first)
          for (let i = this.backButtonListeners.length - 1; i >= 0; i--) {
            const handled = this.backButtonListeners[i]();
            if (handled === true) {
              return;
            }
          }

          if (canGoBack) {
            window.history.back();
          } else {
            appPlugin.exitApp();
          }
        });
      }
    } catch {
      // Not in native app
    }
  }

  /**
   * Secure Storage / Preferences bridge
   */
  async getStorageItem(key: string): Promise<string | null> {
    try {
      const cap = (window as any).Capacitor;
      const preferences = cap?.Plugins?.Preferences || cap?.Plugins?.Storage;
      if (preferences) {
        const res = await preferences.get({ key });
        return res?.value ?? null;
      }
    } catch {
      // Fallback
    }

    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  async setStorageItem(key: string, value: string): Promise<void> {
    try {
      const cap = (window as any).Capacitor;
      const preferences = cap?.Plugins?.Preferences || cap?.Plugins?.Storage;
      if (preferences) {
        await preferences.set({ key, value });
        return;
      }
    } catch {
      // Fallback
    }

    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore
    }
  }

  async removeStorageItem(key: string): Promise<void> {
    try {
      const cap = (window as any).Capacitor;
      const preferences = cap?.Plugins?.Preferences || cap?.Plugins?.Storage;
      if (preferences) {
        await preferences.remove({ key });
        return;
      }
    } catch {
      // Fallback
    }

    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }

  /**
   * Native Filesystem bridge for audio persistence
   * When native, writes to directory: Directory.Data; when web, handled by Dexie audioBlobs
   */
  async saveAudioFile(filename: string, blob: Blob): Promise<{ uri: string } | null> {
    try {
      const cap = (window as any).Capacitor;
      const filesystem = cap?.Plugins?.Filesystem;
      if (filesystem) {
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const result = await filesystem.writeFile({
          path: `tour_audio/${filename}`,
          data: base64Data,
          directory: 'DATA',
          recursive: true,
        });

        return { uri: result?.uri || `file://${filename}` };
      }
    } catch (e) {
      console.warn('Native filesystem save failed:', e);
    }

    return null;
  }
}

export const nativeBridge = new NativeBridge();
