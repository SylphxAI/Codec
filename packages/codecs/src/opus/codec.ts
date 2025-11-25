/**
 * OPUS codec class implementation
 * Integrates decoder and encoder
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeOpus, isOpus, parseOpusInfo } from './decoder'
import { encodeOpus } from './encoder'
import type { OpusDecodeResult, OpusEncodeOptions, OpusInfo } from './types'
import { OPUS_SAMPLE_RATES } from './types'

/**
 * OPUS Codec class
 */
export class OpusCodec {
	/**
	 * Detect if data is OPUS
	 */
	static detect(data: Uint8Array): boolean {
		return isOpus(data)
	}

	/**
	 * Parse OPUS metadata
	 */
	static parse(data: Uint8Array): OpusInfo {
		return parseOpusInfo(data)
	}

	/**
	 * Decode OPUS to raw audio
	 */
	static decode(data: Uint8Array): OpusDecodeResult {
		return decodeOpus(data)
	}

	/**
	 * Encode raw audio to OPUS
	 */
	static encode(audio: AudioData, options?: OpusEncodeOptions): Uint8Array {
		return encodeOpus(audio, options)
	}

	/**
	 * Get supported sample rates
	 */
	static getSupportedSampleRates(): readonly number[] {
		return OPUS_SAMPLE_RATES
	}

	/**
	 * Get supported channel configurations
	 */
	static getSupportedChannels(): number[] {
		return [1, 2] // Mono and stereo
	}

	/**
	 * Validate sample rate
	 */
	static isValidSampleRate(sampleRate: number): boolean {
		return OPUS_SAMPLE_RATES.includes(sampleRate as any)
	}

	/**
	 * Validate channel count
	 */
	static isValidChannelCount(channels: number): boolean {
		return channels === 1 || channels === 2
	}

	/**
	 * Get recommended bitrates for different use cases
	 */
	static getRecommendedBitrates(): Record<string, number> {
		return {
			voip: 24000, // Voice over IP
			voiceRecording: 32000, // Voice recording
			musicStreaming: 128000, // Music streaming
			musicArchive: 192000, // Music archival
			transparent: 256000, // Near-transparent quality
		}
	}

	/**
	 * Get frame duration options (in milliseconds)
	 */
	static getFrameDurations(): number[] {
		return [2.5, 5, 10, 20, 40, 60]
	}

	/**
	 * Calculate approximate file size
	 */
	static estimateFileSize(
		durationSeconds: number,
		bitrate: number = 128000,
		includeContainer: boolean = true
	): number {
		// Audio data size
		const audioSize = (durationSeconds * bitrate) / 8

		// Add container overhead (Ogg pages, headers, etc.)
		const overhead = includeContainer ? 5000 + durationSeconds * 100 : 0

		return Math.ceil(audioSize + overhead)
	}

	/**
	 * Get codec information
	 */
	static getInfo(): {
		name: string
		fullName: string
		description: string
		mimeType: string
		extensions: string[]
		container: string
		features: string[]
	} {
		return {
			name: 'OPUS',
			fullName: 'Opus Interactive Audio Codec',
			description:
				'High-quality lossy audio codec using SILK + CELT hybrid, optimized for interactive applications',
			mimeType: 'audio/opus',
			extensions: ['.opus'],
			container: 'Ogg',
			features: [
				'Low latency (2.5-60ms frames)',
				'Wide range of bitrates (6-510 kbps)',
				'Multiple bandwidths (NB to FB)',
				'Excellent quality at low bitrates',
				'Seamless bitrate switching',
				'Robust packet loss concealment',
				'Voice and music optimization',
				'Mono and stereo support',
			],
		}
	}
}

/**
 * Convenience exports
 */
export { decodeOpus, encodeOpus, isOpus, parseOpusInfo }
