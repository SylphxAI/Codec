/**
 * CAF (Core Audio Format) types
 * Apple's container format for audio data
 */

/** CAF file type signature: "caff" */
export const CAF_MAGIC = 0x63616666 // 'caff'

/** CAF file version */
export const CAF_VERSION = 1

/** CAF chunk types */
export const CafChunkType = {
	/** Audio description chunk (required) */
	AUDIO_DESC: 0x64657363, // 'desc'
	/** Audio data chunk (required) */
	AUDIO_DATA: 0x64617461, // 'data'
	/** Channel layout */
	CHANNEL_LAYOUT: 0x6368616e, // 'chan'
	/** Packet table */
	PACKET_TABLE: 0x70616b74, // 'pakt'
	/** Magic cookie (codec-specific data) */
	MAGIC_COOKIE: 0x6b756b69, // 'kuki'
	/** Information strings */
	INFORMATION: 0x696e666f, // 'info'
	/** Edit comments */
	EDIT_COMMENTS: 0x65646374, // 'edct'
	/** Marker chunk */
	MARKER: 0x6d61726b, // 'mark'
	/** MIDI chunk */
	MIDI: 0x6d696469, // 'midi'
	/** Overview chunk */
	OVERVIEW: 0x6f767677, // 'ovvw'
	/** Peak chunk */
	PEAK: 0x7065616b, // 'peak'
	/** User-defined name */
	USER_NAME: 0x6e616d65, // 'name'
	/** User-defined data */
	USER_DATA: 0x75736572, // 'user'
	/** Free space */
	FREE: 0x66726565, // 'free'
} as const

export type CafChunkTypeCode = (typeof CafChunkType)[keyof typeof CafChunkType]

/** CAF audio format IDs */
export const CafFormatId = {
	/** Linear PCM */
	LINEAR_PCM: 0x6c70636d, // 'lpcm'
	/** Apple IMA ADPCM */
	APPLE_IMA4: 0x696d6134, // 'ima4'
	/** MPEG-4 AAC */
	MPEG4_AAC: 0x61616320, // 'aac '
	/** MACE 3:1 */
	MACE3: 0x4d414333, // 'MAC3'
	/** MACE 6:1 */
	MACE6: 0x4d414336, // 'MAC6'
	/** µ-law 2:1 */
	ULAW: 0x756c6177, // 'ulaw'
	/** A-law 2:1 */
	ALAW: 0x616c6177, // 'alaw'
	/** MPEG Layer 3 */
	MP3: 0x2e6d7033, // '.mp3'
	/** Apple Lossless */
	APPLE_LOSSLESS: 0x616c6163, // 'alac'
} as const

export type CafFormatIdCode = (typeof CafFormatId)[keyof typeof CafFormatId]

/** CAF format flags for Linear PCM */
export const CafFormatFlag = {
	/** Floating point samples */
	FLOAT: 1 << 0,
	/** Little endian byte order */
	LITTLE_ENDIAN: 1 << 1,
} as const

/** Audio description chunk */
export interface CafAudioDescription {
	/** Sample rate in Hz */
	mSampleRate: number
	/** Format ID */
	mFormatID: CafFormatIdCode
	/** Format-specific flags */
	mFormatFlags: number
	/** Bytes per packet */
	mBytesPerPacket: number
	/** Frames per packet */
	mFramesPerPacket: number
	/** Number of channels */
	mChannelsPerFrame: number
	/** Bits per channel */
	mBitsPerChannel: number
}

/** CAF chunk header */
export interface CafChunkHeader {
	/** Chunk type */
	type: CafChunkTypeCode
	/** Chunk size in bytes */
	size: number
	/** Offset to chunk data */
	offset: number
}

/** CAF file header */
export interface CafHeader {
	/** File version */
	version: number
	/** File flags */
	flags: number
	/** Audio description */
	audioDesc: CafAudioDescription
	/** Audio data chunk info */
	audioDataOffset: number
	/** Audio data size in bytes (-1 = unknown) */
	audioDataSize: number
	/** All chunk headers */
	chunks: CafChunkHeader[]
}

/** CAF audio info (metadata without decoding) */
export interface CafInfo {
	/** Number of channels */
	numChannels: number
	/** Sample rate in Hz */
	sampleRate: number
	/** Bits per channel */
	bitsPerChannel: number
	/** Format ID */
	format: CafFormatIdCode
	/** Format flags */
	formatFlags: number
	/** Duration in seconds */
	duration: number
	/** Total sample count per channel */
	sampleCount: number
	/** Is floating point */
	isFloat: boolean
	/** Is little endian */
	isLittleEndian: boolean
}

/** Decoded CAF audio */
export interface CafAudio {
	/** Audio info */
	info: CafInfo
	/** Audio samples as Float32Array (normalized -1 to 1) */
	samples: Float32Array[]
}

/** CAF encode options */
export interface CafEncodeOptions {
	/** Sample rate (default: 44100) */
	sampleRate?: number
	/** Bits per channel: 8, 16, 24, or 32 (default: 16) */
	bitsPerChannel?: 8 | 16 | 24 | 32
	/** Use floating point format for 32-bit (default: false) */
	floatingPoint?: boolean
	/** Use little endian byte order (default: false, CAF typically uses big endian) */
	littleEndian?: boolean
}
