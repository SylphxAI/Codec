/**
 * ALAC codec implementation for @sylphx/codec-core
 */

import type { AudioData, Codec, FeatureLevel, MediaInfo } from '@sylphx/codec-core'
import { decodeAlac, isAlac, parseAlacInfo } from './decoder'
import { encodeAlac } from './encoder'
import { ALAC_FRAME_LENGTH } from './types'

/**
 * ALAC codec for @sylphx/codec-core
 * Note: ALAC is typically found in M4A/MP4 containers
 */
export const alacCodec: Codec<AudioData> = {
	name: 'alac',
	mediaType: 'audio',
	mimeTypes: ['audio/alac', 'audio/x-alac'],
	extensions: ['m4a', 'mp4'],

	detect(data: Uint8Array): boolean {
		return isAlac(data)
	},

	getInfo(data: Uint8Array): MediaInfo {
		const info = parseAlacInfo(data)

		return {
			mediaType: 'audio',
			width: 0,
			height: 0,
			duration: info.duration,
			frameCount: Math.ceil(info.totalSamples / info.frameLength),
			fps: 0,
			hasAudio: true,
			hasVideo: false,
			bitrate: info.avgBitRate,
			metadata: {
				codec: 'alac',
				sampleRate: info.sampleRate,
				channels: info.channels,
				bitDepth: info.bitDepth,
				frameLength: info.frameLength,
			},
		}
	},

	decode(data: Uint8Array): AudioData {
		const result = decodeAlac(data)

		// Convert Int32Array to Float32Array
		const samples: Float32Array[] = []
		const maxValue = 1 << (result.info.bitDepth - 1)

		for (let ch = 0; ch < result.samples.length; ch++) {
			const intSamples = result.samples[ch]!
			const floatSamples = new Float32Array(intSamples.length)

			for (let i = 0; i < intSamples.length; i++) {
				floatSamples[i] = intSamples[i]! / maxValue
			}

			samples.push(floatSamples)
		}

		return {
			samples,
			sampleRate: result.info.sampleRate,
			channels: result.info.channels,
		}
	},

	encode(audio: AudioData): Uint8Array {
		// Convert Float32Array to Int32Array
		// Assume 16-bit depth for encoding (can be adjusted)
		const bitDepth = 16
		const maxValue = (1 << (bitDepth - 1)) - 1

		const samples: Int32Array[] = []
		for (let ch = 0; ch < audio.samples.length; ch++) {
			const floatSamples = audio.samples[ch]!
			const intSamples = new Int32Array(floatSamples.length)

			for (let i = 0; i < floatSamples.length; i++) {
				const value = Math.round(floatSamples[i]! * maxValue)
				intSamples[i] = Math.max(-maxValue - 1, Math.min(maxValue, value))
			}

			samples.push(intSamples)
		}

		return encodeAlac({
			samples,
			sampleRate: audio.sampleRate,
			bitDepth,
		})
	},

	getSupportLevel(): FeatureLevel {
		return {
			decode: 'partial', // Basic decoding, may not handle all edge cases
			encode: 'partial', // Basic encoding, not optimized
			info: 'partial', // Can parse ALAC atom but not full MP4 container
			detect: 'full',
		}
	},
}
