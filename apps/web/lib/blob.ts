/**
 * Safely creates a Blob from a Uint8Array, ensuring that any subarray view or byteOffset
 * is preserved and not expanded to the entire underlying ArrayBuffer.
 */
export function uint8ArrayToBlob(
  data: Uint8Array,
  mimeType: string = "application/pdf"
): Blob {
  // If data is a sub-view on an ArrayBuffer (byteOffset > 0 or byteLength < buffer.byteLength),
  // slice it to ensure only the exact byte range is passed to the Blob constructor.
  const isExactBuffer =
    data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;
  const chunk = isExactBuffer
    ? data
    : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

  return new Blob([chunk as BlobPart], { type: mimeType });
}
