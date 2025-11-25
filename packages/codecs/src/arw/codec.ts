import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeArw } from './decoder'
import { encodeArw } from './encoder'

/**
 * ARW (Sony RAW) codec implementation
 *
 * ARW is Sony's proprietary RAW image format based on TIFF.
 * This codec provides basic support for reading and writing ARW files.
 *
 * Notes:
 * - Decoding: Supports TIFF-based ARW files with basic demosaicing for Bayer pattern data
 * - Encoding: Creates TIFF-compatible files with Sony metadata (not true RAW sensor data)
 */
export const ArwCodec: ImageCodec = {
	format: 'arw',

	decode(data: Uint8Array): ImageData {
		return decodeArw(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeArw(image, options)
	},
}
