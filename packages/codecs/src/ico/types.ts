/**
 * ICO/CUR format types and constants
 */

// File type constants
export const ICO_TYPE = 1 // Icon
export const CUR_TYPE = 2 // Cursor

/**
 * ICONDIR header structure
 */
export interface IconDir {
	reserved: number // Must be 0
	type: number // 1 for ICO, 2 for CUR
	count: number // Number of images
}

/**
 * ICONDIRENTRY structure
 */
export interface IconDirEntry {
	width: number // 0 means 256
	height: number // 0 means 256
	colorCount: number // 0 if >= 256 colors
	reserved: number // Must be 0
	planes: number // Color planes (ICO) or hotspot X (CUR)
	bitCount: number // Bits per pixel (ICO) or hotspot Y (CUR)
	bytesInRes: number // Size of image data
	imageOffset: number // Offset to image data
}

/**
 * Parsed ICO file
 */
export interface IcoImage {
	type: 'ico' | 'cur'
	entries: IconDirEntry[]
	images: Uint8Array[] // Raw image data (PNG or BMP DIB)
}

/**
 * PNG signature for detection
 */
export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
