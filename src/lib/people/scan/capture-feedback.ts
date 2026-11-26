/**
 * Shutter feedback — a Web Audio click plus a guarded haptic pulse (plan Gate 2.4).
 *
 * Both are wrapped because neither is universally available:
 * - Web Audio needs a prior user gesture to start a context, and iOS suspends it when backgrounded.
 * - `navigator.vibrate` does not exist on iOS Safari at all, and is silently ignored when the
 *   device is in silent mode.
 *
 * Neither is allowed to throw into the capture path. Feedback is a nicety; losing a capture because
 * the audio context failed would be a real bug.
 */

let audioContext: AudioContext | null = null;

const getContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  return audioContext;
};

/** Call once from a real user gesture (the shutter or a mode toggle) to unlock audio on iOS. */
export function primeAudioFeedback(): void {
  const context = getContext();
  if (context && context.state === "suspended") void context.resume();
}

/**
 * A short filtered noise burst — closer to a mechanical shutter than an oscillator beep.
 * Returns false when audio is unavailable so the caller can fall back to haptics alone.
 */
export function playShutterClick(muted = false): boolean {
  if (muted) return false;
  const context = getContext();
  if (!context) return false;

  try {
    if (context.state === "suspended") void context.resume();

    const duration = 0.055;
    const frames = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < frames; index += 1) {
      // Linear decay keeps it a click rather than a pop.
      const decay = 1 - index / frames;
      channel[index] = (Math.random() * 2 - 1) * decay * decay;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    filter.Q.value = 0.9;

    const gain = context.createGain();
    gain.gain.value = 0.22;

    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    return true;
  } catch {
    return false;
  }
}

/** Android-only in practice; iOS Safari has no `navigator.vibrate`. Never throws. */
export function pulseHaptic(pattern: number | number[] = 40): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/** Fired on a successful capture: click and pulse together. */
export function captureFeedback(muted = false): void {
  playShutterClick(muted);
  pulseHaptic(40);
}

/** A softer confirmation for auto-advance, so the teacher knows the row moved on. */
export function advanceFeedback(muted = false): void {
  if (!muted) playShutterClick(false);
  pulseHaptic([12, 40, 12]);
}
