/**
 * BPG (Better Portable Graphics) format types and constants
 */

// BPG magic number (42 50 47 FB)
export const BPG_MAGIC = 0x425047fb

// BPG format constants
export const BPG_FORMAT_GRAY = 0 // Grayscale
export const BPG_FORMAT_420 = 1 // YCbCr 4:2:0
export const BPG_FORMAT_422 = 2 // YCbCr 4:2:2
export const BPG_FORMAT_444 = 3 // YCbCr 4:4:4
export const BPG_FORMAT_420_VIDEO = 4 // YCbCr 4:2:0 video range
export const BPG_FORMAT_422_VIDEO = 5 // YCbCr 4:2:2 video range

// BPG color space constants
export const BPG_CS_YCbCr = 0 // YCbCr
export const BPG_CS_RGB = 1 // RGB
export const BPG_CS_YCgCo = 2 // YCgCo
export const BPG_CS_YCbCr_BT709 = 3 // YCbCr BT.709
export const BPG_CS_YCbCr_BT2020 = 4 // YCbCr BT.2020

// BPG extension types
export const BPG_EXTENSION_TAG_EXIF = 1 // EXIF metadata
export const BPG_EXTENSION_TAG_ICC_PROFILE = 2 // ICC color profile
export const BPG_EXTENSION_TAG_XMP = 3 // XMP metadata
export const BPG_EXTENSION_TAG_THUMBNAIL = 4 // Thumbnail image
export const BPG_EXTENSION_TAG_ANIM_CONTROL = 5 // Animation control

/**
 * BPG file header structure
 */
export interface BPGHeader {
	magic: number
	formatFlags: number
	pictureWidth: number
	pictureHeight: number
	pictureDataLength: number
	extensionDataLength: number
	// Parsed flags
	format: number
	hasAlpha: boolean
	bitDepth: number
	colorSpace: number
	hasExtensions: boolean
	alphaFirst: boolean
	isPremultiplied: boolean
	hasLimitedRange: boolean
	hasAnimation: boolean
}

/**
 * BPG extension data
 */
export interface BPGExtension {
	tag: number
	length: number
	data: Uint8Array
}

/**
 * HEVC NAL unit types (relevant for BPG)
 */
export enum HevcNalUnitType {
	TRAIL_N = 0,
	TRAIL_R = 1,
	TSA_N = 2,
	TSA_R = 3,
	STSA_N = 4,
	STSA_R = 5,
	RADL_N = 6,
	RADL_R = 7,
	RASL_N = 8,
	RASL_R = 9,
	BLA_W_LP = 16,
	BLA_W_RADL = 17,
	BLA_N_LP = 18,
	IDR_W_RADL = 19,
	IDR_N_LP = 20,
	CRA_NUT = 21,
	VPS_NUT = 32, // Video Parameter Set
	SPS_NUT = 33, // Sequence Parameter Set
	PPS_NUT = 34, // Picture Parameter Set
	AUD_NUT = 35, // Access Unit Delimiter
	EOS_NUT = 36,
	EOB_NUT = 37,
	FD_NUT = 38,
	PREFIX_SEI_NUT = 39,
	SUFFIX_SEI_NUT = 40,
}

/**
 * HEVC sequence parameters
 */
export interface HevcSPS {
	width: number
	height: number
	bitDepth: number
	chromaFormat: number
}

/**
 * HEVC bitstream structure
 */
export interface HevcBitstream {
	nalUnits: Array<{
		type: HevcNalUnitType
		data: Uint8Array
	}>
	sps?: HevcSPS
}

/**
 * Parsed BPG file structure
 */
export interface BPGFile {
	header: BPGHeader
	extensions: BPGExtension[]
	pictureData: Uint8Array
}
