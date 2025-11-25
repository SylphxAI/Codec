/**
 * XBM (X BitMap) format types and constants
 * Monochrome image format used in X Window System
 */

export interface XBMEncodeOptions {
	name?: string // Variable name for C header (default: 'image')
	threshold?: number // Grayscale threshold (0-255, default: 128)
}
