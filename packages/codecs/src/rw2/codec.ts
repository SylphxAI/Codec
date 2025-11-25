import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeRW2 } from './decoder'
import { encodeRW2 } from './encoder'

/**
 * RW2 (Panasonic RAW) codec implementation
 */
export const RW2Codec: ImageCodec = {
	format: 'rw2',

	decode(data: Uint8Array): ImageData {
		return decodeRW2(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeRW2(image, options)
	},
}
