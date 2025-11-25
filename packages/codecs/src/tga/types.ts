/**
 * TGA (Targa) format types and constants
 */

// Image types
export enum TgaImageType {
	NoImage = 0,
	ColorMapped = 1,
	TrueColor = 2,
	Grayscale = 3,
	ColorMappedRLE = 9,
	TrueColorRLE = 10,
	GrayscaleRLE = 11,
}

// Image descriptor flags
export const ORIGIN_MASK = 0x30
export const ORIGIN_BOTTOM_LEFT = 0x00
export const ORIGIN_BOTTOM_RIGHT = 0x10
export const ORIGIN_TOP_LEFT = 0x20
export const ORIGIN_TOP_RIGHT = 0x30

/**
 * TGA header structure (18 bytes)
 */
export interface TgaHeader {
	idLength: number // Length of image ID field
	colorMapType: number // 0 = no color map, 1 = has color map
	imageType: TgaImageType

	// Color map specification
	colorMapOrigin: number // First entry index
	colorMapLength: number // Number of entries
	colorMapDepth: number // Bits per entry (15, 16, 24, 32)

	// Image specification
	xOrigin: number
	yOrigin: number
	width: number
	height: number
	pixelDepth: number // Bits per pixel (8, 16, 24, 32)
	imageDescriptor: number // Alpha bits + origin
}

/**
 * TGA 2.0 footer (26 bytes)
 */
export interface TgaFooter {
	extensionOffset: number
	developerOffset: number
	signature: string // "TRUEVISION-XFILE."
}

export const TGA_FOOTER_SIGNATURE = 'TRUEVISION-XFILE.'
