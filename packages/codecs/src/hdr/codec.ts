import type { Codec, EncodeOptions, ImageData } from '@sylphx/codec-core'
import { decodeHdr } from './decoder'
import { encodeHdr } from './encoder'

/**
 * HDR (Radiance RGBE) codec
 */
export const HdrCodec: Codec = {
	decode(data: Uint8Array): ImageData {
		return decodeHdr(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeHdr(image, options)
	},
}
