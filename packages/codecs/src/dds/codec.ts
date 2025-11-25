/**
 * DDS Codec implementation
 */

import type { ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeDds } from './decoder'
import { encodeDds } from './encoder'
import type { DDSEncodeOptions } from './types'

export class DDSCodec implements ImageCodec {
	readonly name = 'DDS'
	readonly mimeTypes = ['image/vnd-ms.dds', 'image/x-dds']
	readonly extensions = ['.dds']

	private options: DDSEncodeOptions

	constructor(options: DDSEncodeOptions = {}) {
		this.options = options
	}

	canDecode(data: Uint8Array): boolean {
		// Check for 'DDS ' magic number
		if (data.length < 4) return false
		return (
			data[0] === 0x44 && // D
			data[1] === 0x44 && // D
			data[2] === 0x53 && // S
			data[3] === 0x20 // ' '
		)
	}

	decode(data: Uint8Array): ImageData {
		return decodeDds(data)
	}

	encode(image: ImageData): Uint8Array {
		return encodeDds(image, this.options)
	}
}
