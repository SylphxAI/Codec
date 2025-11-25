/**
 * HEIC/HEIF format types and constants
 */

// HEIF/ISOBMFF Box types (4CC as big-endian)
export const FTYP = 0x66747970 // 'ftyp'
export const META = 0x6d657461 // 'meta'
export const HDLR = 0x68646c72 // 'hdlr'
export const PITM = 0x7069746d // 'pitm'
export const ILOC = 0x696c6f63 // 'iloc'
export const IINF = 0x69696e66 // 'iinf'
export const IPRP = 0x69707270 // 'iprp'
export const IPCO = 0x6970636f // 'ipco'
export const ISPE = 0x69737065 // 'ispe'
export const IROT = 0x69726f74 // 'irot'
export const IMIR = 0x696d6972 // 'imir'
export const COLR = 0x636f6c72 // 'colr'
export const PIXI = 0x70697869 // 'pixi'
export const MDAT = 0x6d646174 // 'mdat'
export const IPMA = 0x69706d61 // 'ipma'
export const INFE = 0x696e6665 // 'infe'

// Brand identifiers for HEIC/HEIF
export const BRAND_HEIC = 0x68656963 // 'heic' - HEVC image
export const BRAND_HEIX = 0x68656978 // 'heix' - HEVC image with alpha
export const BRAND_HEVC = 0x68657663 // 'hevc' - HEVC image sequence
export const BRAND_HEVX = 0x68657678 // 'hevx' - HEVC image sequence with alpha
export const BRAND_MIF1 = 0x6d696631 // 'mif1' - HEIF base
export const BRAND_MSIM = 0x6d73696d // 'msim' - Multi-image
export const BRAND_AVIF = 0x61766966 // 'avif' - AV1 image

// Item types
export const ITEM_TYPE_HVC1 = 0x68766331 // 'hvc1' - HEVC intra image
export const ITEM_TYPE_GRID = 0x67726964 // 'grid' - Image grid
export const ITEM_TYPE_EXIF = 0x45786966 // 'Exif' - EXIF metadata
export const ITEM_TYPE_MIME = 0x6d696d65 // 'mime' - MIME data

// Handler types
export const HANDLER_PICT = 0x70696374 // 'pict' - Picture handler

/**
 * HEIF file type box (ftyp)
 */
export interface FtypBox {
	majorBrand: number
	minorVersion: number
	compatibleBrands: number[]
}

/**
 * Image spatial extents property (ispe)
 */
export interface ImageSize {
	width: number
	height: number
}

/**
 * Image rotation property (irot)
 * Angle in counter-clockwise 90-degree units
 */
export type ImageRotation = 0 | 1 | 2 | 3 // 0°, 90°, 180°, 270°

/**
 * Image mirror property (imir)
 */
export type ImageMirror = 0 | 1 // 0 = vertical, 1 = horizontal

/**
 * Color information (colr)
 */
export interface ColorInfo {
	colorType: number // 'nclx' or 'rICC' or 'prof'
	colorPrimaries?: number
	transferCharacteristics?: number
	matrixCoefficients?: number
	fullRangeFlag?: boolean
}

/**
 * Pixel information (pixi)
 */
export interface PixelInfo {
	bitsPerChannel: number[]
}

/**
 * Item location entry
 */
export interface ItemLocation {
	itemId: number
	constructionMethod: number
	dataReferenceIndex: number
	baseOffset: number
	extents: Array<{
		extentIndex?: number
		extentOffset: number
		extentLength: number
	}>
}

/**
 * Item information entry
 */
export interface ItemInfo {
	itemId: number
	itemProtectionIndex: number
	itemType: number
	itemName: string
	contentType?: string
	contentEncoding?: string
}

/**
 * Item properties
 */
export interface ItemProperties {
	size?: ImageSize
	rotation?: ImageRotation
	mirror?: ImageMirror
	colorInfo?: ColorInfo
	pixelInfo?: PixelInfo
}

/**
 * HEIF image item
 */
export interface HeifItem {
	id: number
	type: number
	data: Uint8Array
	properties: ItemProperties
}

/**
 * Parsed HEIF container structure
 */
export interface HeifContainer {
	ftyp: FtypBox
	primaryItemId: number
	items: Map<number, HeifItem>
}

/**
 * HEVC NAL unit types
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
