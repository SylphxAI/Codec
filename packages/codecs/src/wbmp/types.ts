/**
 * WBMP (Wireless Bitmap) format types
 * Simple monochrome format for mobile devices
 */

export interface WBMPEncodeOptions {
	threshold?: number // Grayscale threshold (0-255, default: 128)
}
