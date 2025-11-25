import {
	BmpCodec,
	GifCodec,
	HdrCodec,
	IcoCodec,
	JpegCodec,
	PbmCodec,
	PcxCodec,
	PgmCodec,
	PngCodec,
	PpmCodec,
	QoiCodec,
	TgaCodec,
	TiffCodec,
	WebPCodec,
} from '@mconv/codecs'
import type { ImageData, ImageFormat } from '@mconv/core'
import { detectFormat } from '@mconv/core'
import { getBackend, getWasmModule } from './backend'

/**
 * Registry of available codecs
 */
const codecs = {
	bmp: BmpCodec,
	gif: GifCodec,
	hdr: HdrCodec,
	ico: IcoCodec,
	jpeg: JpegCodec,
	pbm: PbmCodec,
	pcx: PcxCodec,
	pgm: PgmCodec,
	png: PngCodec,
	ppm: PpmCodec,
	qoi: QoiCodec,
	tga: TgaCodec,
	tiff: TiffCodec,
	webp: WebPCodec,
} as const

type SupportedFormat = keyof typeof codecs

/**
 * Load image from binary data
 */
export async function loadImage(data: Uint8Array): Promise<ImageData> {
	const format = detectFormat(data)

	if (!format) {
		throw new Error('Unknown image format')
	}

	if (!(format in codecs)) {
		throw new Error(`Unsupported format: ${format}`)
	}

	const backend = await getBackend()

	if (backend === 'wasm') {
		const wasm = getWasmModule() as Record<string, unknown> | null
		if (wasm) {
			// Try WASM decoder
			const decoderName = `decode${format.charAt(0).toUpperCase() + format.slice(1)}`
			const decoder = wasm[decoderName] as ((data: Uint8Array) => Uint8Array) | undefined
			if (decoder) {
				const result = decoder(data)
				// WASM returns [width (4 bytes), height (4 bytes), rgba_data...]
				const width = result[0]! | (result[1]! << 8) | (result[2]! << 16) | (result[3]! << 24)
				const height = result[4]! | (result[5]! << 8) | (result[6]! << 16) | (result[7]! << 24)
				return {
					width,
					height,
					data: result.slice(8),
				}
			}
		}
	}

	// JS fallback
	const codec = codecs[format as SupportedFormat]
	return codec.decode(data)
}

/**
 * Save image to binary data
 */
export async function saveImage(
	image: ImageData,
	format: ImageFormat,
	options?: { quality?: number }
): Promise<Uint8Array> {
	if (!(format in codecs)) {
		throw new Error(`Unsupported format: ${format}`)
	}

	const backend = await getBackend()

	if (backend === 'wasm') {
		const wasm = getWasmModule() as Record<string, unknown> | null
		if (wasm) {
			// Try WASM encoder
			const encoderName = `encode${format.charAt(0).toUpperCase() + format.slice(1)}`
			const encoder = wasm[encoderName] as
				| ((width: number, height: number, data: Uint8Array) => Uint8Array)
				| undefined
			if (encoder) {
				return encoder(image.width, image.height, image.data)
			}
		}
	}

	// JS fallback
	const codec = codecs[format as SupportedFormat]
	return codec.encode(image, options)
}
