/**
 * PAM Codec implementation
 */

import type { ImageCodec, ImageData } from '@mconv/core'
import { decodePam } from './decoder'
import { encodePam } from './encoder'

export class PAMCodec implements ImageCodec {
	readonly name = 'PAM'
	readonly mimeTypes = ['image/x-portable-arbitrarymap']
	readonly extensions = ['.pam']

	canDecode(data: Uint8Array): boolean {
		// PAM magic: "P7"
		return data.length >= 2 && data[0] === 0x50 && data[1] === 0x37
	}

	decode(data: Uint8Array): ImageData {
		return decodePam(data)
	}

	encode(image: ImageData): Uint8Array {
		return encodePam(image)
	}
}
