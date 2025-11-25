/**
 * Raw YUV video decoder
 * Decodes uncompressed YUV video frames
 */

import type { ImageData } from '@mconv/core'
import { YuvFormat, type YuvDecodeOptions, type YuvFormatType, type YuvFrame, type YuvInfo, type YuvStream } from './types'

/**
 * Get frame size in bytes for a YUV format
 */
export function getYuvFrameSize(width: number, height: number, format: YuvFormatType): number {
	switch (format) {
		case YuvFormat.I420:
		case YuvFormat.YV12:
		case YuvFormat.NV12:
		case YuvFormat.NV21:
			// 4:2:0 - Y full, U and V quarter size each
			return width * height + (width / 2) * (height / 2) * 2
		case YuvFormat.YUYV:
		case YuvFormat.UYVY:
			// 4:2:2 packed - 2 bytes per pixel
			return width * height * 2
		case YuvFormat.YUV444:
			// 4:4:4 - full resolution for all planes
			return width * height * 3
		default:
			return width * height * 1.5 // Default to I420
	}
}

/**
 * Parse YUV stream info
 */
export function parseYuvInfo(data: Uint8Array, options: YuvDecodeOptions): YuvInfo {
	const { width, height, format = YuvFormat.I420 } = options
	const frameSize = getYuvFrameSize(width, height, format)
	const frameCount = Math.floor(data.length / frameSize)

	return {
		width,
		height,
		format,
		frameCount,
		frameSize,
	}
}

/**
 * Decode YUV stream to frames
 */
export function decodeYuv(data: Uint8Array, options: YuvDecodeOptions): YuvStream {
	const info = parseYuvInfo(data, options)
	const frames: YuvFrame[] = []

	for (let i = 0; i < info.frameCount; i++) {
		const offset = i * info.frameSize
		const frameData = data.slice(offset, offset + info.frameSize)

		frames.push({
			index: i,
			data: frameData,
		})
	}

	return { info, frames }
}

/**
 * Decode single YUV frame to RGBA
 */
export function decodeYuvFrame(data: Uint8Array, options: YuvDecodeOptions): ImageData {
	const { width, height, format = YuvFormat.I420 } = options

	switch (format) {
		case YuvFormat.I420:
			return decodeI420(data, width, height)
		case YuvFormat.YV12:
			return decodeYV12(data, width, height)
		case YuvFormat.NV12:
			return decodeNV12(data, width, height)
		case YuvFormat.NV21:
			return decodeNV21(data, width, height)
		case YuvFormat.YUYV:
			return decodeYUYV(data, width, height)
		case YuvFormat.UYVY:
			return decodeUYVY(data, width, height)
		case YuvFormat.YUV444:
			return decodeYUV444(data, width, height)
		default:
			return decodeI420(data, width, height)
	}
}

/**
 * Convert YUV frame to RGBA ImageData
 */
export function yuvFrameToImage(frame: YuvFrame, info: YuvInfo): ImageData {
	if (frame.image) return frame.image

	const image = decodeYuvFrame(frame.data, {
		width: info.width,
		height: info.height,
		format: info.format,
	})

	frame.image = image
	return image
}

// YUV to RGB conversion (BT.601)
function yuvToRgb(y: number, u: number, v: number): [number, number, number] {
	const yy = y - 16
	const uu = u - 128
	const vv = v - 128

	let r = Math.round(1.164 * yy + 1.596 * vv)
	let g = Math.round(1.164 * yy - 0.392 * uu - 0.813 * vv)
	let b = Math.round(1.164 * yy + 2.017 * uu)

	r = Math.max(0, Math.min(255, r))
	g = Math.max(0, Math.min(255, g))
	b = Math.max(0, Math.min(255, b))

	return [r, g, b]
}

