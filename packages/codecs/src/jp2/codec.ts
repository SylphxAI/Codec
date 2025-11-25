import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeJp2 } from './decoder'
import { encodeJp2 } from './encoder'

/**
 * JPEG 2000 codec implementation
 */
export const Jp2Codec: ImageCodec = {
	format: 'jp2',

	decode(data: Uint8Array): ImageData {
		return decodeJp2(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeJp2(image, options)
	},
}
