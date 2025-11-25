/**
 * MNG (Multiple-image Network Graphics) format types
 * Animation format related to PNG
 */

import type { ImageData } from '@sylphx/codec-core'

/** MNG file header (MHDR chunk) */
export interface MngHeader {
	/** Frame width in pixels */
	width: number
	/** Frame height in pixels */
	height: number
	/** Ticks per second (for timing) */
	ticksPerSecond: number
	/** Nominal layer count */
	layerCount: number
	/** Nominal frame count */
	frameCount: number
	/** Nominal play time in ticks */
	playTime: number
	/** Simplicity profile flags */
	simplicity: number
}

/** MNG frame info */
export interface MngFrame {
	/** Frame index */
	index: number
	/** Timestamp in milliseconds */
	timestamp: number
	/** Frame duration in milliseconds */
	duration: number
	/** Frame image data */
	image: ImageData
}

/** MNG animation info */
export interface MngInfo {
	/** Frame width */
	width: number
	/** Frame height */
	height: number
	/** Number of frames */
	frameCount: number
	/** Total duration in milliseconds */
	duration: number
	/** Default frame delay in milliseconds */
	defaultDelay: number
	/** Is MNG-LC (Low Complexity) profile */
	isLC: boolean
}

/** Decoded MNG animation */
export interface MngAnimation {
	/** Animation info */
	info: MngInfo
	/** Animation frames */
	frames: MngFrame[]
}

/** MNG encode options */
export interface MngEncodeOptions {
	/** Frame delay in milliseconds (default: 100) */
	delay?: number
	/** Loop count (0 = infinite, default: 0) */
	loops?: number
}

/** MNG chunk */
export interface MngChunk {
	/** Chunk type as 4-byte integer */
	type: number
	/** Chunk data */
	data: Uint8Array
}

// MNG signature
export const MNG_SIGNATURE = new Uint8Array([0x8a, 0x4d, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// PNG signature (for embedded images)
export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// MNG chunk types (as 32-bit integers)
export const MngChunkType = {
	/** MNG header */
	MHDR: 0x4d484452,
	/** MNG end */
	MEND: 0x4d454e44,
	/** Frame control */
	FRAM: 0x4652414d,
	/** Loop */
	LOOP: 0x4c4f4f50,
	/** End loop */
	ENDL: 0x454e444c,
	/** Termination action */
	TERM: 0x5445524d,
	/** Default image */
	DEFI: 0x44454649,
	/** Background */
	BACK: 0x4241434b,

	// PNG chunks that can appear in MNG
	/** PNG image header */
	IHDR: 0x49484452,
	/** PNG image data */
	IDAT: 0x49444154,
	/** PNG image end */
	IEND: 0x49454e44,
	/** PNG palette */
	PLTE: 0x504c5445,
} as const

// Simplicity profile flags
export const MngSimplicity = {
	/** Simple MNG features only */
	SIMPLE: 0x00000001,
	/** Complex MNG features */
	COMPLEX: 0x00000002,
	/** Transparency */
	TRANSPARENCY: 0x00000004,
	/** JNG images */
	JNG: 0x00000008,
	/** Delta-PNG */
	DELTA_PNG: 0x00000010,
} as const