// Decode I420 (planar YUV 4:2:0, Y-U-V order)
function decodeI420(data: Uint8Array, width: number, height: number): ImageData {
	const output = new Uint8Array(width * height * 4)
	const yPlane = 0
	const uPlane = width * height
	const vPlane = uPlane + (width / 2) * (height / 2)

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const yIdx = j * width + i
			const uvIdx = Math.floor(j / 2) * (width / 2) + Math.floor(i / 2)

			const y = data[yPlane + yIdx]!
			const u = data[uPlane + uvIdx]!
			const v = data[vPlane + uvIdx]!

			const [r, g, b] = yuvToRgb(y, u, v)
			const outIdx = (j * width + i) * 4
			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

// Decode YV12 (planar YUV 4:2:0, Y-V-U order)
function decodeYV12(data: Uint8Array, width: number, height: number): ImageData {
	const output = new Uint8Array(width * height * 4)
	const yPlane = 0
	const vPlane = width * height
	const uPlane = vPlane + (width / 2) * (height / 2)

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const yIdx = j * width + i
			const uvIdx = Math.floor(j / 2) * (width / 2) + Math.floor(i / 2)

			const y = data[yPlane + yIdx]!
			const u = data[uPlane + uvIdx]!
			const v = data[vPlane + uvIdx]!

			const [r, g, b] = yuvToRgb(y, u, v)
			const outIdx = (j * width + i) * 4
			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

// Decode NV12 (semi-planar YUV 4:2:0, Y plane + interleaved UV)
function decodeNV12(data: Uint8Array, width: number, height: number): ImageData {
	const output = new Uint8Array(width * height * 4)
	const yPlane = 0
	const uvPlane = width * height

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const yIdx = j * width + i
			const uvIdx = Math.floor(j / 2) * width + (Math.floor(i / 2) * 2)

			const y = data[yPlane + yIdx]!
			const u = data[uvPlane + uvIdx]!
			const v = data[uvPlane + uvIdx + 1]!

			const [r, g, b] = yuvToRgb(y, u, v)
			const outIdx = (j * width + i) * 4
			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

// Decode NV21 (semi-planar YUV 4:2:0, Y plane + interleaved VU)
function decodeNV21(data: Uint8Array, width: number, height: number): ImageData {
	const output = new Uint8Array(width * height * 4)
	const yPlane = 0
	const vuPlane = width * height

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const yIdx = j * width + i
			const vuIdx = Math.floor(j / 2) * width + (Math.floor(i / 2) * 2)

			const y = data[yPlane + yIdx]!
			const v = data[vuPlane + vuIdx]!
			const u = data[vuPlane + vuIdx + 1]!

			const [r, g, b] = yuvToRgb(y, u, v)
			const outIdx = (j * width + i) * 4
			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

// Decode YUYV (packed YUV 4:2:2)
function decodeYUYV(data: Uint8Array, width: number, height: number): ImageData {
	const output = new Uint8Array(width * height * 4)

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i += 2) {
			const idx = (j * width + i) * 2
			const y0 = data[idx]!
			const u = data[idx + 1]!
			const y1 = data[idx + 2]!
			const v = data[idx + 3]!

			const [r0, g0, b0] = yuvToRgb(y0, u, v)
			const [r1, g1, b1] = yuvToRgb(y1, u, v)

			const outIdx0 = (j * width + i) * 4
			output[outIdx0] = r0
			output[outIdx0 + 1] = g0
			output[outIdx0 + 2] = b0
			output[outIdx0 + 3] = 255

			const outIdx1 = (j * width + i + 1) * 4
			output[outIdx1] = r1
			output[outIdx1 + 1] = g1
			output[outIdx1 + 2] = b1
			output[outIdx1 + 3] = 255
		}
	}

	return { width, height, data: output }
}

// Decode UYVY (packed YUV 4:2:2)
function decodeUYVY(data: Uint8Array, width: number, height: number): ImageData {
	const output = new Uint8Array(width * height * 4)

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i += 2) {
			const idx = (j * width + i) * 2
			const u = data[idx]!
			const y0 = data[idx + 1]!
			const v = data[idx + 2]!
			const y1 = data[idx + 3]!

			const [r0, g0, b0] = yuvToRgb(y0, u, v)
			const [r1, g1, b1] = yuvToRgb(y1, u, v)

			const outIdx0 = (j * width + i) * 4
			output[outIdx0] = r0
			output[outIdx0 + 1] = g0
			output[outIdx0 + 2] = b0
			output[outIdx0 + 3] = 255

			const outIdx1 = (j * width + i + 1) * 4
			output[outIdx1] = r1
			output[outIdx1 + 1] = g1
			output[outIdx1 + 2] = b1
			output[outIdx1 + 3] = 255
		}
	}

	return { width, height, data: output }
}

// Decode YUV444 (planar YUV 4:4:4)
function decodeYUV444(data: Uint8Array, width: number, height: number): ImageData {
	const output = new Uint8Array(width * height * 4)
	const planeSize = width * height

	for (let j = 0; j < height; j++) {
		for (let i = 0; i < width; i++) {
			const idx = j * width + i
			const y = data[idx]!
			const u = data[planeSize + idx]!
			const v = data[planeSize * 2 + idx]!

			const [r, g, b] = yuvToRgb(y, u, v)
			const outIdx = idx * 4
			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}
