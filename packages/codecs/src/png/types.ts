/**
 * PNG color types
 */
export const ColorType = {
	Grayscale: 0,
	RGB: 2,
	Indexed: 3,
	GrayscaleAlpha: 4,
	RGBA: 6,
} as const

export type ColorType = (typeof ColorType)[keyof typeof ColorType]

/**
 * PNG filter types
 */
export const FilterType = {
	None: 0,
	Sub: 1,
	Up: 2,
	Average: 3,
	Paeth: 4,
} as const

export type FilterType = (typeof FilterType)[keyof typeof FilterType]

/**
 * PNG chunk types
 */
export const ChunkType = {
	IHDR: 0x49484452,
	PLTE: 0x504c5445,
	IDAT: 0x49444154,
	IEND: 0x49454e44,
	tRNS: 0x74524e53,
	gAMA: 0x67414d41,
	cHRM: 0x6348524d,
	sRGB: 0x73524742,
	iCCP: 0x69434350,
	tEXt: 0x74455874,
	zTXt: 0x7a545874,
	iTXt: 0x69545874,
	bKGD: 0x624b4744,
	pHYs: 0x70485973,
	sBIT: 0x73424954,
	sPLT: 0x73504c54,
	hIST: 0x68495354,
	tIME: 0x74494d45,
} as const

/**
 * PNG signature bytes
 */
export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

/**
 * IHDR chunk data
 */
export interface IHDRData {
	width: number
	height: number
	bitDepth: number
	colorType: ColorType
	compressionMethod: number
	filterMethod: number
	interlaceMethod: number
}

/**
 * PNG chunk
 */
export interface PngChunk {
	type: number
	data: Uint8Array
}
