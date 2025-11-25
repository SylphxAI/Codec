import type { Codec, ImageData } from '@sylphx/codec-core'
import { decodeQoi } from './decoder'
import { encodeQoi } from './encoder'

/**
 * QOI (Quite OK Image) codec
 */
export const QoiCodec: Codec = {
	decode(data: Uint8Array): ImageData {
		return decodeQoi(data)
	},

	encode(image: ImageData): Uint8Array {
		return encodeQoi(image)
	},
}
