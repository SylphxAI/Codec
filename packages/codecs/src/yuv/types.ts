/**
 * Raw YUV video format types
 * Uncompressed video frames in YUV color space
 */

import type { ImageData } from '@mconv/core'

/** YUV pixel format */
export const YuvFormat = {
	/** Planar YUV 4:2:0 (I420) - Y plane, U plane, V plane */
	I420: 'I420',
	/** Planar YUV 4:2:0 (YV12) - Y plane, V plane, U plane */
	YV12: 'YV12',
	/** Planar YUV 4:2:0 with alpha (NV12) - Y plane, interleaved UV */
	NV12: 'NV12',
	/** Planar YUV 4:2:0 (NV21) - Y plane, interleaved VU */
	NV21: 'NV21',
	/** Packed YUV 4:2:2 (YUYV) - Y0 U Y1 V */
	YUYV: 'YUYV',
	/** Packed YUV 4:2:2 (UYVY) - U Y0 V Y1 */
	UYVY: 'UYVY',
	/** Planar YUV 4:4:4 - full chroma resolution */
	YUV444: 'YUV444',
} as const

export type YuvFormatType = (typeof YuvFormat)[keyof typeof YuvFormat]

/** YUV frame metadata */
export interface YuvInfo {
	/** Frame width in pixels */
	width: number
	/** Frame height in pixels */
	height: number
	/** YUV pixel format */
	format: YuvFormatType
	/** Frame count (for multi-frame files) */
	frameCount: number
	/** Bytes per frame */
	frameSize: number
}

/** YUV video stream */
export interface YuvStream {
	/** Stream info */
	info: YuvInfo
	/** Frame data */
	frames: YuvFrame[]
}

/** Single YUV frame */
export interface YuvFrame {
	/** Frame index */
	index: number
	/** Raw YUV data */
	data: Uint8Array
	/** Converted RGBA image (lazy) */
	image?: ImageData
}

/** YUV encode options */
export interface YuvEncodeOptions {
	/** YUV format (default: I420) */
	format?: YuvFormatType
}

/** YUV decode options */
export interface YuvDecodeOptions {
	/** Frame width (required for raw YUV) */
	width: number
	/** Frame height (required for raw YUV) */
	height: number
	/** YUV format (default: I420) */
	format?: YuvFormatType
}
