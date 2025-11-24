import type { ImageData, ImageFormat, ResizeOptions } from '@mconv/core'
import { detectFormat, isImageFormat } from '@mconv/core'
import { loadImage, saveImage } from './image'

/**
 * Conversion options
 */
export interface ConvertOptions {
	/** Output format */
	format?: ImageFormat
	/** Resize options */
	resize?: ResizeOptions
	/** Output quality (0-100) */
	quality?: number
}

/**
 * Convert image between formats with optional transformations
 */
export async function convert(
	input: Uint8Array,
	options: ConvertOptions = {}
): Promise<Uint8Array> {
	// Detect input format
	const inputFormat = detectFormat(input)
	if (!inputFormat || !isImageFormat(inputFormat)) {
		throw new Error('Unknown or unsupported input format')
	}

	// Default output format to input format
	const outputFormat = options.format ?? inputFormat

	// Decode
	let image: ImageData = await loadImage(input)

	// Apply transformations
	if (options.resize) {
		image = resize(image, options.resize)
	}

	// Encode
	return saveImage(image, outputFormat, { quality: options.quality })
}

/**
 * Resize image (pure JS implementation)
 */
function resize(image: ImageData, options: ResizeOptions): ImageData {
	const { width: srcWidth, height: srcHeight, data: srcData } = image

	// Calculate target dimensions
	let targetWidth = options.width ?? srcWidth
	let targetHeight = options.height ?? srcHeight

	const fit = options.fit ?? 'fill'

	if (fit !== 'fill' && options.width && options.height) {
		const srcAspect = srcWidth / srcHeight
		const targetAspect = options.width / options.height

		switch (fit) {
			case 'contain':
				if (srcAspect > targetAspect) {
					targetHeight = Math.round(options.width / srcAspect)
				} else {
					targetWidth = Math.round(options.height * srcAspect)
				}
				break

			case 'cover':
				if (srcAspect > targetAspect) {
					targetWidth = Math.round(options.height * srcAspect)
				} else {
					targetHeight = Math.round(options.width / srcAspect)
				}
				break

			case 'inside':
				if (srcWidth > options.width || srcHeight > options.height) {
					if (srcAspect > targetAspect) {
						targetWidth = options.width
						targetHeight = Math.round(options.width / srcAspect)
					} else {
						targetHeight = options.height
						targetWidth = Math.round(options.height * srcAspect)
					}
				} else {
					targetWidth = srcWidth
					targetHeight = srcHeight
				}
				break

			case 'outside':
				if (srcWidth < options.width || srcHeight < options.height) {
					if (srcAspect > targetAspect) {
						targetHeight = options.height
						targetWidth = Math.round(options.height * srcAspect)
					} else {
						targetWidth = options.width
						targetHeight = Math.round(options.width / srcAspect)
					}
				} else {
					targetWidth = srcWidth
					targetHeight = srcHeight
				}
				break
		}
	}

	if (targetWidth === srcWidth && targetHeight === srcHeight) {
		return image // No resize needed
	}

	const kernel = options.kernel ?? 'bilinear'
	const dstData = new Uint8Array(targetWidth * targetHeight * 4)

	// Scale factors
	const xScale = srcWidth / targetWidth
	const yScale = srcHeight / targetHeight

	for (let dstY = 0; dstY < targetHeight; dstY++) {
		for (let dstX = 0; dstX < targetWidth; dstX++) {
			const srcX = dstX * xScale
			const srcY = dstY * yScale

			const dstIdx = (dstY * targetWidth + dstX) * 4
			let r: number
			let g: number
			let b: number
			let a: number

			switch (kernel) {
				case 'nearest': {
					const nearX = Math.floor(srcX)
					const nearY = Math.floor(srcY)
					const srcIdx = (nearY * srcWidth + nearX) * 4
					r = srcData[srcIdx]!
					g = srcData[srcIdx + 1]!
					b = srcData[srcIdx + 2]!
					a = srcData[srcIdx + 3]!
					break
				}
				default: {
					const x0 = Math.floor(srcX)
					const y0 = Math.floor(srcY)
					const x1 = Math.min(x0 + 1, srcWidth - 1)
					const y1 = Math.min(y0 + 1, srcHeight - 1)

					const xFrac = srcX - x0
					const yFrac = srcY - y0

					const idx00 = (y0 * srcWidth + x0) * 4
					const idx10 = (y0 * srcWidth + x1) * 4
					const idx01 = (y1 * srcWidth + x0) * 4
					const idx11 = (y1 * srcWidth + x1) * 4

					r = bilinearInterp(
						srcData[idx00]!,
						srcData[idx10]!,
						srcData[idx01]!,
						srcData[idx11]!,
						xFrac,
						yFrac
					)
					g = bilinearInterp(
						srcData[idx00 + 1]!,
						srcData[idx10 + 1]!,
						srcData[idx01 + 1]!,
						srcData[idx11 + 1]!,
						xFrac,
						yFrac
					)
					b = bilinearInterp(
						srcData[idx00 + 2]!,
						srcData[idx10 + 2]!,
						srcData[idx01 + 2]!,
						srcData[idx11 + 2]!,
						xFrac,
						yFrac
					)
					a = bilinearInterp(
						srcData[idx00 + 3]!,
						srcData[idx10 + 3]!,
						srcData[idx01 + 3]!,
						srcData[idx11 + 3]!,
						xFrac,
						yFrac
					)
					break
				}
			}

			dstData[dstIdx] = r
			dstData[dstIdx + 1] = g
			dstData[dstIdx + 2] = b
			dstData[dstIdx + 3] = a
		}
	}

	return {
		width: targetWidth,
		height: targetHeight,
		data: dstData,
	}
}

/**
 * Bilinear interpolation
 */
function bilinearInterp(
	v00: number,
	v10: number,
	v01: number,
	v11: number,
	xFrac: number,
	yFrac: number
): number {
	const top = v00 + (v10 - v00) * xFrac
	const bottom = v01 + (v11 - v01) * xFrac
	return Math.round(top + (bottom - top) * yFrac)
}
