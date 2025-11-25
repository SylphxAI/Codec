/**
 * Farbfeld format types and constants
 * Simple uncompressed 16-bit RGBA format
 * https://tools.suckless.org/farbfeld/
 */

// Magic bytes: "farbfeld"
export const FARBFELD_MAGIC = new Uint8Array([0x66, 0x61, 0x72, 0x62, 0x66, 0x65, 0x6c, 0x64])

// No options - farbfeld is fixed format
export type FarbfeldEncodeOptions = Record<string, never>
