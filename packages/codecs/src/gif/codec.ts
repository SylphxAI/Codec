import type { EncodeOptions, ImageCodec, ImageData } from '@mconv/core'
import { decodeGif } from './decoder'
import { encodeGif } from './encoder'

/**
 * GIF codec implementation
 */
export const GifCodec: ImageCodec = {
	format: 'gif',

	decode(data: Uint8Array): ImageData {
		return decodeGif(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeGif(image, options)
	},
}
