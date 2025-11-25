/**
 * FLIF color types
 */
export const ColorType = {
	Grayscale: 1,
	RGB: 3,
	RGBA: 4,
} as const

export type ColorType = (typeof ColorType)[keyof typeof ColorType]

/**
 * FLIF signature bytes (magic number)
 */
export const FLIF_SIGNATURE = new Uint8Array([0x46, 0x4c, 0x49, 0x46]) // "FLIF"

/**
 * FLIF header flags
 */
export interface FlifFlags {
	interlaced: boolean
	animated: boolean
}

/**
 * FLIF image header
 */
export interface FlifHeader {
	width: number
	height: number
	channels: number
	bitDepth: number
	numFrames: number
	flags: FlifFlags
}

/**
 * MANIAC tree node for entropy coding
 */
export interface ManiacNode {
	property: number
	splitValue: number
	left?: ManiacNode
	right?: ManiacNode
	leafValue?: number
}

/**
 * FLIF transformation types
 */
export const TransformType = {
	ChannelCompact: 0,
	YCoCg: 1,
	PermutePlanes: 2,
	Bounds: 3,
	PaletteAlpha: 4,
	Palette: 5,
	ColorBuckets: 6,
	DuplicateFrame: 7,
	FrameShape: 8,
	FrameLookback: 9,
} as const

export type TransformType = (typeof TransformType)[keyof typeof TransformType]
