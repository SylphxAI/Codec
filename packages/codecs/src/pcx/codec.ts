import type { Codec, EncodeOptions, ImageData } from '@sylphx/codec-core'
import { decodePcx } from './decoder'
import { encodePcx } from './encoder'

/**
 * PCX (PC Paintbrush) codec
 */
export const PcxCodec: Codec = {
	decode(data: Uint8Array): ImageData {
		return decodePcx(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodePcx(image, options)
	},
}
