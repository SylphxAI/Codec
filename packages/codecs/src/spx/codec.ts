/**
 * Speex codec class implementation
 * Integrates decoder and encoder
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeSpeex, isSpeex, parseSpeexInfo } from './decoder'
import { encodeSpeex } from './encoder'
import type { SpeexDecodeResult, SpeexEncodeOptions, SpeexInfo } from './types'
import { SPEEX_QUALITY_RANGE, SPEEX_SAMPLE_RATES } from './types'

/**
 * Speex Codec class
 */
export class SpeexCodec {
	/**
	 * Detect if data is Speex
	 */
	static detect(data: Uint8Array): boolean {
		return isSpeex(data)
	}

	/**
	 * Parse Speex metadata
	 */
	static parse(data: Uint8Array): SpeexInfo {
		return parseSpeexInfo(data)
	}

	/**
	 * Decode Speex to raw audio
	 */
	static decode(data: Uint8Array): SpeexDecodeResult {
		return decodeSpeex(data)
	}

	/**
	 * Encode raw audio to Speex
	 */
	static encode(audio: AudioData, options?: SpeexEncodeOptions): Uint8Array {
		return encodeSpeex(audio, options)
	}

	/**
	 * Get supported sample rates
	 */
	static getSupportedSampleRates(): readonly number[] {
		return SPEEX_SAMPLE_RATES
	}

	/**
	 * Get supported channel configurations
	 */
	static getSupportedChannels(): number[] {
		return [1, 2] // Mono and stereo (stereo converted to mono internally)
	}

	/**
	 * Validate sample rate
	 */
	static isValidSampleRate(sampleRate: number): boolean {
		return SPEEX_SAMPLE_RATES.includes(sampleRate as any)
	}

	/**
	 * Validate channel count
	 */
	static isValidChannelCount(channels: number): boolean {
		return channels === 1 || channels === 2
	}

	/**
	 * Get quality range
	 */
	static getQualityRange(): { min: number; max: number; default: number } {
		return {
			min: SPEEX_QUALITY_RANGE.MIN,
			max: SPEEX_QUALITY_RANGE.MAX,
			default: SPEEX_QUALITY_RANGE.DEFAULT,
		}
	}

	/**
	 * Get recommended bitrates for different use cases
	 */
	static getRecommendedBitrates(): Record<string, { sampleRate: number; quality: number; bitrate: number }> {
		return {
			voip: { sampleRate: 8000, quality: 4, bitrate: 8000 }, // VoIP quality
			voiceRecording: { sampleRate: 16000, quality: 6, bitrate: 16000 }, // Voice recording
			highQualityVoice: { sampleRate: 16000, quality: 8, bitrate: 24000 }, // High quality voice
			wideband: { sampleRate: 32000, quality: 8, bitrate: 28000 }, // Ultra-wideband
		}
	}

	/**
	 * Get mode names
	 */
	static getModeNames(): Record<number, string> {
		return {
			0: 'Narrowband (8 kHz)',
			1: 'Wideband (16 kHz)',
			2: 'Ultra-wideband (32 kHz)',
		}
	}

	/**
	 * Calculate approximate file size
	 */
	static estimateFileSize(
		durationSeconds: number,
		sampleRate: number = 16000,
		quality: number = 8,
		includeContainer: boolean = true
	): number {
		// Estimate bitrate based on mode and quality
		let bitrate: number
		if (sampleRate === 8000) {
			bitrate = 2150 + quality * 1500 // Narrowband
		} else if (sampleRate === 16000) {
			bitrate = 4000 + quality * 2400 // Wideband
		} else {
			bitrate = 5500 + quality * 3000 // Ultra-wideband
		}

		// Audio data size
		const audioSize = (durationSeconds * bitrate) / 8

		// Add container overhead (Ogg pages, headers, etc.)
		const overhead = includeContainer ? 500 + durationSeconds * 50 : 0

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
			name: 'Speex',
			fullName: 'Speex Speech Codec',
			description: 'Free codec designed for speech compression, optimized for VoIP and file-based applications',
			mimeType: 'audio/speex',
			extensions: ['.spx'],
			container: 'Ogg',
			features: [
				'Optimized for speech',
				'Three bandwidth modes (NB, WB, UWB)',
				'Variable bitrate (VBR)',
				'Low latency (20ms frames)',
				'Quality range 0-10',
				'Packet loss concealment',
				'Perceptual enhancement',
				'Low complexity',
				'Free and open source',
			],
		}
	}
}

/**
 * Convenience exports
 */
export { decodeSpeex, encodeSpeex, isSpeex, parseSpeexInfo }
