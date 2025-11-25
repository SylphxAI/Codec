import type { EncodeOptions, VideoCodec, VideoData } from '@sylphx/codec-core'
import { decodeApng } from './decoder'
import { encodeApng } from './encoder'

/**
 * APNG (Animated PNG) codec implementation
 *
 * APNG is an extension to PNG that adds animation support.
 * It uses the same PNG signature and basic structure, with additional chunks:
 * - acTL: Animation Control - defines number of frames and loops
 * - fcTL: Frame Control - defines timing and positioning for each frame
 * - fdAT: Frame Data - contains compressed frame pixels (like IDAT but for animation frames)
 *
 * Features:
 * - Multiple frames with independent timing
 * - Frame-level positioning (x/y offsets)
 * - Dispose operations (none, background, previous)
 * - Blend operations (source, over)
 * - Infinite or finite looping
 */
export const ApngCodec: VideoCodec = {
	format: 'apng' as const,

	decode(data: Uint8Array): VideoData {
		return decodeApng(data)
	},

	encode(video: VideoData, options?: EncodeOptions): Uint8Array {
		return encodeApng(video, options)
	},
}
