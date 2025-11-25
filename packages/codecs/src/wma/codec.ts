/**
 * WMA (Windows Media Audio) codec implementation
 */

import type { AudioCodec, AudioData } from '@sylphx/codec-core'
import { decodeWma, isWma, parseWmaInfo } from './decoder'
import { encodeWma } from './encoder'
import type { WmaEncodeOptions } from './types'

/**
 * WMA audio codec
 */
export class WmaCodec implements AudioCodec {
	readonly format = 'wma' as const

	/**
	 * Check if data is WMA format
	 */
	static isWma = isWma

	/**
	 * Parse WMA metadata without full decode
	 */
	static parseInfo = parseWmaInfo

	/**
	 * Decode WMA to AudioData
	 */
	decode(data: Uint8Array): AudioData {
		const result = decodeWma(data)

		return {
			samples: result.samples,
			sampleRate: result.info.sampleRate,
			channels: result.info.channels,
		}
	}

	/**
	 * Encode AudioData to WMA
	 */
	encode(audio: AudioData, options?: WmaEncodeOptions): Uint8Array {
		return encodeWma(audio, options)
	}
}

/**
 * Create a WMA codec instance
 */
export function createWmaCodec(): WmaCodec {
	return new WmaCodec()
}
