/**
 * TTA (True Audio) codec
 * Integrates decoder and encoder with AudioData interface
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeTta, isTta, parseTtaInfo } from './decoder'
import { encodeTta } from './encoder'
import type { TtaAudioData, TtaEncodeOptions } from './types'

/**
 * Convert AudioData (Float32) to TTA format (Int32)
 */
function audioDataToTta(audio: AudioData, bitsPerSample: number = 16): TtaAudioData {
	const samples: Int32Array[] = []
	const maxValue = (1 << (bitsPerSample - 1)) - 1

	for (const channel of audio.samples) {
		const int32Samples = new Int32Array(channel.length)
		for (let i = 0; i < channel.length; i++) {
			// Convert from float [-1.0, 1.0] to integer
			const floatValue = Math.max(-1.0, Math.min(1.0, channel[i]!))
			int32Samples[i] = Math.round(floatValue * maxValue)
		}
		samples.push(int32Samples)
	}

	return {
		samples,
		sampleRate: audio.sampleRate,
		bitsPerSample,
	}
}

/**
 * Convert TTA format (Int32) to AudioData (Float32)
 */
function ttaToAudioData(samples: Int32Array[], sampleRate: number, bitsPerSample: number): AudioData {
	const floatSamples: Float32Array[] = []
	const maxValue = (1 << (bitsPerSample - 1)) - 1

	for (const channel of samples) {
		const float32Samples = new Float32Array(channel.length)
		for (let i = 0; i < channel.length; i++) {
			// Convert from integer to float [-1.0, 1.0]
			float32Samples[i] = channel[i]! / maxValue
		}
		floatSamples.push(float32Samples)
	}

	return {
		samples: floatSamples,
		sampleRate,
		channels: samples.length,
	}
}

/**
 * Decode TTA file to AudioData
 */
export function decodeTtaToAudio(data: Uint8Array): AudioData {
	const result = decodeTta(data)
	return ttaToAudioData(result.samples, result.info.sampleRate, result.info.bitsPerSample)
}

/**
 * Encode AudioData to TTA file
 */
export function encodeAudioToTta(audio: AudioData, options: TtaEncodeOptions & { bitsPerSample?: number } = {}): Uint8Array {
	const bitsPerSample = options.bitsPerSample || 16
	const ttaAudio = audioDataToTta(audio, bitsPerSample)
	return encodeTta(ttaAudio, options)
}

/**
 * Get TTA file info
 */
export function getTtaInfo(data: Uint8Array) {
	return parseTtaInfo(data)
}

/**
 * Check if data is TTA format
 */
export function isTtaFile(data: Uint8Array): boolean {
	return isTta(data)
}

// Re-export all decoder/encoder functions
export * from './decoder'
export * from './encoder'
export * from './types'
