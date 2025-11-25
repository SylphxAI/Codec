/**
 * Sun Raster Codec implementation
 */

import type { ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeSunRaster } from './decoder'
import { encodeSunRaster } from './encoder'
import type { SunRasterEncodeOptions } from './types'

export class SunRasterCodec implements ImageCodec {
	readonly name = 'Sun Raster'
	readonly mimeTypes = ['image/x-sun-raster']
	readonly extensions = ['.ras', '.sun']

	private options: SunRasterEncodeOptions

	constructor(options: SunRasterEncodeOptions = {}) {
		this.options = options
	}

	canDecode(data: Uint8Array): boolean {
		if (data.length < 4) return false
		// Sun Raster magic: 0x59a66a95 (big-endian)
		return data[0] === 0x59 && data[1] === 0xa6 && data[2] === 0x6a && data[3] === 0x95
	}

	decode(data: Uint8Array): ImageData {
		return decodeSunRaster(data)
	}

	encode(image: ImageData): Uint8Array {
		return encodeSunRaster(image, this.options)
	}
}
