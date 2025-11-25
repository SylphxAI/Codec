/**
 * WMV (Windows Media Video) codec implementation
 */

import type { VideoCodec, VideoData, EncodeOptions } from '@sylphx/codec-core'
import { decodeWmvVideo } from './decoder'
import { encodeWmvVideo } from './encoder'
import type { WmvEncodeOptions } from './types'

/**
 * WMV video codec
 */
export class WmvCodec implements VideoCodec {
	readonly format = 'wmv' as const

	/**
	 * Decode WMV data to VideoData
	 */
	decode(data: Uint8Array): VideoData {
		return decodeWmvVideo(data)
	}

	/**
	 * Encode VideoData to WMV
	 */
	encode(video: VideoData, options?: EncodeOptions & WmvEncodeOptions): Uint8Array {
		return encodeWmvVideo(video, options)
	}
}

/**
 * Create WMV codec instance
 */
export function createWmvCodec(): VideoCodec {
	return new WmvCodec()
}
