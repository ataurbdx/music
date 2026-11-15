/**
 * Screen WakeLock manager for lyrics reading
 * Supports navigator.wakeLock with fallback and state listeners.
 */

class WakeLockManager {
  private sentinel: any = null;
  private isActive = false;

  async request(): Promise<boolean> {
    if (this.isActive && this.sentinel) return true;

    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        this.sentinel = await (navigator as any).wakeLock.request('screen');
        this.isActive = true;

        this.sentinel.addEventListener('release', () => {
          this.isActive = false;
          this.sentinel = null;
        });

        return true;
      }
    } catch {
      // WakeLock might fail if tab is not focused or battery saver is active
    }

    return false;
  }

  async release(): Promise<void> {
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        // Ignored
      }
      this.sentinel = null;
    }
    this.isActive = false;
  }

  isWakeLockActive(): boolean {
    return this.isActive;
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }
}

export const wakeLockManager = new WakeLockManager();
