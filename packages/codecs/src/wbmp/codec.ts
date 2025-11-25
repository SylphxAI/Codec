/**
 * WBMP Codec implementation
 */

import type { ImageCodec, ImageData } from '@mconv/core'
import { decodeWbmp } from './decoder'
import { encodeWbmp } from './encoder'
import type { WBMPEncodeOptions } from './types'

export class WBMPCodec implements ImageCodec {
	readonly name = 'WBMP'
	readonly mimeTypes = ['image/vnd.wap.wbmp']
	readonly extensions = ['.wbmp']

	private options: WBMPEncodeOptions

	constructor(options: WBMPEncodeOptions = {}) {
		this.options = options
	}

	canDecode(data: Uint8Array): boolean {
		// WBMP starts with type byte (0) and fixed header (0)
		// Then variable-length width and height
		if (data.length < 4) return false
		return data[0] === 0 && data[1] === 0
	}

	decode(data: Uint8Array): ImageData {
		return decodeWbmp(data)
	}

	encode(image: ImageData): Uint8Array {
		return encodeWbmp(image, this.options)
	}
}
