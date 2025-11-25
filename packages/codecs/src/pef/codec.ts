import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodePef } from './decoder'
import { encodePef } from './encoder'

/**
 * PEF (Pentax Electronic Format) codec implementation
 *
 * PEF is Pentax's proprietary RAW image format based on TIFF.
 * This codec handles the TIFF-based structure and extracts preview images.
 * Note: Full RAW sensor data processing is not implemented.
 */
export const PefCodec: ImageCodec = {
	format: 'pef',

	decode(data: Uint8Array): ImageData {
		return decodePef(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodePef(image, options)
	},
}
