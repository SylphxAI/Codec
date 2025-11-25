import type { Codec, EncodeOptions, ImageData } from '@sylphx/codec-core'
import { decodePnm } from './decoder'
import { encodePbm, encodePgm, encodePnm, encodePpm } from './encoder'

/**
 * PPM (Portable Pixmap) codec - RGB images
 */
export const PpmCodec: Codec = {
	decode(data: Uint8Array): ImageData {
		return decodePnm(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodePpm(image, options)
	},
}

/**
 * PGM (Portable Graymap) codec - Grayscale images
 */
export const PgmCodec: Codec = {
	decode(data: Uint8Array): ImageData {
		return decodePnm(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodePgm(image, options)
	},
}

/**
 * PBM (Portable Bitmap) codec - Black and white images
 */
export const PbmCodec: Codec = {
	decode(data: Uint8Array): ImageData {
		return decodePnm(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodePbm(image, options)
	},
}

/**
 * PNM (Portable Any Map) codec - Generic, outputs PPM
 */
export const PnmCodec: Codec = {
	decode(data: Uint8Array): ImageData {
		return decodePnm(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodePnm(image, options)
	},
}
