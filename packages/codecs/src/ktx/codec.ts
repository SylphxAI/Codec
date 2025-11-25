/**
 * KTX codec implementation
 */

import type { ImageCodec, ImageData } from '@mconv/core'
import { decodeKtx } from './decoder'
import { encodeKtx } from './encoder'
import type { KTXEncodeOptions } from './types'
import { KTX1_MAGIC } from './types'

export class KTXCodec implements ImageCodec<KTXEncodeOptions> {
	readonly name = 'KTX'
	readonly extensions = ['.ktx']
	readonly mimeTypes = ['image/ktx']

	canDecode(data: Uint8Array): boolean {
		if (data.length < 12) return false

		// Check magic number
		for (let i = 0; i < 12; i++) {
			if (data[i] !== KTX1_MAGIC[i]) return false
		}

		return true
	}

	decode(data: Uint8Array): ImageData {
		return decodeKtx(data)
	}

	encode(image: ImageData, options?: KTXEncodeOptions): Uint8Array {
		return encodeKtx(image, options)
	}
}
