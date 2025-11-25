/**
 * PIX codec implementation
 */

import type { ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodePix } from './decoder'
import { encodePix } from './encoder'
import type { PIXEncodeOptions } from './types'

export class PIXCodec implements ImageCodec<PIXEncodeOptions> {
	readonly name = 'PIX'
	readonly extensions = ['.pix', '.alias']
	readonly mimeTypes = ['image/x-alias']

	canDecode(data: Uint8Array): boolean {
		// PIX doesn't have a magic number, check for reasonable header values
		if (data.length < 10) return false

		const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
		const width = view.getUint16(0, false)
		const height = view.getUint16(2, false)
		const depth = view.getUint16(8, false)

		// Sanity checks
		return (
			width > 0 && width <= 32768 && height > 0 && height <= 32768 && depth === 24 // Only support 24-bit
		)
	}

	decode(data: Uint8Array): ImageData {
		return decodePix(data)
	}

	encode(image: ImageData, options?: PIXEncodeOptions): Uint8Array {
		return encodePix(image, options)
	}
}
