import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeJpeg } from './decoder'
import { encodeJpeg } from './encoder'

/**
 * JPEG codec implementation
 */
export const JpegCodec: ImageCodec = {
	format: 'jpeg',

	decode(data: Uint8Array): ImageData {
		return decodeJpeg(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeJpeg(image, options)
	},
}
