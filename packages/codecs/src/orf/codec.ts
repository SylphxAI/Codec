import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeOrf } from './decoder'
import { encodeOrf } from './encoder'

/**
 * ORF (Olympus RAW) codec implementation
 * Based on TIFF with Olympus-specific extensions
 */
export const OrfCodec: ImageCodec = {
	format: 'orf',

	decode(data: Uint8Array): ImageData {
		return decodeOrf(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeOrf(image, options)
	},
}
