/**
 * Image resize operations
 * Supports nearest neighbor, bilinear, bicubic, and Lanczos interpolation
 */

import type { ImageData } from '@mconv/core'
import type { ResizeOptions } from './types'

/**
 * Resize image to new dimensions
 */
export function resize(
	image: ImageData,
	newWidth: number,
	newHeight: number,
	options: ResizeOptions = {}
): ImageData {
	const { method = 'bilinear', preserveAspectRatio = false, fillColor = [0, 0, 0, 0] } = options
	const { width, height, data } = image

	let targetWidth = newWidth
	let targetHeight = newHeight
	let offsetX = 0
	let offsetY = 0

	if (preserveAspectRatio) {
		const aspectRatio = width / height
		const targetAspect = newWidth / newHeight

		if (aspectRatio > targetAspect) {
			// Width limited
			targetHeight = Math.round(newWidth / aspectRatio)
			offsetY = Math.floor((newHeight - targetHeight) / 2)
		} else {
			// Height limited
			targetWidth = Math.round(newHeight * aspectRatio)
			offsetX = Math.floor((newWidth - targetWidth) / 2)
		}
	}

	const output = new Uint8Array(newWidth * newHeight * 4)

	// Fill with background color if preserving aspect ratio
	if (preserveAspectRatio) {
		for (let i = 0; i < newWidth * newHeight; i++) {
			output[i * 4] = fillColor[0]
			output[i * 4 + 1] = fillColor[1]
			output[i * 4 + 2] = fillColor[2]
			output[i * 4 + 3] = fillColor[3]
		}
	}

	// Scale factors
	const scaleX = width / targetWidth
	const scaleY = height / targetHeight

	switch (method) {
		case 'nearest':
			resizeNearest(
				data,
				output,
				width,
				height,
				targetWidth,
				targetHeight,
				offsetX,
				offsetY,
				newWidth
			)
			break
		case 'bilinear':
			resizeBilinear(
				data,
				output,
				width,
				height,
				targetWidth,
				targetHeight,
				offsetX,
				offsetY,
				newWidth
			)
			break
		case 'bicubic':
			resizeBicubic(
				data,
				output,
				width,
				height,
				targetWidth,
				targetHeight,
				offsetX,
				offsetY,
				newWidth
			)
			break
		case 'lanczos':
			resizeLanczos(
				data,
				output,
				width,
				height,
				targetWidth,
				targetHeight,
				offsetX,
				offsetY,
				newWidth
			)
			break
	}

	return { width: newWidth, height: newHeight, data: output }
}

/**
 * Nearest neighbor interpolation (fastest, pixelated)
 */
function resizeNearest(
	src: Uint8Array,
	dst: Uint8Array,
	srcW: number,
	srcH: number,
	dstW: number,
	dstH: number,
	offsetX: number,
	offsetY: number,
	outputW: number
): void {
	const scaleX = srcW / dstW
	const scaleY = srcH / dstH

	for (let y = 0; y < dstH; y++) {
		const srcY = Math.floor(y * scaleY)
		for (let x = 0; x < dstW; x++) {
			const srcX = Math.floor(x * scaleX)
			const srcIdx = (srcY * srcW + srcX) * 4
			const dstIdx = ((y + offsetY) * outputW + (x + offsetX)) * 4

			dst[dstIdx] = src[srcIdx]!
			dst[dstIdx + 1] = src[srcIdx + 1]!
			dst[dstIdx + 2] = src[srcIdx + 2]!
			dst[dstIdx + 3] = src[srcIdx + 3]!
		}
	}
}

/**
 * Bilinear interpolation (good quality, fast)
 */
