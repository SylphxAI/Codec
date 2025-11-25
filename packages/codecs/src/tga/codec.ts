import type { Codec, EncodeOptions, ImageData } from '@sylphx/codec-core'
import { decodeTga } from './decoder'
import { encodeTga } from './encoder'

/**
 * TGA (Targa) codec
 */
export const TgaCodec: Codec = {
	decode(data: Uint8Array): ImageData {
		return decodeTga(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeTga(image, options)
	},
}
