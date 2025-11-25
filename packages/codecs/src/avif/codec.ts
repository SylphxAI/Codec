import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeAVIF } from './decoder'
import { encodeAVIF } from './encoder'

/**
 * AVIF codec implementation
 *
 * Note: This is a pure TypeScript implementation with placeholder AV1 encoding/decoding.
 * For production use, consider integrating:
 * - dav1d (decoder) via WebAssembly
 * - libaom, rav1e, or SVT-AV1 (encoder) via WebAssembly
 * - Browser native ImageDecoder/ImageEncoder APIs where available
 */
export const AVIFCodec: ImageCodec = {
	format: 'avif',

	decode(data: Uint8Array): ImageData {
		return decodeAVIF(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeAVIF(image, options)
	},
}
