import { uuidv7 } from "uuidv7";

/**
 * generates a cryptographically strong, time-ordered UUID v7 string.
 */
export const generateId = () => uuidv7();

/**
 * Drizzle-compatible default function for string-based primary keys.
 */
export const idDefault = () => ({
  $defaultFn: () => generateId()
});
