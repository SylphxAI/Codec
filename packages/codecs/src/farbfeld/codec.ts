/**
 * Farbfeld Codec implementation
 */

import type { ImageCodec, ImageData } from '@mconv/core'
import { decodeFarbfeld } from './decoder'
import { encodeFarbfeld } from './encoder'
import { FARBFELD_MAGIC } from './types'

export class FarbfeldCodec implements ImageCodec {
	readonly name = 'Farbfeld'
	readonly mimeTypes = ['image/x-farbfeld']
	readonly extensions = ['.ff']

	canDecode(data: Uint8Array): boolean {
		if (data.length < 8) return false
		for (let i = 0; i < 8; i++) {
			if (data[i] !== FARBFELD_MAGIC[i]) return false
		}
		return true
	}

	decode(data: Uint8Array): ImageData {
		return decodeFarbfeld(data)
	}

	encode(image: ImageData): Uint8Array {
		return encodeFarbfeld(image)
	}
}
