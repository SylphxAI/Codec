/**
 * ILBM (InterLeaved BitMap) image format types
 * Part of the IFF (Interchange File Format) container
 * Classic Amiga image format
 */

/** ILBM compression types */
export const IlbmCompression = {
	/** No compression */
	NONE: 0,
	/** ByteRun1 RLE compression */
	BYTERUN1: 1,
} as const

export type IlbmCompressionType = (typeof IlbmCompression)[keyof typeof IlbmCompression]

/** ILBM masking types */
export const IlbmMasking = {
	/** No mask */
	NONE: 0,
	/** Has mask plane */
	HAS_MASK: 1,
	/** Has transparent color */
	HAS_TRANSPARENT_COLOR: 2,
	/** Lasso mask */
	LASSO: 3,
} as const

export type IlbmMaskingType = (typeof IlbmMasking)[keyof typeof IlbmMasking]

/** ILBM bitmap header (BMHD chunk) */
export interface IlbmHeader {
	/** Image width in pixels */
	width: number
	/** Image height in pixels */
	height: number
	/** X position (for sprites) */
	xOrigin: number
	/** Y position (for sprites) */
	yOrigin: number
	/** Number of bitplanes (1-8, or 24 for true color) */
	numPlanes: number
	/** Masking type */
	masking: IlbmMaskingType
	/** Compression type */
	compression: IlbmCompressionType
	/** Transparent color index */
	transparentColor: number
	/** X aspect ratio */
	xAspect: number
	/** Y aspect ratio */
	yAspect: number
	/** Page width */
	pageWidth: number
	/** Page height */
	pageHeight: number
}

/** ILBM image info */
export interface IlbmInfo {
	/** Image width */
	width: number
	/** Image height */
	height: number
	/** Number of colors (2^numPlanes) */
	numColors: number
	/** Number of bitplanes */
	numPlanes: number
	/** Is HAM (Hold And Modify) mode */
	isHAM: boolean
	/** Is EHB (Extra Half-Brite) mode */
	isEHB: boolean
	/** Has transparency */
	hasTransparency: boolean
	/** Compression type */
	compression: IlbmCompressionType
}

/** IFF chunk */
export interface IffChunk {
	/** Chunk type (4 characters as number) */
	type: number
	/** Chunk data */
	data: Uint8Array
}

/** ILBM encode options */
export interface IlbmEncodeOptions {
	/** Use compression (default: true) */
	compress?: boolean
	/** Number of bitplanes (default: auto-detect) */
	numPlanes?: number
}

// IFF/ILBM magic numbers (big-endian)
export const FORM_MAGIC = 0x464f524d // 'FORM'
export const ILBM_MAGIC = 0x494c424d // 'ILBM'
export const PBM_MAGIC = 0x50424d20 // 'PBM '
export const BMHD_MAGIC = 0x424d4844 // 'BMHD'
export const CMAP_MAGIC = 0x434d4150 // 'CMAP'
export const BODY_MAGIC = 0x424f4459 // 'BODY'
export const CAMG_MAGIC = 0x43414d47 // 'CAMG'

// Amiga display modes
export const CAMG_HAM = 0x0800 // Hold And Modify
export const CAMG_EHB = 0x0080 // Extra Half-Brite
export const CAMG_HIRES = 0x8000 // High resolution
export const CAMG_LACE = 0x0004 // Interlaced
