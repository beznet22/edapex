/**
 * Torch (flashlight) access.
 *
 * `torch` is a real capability in Chrome/Android but is **absent from TypeScript's DOM lib**, so
 * `MediaTrackCapabilities` and `MediaTrackConstraintSet` reject it. No cast is used here: the
 * capability is read with an `in` guard (which narrows to `Record<"torch", unknown>`), and the
 * constraint is expressed as an intersection that stays assignable to `MediaTrackConstraints`.
 *
 * Support: Chrome on Android yes; iOS Safari no — the system flashlight is not exposed to the web,
 * so the control is hidden rather than shown broken.
 */

type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

/** Structurally assignable to `MediaTrackConstraints`; adds only the untyped `torch` key. */
type TorchTrackConstraints = Omit<MediaTrackConstraints, "advanced"> & {
  advanced?: TorchConstraintSet[];
};

export function canUseTorch(track: MediaStreamTrack | null): boolean {
  if (!track || typeof track.getCapabilities !== "function") return false;
  try {
    const capabilities = track.getCapabilities();
    return "torch" in capabilities && capabilities.torch === true;
  } catch {
    return false;
  }
}

/** Returns the new torch state, or null when the track cannot control it. */
export async function setTorch(
  track: MediaStreamTrack | null,
  on: boolean
): Promise<boolean | null> {
  if (!track || !canUseTorch(track)) return null;

  const constraints: TorchTrackConstraints = { advanced: [{ torch: on }] };
  try {
    await track.applyConstraints(constraints);
    return on;
  } catch {
    return null;
  }
}
