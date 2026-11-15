/**
 * File name validation utility for Workspace Panel inline file/directory creation.
 * Validates names against allowed character set and length constraints.
 *
 * Requirements 8.1, 8.2: Accept 1-255 chars, alphanumeric + hyphens + underscores + dots + spaces only.
 * Show specific validation failure messages on rejection.
 */

export interface FileNameValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a file or directory name for the Workspace Panel.
 *
 * Rules:
 * - Name must be 1-255 characters
 * - Only alphanumeric characters, hyphens, underscores, dots, and spaces are allowed
 *
 * @param name - The file or directory name to validate
 * @returns An object with `valid` boolean and optional `error` message
 */
export function validateFileName(name: string): FileNameValidationResult {
  if (!name || name.length === 0) {
    return { valid: false, error: 'Name cannot be empty' };
  }

  if (name.length > 255) {
    return { valid: false, error: 'Name cannot exceed 255 characters' };
  }

  if (!/^[a-zA-Z0-9\-_. ]+$/.test(name)) {
    return {
      valid: false,
      error: 'Name can only contain letters, numbers, hyphens, underscores, dots, and spaces'
    };
  }

  return { valid: true };
}
