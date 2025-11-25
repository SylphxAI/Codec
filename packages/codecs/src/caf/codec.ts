/**
 * CAF (Core Audio Format) codec
 * Implements AudioCodec interface for CAF files
 */

import type { AudioCodec, AudioData } from '@sylphx/codec-core'
import { decodeCaf } from './decoder'
import { encodeCaf } from './encoder'
import type { CafEncodeOptions } from './types'

/**
 * CAF codec implementation
 */
export class CafCodec implements AudioCodec {
	readonly format = 'caf' as const

	decode(data: Uint8Array): AudioData {
		const decoded = decodeCaf(data)
		return {
			samples: decoded.samples,
			sampleRate: decoded.info.sampleRate,
			channels: decoded.info.numChannels,
		}
	}

	encode(input: AudioData, options?: CafEncodeOptions): Uint8Array {
		return encodeCaf(input.samples, {
			sampleRate: input.sampleRate,
			...options,
		})
	}
}

/**
 * Create a new CAF codec instance
 */
export function createCafCodec(): CafCodec {
	return new CafCodec()
}
