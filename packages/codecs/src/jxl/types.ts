/**
 * JPEG XL signature bytes
 * Two formats: naked codestream and ISOBMFF container
 */
export const JXL_CODESTREAM_SIGNATURE = new Uint8Array([0xff, 0x0a])
export const JXL_CONTAINER_SIGNATURE = new Uint8Array([
	0x00,
	0x00,
	0x00,
	0x0c,
	0x4a,
	0x58,
	0x4c,
	0x20,
	0x0d,
	0x0a,
	0x87,
	0x0a,
])

/**
 * JXL encoding modes
 */
export const EncodingMode = {
	VarDCT: 0, // Lossy mode using DCT
	Modular: 1, // Lossless/lossy modular mode
} as const

export type EncodingMode = (typeof EncodingMode)[keyof typeof EncodingMode]

/**
 * JXL color space
 */
export const ColorSpace = {
	RGB: 0,
	Gray: 1,
	XYB: 2, // Internal color space
} as const

export type ColorSpace = (typeof ColorSpace)[keyof typeof ColorSpace]

/**
 * JXL extra channel types
 */
export const ExtraChannelType = {
	Alpha: 0,
	Depth: 1,
	SpotColor: 2,
	SelectionMask: 3,
	Black: 4,
	CFA: 5,
	Thermal: 6,
} as const

export type ExtraChannelType = (typeof ExtraChannelType)[keyof typeof ExtraChannelType]

/**
 * JXL image header information
 */
export interface JxlHeader {
	width: number
	height: number
	bitDepth: number
	colorSpace: ColorSpace
	hasAlpha: boolean
	isLossy: boolean
	encodingMode: EncodingMode
	numExtraChannels: number
	orientation: number
}

/**
 * JXL frame header
 */
export interface JxlFrameHeader {
	duration: number
	nameLength: number
	isLast: boolean
	type: number
	encoding: EncodingMode
}

/**
 * JXL encode options
 */
export interface JxlEncodeOptions {
	quality?: number // 0-100, 100 = lossless
	effort?: number // 1-9, higher = slower but better compression
	lossless?: boolean
	distance?: number // 0-15, lower = better quality (overrides quality)
	decodingSpeed?: number // 0-4, higher = faster decode
	modular?: boolean // Force modular mode
}

/**
 * Box types for ISOBMFF container
 */
export const BoxType = {
	JXL_SIGNATURE: 0x4a584c20, // 'JXL '
	FILE_TYPE: 0x66747970, // 'ftyp'
	JXLC: 0x6a786c63, // 'jxlc' - codestream
	JXLP: 0x6a786c70, // 'jxlp' - partial codestream
} as const

/**
 * JXL container box
 */
export interface JxlBox {
	type: number
	size: number
	data: Uint8Array
}
