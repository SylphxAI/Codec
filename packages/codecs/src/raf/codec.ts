import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeRaf } from './decoder'
import { encodeRaf } from './encoder'

/**
 * RAF (Fujifilm RAW) codec implementation
 */
export const RafCodec: ImageCodec = {
	format: 'raf',

	decode(data: Uint8Array): ImageData {
		return decodeRaf(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeRaf(image, options)
	},
}
