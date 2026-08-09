/**
 * Background music.
 *
 * Three rules shape this, all of them about not annoying the player:
 *
 * 1. Nothing plays until the player has interacted with the page. That is a
 *    browser requirement (autoplay is blocked without a gesture), but it is
 *    also just correct: a page that starts making noise on load is a page
 *    people close.
 * 2. The on/off choice is remembered. Someone who muted once should never have
 *    to mute again.
 * 3. Music stops when the tab is hidden and resumes when it comes back, so the
 *    game is not singing from a background tab.
 */

const PREFERENCE_KEY = 'merge-restore/music';
/** Background level: present, but under the UI rather than over it. */
const VOLUME = 0.38;
/** Seconds of fade when toggling, so it never snaps on or off. */
const FADE_SECONDS = 0.9;

export type MusicListener = (enabled: boolean) => void;

export class Music {
  private readonly element: HTMLAudioElement;
  private readonly listeners = new Set<MusicListener>();
  private enabled: boolean;
  private started = false;
  private fadeTimer = 0;
  /**
   * Bumped on every toggle. `play()` awaits the browser, and without this a
   * quick on-off would let the resolved play() fade the music back up after
   * the player had already muted it.
   */
  private generation = 0;

  constructor(element: HTMLAudioElement) {
    this.element = element;
    this.element.loop = true;
    this.element.volume = 0;
    this.enabled = readPreference();

    // The first interaction anywhere is the gesture that unlocks playback.
    const unlock = (): void => {
      this.started = true;
      if (this.enabled) void this.play();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.element.pause();
      else if (this.enabled && this.started) void this.play();
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Flips the preference, persists it, and fades accordingly. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    this.generation += 1;
    writePreference(this.enabled);
    if (this.enabled) {
      this.started = true;
      void this.play();
    } else {
      this.fadeTo(0, () => this.element.pause());
    }
    this.listeners.forEach((listener) => listener(this.enabled));
    return this.enabled;
  }

  onChange(listener: MusicListener): void {
    this.listeners.add(listener);
    listener(this.enabled);
  }

  private async play(): Promise<void> {
    const generation = this.generation;
    try {
      await this.element.play();
      // The player may have muted while the browser was deciding.
      if (generation !== this.generation || !this.enabled) {
        this.element.pause();
        return;
      }
      this.fadeTo(VOLUME);
    } catch {
      // Autoplay still blocked (no gesture yet). The unlock listener retries.
    }
  }

  /**
   * Linear fade on a timer; the Web Audio API would be overkill for one track.
   *
   * The ramp is driven by the clock, not by a per-tick delta. A busy frame -
   * and this game renders two WebGL scenes - throttles timers badly, and a
   * tick-counted fade then takes three seconds to mute instead of one.
   */
  private fadeTo(target: number, done?: () => void): void {
    window.clearInterval(this.fadeTimer);
    const from = this.element.volume;
    const startedAt = performance.now();
    const durationMs = FADE_SECONDS * 1000;

    this.fadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / durationMs);
      this.element.volume = Math.max(0, Math.min(1, from + (target - from) * t));
      if (t >= 1) {
        window.clearInterval(this.fadeTimer);
        done?.();
      }
    }, 40);
  }
}

function readPreference(): boolean {
  try {
    // Default on: the track is part of the game's atmosphere, and muting is
    // one tap away in the header.
    return window.localStorage.getItem(PREFERENCE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Private mode: the choice just will not survive a reload.
  }
}

/** Speaker / muted-speaker glyphs for the header toggle. */
export function speakerIcon(enabled: boolean): string {
  const waves = enabled
    ? `<path d="M16 9.2a4 4 0 0 1 0 5.6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>
       <path d="M18.4 6.6a7.5 7.5 0 0 1 0 10.8" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
    : `<path d="M16.4 9.6l5.2 4.8M21.6 9.6l-5.2 4.8" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" fill="currentColor"/>${waves}</svg>`;
}
