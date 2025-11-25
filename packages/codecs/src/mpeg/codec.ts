/**
 * MPEG-1/2 Codec class implementation
 */

import type { EncodeOptions, VideoCodec, VideoData } from '@sylphx/codec-core'
import { decodeMpegToVideo } from './decoder'
import { encodeMpeg } from './encoder'
import type { MpegEncodeOptions } from './types'

/**
 * MPEG-1/2 Video Codec
 */
export class MpegCodec implements VideoCodec {
	readonly format = 'mpeg' as const

	/**
	 * Decode MPEG to VideoData
	 */
	decode(data: Uint8Array): VideoData {
		return decodeMpegToVideo(data)
	}

	/**
	 * Encode VideoData to MPEG
	 */
	encode(input: VideoData, options?: EncodeOptions): Uint8Array {
		const mpegOptions: MpegEncodeOptions = {
			quality: options?.quality,
		}

		return encodeMpeg(input, mpegOptions)
	}
}

/**
 * Create MPEG codec instance
 */
export function createMpegCodec(): VideoCodec {
	return new MpegCodec()
}
