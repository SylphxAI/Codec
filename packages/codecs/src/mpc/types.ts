/**
 * MPC (Musepack) types
 * High quality lossy audio compression format
 */

import type { AudioData } from '@sylphx/codec-core'

/**
 * MPC magic numbers for different stream versions
 */
export const MPC_MAGIC_SV8 = 0x4d50434b // "MPCK" - Stream Version 8
export const MPC_MAGIC_SV7 = 0x4d502b // "MP+" - Stream Version 7

/**
 * MPC stream version
 */
export const MPCVersion = {
	SV7: 7, // Stream Version 7 (MP+)
	SV8: 8, // Stream Version 8 (MPCK)
} as const

export type MPCVersionType = (typeof MPCVersion)[keyof typeof MPCVersion]

/**
 * MPC packet types (SV8)
 */
export const MPCPacketType = {
	STREAM_HEADER: 'SH',
	STREAM_END: 'SE',
	AUDIO_PACKET: 'AP',
	ENCODER_INFO: 'EI',
	REPLAYGAIN: 'RG',
	SEEK_TABLE: 'ST',
	CHAPTER: 'CT',
} as const

/**
 * MPC channel mode
 */
export const MPCChannelMode = {
	MONO: 0,
	STEREO: 1,
} as const

export type MPCChannelModeType = (typeof MPCChannelMode)[keyof typeof MPCChannelMode]

/**
 * MPC profile (quality preset)
 */
export const MPCProfile = {
	TELEPHONE: 0, // ~64 kbps
	THUMB: 1, // ~96 kbps
	RADIO: 2, // ~112 kbps
	STANDARD: 3, // ~128 kbps
	XTREME: 4, // ~160 kbps
	INSANE: 5, // ~180 kbps
	BRAINDEAD: 6, // ~200 kbps
	EXPERIMENTAL: 7, // ~220+ kbps
} as const

export type MPCProfileType = (typeof MPCProfile)[keyof typeof MPCProfile]

/**
 * MPC Stream Header (SV8)
 */
export interface MPCStreamHeader {
	/** Stream version */
	version: MPCVersionType
	/** Sample rate in Hz */
	sampleRate: number
	/** Number of channels */
	channels: number
	/** Total number of samples */
	totalSamples: number
	/** Beginning silence (samples) */
	beginSilence: number
	/** Audio block frames */
	audioBlockFrames: number
	/** Encoder version */
	encoderVersion: number
}

/**
 * MPC SV7 Header
 */
export interface MPCSV7Header {
	/** Stream version */
	version: MPCVersionType
	/** Sample rate in Hz */
	sampleRate: number
	/** Number of channels */
	channels: number
	/** Total number of frames */
	frameCount: number
	/** Maximum used bands */
	maxBand: number
	/** Mid-Side stereo used */
	midSideStereo: boolean
	/** Profile/quality preset */
	profile: number
	/** Encoder version */
	encoderVersion: number
}

/**
 * MPC frame header
 */
export interface MPCFrameHeader {
	/** Frame size in bytes */
	frameSize: number
	/** Number of samples in frame */
	samplesPerFrame: number
	/** Reserved bits */
	reserved: number
}

/**
 * MPC audio frame
 */
export interface MPCFrame {
	/** Frame header */
	header: MPCFrameHeader
	/** Encoded audio data */
	data: Uint8Array
	/** Decoded PCM samples (after decoding) */
	samples?: Float32Array[]
}

/**
 * MPC encoder info
 */
export interface MPCEncoderInfo {
	/** Encoder version */
	version: number
	/** Profile/quality preset */
	profile: MPCProfileType
	/** Peak signal value */
	peakSignal: number
	/** Encoder info string */
	info: string
}

/**
 * MPC ReplayGain info
 */
export interface MPCReplayGain {
	/** Title gain in dB */
	titleGain: number
	/** Title peak */
	titlePeak: number
	/** Album gain in dB */
	albumGain: number
	/** Album peak */
	albumPeak: number
}

/**
 * MPC file info
 */
export interface MPCInfo {
	/** Stream version */
	version: MPCVersionType
	/** Sample rate in Hz */
	sampleRate: number
	/** Number of channels */
	channels: number
	/** Duration in seconds */
	duration: number
	/** Total samples */
	totalSamples: number
	/** Average bitrate in kbps */
	bitrate: number
	/** Encoder info if available */
	encoderInfo?: MPCEncoderInfo
	/** ReplayGain info if available */
	replayGain?: MPCReplayGain
}

/**
 * Decoded MPC result
 */
export interface MPCDecodeResult {
	/** File info */
	info: MPCInfo
	/** Decoded audio samples (Float32Array per channel, normalized -1 to 1) */
	samples: Float32Array[]
}

/**
 * MPC encode options
 */
export interface MPCEncodeOptions {
	/** Quality profile (default: STANDARD) */
	profile?: MPCProfileType
	/** Sample rate in Hz (default: 44100) */
	sampleRate?: number
	/** Enable mid-side stereo (default: true for stereo) */
	midSideStereo?: boolean
	/** Include ReplayGain data (default: false) */
	replayGain?: boolean
	/** Encoder version (default: 8 for SV8) */
	version?: MPCVersionType
}

/**
 * Sample rate table for MPC
 */
export const MPC_SAMPLE_RATES = [44100, 48000, 37800, 32000] as const

/**
 * Samples per frame for MPC SV8
 */
export const MPC_SAMPLES_PER_FRAME = 1152

/**
 * Frequency bands used in MPC encoding
 */
export const MPC_MAX_BANDS = 32
