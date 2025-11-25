import type { EncodeOptions, ImageCodec, ImageData } from '@mconv/core'
import { decodeTiff } from './decoder'
import { encodeTiff } from './encoder'

/**
 * TIFF codec implementation
 */
export const TiffCodec: ImageCodec = {
	format: 'tiff',

	decode(data: Uint8Array): ImageData {
		return decodeTiff(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeTiff(image, options)
	},
}
