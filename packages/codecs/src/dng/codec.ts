import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeDNG } from './decoder'
import { encodeDNG } from './encoder'

/**
 * DNG (Adobe Digital Negative) codec implementation
 *
 * DNG is Adobe's universal RAW image format based on TIFF/EP.
 * It supports extensive camera metadata, color calibration data,
 * and various compression methods.
 */
export const DNGCodec: ImageCodec = {
	format: 'dng' as any,

	decode(data: Uint8Array): ImageData {
		return decodeDNG(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeDNG(image, options)
	},
}
