/**
 * F4V (Flash Video MP4) codec
 */

import type { Codec } from '@sylphx/codec-core'
import { decodeF4v, decodeF4vFrames, isF4v, parseF4vInfo } from './decoder'
import { encodeF4v } from './encoder'
import type { F4vEncodeOptions } from './types'

export const f4vCodec: Codec = {
	name: 'F4V',
	extensions: ['.f4v'],
	mimeTypes: ['video/x-f4v', 'video/mp4'],

	detect: (data: Uint8Array): boolean => {
		return isF4v(data)
	},

	decode: async (data: Uint8Array) => {
		return decodeF4vFrames(data)
	},

	encode: async (frames, options?: F4vEncodeOptions) => {
		return encodeF4v(frames, options)
	},

	getInfo: (data: Uint8Array) => {
		const info = parseF4vInfo(data)
		return {
			width: info.width,
			height: info.height,
			frameCount: info.videoTrack?.sampleCount || 0,
			duration: info.duration,
		}
	},
}
