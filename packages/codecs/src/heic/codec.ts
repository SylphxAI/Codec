import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeHeic } from './decoder'
import { encodeHeic } from './encoder'

/**
 * HEIC/HEIF codec implementation
 *
 * HEIC (High Efficiency Image Container) uses HEVC (H.265) compression
 * in an HEIF (High Efficiency Image File Format) container.
 *
 * Note: Full HEVC encoding/decoding is extremely complex and typically
 * requires hardware acceleration or specialized libraries. This implementation
 * provides the container parsing but HEVC codec implementation is a placeholder.
 */
export const HeicCodec: ImageCodec = {
	format: 'heic',

	decode(data: Uint8Array): ImageData {
		return decodeHeic(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeHeic(image, options)
	},
}
