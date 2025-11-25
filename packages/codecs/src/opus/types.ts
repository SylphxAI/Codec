/**
 * OPUS audio codec types
 * High-quality lossy audio codec using SILK + CELT hybrid
 * Typically encapsulated in Ogg container
 */

import type { AudioData } from '@sylphx/codec-core'

/**
 * OPUS magic signature in Ogg: "OpusHead"
 */
export const OPUS_HEAD_MAGIC = 'OpusHead'

/**
 * OPUS tags magic: "OpusTags"
 */
export const OPUS_TAGS_MAGIC = 'OpusTags'

/**
 * Supported OPUS sample rates (Hz)
 * OPUS internally operates at 48kHz but can handle these input rates
 */
export const OPUS_SAMPLE_RATES = [8000, 12000, 16000, 24000, 48000] as const

/**
 * OPUS channel mapping families
 */
export const OpusChannelMapping = {
	MONO_STEREO: 0, // 1-2 channels, no mapping (RTP mapping)
	VORBIS: 1, // 1-8 channels, Vorbis channel order
	AMBISONIC: 2, // Ambisonics mapping
	DISCRETE: 255, // Discrete channels (no specified order)
} as const

/**
 * OPUS application types
 */
export const OpusApplication = {
	VOIP: 2048, // Optimize for voice (lower latency)
	AUDIO: 2049, // Optimize for music/audio quality
	RESTRICTED_LOWDELAY: 2051, // Optimize for low delay
} as const

/**
 * OPUS bandwidth modes
 */
export const OpusBandwidth = {
	NARROW: 1101, // 4 kHz passband (NB)
	MEDIUM: 1102, // 6 kHz passband (MB)
	WIDE: 1103, // 8 kHz passband (WB)
	SUPER_WIDE: 1104, // 12 kHz passband (SWB)
	FULL: 1105, // 20 kHz passband (FB)
} as const

/**
 * OPUS frame sizes (in samples at 48kHz)
 */
export const OpusFrameSize = {
	SIZE_2_5_MS: 120, // 2.5ms
	SIZE_5_MS: 240, // 5ms
	SIZE_10_MS: 480, // 10ms
	SIZE_20_MS: 960, // 20ms (most common)
	SIZE_40_MS: 1920, // 40ms
	SIZE_60_MS: 2880, // 60ms
} as const

/**
 * OPUS identification header (19 bytes)
 * First packet in Ogg OPUS stream
 */
export interface OpusHead {
	/** Magic signature: "OpusHead" */
	magic: string
	/** Version (must be 1) */
	version: number
	/** Number of channels (1-255) */
	channels: number
	/** Pre-skip: Number of samples to discard from decoder output */
	preSkip: number
	/** Original input sample rate in Hz */
	inputSampleRate: number
	/** Output gain in dB (Q7.8 format) */
	outputGain: number
	/** Channel mapping family */
	mappingFamily: number
	/** Stream count (if mapping family > 0) */
	streamCount?: number
	/** Coupled stream count (if mapping family > 0) */
	coupledCount?: number
	/** Channel mapping (if mapping family > 0) */
	channelMapping?: number[]
}

/**
 * OPUS comment header (OpusTags)
 * Second packet in Ogg OPUS stream
 */
export interface OpusTags {
	/** Magic signature: "OpusTags" */
	magic: string
	/** Vendor string */
	vendor: string
	/** User comments (key=value pairs) */
	comments: Record<string, string>
}

/**
 * OPUS stream information
 */
export interface OpusInfo {
	/** Number of channels */
	channels: number
	/** Sample rate (Hz) - input rate, OPUS processes at 48kHz internally */
	sampleRate: number
	/** Pre-skip samples */
	preSkip: number
	/** Output gain (dB) */
	outputGain: number
	/** Channel mapping family */
	mappingFamily: number
	/** Duration in seconds */
	duration?: number
	/** Total number of PCM samples */
	totalSamples?: number
	/** Bitrate in bits per second */
	bitrate?: number
	/** Vendor string */
	vendor?: string
	/** Comment tags */
	tags?: Record<string, string>
}

/**
 * Decoded OPUS result
 */
export interface OpusDecodeResult {
	/** Stream information */
	info: OpusInfo
	/** Decoded audio data */
	audio: AudioData
}

/**
 * OPUS encode options
 */
export interface OpusEncodeOptions {
	/** Target bitrate in bits per second (default: 128000) */
	bitrate?: number
	/** Application type (default: AUDIO) */
	application?: number
	/** Complexity 0-10 (default: 10, highest quality) */
	complexity?: number
	/** Frame duration in ms (default: 20) */
	frameDuration?: number
	/** Enable variable bitrate (default: true) */
	vbr?: boolean
	/** Enable constrained VBR (default: false) */
	constrainedVbr?: boolean
	/** Force channels (default: use input channel count) */
	forceChannels?: 1 | 2
	/** Maximum bandwidth (default: FULL) */
	maxBandwidth?: number
	/** Signal type hint: VOICE or MUSIC (default: auto) */
	signal?: 'auto' | 'voice' | 'music'
	/** Vendor string for OpusTags */
	vendor?: string
	/** Comment tags for OpusTags */
	tags?: Record<string, string>
}

/**
 * OPUS packet information
 */
export interface OpusPacket {
	/** Packet data */
	data: Uint8Array
	/** Configuration (TOC byte) */
	config: number
	/** Stereo flag */
	stereo: boolean
	/** Number of frames in packet */
	frameCount: number
	/** Frame sizes */
	frameSizes: number[]
	/** Packet mode (SILK, CELT, or Hybrid) */
	mode: 'silk' | 'celt' | 'hybrid'
}

/**
 * OPUS encoder state (simplified)
 */
export interface OpusEncoderState {
	sampleRate: number
	channels: number
	application: number
	bitrate: number
	complexity: number
	vbr: boolean
	constrainedVbr: boolean
	maxBandwidth: number
	signal: number
	/** SILK encoder state */
	silkState?: unknown
	/** CELT encoder state */
	celtState?: unknown
	/** Frame size in samples */
	frameSize: number
	/** Pre-skip samples */
	preSkip: number
}

/**
 * OPUS decoder state (simplified)
 */
export interface OpusDecoderState {
	sampleRate: number
	channels: number
	/** Pre-skip remaining */
	preSkip: number
	/** Output gain linear scale */
	gain: number
	/** SILK decoder state */
	silkState?: unknown
	/** CELT decoder state */
	celtState?: unknown
	/** Previous packet mode */
	prevMode?: 'silk' | 'celt' | 'hybrid'
	/** Packet loss concealment state */
	plcState?: unknown
}
