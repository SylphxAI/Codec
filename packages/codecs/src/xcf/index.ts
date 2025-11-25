/**
 * GIMP XCF (eXperimental Computing Facility) codec
 *
 * Features:
 * - Decode flattened composite image
 * - RGB and Grayscale modes
 * - RLE compression support
 * - Layer compositing (visible layers only)
 * - Parse layer info (names, offsets, opacity)
 */

export * from './types'
export * from './decoder'
export * from './encoder'
export * from './codec'
