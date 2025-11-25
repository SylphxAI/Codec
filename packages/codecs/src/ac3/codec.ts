/**
 * AC3 (Dolby Digital) codec implementation
 * Implements Codec interface for AC3 audio format
 */

import type { AudioCodec, AudioData } from '@sylphx/codec-core'
import { decodeAC3, isAC3, parseAC3Info } from './decoder'
import { encodeAC3 } from './encoder'
import type { AC3AudioData, AC3DecodeResult, AC3EncodeOptions, AC3Info } from './types'

/**
 * AC3 audio codec
 */
export class AC3Codec implements AudioCodec {
	readonly format = 'ac3' as const

	/**
	 * Codec name
	 */
	static readonly name = 'AC3'

	/**
	 * Codec description
	 */
	static readonly description = 'AC3 (Dolby Digital) audio codec'

	/**
	 * File extensions
	 */
	static readonly extensions = ['.ac3', '.dd', '.dolby']

	/**
	 * MIME types
	 */
	static readonly mimeTypes = ['audio/ac3', 'audio/vnd.dolby.dd-raw']

	/**
	 * Check if data is AC3 format
	 */
	static isAC3(data: Uint8Array): boolean {
		return isAC3(data)
	}

	/**
	 * Parse AC3 metadata without full decode
	 */
	static parseInfo(data: Uint8Array): AC3Info {
		return parseAC3Info(data)
	}

	/**
	 * Decode AC3 data to AudioData (core interface)
	 */
	decode(data: Uint8Array): AudioData {
		const result = decodeAC3(data)
		// Convert Int32Array to Float32Array (normalized -1.0 to 1.0)
		const samples: Float32Array[] = result.samples.map((channel) => {
			const floatSamples = new Float32Array(channel.length)
			const scale = 1 / 32768 // Normalize 16-bit PCM
			for (let i = 0; i < channel.length; i++) {
				floatSamples[i] = channel[i]! * scale
			}
			return floatSamples
		})

		return {
			samples,
			sampleRate: result.info.sampleRate,
			channels: result.info.channels,
		}
	}

	/**
	 * Encode AudioData to AC3
	 */
	encode(input: AudioData, options?: AC3EncodeOptions): Uint8Array {
		// Convert Float32Array to Int32Array
		const samples: Int32Array[] = input.samples.map((channel) => {
			const intSamples = new Int32Array(channel.length)
			const scale = 32767 // Scale to 16-bit PCM range
			for (let i = 0; i < channel.length; i++) {
				intSamples[i] = Math.round(Math.max(-1, Math.min(1, channel[i]!)) * scale)
			}
			return intSamples
		})

		const audioData: AC3AudioData = {
			samples,
			sampleRate: input.sampleRate,
			bitsPerSample: 16,
		}

		return encodeAC3(audioData, options)
	}

	/**
	 * Decode AC3 data to raw audio samples (static method)
	 */
	static decodeToInt32(data: Uint8Array): AC3DecodeResult {
		return decodeAC3(data)
	}

	/**
	 * Encode raw audio samples to AC3 (static method)
	 */
	static encodeFromInt32(audio: AC3AudioData, options?: AC3EncodeOptions): Uint8Array {
		return encodeAC3(audio, options)
	}

	/**
	 * Get supported sample rates
	 */
	static getSupportedSampleRates(): number[] {
		return [48000, 44100, 32000]
	}

	/**
	 * Get supported bitrates (kbps)
	 */
	static getSupportedBitrates(): number[] {
		return [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 448, 512, 576, 640]
	}

	/**
	 * Get channel mode from channel count
	 */
	static getChannelModeForChannels(channels: number): number {
		// AC3ChannelMode enum values
		switch (channels) {
			case 1:
				return 1 // MONO
			case 2:
				return 2 // STEREO
			case 3:
				return 3 // THREE_CHANNEL
			case 4:
				return 6 // SURROUND_2_2
			case 5:
				return 7 // SURROUND_3_2
			case 6:
				return 7 // SURROUND_3_2 with LFE
			default:
				return 2 // Default to STEREO
		}
	}

	/**
	 * Validate encode options
	 */
	static validateOptions(options: AC3EncodeOptions): void {
		if (options.bitrate !== undefined) {
			const validBitrates = this.getSupportedBitrates()
			if (!validBitrates.includes(options.bitrate)) {
				throw new Error(`Invalid bitrate: ${options.bitrate}. Must be one of: ${validBitrates.join(', ')}`)
			}
		}
	}

	/**
	 * Get recommended bitrate for channel configuration
	 */
	static getRecommendedBitrate(channels: number, sampleRate: number): number {
		// Recommended bitrates based on channel count
		if (channels <= 2) {
			return 192 // 192 kbps for stereo/mono
		} else if (channels <= 4) {
			return 384 // 384 kbps for surround
		} else {
			return 448 // 448 kbps for 5.1
		}
	}

	/**
	 * Get frame size for bitrate and sample rate
	 */
	static getFrameSize(bitrate: number, sampleRate: number): number {
		// Simplified calculation
		// Frame contains 1536 samples (6 blocks * 256 samples)
		const samplesPerFrame = 1536
		const frameTimeMs = (samplesPerFrame / sampleRate) * 1000
		return Math.floor((bitrate * 1000 * frameTimeMs) / 8000)
	}
}

export default AC3Codec
