import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeDicom } from './decoder'
import { encodeDicom } from './encoder'

/**
 * DICOM codec implementation
 */
export const DicomCodec: ImageCodec = {
	format: 'dicom',

	decode(data: Uint8Array): ImageData {
		return decodeDicom(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeDicom(image, options)
	},
}
