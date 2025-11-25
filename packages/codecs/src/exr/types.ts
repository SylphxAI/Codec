/**
 * OpenEXR format types
 */

/** EXR compression types */
export enum ExrCompression {
	NONE = 0,
	RLE = 1,
	ZIPS = 2, // ZIP single scanline
	ZIP = 3, // ZIP 16 scanlines
	PIZ = 4,
	PXR24 = 5,
	B44 = 6,
	B44A = 7,
	DWAA = 8,
	DWAB = 9,
}

/** EXR pixel type */
export enum ExrPixelType {
	UINT = 0,
	HALF = 1,
	FLOAT = 2,
}

/** EXR line order */
export enum ExrLineOrder {
	INCREASING_Y = 0,
	DECREASING_Y = 1,
	RANDOM_Y = 2,
}

/** EXR channel info */
export interface ExrChannel {
	name: string
	pixelType: ExrPixelType
	pLinear: number
	xSampling: number
	ySampling: number
}

/** EXR bounding box */
export interface ExrBox2i {
	xMin: number
	yMin: number
	xMax: number
	yMax: number
}

/** EXR header */
export interface ExrHeader {
	version: number
	isTiled: boolean
	hasLongNames: boolean
	hasDeepData: boolean
	isMultiPart: boolean
	channels: ExrChannel[]
	compression: ExrCompression
	dataWindow: ExrBox2i
	displayWindow: ExrBox2i
	lineOrder: ExrLineOrder
	pixelAspectRatio: number
	screenWindowCenter: [number, number]
	screenWindowWidth: number
}

/** EXR encode options */
export interface ExrEncodeOptions {
	/** Compression method (default: NONE) */
	compression?: ExrCompression
}
