import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeFlif } from './decoder'
import { encodeFlif } from './encoder'

/**
 * FLIF (Free Lossless Image Format) codec implementation
 */
export const FlifCodec: ImageCodec = {
	format: 'flif',

	decode(data: Uint8Array): ImageData {
		return decodeFlif(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeFlif(image, options)
	},
}
