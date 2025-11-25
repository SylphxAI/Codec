/**
 * AVIF format types and constants
 */

/**
 * ISOBMFF/HEIF box types (4CC as big-endian u32)
 */
export const BoxType = {
	FTYP: 0x66747970, // 'ftyp'
	META: 0x6d657461, // 'meta'
	HDLR: 0x68646c72, // 'hdlr'
	PITM: 0x7069746d, // 'pitm' - primary item
	ILOC: 0x696c6f63, // 'iloc' - item location
	IINF: 0x69696e66, // 'iinf' - item info
	IPRP: 0x69707270, // 'iprp' - item properties
	IPCO: 0x6970636f, // 'ipco' - item property container
	ISPE: 0x69737065, // 'ispe' - image spatial extents
	PIXI: 0x70697869, // 'pixi' - pixel information
	AV1C: 0x61763143, // 'av1C' - AV1 config
	COLR: 0x636f6c72, // 'colr' - color info
	MDAT: 0x6d646174, // 'mdat' - media data
} as const

/**
 * AVIF brand identifiers
 */
export const AVIF_BRANDS = {
	AVIF: 0x61766966, // 'avif' - standard AVIF
	AVIS: 0x61766973, // 'avis' - AVIF image sequence
	MA1B: 0x6d613162, // 'ma1b' - AVIF profile
	MA1A: 0x6d613161, // 'ma1a' - AVIF profile
} as const

/**
 * AV1 configuration
 */
export interface AV1Config {
	seqProfile: number // 0-2: Main, High, Professional
	seqLevelIdx: number // 0-31: level
	seqTier: number // 0: Main tier, 1: High tier
	highBitdepth: boolean
	twelveBit: boolean
	monochrome: boolean
	chromaSubsamplingX: number
	chromaSubsamplingY: number
	chromaSamplePosition: number
	initialPresentationDelayPresent: boolean
	initialPresentationDelayMinusOne: number
}

/**
 * AVIF image metadata
 */
export interface AVIFMetadata {
	width: number
	height: number
	bitDepth: number
	numChannels: number
	config: AV1Config
	primaryItemId?: number
}

/**
 * ISOBMFF box structure
 */
export interface Box {
	type: number
	size: number
	data: Uint8Array
	offset: number
	children?: Box[]
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
		extentOffset: number
		extentLength: number
	}>
}

/**
 * Item information entry
 */
export interface ItemInfo {
	itemId: number
	itemType: number
	itemName: string
	contentType?: string
}
