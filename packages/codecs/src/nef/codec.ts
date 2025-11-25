import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeNef } from './decoder'
import { encodeNef } from './encoder'

/**
 * NEF (Nikon Electronic Format) codec implementation
 *
 * NEF is Nikon's RAW image format based on TIFF.
 * This implementation handles basic TIFF-based NEF files.
 */
export const NefCodec: ImageCodec = {
	format: 'nef',

	decode(data: Uint8Array): ImageData {
		return decodeNef(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeNef(image, options)
	},
}
