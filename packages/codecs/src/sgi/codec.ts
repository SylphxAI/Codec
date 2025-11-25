/**
 * SGI Codec implementation
 */

import type { ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeSgi } from './decoder'
import { encodeSgi } from './encoder'
import type { SGIEncodeOptions } from './types'

export class SGICodec implements ImageCodec {
	readonly name = 'SGI'
	readonly mimeTypes = ['image/x-sgi', 'image/sgi', 'image/x-rgb']
	readonly extensions = ['.sgi', '.rgb', '.rgba', '.bw']

	private options: SGIEncodeOptions

	constructor(options: SGIEncodeOptions = {}) {
		this.options = options
	}

	canDecode(data: Uint8Array): boolean {
		if (data.length < 2) return false
		// SGI magic: 0x01DA (big-endian)
		return data[0] === 0x01 && data[1] === 0xda
	}

	decode(data: Uint8Array): ImageData {
		return decodeSgi(data)
	}

	encode(image: ImageData): Uint8Array {
		return encodeSgi(image, this.options)
	}
}
