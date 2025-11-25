/**
 * PVR (PowerVR) texture format types
 * Supports PVR v3 format used in mobile games
 */

// PVR3 magic number (little-endian)
export const PVR3_MAGIC = 0x03525650 // 'PVR\x03'

// Pixel formats
export const PVR_PIXEL_FORMAT = {
	PVRTC_2BPP_RGB: 0n,
	PVRTC_2BPP_RGBA: 1n,
	PVRTC_4BPP_RGB: 2n,
	PVRTC_4BPP_RGBA: 3n,
	PVRTC2_2BPP: 4n,
	PVRTC2_4BPP: 5n,
	ETC1: 6n,
	DXT1: 7n,
	DXT2: 8n,
	DXT3: 9n,
	DXT4: 10n,
	DXT5: 11n,
	BC4: 12n,
	BC5: 13n,
	BC6: 14n,
	BC7: 15n,
	UYVY: 16n,
	YUY2: 17n,
	BW1BPP: 18n,
	R9G9B9E5: 19n,
	RGBG8888: 20n,
	GRGB8888: 21n,
	ETC2_RGB: 22n,
	ETC2_RGBA: 23n,
	ETC2_RGB_A1: 24n,
	EAC_R11: 25n,
	EAC_RG11: 26n,
	ASTC_4X4: 27n,
	// Uncompressed formats use high bits to describe channel layout
} as const

// Color space
export const PVR_COLOR_SPACE = {
	LINEAR: 0,
	SRGB: 1,
} as const

// Channel types
export const PVR_CHANNEL_TYPE = {
	UNSIGNED_BYTE_NORMALIZED: 0,
	SIGNED_BYTE_NORMALIZED: 1,
	UNSIGNED_BYTE: 2,
	SIGNED_BYTE: 3,
	UNSIGNED_SHORT_NORMALIZED: 4,
	SIGNED_SHORT_NORMALIZED: 5,
	UNSIGNED_SHORT: 6,
	SIGNED_SHORT: 7,
	UNSIGNED_INT_NORMALIZED: 8,
	SIGNED_INT_NORMALIZED: 9,
	UNSIGNED_INT: 10,
	SIGNED_INT: 11,
	FLOAT: 12,
} as const

export type PVREncodeOptions = Record<string, never>
