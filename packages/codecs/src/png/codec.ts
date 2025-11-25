import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodePng } from './decoder'
import { encodePng } from './encoder'

/**
 * PNG codec implementation
 */
export const PngCodec: ImageCodec = {
	format: 'png',

	decode(data: Uint8Array): ImageData {
		return decodePng(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodePng(image, options)
	},
}
