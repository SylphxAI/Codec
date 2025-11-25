/**
 * APNG-specific chunk types
 */
export const ApngChunkType = {
	acTL: 0x6163544c, // Animation Control
	fcTL: 0x6663544c, // Frame Control
	fdAT: 0x66644154, // Frame Data
	IHDR: 0x49484452, // Image Header
	IDAT: 0x49444154, // Image Data
	IEND: 0x49454e44, // Image End
	PLTE: 0x504c5445, // Palette
	tRNS: 0x74524e53, // Transparency
} as const

/**
 * APNG dispose operations
 * Controls what happens to the canvas before rendering the next frame
 */
export const DisposeOp = {
	/** Do nothing - leave canvas as is */
	None: 0,
	/** Clear frame area to transparent black */
	Background: 1,
	/** Restore canvas to state before rendering this frame */
	Previous: 2,
} as const

export type DisposeOp = (typeof DisposeOp)[keyof typeof DisposeOp]

/**
 * APNG blend operations
 * Controls how the frame is composited onto the canvas
 */
export const BlendOp = {
	/** Replace: pixels replace canvas content */
	Source: 0,
	/** Alpha blend: pixels are alpha composited over canvas */
	Over: 1,
} as const

export type BlendOp = (typeof BlendOp)[keyof typeof BlendOp]

/**
 * PNG color types (reused from PNG)
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
 * PNG signature bytes
 */
export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

/**
 * Animation Control chunk data (acTL)
 */
export interface AnimationControl {
	/** Number of frames in the animation */
	numFrames: number
	/** Number of times to loop (0 = infinite) */
	numPlays: number
}

/**
 * Frame Control chunk data (fcTL)
 */
export interface FrameControl {
	/** Sequence number (0-based) */
	sequenceNumber: number
	/** Width of the frame */
	width: number
	/** Height of the frame */
	height: number
	/** X offset from canvas origin */
	xOffset: number
	/** Y offset from canvas origin */
	yOffset: number
	/** Frame delay numerator */
	delayNum: number
	/** Frame delay denominator */
	delayDen: number
	/** Dispose operation */
	disposeOp: DisposeOp
	/** Blend operation */
	blendOp: BlendOp
}

/**
 * APNG frame with image data
 */
export interface ApngFrame {
	/** Frame control information */
	control: FrameControl
	/** Raw RGBA pixel data */
	imageData: Uint8Array
}

/**
 * APNG chunk
 */
export interface ApngChunk {
	type: number
	data: Uint8Array
}

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
