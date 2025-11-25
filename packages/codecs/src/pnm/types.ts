/**
 * PNM (Portable Any Map) format types and constants
 * Includes PBM (Bitmap), PGM (Graymap), PPM (Pixmap)
 */

// Format types
export enum PnmFormat {
	PBM_ASCII = 'P1', // Portable Bitmap ASCII
	PGM_ASCII = 'P2', // Portable Graymap ASCII
	PPM_ASCII = 'P3', // Portable Pixmap ASCII
	PBM_BINARY = 'P4', // Portable Bitmap Binary
	PGM_BINARY = 'P5', // Portable Graymap Binary
	PPM_BINARY = 'P6', // Portable Pixmap Binary
	PAM = 'P7', // Portable Arbitrary Map
}

/**
 * PNM header structure
 */
export interface PnmHeader {
	format: PnmFormat
	width: number
	height: number
	maxVal: number // Maximum pixel value (1 for PBM, usually 255 or 65535)
}

/**
 * Check if format is ASCII (text)
 */
export function isAsciiFormat(format: PnmFormat): boolean {
	return (
		format === PnmFormat.PBM_ASCII ||
		format === PnmFormat.PGM_ASCII ||
		format === PnmFormat.PPM_ASCII
	)
}

/**
 * Check if format is binary
 */
export function isBinaryFormat(format: PnmFormat): boolean {
	return (
		format === PnmFormat.PBM_BINARY ||
		format === PnmFormat.PGM_BINARY ||
		format === PnmFormat.PPM_BINARY
	)
}

/**
 * Get channels for format
 */
export function getChannels(format: PnmFormat): number {
	switch (format) {
		case PnmFormat.PBM_ASCII:
		case PnmFormat.PBM_BINARY:
		case PnmFormat.PGM_ASCII:
		case PnmFormat.PGM_BINARY:
			return 1
		case PnmFormat.PPM_ASCII:
		case PnmFormat.PPM_BINARY:
			return 3
		default:
			return 3
	}
}
