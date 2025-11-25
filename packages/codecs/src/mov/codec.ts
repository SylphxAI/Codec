/**
 * MOV/QuickTime Codec class implementation
 */

import type { EncodeOptions, VideoCodec, VideoData } from '@sylphx/codec-core'
import { decodeMovToVideo } from './decoder'
import { encodeMov } from './encoder'
import type { MovEncodeOptions } from './types'

/**
 * MOV/QuickTime Video Codec
 */
export class MovCodec implements VideoCodec {
	readonly format = 'mov' as const

	/**
	 * Decode MOV to VideoData
	 */
	decode(data: Uint8Array): VideoData {
		return decodeMovToVideo(data)
	}

	/**
	 * Encode VideoData to MOV
	 */
	encode(input: VideoData, options?: EncodeOptions): Uint8Array {
		const movOptions: MovEncodeOptions = {
			quality: options?.quality,
		}

		return encodeMov(input, movOptions)
	}
}

/**
 * Create MOV codec instance
 */
export function createMovCodec(): VideoCodec {
	return new MovCodec()
}
