/**
 * VTF codec implementation
 */

import type { ImageCodec, ImageData } from '@mconv/core'
import { decodeVtf } from './decoder'
import { encodeVtf } from './encoder'
import type { VTFEncodeOptions } from './types'
import { VTF_MAGIC } from './types'

export class VTFCodec implements ImageCodec<VTFEncodeOptions> {
	readonly name = 'VTF'
	readonly extensions = ['.vtf']
	readonly mimeTypes = ['image/x-vtf']

	canDecode(data: Uint8Array): boolean {
		if (data.length < 16) return false

		const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
		return view.getUint32(0, true) === VTF_MAGIC
	}

	decode(data: Uint8Array): ImageData {
		return decodeVtf(data)
	}

	encode(image: ImageData, options?: VTFEncodeOptions): Uint8Array {
		return encodeVtf(image, options)
	}
}
