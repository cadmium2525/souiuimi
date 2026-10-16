/** The bundled, credited acoustic recording is shared across the whole game. */
export class Music {
  enabled = true;
  private readonly audio: HTMLAudioElement;
  private unlocked = false;
  private suspended = false;
  private lastError: string | null = null;
  private playAttempt = 0;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.audio.loop = true;
    this.audio.volume = 0.24;
    this.audio.src = new URL(`${import.meta.env.BASE_URL}audio/bossa-antigua.mp3`, document.baseURI).href;
    this.audio.addEventListener('playing', () => {
      this.lastError = null;
      // A pending play request must not restore sound after OFF or app hiding.
      if (!this.shouldPlay()) this.audio.pause();
    });
    this.audio.addEventListener('error', () => {
      this.lastError = this.audio.error ? `MediaError ${this.audio.error.code}` : 'MediaError';
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.sync();
  }

  /** Call directly inside a click/tap handler, before any awaited operation. */
  unlock(): void {
    this.unlocked = true;
    this.sync();
  }

  /** Keeps the current musical position when the page loses visibility. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.sync();
  }

  diagnostics() {
    return {
      enabled: this.enabled,
      unlocked: this.unlocked,
      suspended: this.suspended,
      paused: this.audio.paused,
      currentTime: this.audio.currentTime,
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : null,
      readyState: this.audio.readyState,
      networkState: this.audio.networkState,
      volume: this.audio.volume,
      loop: this.audio.loop,
      error: this.lastError,
    };
  }

  private shouldPlay(): boolean {
    return this.enabled && this.unlocked && !this.suspended;
  }

  private sync(): void {
    const attempt = ++this.playAttempt;
    if (!this.shouldPlay()) {
      this.audio.pause();
      return;
    }
    // Calling play again never creates another player or resets currentTime.
    // Keep it inside the gesture call stack for Safari's media policy.
    try {
      const playing = this.audio.play();
      void playing.then(() => {
        if (!this.shouldPlay()) this.audio.pause();
      }).catch((error: unknown) => {
        if (attempt !== this.playAttempt) return;
        // Autoplay denial / a missing download should never interrupt a case.
        this.lastError = error instanceof Error ? error.name : 'PlaybackError';
      });
    } catch (error: unknown) {
      this.lastError = error instanceof Error ? error.name : 'PlaybackError';
    }
  }
}
