import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeSwf } from './decoder'
import { encodeSwf } from './encoder'

/**
 * SWF (Shockwave Flash) codec implementation
 */
export const SwfCodec: ImageCodec = {
	format: 'swf',

	decode(data: Uint8Array): ImageData {
		return decodeSwf(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeSwf(image, options)
	},
}
