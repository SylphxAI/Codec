/**
 * VTF (Valve Texture Format) types
 * Used in Source engine games (Half-Life 2, Portal, CS:GO, etc.)
 */

// VTF magic number "VTF\0"
export const VTF_MAGIC = 0x00465456

// Image formats
export const VTF_FORMAT = {
	RGBA8888: 0,
	ABGR8888: 1,
	RGB888: 2,
	BGR888: 3,
	RGB565: 4,
	I8: 5, // Luminance
	IA88: 6, // Luminance + Alpha
	P8: 7, // Paletted
	A8: 8,
	RGB888_BLUESCREEN: 9,
	BGR888_BLUESCREEN: 10,
	ARGB8888: 11,
	BGRA8888: 12,
	DXT1: 13,
	DXT3: 14,
	DXT5: 15,
	BGRX8888: 16,
	BGR565: 17,
	BGRX5551: 18,
	BGRA4444: 19,
	DXT1_ONEBITALPHA: 20,
	BGRA5551: 21,
	UV88: 22,
	UVWQ8888: 23,
	RGBA16161616F: 24,
	RGBA16161616: 25,
	UVLX8888: 26,
} as const

export type VTFEncodeOptions = Record<string, never>
