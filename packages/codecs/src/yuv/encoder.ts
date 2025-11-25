/**
 * Raw YUV video encoder
 * Encodes images to uncompressed YUV video frames
 */

import type { ImageData } from '@sylphx/codec-core'
import { YuvFormat, type YuvEncodeOptions, type YuvFormatType, type YuvInfo, type YuvStream } from './types'
import { getYuvFrameSize } from './decoder'

/**
 * Encode images to YUV stream
 */
export function encodeYuv(images: ImageData[], options: YuvEncodeOptions = {}): Uint8Array {
	if (images.length === 0) {
		return new Uint8Array(0)
	}

	const { format = YuvFormat.I420 } = options
	const { width, height } = images[0]!
	const frameSize = getYuvFrameSize(width, height, format)

	const output = new Uint8Array(images.length * frameSize)

	for (let i = 0; i < images.length; i++) {
		const frame = encodeYuvFrame(images[i]!, options)
		output.set(frame, i * frameSize)
	}

	return output
}

/**
 * Encode single image to YUV frame
 */
export function encodeYuvFrame(image: ImageData, options: YuvEncodeOptions = {}): Uint8Array {
	const { format = YuvFormat.I420 } = options

	switch (format) {
		case YuvFormat.I420:
			return encodeI420(image)
		case YuvFormat.YV12:
			return encodeYV12(image)
		case YuvFormat.NV12:
			return encodeNV12(image)
		case YuvFormat.NV21:
			return encodeNV21(image)
		case YuvFormat.YUYV:
			return encodeYUYV(image)
		case YuvFormat.UYVY:
			return encodeUYVY(image)
		case YuvFormat.YUV444:
			return encodeYUV444(image)
		default:
			return encodeI420(image)
	}
}

/**
 * Create YUV stream object from images
 */
export function createYuvStream(images: ImageData[], options: YuvEncodeOptions = {}): YuvStream {
	if (images.length === 0) {
		return {
			info: {
				width: 0,
				height: 0,
				format: options.format || YuvFormat.I420,
				frameCount: 0,
				frameSize: 0,
			},
			frames: [],
		}
	}

	const { format = YuvFormat.I420 } = options
	const { width, height } = images[0]!
	const frameSize = getYuvFrameSize(width, height, format)

	const info: YuvInfo = {
		width,
		height,
		format,
		frameCount: images.length,
		frameSize,
	}

	const frames = images.map((image, index) => ({
		index,
		data: encodeYuvFrame(image, options),
		image,
	}))

	return { info, frames }
}

// RGB to YUV conversion (BT.601)
function rgbToYuv(r: number, g: number, b: number): [number, number, number] {
	const y = Math.round(0.257 * r + 0.504 * g + 0.098 * b + 16)
	const u = Math.round(-0.148 * r - 0.291 * g + 0.439 * b + 128)
	const v = Math.round(0.439 * r - 0.368 * g - 0.071 * b + 128)

	return [
		Math.max(0, Math.min(255, y)),
		Math.max(0, Math.min(255, u)),
		Math.max(0, Math.min(255, v)),
	]
}

// Encode to I420 (planar YUV 4:2:0, Y-U-V order)
function encodeI420(image: ImageData): Uint8Array {
	const { width, height, data } = image
	const frameSize = width * height + (width / 2) * (height / 2) * 2
	const output = new Uint8Array(frameSize)

	const yPlane = 0
	const uPlane = width * height
	const vPlane = uPlane + (width / 2) * (height / 2)

	// First pass: write Y plane
	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const idx = (j * width + i) * 4
			const [y] = rgbToYuv(data[idx]!, data[idx + 1]!, data[idx + 2]!)
			output[yPlane + j * width + i] = y
		}
	}

	// Second pass: write U and V planes (subsampled)
	for (let j = 0; j < height; j += 2) {
		for (let i = 0; i < width; i += 2) {
			// Average 2x2 block for U and V
			let sumU = 0
			let sumV = 0
			for (let dj = 0; dj < 2; dj++) {
				for (let di = 0; di < 2; di++) {
					const idx = ((j + dj) * width + (i + di)) * 4
					const [, u, v] = rgbToYuv(data[idx]!, data[idx + 1]!, data[idx + 2]!)
					sumU += u
					sumV += v
				}
			}

			const uvIdx = (j / 2) * (width / 2) + (i / 2)
			output[uPlane + uvIdx] = Math.round(sumU / 4)
			output[vPlane + uvIdx] = Math.round(sumV / 4)
		}
	}

	return output
}

// Encode to YV12 (planar YUV 4:2:0, Y-V-U order)
function encodeYV12(image: ImageData): Uint8Array {
	const { width, height, data } = image
	const frameSize = width * height + (width / 2) * (height / 2) * 2
	const output = new Uint8Array(frameSize)

	const yPlane = 0
	const vPlane = width * height
	const uPlane = vPlane + (width / 2) * (height / 2)

	// First pass: write Y plane
	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const idx = (j * width + i) * 4
			const [y] = rgbToYuv(data[idx]!, data[idx + 1]!, data[idx + 2]!)
			output[yPlane + j * width + i] = y
		}
	}

	// Second pass: write U and V planes (subsampled)
	for (let j = 0; j < height; j += 2) {
		for (let i = 0; i < width; i += 2) {
			let sumU = 0
			let sumV = 0
			for (let dj = 0; dj < 2; dj++) {
				for (let di = 0; di < 2; di++) {
					const idx = ((j + dj) * width + (i + di)) * 4
					const [, u, v] = rgbToYuv(data[idx]!, data[idx + 1]!, data[idx + 2]!)
					sumU += u
					sumV += v
				}
			}

			const uvIdx = (j / 2) * (width / 2) + (i / 2)
			output[uPlane + uvIdx] = Math.round(sumU / 4)
			output[vPlane + uvIdx] = Math.round(sumV / 4)
		}
	}

	return output
}

