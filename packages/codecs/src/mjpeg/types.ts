/**
 * MJPEG (Motion JPEG) format types
 */

import type { ImageData } from '@mconv/core'

/** MJPEG frame */
export interface MjpegFrame {
	/** Frame index (0-based) */
	index: number
	/** Frame timestamp in milliseconds */
	timestamp: number
	/** JPEG data for this frame */
	data: Uint8Array
	/** Decoded image (optional, populated on decode) */
	image?: ImageData
}

/** MJPEG stream info */
export interface MjpegInfo {
	/** Video width */
	width: number
	/** Video height */
	height: number
	/** Frame count */
	frameCount: number
	/** Frame rate (frames per second) */
	frameRate: number
	/** Duration in milliseconds */
	duration: number
}

/** MJPEG encode options */
export interface MjpegEncodeOptions {
	/** JPEG quality (1-100, default: 90) */
	quality?: number
	/** Target frame rate (default: 30) */
	frameRate?: number
}

/** MJPEG decode options */
export interface MjpegDecodeOptions {
	/** Start frame (default: 0) */
	startFrame?: number
	/** End frame (default: all) */
	endFrame?: number
	/** Decode frames to ImageData (default: false) */
	decodeFrames?: boolean
}

/** Raw MJPEG stream (frame sequence) */
export interface MjpegStream {
	info: MjpegInfo
	frames: MjpegFrame[]
}
