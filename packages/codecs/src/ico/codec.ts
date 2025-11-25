import type { EncodeOptions, ImageCodec, ImageData } from '@mconv/core'
import { decodeIco } from './decoder'
import { encodeIco } from './encoder'

/**
 * ICO codec implementation
 */
export const IcoCodec: ImageCodec = {
	format: 'ico',

	decode(data: Uint8Array): ImageData {
		return decodeIco(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeIco(image, options)
	},
}
