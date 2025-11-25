/**
 * VOB (DVD Video) Codec class implementation
 */

import type { EncodeOptions, VideoCodec, VideoData } from '@sylphx/codec-core'
import { decodeVobToVideo } from './decoder'
import { encodeVob } from './encoder'
import type { VobEncodeOptions } from './types'

/**
 * VOB (DVD Video) Codec
 */
export class VobCodec implements VideoCodec {
	readonly format = 'vob' as const

	/**
	 * Decode VOB to VideoData
	 */
	decode(data: Uint8Array): VideoData {
		return decodeVobToVideo(data)
	}

	/**
	 * Encode VideoData to VOB
	 */
	encode(input: VideoData, options?: EncodeOptions): Uint8Array {
		const vobOptions: VobEncodeOptions = {
			quality: options?.quality,
		}

		return encodeVob(input, vobOptions)
	}
}

/**
 * Create VOB codec instance
 */
export function createVobCodec(): VideoCodec {
	return new VobCodec()
}
