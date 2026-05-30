import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MistralOcrService } from '../mistral-ocr.service';
import { SDKError, HTTPValidationError } from '@mistralai/mistralai/models/errors';

vi.mock('$env/dynamic/private', () => ({
  env: {
    MISTRAL_API_KEY: 'mock-key-123'
  }
}));

const mockUpload = vi.fn();
const mockProcess = vi.fn();

vi.mock('@mistralai/mistralai', () => {
  return {
    Mistral: class {
      files = {
        upload: mockUpload,
      };
      ocr = {
        process: mockProcess,
      };
    }
  };
});

describe('MistralOcrService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('successfully processes a document and returns OCR response', async () => {
    mockUpload.mockResolvedValue({ id: 'file-123' });
    mockProcess.mockResolvedValue({
      model: 'mistral-ocr-latest',
      usageInfo: { pagesProcessed: 2, docSizeBytes: 2048 },
      pages: [{ markdown: '# Page 1' }, { markdown: '# Page 2' }]
    });

    const service = MistralOcrService.getInstance();
    const promise = service.processDocument(Buffer.from('dummy-pdf-content'), 'test.pdf');
    
    // Fast-forward any timers to bypass the cooldown check
    await vi.runAllTimersAsync();
    
    const result = await promise;

    expect(mockUpload).toHaveBeenCalledWith({
      file: {
        fileName: 'test.pdf',
        content: expect.any(Blob)
      },
      purpose: 'ocr'
    });
    expect(mockProcess).toHaveBeenCalledWith({
      model: 'mistral-ocr-latest',
      document: {
        type: 'file',
        fileId: 'file-123'
      },
      includeImageBase64: true
    });
    expect(result.pages[0].markdown).toBe('# Page 1');
    expect(result.usageInfo.pagesProcessed).toBe(2);
  });

  it('spaces sequential requests using cooldown logic', async () => {
    mockUpload.mockResolvedValue({ id: 'file-123' });
    mockProcess.mockResolvedValue({
      model: 'mistral-ocr-latest',
      usageInfo: { pagesProcessed: 1, docSizeBytes: 100 },
      pages: [{ markdown: 'Text' }]
    });

    const service = MistralOcrService.getInstance();
    
    // Capture timeouts during the process
    const spySetTimeout = vi.spyOn(global, 'setTimeout');

    const promise1 = service.processDocument(Buffer.from('1'), '1.pdf');
    const promise2 = service.processDocument(Buffer.from('2'), '2.pdf');

    await vi.runAllTimersAsync();
    await Promise.all([promise1, promise2]);

    // The second request should trigger a setTimeout with the remaining cooldown duration
    expect(spySetTimeout).toHaveBeenCalled();
    const calls = spySetTimeout.mock.calls;
    const cooldownDelay = calls.find(call => typeof call[1] === 'number' && call[1] > 2000);
    expect(cooldownDelay).toBeDefined();
  });

  it('retries up to 3 times with exponential backoff on transient errors (429, 500, 503)', async () => {
    mockUpload.mockResolvedValue({ id: 'file-123' });
    
    // First 2 calls fail with 429, 3rd call succeeds
    const transientError = Object.create(SDKError.prototype);
    Object.assign(transientError, {
      message: 'Rate limit',
      httpMeta: {
        response: { status: 429 }
      }
    });

    mockProcess
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({
        model: 'mistral-ocr-latest',
        usageInfo: { pagesProcessed: 1, docSizeBytes: 100 },
        pages: [{ markdown: 'Success after retries' }]
      });

    const service = MistralOcrService.getInstance();
    const promise = service.processDocument(Buffer.from('dummy'), 'retry.pdf');

    // Run timers for the exponential backoff (1s, then 2s)
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(mockProcess).toHaveBeenCalledTimes(3);
    expect(result.pages[0].markdown).toBe('Success after retries');
  });

  it('throws immediately on non-retryable client errors (400, 401)', async () => {
    mockUpload.mockResolvedValue({ id: 'file-123' });
    
    const fatalError = Object.create(SDKError.prototype);
    Object.assign(fatalError, {
      message: 'Unauthorized',
      httpMeta: {
        response: { status: 401 }
      }
    });

    mockProcess.mockRejectedValueOnce(fatalError);

    const service = MistralOcrService.getInstance();
    const promise = service.processDocument(Buffer.from('dummy'), 'fatal.pdf');
    promise.catch(() => {}); // prevent unhandled rejection warnings

    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('Unauthorized');
    expect(mockProcess).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on HTTPValidationError (422)', async () => {
    mockUpload.mockResolvedValue({ id: 'file-123' });
    
    const validationError = Object.create(HTTPValidationError.prototype);
    Object.assign(validationError, {
      message: 'Validation error',
      httpMeta: {
        response: { status: 422 }
      }
    });

    mockProcess.mockRejectedValueOnce(validationError);

    const service = MistralOcrService.getInstance();
    const promise = service.processDocument(Buffer.from('dummy'), 'validation.pdf');
    promise.catch(() => {}); // prevent unhandled rejection warnings

    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow(HTTPValidationError);
    expect(mockProcess).toHaveBeenCalledTimes(1);
  });
});