function resizeBilinear(
	src: Uint8Array,
	dst: Uint8Array,
	srcW: number,
	srcH: number,
	dstW: number,
	dstH: number,
	offsetX: number,
	offsetY: number,
	outputW: number
): void {
	const scaleX = srcW / dstW
	const scaleY = srcH / dstH

	for (let y = 0; y < dstH; y++) {
		const srcY = y * scaleY
		const y0 = Math.floor(srcY)
		const y1 = Math.min(y0 + 1, srcH - 1)
		const fy = srcY - y0

		for (let x = 0; x < dstW; x++) {
			const srcX = x * scaleX
			const x0 = Math.floor(srcX)
			const x1 = Math.min(x0 + 1, srcW - 1)
			const fx = srcX - x0

			const dstIdx = ((y + offsetY) * outputW + (x + offsetX)) * 4

			for (let c = 0; c < 4; c++) {
				const v00 = src[(y0 * srcW + x0) * 4 + c]!
				const v01 = src[(y0 * srcW + x1) * 4 + c]!
				const v10 = src[(y1 * srcW + x0) * 4 + c]!
				const v11 = src[(y1 * srcW + x1) * 4 + c]!

				const v0 = v00 * (1 - fx) + v01 * fx
				const v1 = v10 * (1 - fx) + v11 * fx
				const v = v0 * (1 - fy) + v1 * fy

				dst[dstIdx + c] = Math.round(v)
			}
		}
	}
}

/**
 * Bicubic interpolation (high quality, slower)
 */
function resizeBicubic(
	src: Uint8Array,
	dst: Uint8Array,
	srcW: number,
	srcH: number,
	dstW: number,
	dstH: number,
	offsetX: number,
	offsetY: number,
	outputW: number
): void {
	const scaleX = srcW / dstW
	const scaleY = srcH / dstH

	for (let y = 0; y < dstH; y++) {
		const srcY = y * scaleY
		const y1 = Math.floor(srcY)
		const fy = srcY - y1

		for (let x = 0; x < dstW; x++) {
			const srcX = x * scaleX
			const x1 = Math.floor(srcX)
			const fx = srcX - x1

			const dstIdx = ((y + offsetY) * outputW + (x + offsetX)) * 4

			for (let c = 0; c < 4; c++) {
				let sum = 0

				for (let j = -1; j <= 2; j++) {
					const py = clamp(y1 + j, 0, srcH - 1)
					const wy = cubicWeight(j - fy)

					for (let i = -1; i <= 2; i++) {
						const px = clamp(x1 + i, 0, srcW - 1)
						const wx = cubicWeight(i - fx)
						sum += src[(py * srcW + px) * 4 + c]! * wx * wy
					}
				}

				dst[dstIdx + c] = clamp(Math.round(sum), 0, 255)
			}
		}
	}
}

/**
 * Lanczos interpolation (highest quality, slowest)
 */
function resizeLanczos(
	src: Uint8Array,
	dst: Uint8Array,
	srcW: number,
	srcH: number,
	dstW: number,
	dstH: number,
	offsetX: number,
	offsetY: number,
	outputW: number
): void {
	const scaleX = srcW / dstW
	const scaleY = srcH / dstH
	const a = 3 // Lanczos kernel size

	for (let y = 0; y < dstH; y++) {
		const srcY = y * scaleY
		const y0 = Math.floor(srcY)
		const fy = srcY - y0

		for (let x = 0; x < dstW; x++) {
			const srcX = x * scaleX
			const x0 = Math.floor(srcX)
			const fx = srcX - x0

			const dstIdx = ((y + offsetY) * outputW + (x + offsetX)) * 4

			for (let c = 0; c < 4; c++) {
				let sum = 0
				let weightSum = 0

				for (let j = -a + 1; j <= a; j++) {
					const py = clamp(y0 + j, 0, srcH - 1)
					const wy = lanczosWeight(j - fy, a)

					for (let i = -a + 1; i <= a; i++) {
						const px = clamp(x0 + i, 0, srcW - 1)
						const wx = lanczosWeight(i - fx, a)
						const w = wx * wy
						sum += src[(py * srcW + px) * 4 + c]! * w
						weightSum += w
					}
				}

				dst[dstIdx + c] = clamp(Math.round(sum / weightSum), 0, 255)
			}
		}
	}
}

function cubicWeight(x: number): number {
	const a = -0.5 // Mitchell-Netravali parameter
	const ax = Math.abs(x)

	if (ax <= 1) {
		return (a + 2) * ax * ax * ax - (a + 3) * ax * ax + 1
	}
	if (ax < 2) {
		return a * ax * ax * ax - 5 * a * ax * ax + 8 * a * ax - 4 * a
	}
	return 0
}

function lanczosWeight(x: number, a: number): number {
	if (x === 0) return 1
	if (Math.abs(x) >= a) return 0

	const pix = Math.PI * x
	return (a * Math.sin(pix) * Math.sin(pix / a)) / (pix * pix)
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}
