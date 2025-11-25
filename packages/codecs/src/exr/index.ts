/**
 * OpenEXR codec
 *
 * Features:
 * - Decode scanline EXR with NONE/RLE compression
 * - HALF (16-bit) and FLOAT (32-bit) pixel types
 * - HDR to SDR tone mapping (Reinhard)
 * - Encode to scanline EXR with HALF pixels
 * - Direct HDR float access
 */

export * from './types'
export * from './decoder'
export * from './encoder'
