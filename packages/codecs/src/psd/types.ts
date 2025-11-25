/**
 * Adobe Photoshop (PSD) format types
 */

/** PSD color modes */
export enum PsdColorMode {
	BITMAP = 0,
	GRAYSCALE = 1,
	INDEXED = 2,
	RGB = 3,
	CMYK = 4,
	MULTICHANNEL = 7,
	DUOTONE = 8,
	LAB = 9,
}

/** PSD compression types */
export enum PsdCompression {
	RAW = 0,
	RLE = 1,
	ZIP = 2,
	ZIP_PREDICTION = 3,
}

/** PSD file header */
export interface PsdHeader {
	signature: string
	version: number
	channels: number
	height: number
	width: number
	depth: number
	colorMode: PsdColorMode
}

/** PSD layer info */
export interface PsdLayer {
	name: string
	top: number
	left: number
	bottom: number
	right: number
	opacity: number
	visible: boolean
	blendMode: string
}

/** PSD file info (from parsing) */
export interface PsdInfo {
	header: PsdHeader
	layers: PsdLayer[]
	hasAlpha: boolean
}
