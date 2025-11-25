/**
 * PFM codec implementation
 */

import type { ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodePfm } from './decoder'
import { encodePfm } from './encoder'
import type { PFMEncodeOptions } from './types'

export class PFMCodec implements ImageCodec<PFMEncodeOptions> {
	readonly name = 'PFM'
	readonly extensions = ['.pfm']
	readonly mimeTypes = ['image/x-portable-floatmap']

	canDecode(data: Uint8Array): boolean {
		// Check for "PF" (color) or "Pf" (grayscale) magic
		return (
			data.length >= 2 &&
			data[0] === 0x50 && // 'P'
			(data[1] === 0x46 || data[1] === 0x66) // 'F' or 'f'
		)
	}

	decode(data: Uint8Array): ImageData {
		return decodePfm(data)
	}

	encode(image: ImageData, options?: PFMEncodeOptions): Uint8Array {
		return encodePfm(image, options)
	}
}
