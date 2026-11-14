export interface Clock {
  /** Unix seconds, matching the schema's instant encoding (`05 §4`). */
  now(): number;
}

export const systemClock: Clock = {
  now: () => Math.floor(Date.now() / 1000)
};
