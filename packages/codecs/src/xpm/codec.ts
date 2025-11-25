/**
 * XPM Codec implementation
 */

import type { ImageCodec, ImageData } from '@mconv/core'
import { decodeXpm } from './decoder'
import { encodeXpm } from './encoder'
import type { XPMEncodeOptions } from './types'

export class XPMCodec implements ImageCodec {
	readonly name = 'XPM'
	readonly mimeTypes = ['image/x-xpixmap', 'image/x-xpm']
	readonly extensions = ['.xpm']

	private options: XPMEncodeOptions

	constructor(options: XPMEncodeOptions = {}) {
		this.options = options
	}

	canDecode(data: Uint8Array): boolean {
		// Look for "/* XPM */" magic
		const text = new TextDecoder().decode(data.subarray(0, 100))
		return text.includes('/* XPM */') || text.includes('/*XPM*/')
	}

	decode(data: Uint8Array): ImageData {
		return decodeXpm(data)
	}

	encode(image: ImageData): Uint8Array {
		return encodeXpm(image, this.options)
	}
}
