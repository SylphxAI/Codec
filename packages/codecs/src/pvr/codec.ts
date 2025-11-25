/**
 * PVR codec implementation
 */

import type { ImageCodec, ImageData } from '@mconv/core'
import { decodePvr } from './decoder'
import { encodePvr } from './encoder'
import type { PVREncodeOptions } from './types'
import { PVR3_MAGIC } from './types'

export class PVRCodec implements ImageCodec<PVREncodeOptions> {
	readonly name = 'PVR'
	readonly extensions = ['.pvr']
	readonly mimeTypes = ['image/x-pvr']

	canDecode(data: Uint8Array): boolean {
		if (data.length < 52) return false

		const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
		const magic = view.getUint32(0, true)

		return magic === PVR3_MAGIC
	}

	decode(data: Uint8Array): ImageData {
		return decodePvr(data)
	}

	encode(image: ImageData, options?: PVREncodeOptions): Uint8Array {
		return encodePvr(image, options)
	}
}
