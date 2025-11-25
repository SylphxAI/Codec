/**
 * XBM Codec implementation
 */

import type { ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeXbm } from './decoder'
import { encodeXbm } from './encoder'
import type { XBMEncodeOptions } from './types'

export class XBMCodec implements ImageCodec {
	readonly name = 'XBM'
	readonly mimeTypes = ['image/x-xbitmap', 'image/x-xbm']
	readonly extensions = ['.xbm']

	private options: XBMEncodeOptions

	constructor(options: XBMEncodeOptions = {}) {
		this.options = options
	}

	canDecode(data: Uint8Array): boolean {
		// Look for #define ... _width pattern
		const text = new TextDecoder().decode(data.subarray(0, 200))
		return /#define\s+\w+_width\s+\d+/.test(text)
	}

	decode(data: Uint8Array): ImageData {
		return decodeXbm(data)
	}

	encode(image: ImageData): Uint8Array {
		return encodeXbm(image, this.options)
	}
}
