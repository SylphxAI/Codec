/**
 * Speex audio codec types
 * Speech codec optimized for VoIP and file-based compression
 * Typically encapsulated in Ogg container
 */

import type { AudioData } from '@sylphx/codec-core'

/**
 * Speex magic signature in Ogg: "Speex   " (3 spaces for padding to 8 bytes)
 */
export const SPEEX_MAGIC = 'Speex   '

/**
 * Speex comment magic: "Speex Comments"
 */
export const SPEEX_COMMENT_MAGIC = 'Speex Comments'

/**
 * Supported Speex sample rates (Hz)
 * Speex supports narrowband, wideband, and ultra-wideband
 */
export const SPEEX_SAMPLE_RATES = [8000, 16000, 32000] as const

/**
 * Speex modes based on sample rate
 */
export const SpeexMode = {
	NARROWBAND: 0, // 8 kHz
	WIDEBAND: 1, // 16 kHz
	ULTRA_WIDEBAND: 2, // 32 kHz
} as const

/**
 * Speex quality settings (0-10)
 * Higher values produce better quality but larger files
 */
export const SPEEX_QUALITY_RANGE = { MIN: 0, MAX: 10, DEFAULT: 8 } as const

/**
 * Speex frame sizes per mode (in samples)
 */
export const SPEEX_FRAME_SIZES = {
	[SpeexMode.NARROWBAND]: 160, // 20ms at 8kHz
	[SpeexMode.WIDEBAND]: 320, // 20ms at 16kHz
	[SpeexMode.ULTRA_WIDEBAND]: 640, // 20ms at 32kHz
} as const

/**
 * Speex identification header (80 bytes minimum)
 * First packet in Ogg Speex stream
 */
export interface SpeexHeader {
	/** Magic signature: "Speex   " */
	magic: string
	/** Speex version string */
	version: string
	/** Speex version ID */
	versionId: number
	/** Header size in bytes */
	headerSize: number
	/** Sampling rate in Hz */
	sampleRate: number
	/** Mode (0=NB, 1=WB, 2=UWB) */
	mode: number
	/** Mode bitstream version */
	modeBitstreamVersion: number
	/** Number of channels (typically 1 for speech) */
	channels: number
	/** Bit rate (-1 if not specified) */
	bitrate: number
	/** Frame size in samples */
	frameSize: number
	/** Variable bit rate enabled */
	vbr: boolean
	/** Number of frames per packet */
	framesPerPacket: number
	/** Extra headers (if headerSize > 80) */
	extraHeaders?: number
	/** Reserved bytes */
	reserved?: number
}

/**
 * Speex comment header
 * Second packet in Ogg Speex stream
 */
export interface SpeexComment {
	/** Magic signature: "Speex Comments" */
	magic?: string
	/** Vendor string */
	vendor: string
	/** User comments (key=value pairs) */
	comments: Record<string, string>
}

/**
 * Speex stream information
 */
export interface SpeexInfo {
	/** Number of channels (typically 1) */
	channels: number
	/** Sample rate (Hz) - 8000, 16000, or 32000 */
	sampleRate: number
	/** Mode: narrowband, wideband, or ultra-wideband */
	mode: number
	/** Frame size in samples */
	frameSize: number
	/** Variable bit rate enabled */
	vbr: boolean
	/** Bitrate in bits per second (-1 if VBR) */
	bitrate: number
	/** Frames per packet */
	framesPerPacket: number
	/** Duration in seconds */
	duration?: number
	/** Total number of PCM samples */
	totalSamples?: number
	/** Vendor string */
	vendor?: string
	/** Comment tags */
	tags?: Record<string, string>
}

/**
 * Decoded Speex result
 */
export interface SpeexDecodeResult {
	/** Stream information */
	info: SpeexInfo
	/** Decoded audio data */
	audio: AudioData
}

/**
 * Speex encode options
 */
export interface SpeexEncodeOptions {
	/** Target sample rate (default: 16000 for wideband) */
	sampleRate?: 8000 | 16000 | 32000
	/** Quality 0-10 (default: 8) */
	quality?: number
	/** Complexity 1-10 (default: 3) */
	complexity?: number
	/** Enable variable bitrate (default: true) */
	vbr?: boolean
	/** Frames per packet (default: 1) */
	framesPerPacket?: number
	/** Vendor string for comment header */
	vendor?: string
	/** Comment tags */
	tags?: Record<string, string>
}

/**
 * Speex packet information
 */
export interface SpeexPacket {
	/** Packet data */
	data: Uint8Array
	/** Mode used in this packet */
	mode: number
	/** Number of frames in packet */
	frameCount: number
	/** VBR quality (if VBR enabled) */
	vbrQuality?: number
}

/**
 * Speex encoder state (simplified)
 */
export interface SpeexEncoderState {
	sampleRate: number
	channels: number
	mode: number
	quality: number
	complexity: number
	vbr: boolean
	framesPerPacket: number
	frameSize: number
	/** Internal encoder state */
	encoderState?: unknown
	/** Preprocessor state */
	preprocessorState?: unknown
}

/**
 * Speex decoder state (simplified)
 */
export interface SpeexDecoderState {
	sampleRate: number
	channels: number
	mode: number
	frameSize: number
	framesPerPacket: number
	/** Internal decoder state */
	decoderState?: unknown
	/** Perceptual enhancement enabled */
	enhancementEnabled: boolean
	/** Previous frame data for packet loss concealment */
	prevFrame?: Float32Array
}
