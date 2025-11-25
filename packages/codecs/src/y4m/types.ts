/**
 * Y4M (YUV4MPEG2) video format types
 * Simple uncompressed video container format
 */

/** Y4M color spaces */
export const Y4mColorSpace = {
	/** 4:2:0 planar (default) */
	C420: 'C420',
	/** 4:2:0 JPEG-style */
	C420JPEG: 'C420jpeg',
	/** 4:2:0 MPEG-2 style */
	C420MPEG2: 'C420mpeg2',
	/** 4:2:0 PALDV style */
	C420PALDV: 'C420paldv',
	/** 4:2:2 planar */
	C422: 'C422',
	/** 4:4:4 planar */
	C444: 'C444',
	/** Monochrome */
	CMONO: 'Cmono',
} as const

export type Y4mColorSpaceType = (typeof Y4mColorSpace)[keyof typeof Y4mColorSpace]

/** Y4M interlacing modes */
export const Y4mInterlace = {
	/** Progressive (non-interlaced) */
	PROGRESSIVE: 'p',
	/** Top field first */
	TOP_FIRST: 't',
	/** Bottom field first */
	BOTTOM_FIRST: 'b',
	/** Mixed (varies per frame) */
	MIXED: 'm',
} as const

export type Y4mInterlaceType = (typeof Y4mInterlace)[keyof typeof Y4mInterlace]

/** Y4M stream header */
export interface Y4mHeader {
	/** Frame width in pixels */
	width: number
	/** Frame height in pixels */
	height: number
	/** Frame rate numerator */
	frameRateNum: number
	/** Frame rate denominator */
	frameRateDen: number
	/** Interlacing mode */
	interlace: Y4mInterlaceType
	/** Pixel aspect ratio numerator */
	aspectNum: number
	/** Pixel aspect ratio denominator */
	aspectDen: number
	/** Color space */
	colorSpace: Y4mColorSpaceType
}

/** Y4M stream info */
export interface Y4mInfo {
	/** Frame width */
	width: number
	/** Frame height */
	height: number
	/** Frame rate (frames per second) */
	frameRate: number
	/** Number of frames */
	frameCount: number
	/** Total duration in seconds */
	duration: number
	/** Color space */
	colorSpace: Y4mColorSpaceType
	/** Is interlaced */
	isInterlaced: boolean
}

/** Y4M frame */
export interface Y4mFrame {
	/** Y (luma) plane */
	y: Uint8Array
	/** U (Cb) plane (may be empty for mono) */
	u: Uint8Array
	/** V (Cr) plane (may be empty for mono) */
	v: Uint8Array
}

/** Y4M video data */
export interface Y4mVideo {
	/** Stream header */
	header: Y4mHeader
	/** Video frames */
	frames: Y4mFrame[]
}

/** Y4M encode options */
export interface Y4mEncodeOptions {
	/** Frame rate (default: 30) */
	frameRate?: number | [number, number]
	/** Color space (default: C420) */
	colorSpace?: Y4mColorSpaceType
	/** Interlacing mode (default: progressive) */
	interlace?: Y4mInterlaceType
	/** Pixel aspect ratio (default: 1:1) */
	aspectRatio?: [number, number]
}

// Y4M magic
export const Y4M_MAGIC = 'YUV4MPEG2'
export const Y4M_FRAME_MAGIC = 'FRAME'
