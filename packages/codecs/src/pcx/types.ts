/**
 * PCX (PC Paintbrush) format types and constants
 */

// PCX signature byte
export const PCX_SIGNATURE = 0x0a

// PCX version
export enum PcxVersion {
	V25 = 0, // Version 2.5
	V28_PALETTE = 2, // Version 2.8 with palette
	V28_NO_PALETTE = 3, // Version 2.8 without palette
	WINDOWS = 4, // PC Paintbrush for Windows
	V30 = 5, // Version 3.0 (most common)
}

// PCX encoding
export enum PcxEncoding {
	NONE = 0,
	RLE = 1,
}

/**
 * PCX header structure (128 bytes)
 */
export interface PcxHeader {
	signature: number // 0x0A
	version: PcxVersion
	encoding: PcxEncoding
	bitsPerPixel: number // 1, 2, 4, or 8
	xMin: number
	yMin: number
	xMax: number
	yMax: number
	hDpi: number
	vDpi: number
	palette: Uint8Array // 16-color palette (48 bytes)
	reserved1: number
	numPlanes: number // 1, 3, or 4
	bytesPerLine: number // Bytes per scanline plane
	paletteType: number // 1 = color, 2 = grayscale
	hScreenSize: number
	vScreenSize: number
}

/**
 * Calculate image dimensions from header
 */
export function getDimensions(header: PcxHeader): { width: number; height: number } {
	return {
		width: header.xMax - header.xMin + 1,
		height: header.yMax - header.yMin + 1,
	}
}

/**
 * Calculate color depth
 */
export function getColorDepth(header: PcxHeader): number {
	return header.bitsPerPixel * header.numPlanes
}
