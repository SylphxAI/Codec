import type { EncodeOptions, ImageCodec, ImageData } from '@mconv/core'
import { decodeWebP } from './decoder'
import { encodeWebP } from './encoder'

/**
 * WebP codec implementation (lossless only for now)
 */
export const WebPCodec: ImageCodec = {
	format: 'webp',

	decode(data: Uint8Array): ImageData {
		return decodeWebP(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeWebP(image, options)
	},
}
