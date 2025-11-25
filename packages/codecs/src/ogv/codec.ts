/**
 * OGV codec implementation
 */

import type { VideoCodec, VideoData } from '@sylphx/codec-core'
import { decodeOgvToVideo } from './decoder'
import { encodeOgv } from './encoder'
import type { OgvEncodeOptions } from './types'

/**
 * OGV video codec
 */
export const ogvCodec: VideoCodec = {
	format: 'ogv' as const,
	decode(data: Uint8Array): VideoData {
		return decodeOgvToVideo(data)
	},
	encode(video: VideoData, options?: OgvEncodeOptions): Uint8Array {
		return encodeOgv(video, options)
	},
}
