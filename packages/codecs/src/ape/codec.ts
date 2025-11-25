/**
 * APE (Monkey's Audio) codec
 * Combines decoder and encoder functionality
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeApe, isApe, parseApeInfo } from './decoder'
import { encodeApe } from './encoder'
import type { ApeAudioData, ApeDecodeResult, ApeEncodeOptions, ApeInfo } from './types'

/**
 * APE Codec interface
 */
export class ApeCodec {
	/**
	 * Check if data is APE format
	 */
	static isFormat(data: Uint8Array): boolean {
		return isApe(data)
	}

	/**
	 * Get APE file information
	 */
	static getInfo(data: Uint8Array): ApeInfo {
		return parseApeInfo(data)
	}

	/**
	 * Decode APE to raw audio
	 */
	static decode(data: Uint8Array): ApeDecodeResult {
		return decodeApe(data)
	}

	/**
	 * Encode raw audio to APE
	 */
	static encode(audio: ApeAudioData, options?: ApeEncodeOptions): Uint8Array {
		return encodeApe(audio, options)
	}

	/**
	 * Convert generic AudioData to APE format
	 */
	static fromAudioData(audio: AudioData, options?: ApeEncodeOptions): Uint8Array {
		// Convert to Int32Array if needed
		const samples: Int32Array[] = audio.samples.map((channel) => {
			if (channel instanceof Int32Array) {
				return channel
			}
			// Convert from other typed arrays
			const int32Channel = new Int32Array(channel.length)
			for (let i = 0; i < channel.length; i++) {
				int32Channel[i] = channel[i]!
			}
			return int32Channel
		})

		const apeAudio: ApeAudioData = {
			samples,
			sampleRate: audio.sampleRate,
			bitsPerSample: audio.bitsPerSample || 16,
		}

		return encodeApe(apeAudio, options)
	}

	/**
	 * Convert APE to generic AudioData
	 */
	static toAudioData(data: Uint8Array): AudioData {
		const decoded = decodeApe(data)

		return {
			samples: decoded.samples,
			sampleRate: decoded.info.sampleRate,
			bitsPerSample: decoded.info.bitsPerSample,
		}
	}
}
