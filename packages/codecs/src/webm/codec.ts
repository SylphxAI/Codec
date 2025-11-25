/**
 * WebM Codec class implementation
 */

import type { EncodeOptions, VideoCodec, VideoData } from '@sylphx/codec-core'
import { decodeWebmToVideo } from './decoder'
import { encodeWebm } from './encoder'
import type { WebmEncodeOptions } from './types'

/**
 * WebM Video Codec
 */
export class WebmCodec implements VideoCodec {
	readonly format = 'webm' as const

	/**
	 * Decode WebM to VideoData
	 */
	decode(data: Uint8Array): VideoData {
		return decodeWebmToVideo(data)
	}

	/**
	 * Encode VideoData to WebM
	 */
	encode(input: VideoData, options?: EncodeOptions): Uint8Array {
		const webmOptions: WebmEncodeOptions = {
			quality: options?.quality,
		}

		return encodeWebm(input, webmOptions)
	}
}

/**
 * Create WebM codec instance
 */
export function createWebmCodec(): VideoCodec {
	return new WebmCodec()
}
