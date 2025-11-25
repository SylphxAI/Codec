/**
 * WMA (Windows Media Audio) types
 * Uses ASF (Advanced Systems Format) container
 */

/**
 * ASF object GUIDs (128-bit identifiers)
 * Format: 32-16-16-16-48 bits
 */
export const ASF_GUID = {
	// Top-level objects
	HEADER: '75b22630668e11cfa6d900aa0062ce6c',
	DATA: '75b22636668e11cfa6d900aa0062ce6c',
	SIMPLE_INDEX: '33000890e5b1cf11a39f00a0c90348f6',
	INDEX: 'd329e2d6da35d111903400a0c90349be',

	// Header objects
	FILE_PROPERTIES: 'a1dcab8c47a9cf118ee400c00c205365',
	STREAM_PROPERTIES: '9107dcb7b7a9cf118ee600c00c205365',
	HEADER_EXTENSION: 'b503bf5f2ea9cf118ee300c00c205365',
	CODEC_LIST: '4052d1861d31d011a3a400a0c90348f6',
	SCRIPT_COMMAND: '301afb1e620bd011a39b00a0c90348f6',
	MARKER: '01cd87f4518ad911a38300a0c90348f6',
	BITRATE_MUTUAL_EXCLUSION: 'dc29e2d6da35d111903400a0c90349be',
	ERROR_CORRECTION: '75b22635668e11cfa6d900aa0062ce6c',
	CONTENT_DESCRIPTION: '75b22633668e11cfa6d900aa0062ce6c',
	EXTENDED_CONTENT_DESCRIPTION: 'D2D0A440E307D211978f00a0c95ea850',
	STREAM_BITRATE_PROPERTIES: 'ce75f87b8d46d1118d82006097c9a2b2',
	CONTENT_BRANDING: '2211b3fa6bbf4d73aff0fd9c3dbb0d76',
	CONTENT_ENCRYPTION: '2211b3fb6bbf4d73aff0fd9c3dbb0d76',
	EXTENDED_CONTENT_ENCRYPTION: '298ae614263e4b1a9be8ff8e2ef70d6a',
	DIGITAL_SIGNATURE: '2211b3fc6bbf4d73aff0fd9c3dbb0d76',
	PADDING: '74d40618df5494458f4f7f6abce4e38a',

	// Stream types
	AUDIO_MEDIA: 'f8699e40524fd311a9d6006097c9a2b2',
	VIDEO_MEDIA: 'c0ef19bc4d66d011a9cf006097c9a2b2',
	COMMAND_MEDIA: 'c0cfda59e65940dda38dd0e48aa50f8a',

	// Audio formats
	AUDIO_FORMAT_WMA: '61000000',
	AUDIO_FORMAT_WMA_PRO: '62000000',
	AUDIO_FORMAT_WMA_LOSSLESS: '63000000',
} as const

/**
 * WMA sync marker (part of ASF header)
 */
export const WMA_SYNC = 0x3026b2758e66cf11

/**
 * ASF file properties
 */
export interface AsfFileProperties {
	fileId: string // GUID
	fileSize: bigint
	creationDate: bigint
	dataPacketsCount: bigint
	playDuration: bigint // 100-nanosecond units
	sendDuration: bigint
	preroll: bigint // milliseconds
	flags: number
	minPacketSize: number
	maxPacketSize: number
	maxBitrate: number
}

/**
 * Audio stream properties
 */
export interface AsfAudioStreamProperties {
	streamNumber: number
	streamType: string // GUID
	errorCorrectionType: string // GUID
	timeOffset: bigint
	typeSpecificDataLength: number
	errorCorrectionDataLength: number
	flags: number
	reserved: number

	// Audio format specific (WAVEFORMATEX-like)
	formatTag: number
	channels: number
	samplesPerSec: number
	avgBytesPerSec: number
	blockAlign: number
	bitsPerSample: number
	codecDataSize: number
	codecData: Uint8Array
}

/**
 * Codec list entry
 */
export interface AsfCodecEntry {
	type: number // 1=video, 2=audio
	codecNameLength: number
	codecName: string
	codecDescriptionLength: number
	codecDescription: string
	codecInformationLength: number
	codecInformation: Uint8Array
}

/**
 * Content description
 */
export interface AsfContentDescription {
	title?: string
	author?: string
	copyright?: string
	description?: string
	rating?: string
}

/**
 * Extended content descriptor
 */
export interface AsfExtendedDescriptor {
	name: string
	valueType: number // 0=Unicode, 1=bytes, 2=bool, 3=dword, 4=qword, 5=word
	value: string | Uint8Array | boolean | number | bigint
}

/**
 * WMA file info
 */
export interface WmaInfo {
	duration: number // seconds
	sampleRate: number
	channels: number
	bitsPerSample: number
	bitrate: number
	formatTag: number
	contentDescription?: AsfContentDescription
	extendedDescriptors?: AsfExtendedDescriptor[]
}

/**
 * Decoded WMA result
 */
export interface WmaDecodeResult {
	info: WmaInfo
	samples: Float32Array[] // One array per channel
}

/**
 * WMA encode options
 */
export interface WmaEncodeOptions {
	bitrate?: number // bits per second (default: 128000)
	quality?: number // 0-100 (alternative to bitrate)
	vbr?: boolean // Variable bitrate
}

/**
 * ASF object header
 */
export interface AsfObjectHeader {
	objectId: string // GUID hex string
	objectSize: bigint
	position: number
}

/**
 * ASF data packet header
 */
export interface AsfPacketHeader {
	errorCorrectionPresent: boolean
	errorCorrectionData?: Uint8Array
	payloadParsingInformation: number
	paddingLength: number
	sendTime: number
	duration: number
}

/**
 * ASF payload
 */
export interface AsfPayload {
	streamNumber: number
	mediaObjectNumber: number
	offsetIntoMediaObject: number
	replicatedDataLength: number
	replicatedData: Uint8Array
	payloadDataLength: number
	payloadData: Uint8Array
}
