import { describe, it, expect } from 'vitest';
import { validateFileName } from '../../src/lib/utils/file-validation';

describe('validateFileName', () => {
  describe('valid names', () => {
    it('accepts a simple alphanumeric name', () => {
      const result = validateFileName('report2024');
      expect(result).toEqual({ valid: true });
    });

    it('accepts a name with hyphens', () => {
      const result = validateFileName('my-file-name');
      expect(result).toEqual({ valid: true });
    });

    it('accepts a name with underscores', () => {
      const result = validateFileName('my_file_name');
      expect(result).toEqual({ valid: true });
    });

    it('accepts a name with dots (file extension)', () => {
      const result = validateFileName('document.pdf');
      expect(result).toEqual({ valid: true });
    });

    it('accepts a name with spaces', () => {
      const result = validateFileName('My Report Card');
      expect(result).toEqual({ valid: true });
    });

    it('accepts a single character name', () => {
      const result = validateFileName('a');
      expect(result).toEqual({ valid: true });
    });

    it('accepts a name at exactly 255 characters', () => {
      const name = 'a'.repeat(255);
      const result = validateFileName(name);
      expect(result).toEqual({ valid: true });
    });

    it('accepts a name with mixed allowed characters', () => {
      const result = validateFileName('Student Report - 2024_Q1.final.pdf');
      expect(result).toEqual({ valid: true });
    });
  });

  describe('empty or missing names', () => {
    it('rejects an empty string', () => {
      const result = validateFileName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Name cannot be empty');
    });

    it('rejects a null-like empty value', () => {
      const result = validateFileName('' as string);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Name cannot be empty');
    });
  });

  describe('length violations', () => {
    it('rejects a name exceeding 255 characters', () => {
      const name = 'a'.repeat(256);
      const result = validateFileName(name);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Name cannot exceed 255 characters');
    });

    it('rejects a very long name (1000 chars)', () => {
      const name = 'x'.repeat(1000);
      const result = validateFileName(name);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Name cannot exceed 255 characters');
    });
  });

  describe('invalid characters', () => {
    it('rejects a name with forward slash', () => {
      const result = validateFileName('path/file');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Name can only contain letters, numbers, hyphens, underscores, dots, and spaces');
    });

    it('rejects a name with backslash', () => {
      const result = validateFileName('path\\file');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with special characters (@)', () => {
      const result = validateFileName('file@name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with special characters (#)', () => {
      const result = validateFileName('file#name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with special characters ($)', () => {
      const result = validateFileName('file$name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with angle brackets', () => {
      const result = validateFileName('<script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with colon', () => {
      const result = validateFileName('file:name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with pipe character', () => {
      const result = validateFileName('file|name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with question mark', () => {
      const result = validateFileName('file?name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with asterisk', () => {
      const result = validateFileName('file*name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with tab character', () => {
      const result = validateFileName('file\tname');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });

    it('rejects a name with newline character', () => {
      const result = validateFileName('file\nname');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Name can only contain');
    });
  });
});
