import {
  type PayloadLimits,
  DEFAULT_PAYLOAD_LIMITS,
  PayloadLimitError,
  validatePayloadLimits,
  getPayloadMemoryWarning,
  type FilePayloadInfo,
} from "@pdfkit/core";

export {
  type PayloadLimits,
  DEFAULT_PAYLOAD_LIMITS,
  PayloadLimitError,
  validatePayloadLimits,
  getPayloadMemoryWarning,
  type FilePayloadInfo,
};

export interface FileValidationResult {
  readonly valid: File[];
  readonly error: string | null;
}

/**
 * Validates incoming files against existing files and configured limits.
 * If limits are exceeded, returns { valid: [], error: string }.
 * Otherwise, returns { valid: incoming, error: null }.
 */
export function validateFilesForUpload(
  incomingFiles: readonly File[],
  existingFiles: readonly File[] = [],
  customLimits?: PayloadLimits
): FileValidationResult {
  const combined = [...existingFiles, ...incomingFiles];
  try {
    validatePayloadLimits(combined, customLimits);
    return { valid: Array.from(incomingFiles), error: null };
  } catch (err) {
    if (err instanceof PayloadLimitError) {
      return { valid: [], error: err.message };
    }
    return { valid: [], error: err instanceof Error ? err.message : "File validation failed." };
  }
}
