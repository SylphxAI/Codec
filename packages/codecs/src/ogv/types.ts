/**
 * OGV (Ogg Video) types
 * Ogg container with Theora video codec
 */

import type { VideoData } from '@sylphx/codec-core'

/**
 * OGV magic pattern: "OggS"
 */
export const OGV_MAGIC = 0x4f676753

/**
 * Page header flags
 */
export const OggPageFlag = {
	CONTINUATION: 0x01, // Continuation of previous packet
	BOS: 0x02, // Beginning of stream
	EOS: 0x04, // End of stream
} as const

/**
 * Theora packet types
 */
export const TheoraPacketType = {
	HEADER: 0x80, // Header packet
	COMMENT: 0x81, // Comment packet
	SETUP: 0x82, // Setup packet
} as const

/**
 * Theora identification header magic: "\x80theora"
 */
export const THEORA_MAGIC = 0x80746865 // First 4 bytes

/**
 * OGV page structure
 */
export interface OgvPage {
	version: number
	flags: number
	granulePosition: bigint
	serialNumber: number
	pageSequence: number
	checksum: number
	segmentCount: number
	segmentTable: number[]
	data: Uint8Array
}

/**
 * Theora header info
 */
export interface TheoraInfo {
	versionMajor: number
	versionMinor: number
	versionRevision: number
	frameWidth: number // Encoded frame width (multiple of 16)
	frameHeight: number // Encoded frame height (multiple of 16)
	pictureWidth: number // Display picture width
	pictureHeight: number // Display picture height
	pictureX: number // Picture region offset X
	pictureY: number // Picture region offset Y
	frameRateNumerator: number
	frameRateDenominator: number
	pixelAspectNumerator: number
	pixelAspectDenominator: number
	colorspace: number
	targetBitrate: number
	quality: number
	keyframeGranuleShift: number
}

/**
 * OGV stream info
 */
export interface OgvStreamInfo {
	serialNumber: number
	codecId: string
	codecName: string
	theoraInfo?: TheoraInfo
}

/**
 * OGV file info
 */
export interface OgvInfo {
	streams: OgvStreamInfo[]
	duration: number
	width: number
	height: number
	fps: number
	hasVideo: boolean
	hasAudio: boolean
}

/**
 * Decoded OGV result
 */
export interface OgvDecodeResult {
	info: OgvInfo
	pages: OgvPage[]
	videoPackets: Uint8Array[] // Theora video packets
}

/**
 * OGV encode options
 */
export interface OgvEncodeOptions {
	frameRate?: number
	quality?: number // 0-63, higher is better
	keyframeInterval?: number
	serialNumber?: number
}