// Encode to NV12 (semi-planar YUV 4:2:0, Y + interleaved UV)
function encodeNV12(image: ImageData): Uint8Array {
	const { width, height, data } = image
	const frameSize = width * height + (width / 2) * (height / 2) * 2
	const output = new Uint8Array(frameSize)

	const yPlane = 0
	const uvPlane = width * height

	// First pass: write Y plane
	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const idx = (j * width + i) * 4
			const [y] = rgbToYuv(data[idx]!, data[idx + 1]!, data[idx + 2]!)
			output[yPlane + j * width + i] = y
		}
	}

	// Second pass: write interleaved UV
	for (let j = 0; j < height; j += 2) {
		for (let i = 0; i < width; i += 2) {
			let sumU = 0
			let sumV = 0
			for (let dj = 0; dj < 2; dj++) {
				for (let di = 0; di < 2; di++) {
					const idx = ((j + dj) * width + (i + di)) * 4
					const [, u, v] = rgbToYuv(data[idx]!, data[idx + 1]!, data[idx + 2]!)
					sumU += u
					sumV += v
				}
			}

			const uvIdx = (j / 2) * width + i
			output[uvPlane + uvIdx] = Math.round(sumU / 4)
			output[uvPlane + uvIdx + 1] = Math.round(sumV / 4)
		}
	}

	return output
}

// Encode to NV21 (semi-planar YUV 4:2:0, Y + interleaved VU)
function encodeNV21(image: ImageData): Uint8Array {
	const { width, height, data } = image
	const frameSize = width * height + (width / 2) * (height / 2) * 2
	const output = new Uint8Array(frameSize)

	const yPlane = 0
	const vuPlane = width * height

	// First pass: write Y plane
	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const idx = (j * width + i) * 4
			const [y] = rgbToYuv(data[idx]!, data[idx + 1]!, data[idx + 2]!)
			output[yPlane + j * width + i] = y
		}
	}

	// Second pass: write interleaved VU
	for (let j = 0; j < height; j += 2) {
		for (let i = 0; i < width; i += 2) {
			let sumU = 0
			let sumV = 0
			for (let dj = 0; dj < 2; dj++) {
				for (let di = 0; di < 2; di++) {
					const idx = ((j + dj) * width + (i + di)) * 4
					const [, u, v] = rgbToYuv(data[idx]!, data[idx + 1]!, data[idx + 2]!)
					sumU += u
					sumV += v
				}
			}

			const vuIdx = (j / 2) * width + i
			output[vuPlane + vuIdx] = Math.round(sumV / 4)
			output[vuPlane + vuIdx + 1] = Math.round(sumU / 4)
		}
	}

	return output
}

// Encode to YUYV (packed YUV 4:2:2)
function encodeYUYV(image: ImageData): Uint8Array {
	const { width, height, data } = image
	const output = new Uint8Array(width * height * 2)

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i += 2) {
			const idx0 = (j * width + i) * 4
			const idx1 = (j * width + i + 1) * 4

			const [y0, u0, v0] = rgbToYuv(data[idx0]!, data[idx0 + 1]!, data[idx0 + 2]!)
			const [y1, u1, v1] = rgbToYuv(data[idx1]!, data[idx1 + 1]!, data[idx1 + 2]!)

			const outIdx = (j * width + i) * 2
			output[outIdx] = y0
			output[outIdx + 1] = Math.round((u0 + u1) / 2)
			output[outIdx + 2] = y1
			output[outIdx + 3] = Math.round((v0 + v1) / 2)
		}
	}

	return output
}

// Encode to UYVY (packed YUV 4:2:2)
function encodeUYVY(image: ImageData): Uint8Array {
	const { width, height, data } = image
	const output = new Uint8Array(width * height * 2)

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i += 2) {
			const idx0 = (j * width + i) * 4
			const idx1 = (j * width + i + 1) * 4

			const [y0, u0, v0] = rgbToYuv(data[idx0]!, data[idx0 + 1]!, data[idx0 + 2]!)
			const [y1, u1, v1] = rgbToYuv(data[idx1]!, data[idx1 + 1]!, data[idx1 + 2]!)

			const outIdx = (j * width + i) * 2
			output[outIdx] = Math.round((u0 + u1) / 2)
			output[outIdx + 1] = y0
			output[outIdx + 2] = Math.round((v0 + v1) / 2)
			output[outIdx + 3] = y1
		}
	}

	return output
}

// Encode to YUV444 (planar YUV 4:4:4)
function encodeYUV444(image: ImageData): Uint8Array {
	const { width, height, data } = image
	const planeSize = width * height
	const output = new Uint8Array(planeSize * 3)

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const idx = (j * width + i) * 4
			const [y, u, v] = rgbToYuv(data[idx]!, data[idx + 1]!, data[idx + 2]!)
			const outIdx = j * width + i
			output[outIdx] = y
			output[planeSize + outIdx] = u
			output[planeSize * 2 + outIdx] = v
		}
	}

	return output
}
