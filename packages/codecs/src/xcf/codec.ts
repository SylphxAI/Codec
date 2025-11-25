import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeXcf } from './decoder'
import { encodeXcf } from './encoder'

/**
 * XCF (GIMP) codec implementation
 */
export const XcfCodec: ImageCodec = {
	format: 'xcf',

	decode(data: Uint8Array): ImageData {
		return decodeXcf(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeXcf(image)
	},
}
