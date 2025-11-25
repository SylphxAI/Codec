/**
 * FLI/FLC (FLIC) animation format types
 * Autodesk Animator format
 */

import type { ImageData } from '@sylphx/codec-core'

/** FLIC file magic numbers */
export const FLIC_MAGIC_FLI = 0xaf11 // Original FLI format
export const FLIC_MAGIC_FLC = 0xaf12 // Extended FLC format

/** FLIC chunk types */
export enum FlicChunkType {
	// Frame chunks
	COLOR_256 = 4, // 256-level color palette
	DELTA_FLC = 7, // Word-oriented delta compression
	COLOR_64 = 11, // 64-level color palette (FLI)
	DELTA_FLI = 12, // Byte-oriented delta compression (FLI)
	BLACK = 13, // Entire frame is color 0
	BYTE_RUN = 15, // Byte run-length compression
	LITERAL = 16, // Uncompressed (rare)
	PSTAMP = 18, // Postage stamp (thumbnail)

	// Main chunks
	PREFIX = 0xf100, // Prefix chunk
	FRAME = 0xf1fa, // Frame chunk
}

/** FLIC file header */
export interface FlicHeader {
	/** File size in bytes */
	size: number
	/** Magic number (0xAF11 or 0xAF12) */
	magic: number
	/** Number of frames */
	frameCount: number
	/** Width in pixels */
	width: number
	/** Height in pixels */
	height: number
	/** Bits per pixel (usually 8) */
	depth: number
	/** Flags */
	flags: number
	/** Delay between frames in milliseconds */
	delay: number
	/** Reserved */
	reserved1: number
	/** Creation date (FLC only) */
	created: number
	/** Creator program ID (FLC only) */
	creator: number
	/** Last updated date (FLC only) */
	updated: number
	/** Updater program ID (FLC only) */
	updater: number
	/** Aspect ratio X (FLC only) */
	aspectX: number
	/** Aspect ratio Y (FLC only) */
	aspectY: number
	/** First frame offset */
	frame1Offset: number
	/** Second frame offset */
	frame2Offset: number
}

/** FLIC frame */
export interface FlicFrame {
	/** Frame index */
	index: number
	/** Frame timestamp in milliseconds */
	timestamp: number
	/** Decoded image data */
	image: ImageData
}

/** FLIC animation info */
export interface FlicInfo {
	/** Is FLC format (vs FLI) */
	isFLC: boolean
	/** Width in pixels */
	width: number
	/** Height in pixels */
	height: number
	/** Number of frames */
	frameCount: number
	/** Delay between frames in ms */
	delay: number
	/** Total duration in ms */
	duration: number
}

/** FLIC animation */
export interface FlicAnimation {
	info: FlicInfo
	frames: FlicFrame[]
}

/** FLIC encode options */
export interface FlicEncodeOptions {
	/** Frame delay in milliseconds (default: 66 = ~15fps) */
	delay?: number
}
