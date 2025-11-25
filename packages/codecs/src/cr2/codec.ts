import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeCR2 } from './decoder'
import { encodeCR2 } from './encoder'

/**
 * CR2 (Canon RAW) codec implementation
 *
 * CR2 is Canon's RAW image format based on TIFF/EP with:
 * - Lossless JPEG compression
 * - Bayer CFA (Color Filter Array) pattern
 * - Canon-specific EXIF tags
 * - Multiple IFDs for RAW, preview, and thumbnail images
 */
export const CR2Codec: ImageCodec = {
	format: 'cr2',

	decode(data: Uint8Array): ImageData {
		return decodeCR2(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeCR2(image, options)
	},
}
