/** Tiny original synthesized sounds: no audio files or network requests. */
export class Sound {
  private context: AudioContext | null = null;
  enabled = false;
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      try { this.context ??= new AudioContext(); void this.context.resume(); } catch { this.enabled = false; }
    }
  }
  play(kind: 'tap' | 'clue' | 'ending') {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    const notes = kind === 'clue' ? [587, 784] : kind === 'ending' ? [392, 494, 587, 784] : [440];
    notes.forEach((frequency, i) => {
      const start = ctx.currentTime + i * 0.11;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.055, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start); oscillator.stop(start + 0.22);
    });
  }
}
