/**
 * AVI (Audio Video Interleave) container format types
 * RIFF-based container for video and audio streams
 */

/** AVI stream types */
export const AviStreamType = {
	/** Video stream */
	VIDEO: 'vids',
	/** Audio stream */
	AUDIO: 'auds',
	/** MIDI stream */
	MIDI: 'mids',
	/** Text stream */
	TEXT: 'txts',
} as const

export type AviStreamTypeValue = (typeof AviStreamType)[keyof typeof AviStreamType]

/** AVI video codecs (FourCC) */
export const AviVideoCodec = {
	/** Uncompressed RGB */
	RAW: 0x00000000,
	/** Motion JPEG */
	MJPG: 0x47504a4d, // 'MJPG' (little-endian)
	/** DIB (Device Independent Bitmap) */
	DIB: 0x20424944, // 'DIB '
} as const

export type AviVideoCodecValue = (typeof AviVideoCodec)[keyof typeof AviVideoCodec]

/** AVI audio formats */
export const AviAudioFormat = {
	/** PCM */
	PCM: 0x0001,
	/** MS ADPCM */
	ADPCM: 0x0002,
	/** IEEE Float */
	IEEE_FLOAT: 0x0003,
	/** μ-law */
	MULAW: 0x0007,
	/** A-law */
	ALAW: 0x0006,
	/** MP3 */
	MP3: 0x0055,
} as const

export type AviAudioFormatValue = (typeof AviAudioFormat)[keyof typeof AviAudioFormat]

/** AVI main header (avih) */
export interface AviMainHeader {
	/** Microseconds per frame */
	microSecPerFrame: number
	/** Maximum bytes per second */
	maxBytesPerSec: number
	/** Padding granularity */
	paddingGranularity: number
	/** Flags */
	flags: number
	/** Total frames */
	totalFrames: number
	/** Initial frames (for interleaved) */
	initialFrames: number
	/** Number of streams */
	streams: number
	/** Suggested buffer size */
	suggestedBufferSize: number
	/** Width */
	width: number
	/** Height */
	height: number
}

/** AVI stream header (strh) */
export interface AviStreamHeader {
	/** Stream type (vids, auds, etc.) */
	type: string
	/** Handler (codec FourCC) */
	handler: number
	/** Flags */
	flags: number
	/** Priority */
	priority: number
	/** Language */
	language: number
	/** Initial frames */
	initialFrames: number
	/** Scale (for rate calculation) */
	scale: number
	/** Rate (frames per scale) */
	rate: number
	/** Start time */
	start: number
	/** Length (total frames/samples) */
	length: number
	/** Suggested buffer size */
	suggestedBufferSize: number
	/** Quality */
	quality: number
	/** Sample size */
	sampleSize: number
	/** Frame rect */
	frame: { left: number; top: number; right: number; bottom: number }
}

/** Video stream format (BITMAPINFOHEADER) */
export interface AviBitmapInfo {
	/** Structure size */
	size: number
	/** Width */
	width: number
	/** Height (positive = bottom-up, negative = top-down) */
	height: number
	/** Planes (always 1) */
	planes: number
	/** Bits per pixel */
	bitCount: number
	/** Compression (codec FourCC or 0 for uncompressed) */
	compression: number
	/** Image size in bytes */
	sizeImage: number
	/** X pixels per meter */
	xPelsPerMeter: number
	/** Y pixels per meter */
	yPelsPerMeter: number
	/** Colors used */
	clrUsed: number
	/** Important colors */
	clrImportant: number
}

/** Audio stream format (WAVEFORMATEX) */
export interface AviWaveFormat {
	/** Format tag */
	formatTag: number
	/** Number of channels */
	channels: number
	/** Samples per second */
	samplesPerSec: number
	/** Average bytes per second */
	avgBytesPerSec: number
	/** Block align */
	blockAlign: number
	/** Bits per sample */
	bitsPerSample: number
}

/** AVI stream info */
export interface AviStream {
	/** Stream header */
	header: AviStreamHeader
	/** Stream format (video or audio) */
	format: AviBitmapInfo | AviWaveFormat
	/** Is video stream */
	isVideo: boolean
	/** Raw chunks data offsets */
	chunks: Array<{ offset: number; size: number }>
}

/** AVI file info */
export interface AviInfo {
	/** Main header */
	mainHeader: AviMainHeader
	/** Streams */
	streams: AviStream[]
	/** Width (from video stream) */
	width: number
	/** Height (from video stream) */
	height: number
	/** Frame rate */
	frameRate: number
	/** Total frames */
	totalFrames: number
	/** Duration in seconds */
	duration: number
	/** Has audio */
	hasAudio: boolean
	/** Audio sample rate */
	audioSampleRate?: number
	/** Audio channels */
	audioChannels?: number
}

/** AVI video data */
export interface AviVideo {
	/** File info */
	info: AviInfo
	/** Video frame data (raw compressed chunks) */
	videoFrames: Uint8Array[]
	/** Audio data (raw) */
	audioData?: Uint8Array
}

/** AVI encode options */
export interface AviEncodeOptions {
	/** Frame rate (default: 30) */
	frameRate?: number
	/** Video codec (default: MJPG) */
	videoCodec?: AviVideoCodecValue | 'MJPG' | 'RAW'
	/** JPEG quality for MJPEG (default: 85) */
	jpegQuality?: number
}

// RIFF chunk IDs (little-endian)
export const RIFF_MAGIC = 0x46464952 // 'RIFF'
export const AVI_MAGIC = 0x20495641 // 'AVI '
export const LIST_MAGIC = 0x5453494c // 'LIST'
export const HDRL_MAGIC = 0x6c726468 // 'hdrl'
export const MOVI_MAGIC = 0x69766f6d // 'movi'
export const AVIH_MAGIC = 0x68697661 // 'avih'
export const STRL_MAGIC = 0x6c727473 // 'strl'
export const STRH_MAGIC = 0x68727473 // 'strh'
export const STRF_MAGIC = 0x66727473 // 'strf'
export const IDX1_MAGIC = 0x31786469 // 'idx1'
