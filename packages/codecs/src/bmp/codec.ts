import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeBmp } from './decoder'
import { encodeBmp } from './encoder'

/**
 * BMP codec implementation
 */
export const BmpCodec: ImageCodec = {
	format: 'bmp',

	decode(data: Uint8Array): ImageData {
		return decodeBmp(data)
	},

	encode(image: ImageData, _options?: EncodeOptions): Uint8Array {
		return encodeBmp(image)
	},
}
