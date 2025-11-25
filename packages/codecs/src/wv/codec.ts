/**
 * WavPack codec registration
 */

import type { AudioData, Codec } from '@sylphx/codec-core'
import { decodeWavPack, isWavPack, parseWavPackInfo } from './decoder'
import { encodeWavPack } from './encoder'
import type { WavPackEncodeOptions } from './types'

/**
 * WavPack codec
 */
export const wavPackCodec: Codec = {
	name: 'WavPack',
	mimeTypes: ['audio/x-wavpack'],
	extensions: ['.wv'],

	detect(data: Uint8Array): boolean {
		return isWavPack(data)
	},

	async decode(data: Uint8Array): Promise<AudioData> {
		return decodeWavPack(data)
	},

	async encode(data: AudioData, options?: WavPackEncodeOptions): Promise<Uint8Array> {
		return encodeWavPack(data, options)
	},

	async getInfo(data: Uint8Array) {
		const info = parseWavPackInfo(data)
		return {
			format: 'WavPack',
			width: 0,
			height: 0,
			duration: info.duration,
			metadata: {
				version: info.version,
				sampleRate: info.sampleRate,
				channels: info.channels,
				bitsPerSample: info.bitsPerSample,
				totalSamples: info.totalSamples,
				isHybrid: info.isHybrid,
				isLossless: info.isLossless,
				isFloat: info.isFloat,
			},
		}
	},
}
