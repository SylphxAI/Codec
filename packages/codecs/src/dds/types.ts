/**
 * DDS (DirectDraw Surface) format types and constants
 * Used for game textures, supports various compression formats
 */

// DDS Magic number
export const DDS_MAGIC = 0x20534444 // 'DDS '

// DDS Header flags
export const DDSD_CAPS = 0x1
export const DDSD_HEIGHT = 0x2
export const DDSD_WIDTH = 0x4
export const DDSD_PITCH = 0x8
export const DDSD_PIXELFORMAT = 0x1000
export const DDSD_MIPMAPCOUNT = 0x20000
export const DDSD_LINEARSIZE = 0x80000
export const DDSD_DEPTH = 0x800000

// DDS Pixel Format flags
export const DDPF_ALPHAPIXELS = 0x1
export const DDPF_ALPHA = 0x2
export const DDPF_FOURCC = 0x4
export const DDPF_RGB = 0x40
export const DDPF_LUMINANCE = 0x20000

// DDS Caps flags
export const DDSCAPS_COMPLEX = 0x8
export const DDSCAPS_MIPMAP = 0x400000
export const DDSCAPS_TEXTURE = 0x1000

// DDS Caps2 flags
export const DDSCAPS2_CUBEMAP = 0x200
export const DDSCAPS2_CUBEMAP_POSITIVEX = 0x400
export const DDSCAPS2_CUBEMAP_NEGATIVEX = 0x800
export const DDSCAPS2_CUBEMAP_POSITIVEY = 0x1000
export const DDSCAPS2_CUBEMAP_NEGATIVEY = 0x2000
export const DDSCAPS2_CUBEMAP_POSITIVEZ = 0x4000
export const DDSCAPS2_CUBEMAP_NEGATIVEZ = 0x8000
export const DDSCAPS2_VOLUME = 0x200000

// FourCC codes
export const FOURCC_DXT1 = 0x31545844 // 'DXT1'
export const FOURCC_DXT3 = 0x33545844 // 'DXT3'
export const FOURCC_DXT5 = 0x35545844 // 'DXT5'
export const FOURCC_DX10 = 0x30315844 // 'DX10'

/**
 * DDS Pixel Format structure
 */
export interface DDSPixelFormat {
	size: number
	flags: number
	fourCC: number
	rgbBitCount: number
	rBitMask: number
	gBitMask: number
	bBitMask: number
	aBitMask: number
}

/**
 * DDS Header structure (124 bytes)
 */
export interface DDSHeader {
	size: number
	flags: number
	height: number
	width: number
	pitchOrLinearSize: number
	depth: number
	mipMapCount: number
	reserved1: number[]
	pixelFormat: DDSPixelFormat
	caps: number
	caps2: number
	caps3: number
	caps4: number
	reserved2: number
}

/**
 * DDS compression format
 */
export type DDSFormat =
	| 'rgba'
	| 'rgb'
	| 'bgra'
	| 'bgr'
	| 'luminance'
	| 'luminance-alpha'
	| 'dxt1'
	| 'dxt3'
	| 'dxt5'

export interface DDSEncodeOptions {
	format?: DDSFormat
	generateMipmaps?: boolean
}
