/**
 * Y4M (YUV4MPEG2) decoder
 * Decodes Y4M video streams
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	Y4M_FRAME_MAGIC,
	Y4M_MAGIC,
	Y4mColorSpace,
	Y4mInterlace,
	type Y4mColorSpaceType,
	type Y4mFrame,
	type Y4mHeader,
	type Y4mInfo,
	type Y4mInterlaceType,
	type Y4mVideo,
} from './types'

/**
 * Check if data is a Y4M file
 */
export function isY4m(data: Uint8Array): boolean {
	if (data.length < 10) return false
	const magic = String.fromCharCode(...data.slice(0, 10))
	return magic.startsWith(Y4M_MAGIC)
}

/**
 * Parse Y4M header
 */
export function parseY4mHeader(data: Uint8Array): Y4mHeader {
	if (!isY4m(data)) {
		throw new Error('Invalid Y4M: bad magic number')
	}

	// Find header end (newline)
	let headerEnd = 10
	while (headerEnd < data.length && data[headerEnd] !== 0x0a) {
		headerEnd++
	}

	const headerStr = String.fromCharCode(...data.slice(0, headerEnd))
	const parts = headerStr.split(' ')

	// Default values
	let width = 0
	let height = 0
	let frameRateNum = 30
	let frameRateDen = 1
	let interlace: Y4mInterlaceType = Y4mInterlace.PROGRESSIVE
	let aspectNum = 1
	let aspectDen = 1
	let colorSpace: Y4mColorSpaceType = Y4mColorSpace.C420

	// Parse parameters
	for (const part of parts.slice(1)) {
		const tag = part[0]
		const value = part.slice(1)

		switch (tag) {
			case 'W':
				width = parseInt(value, 10)
				break
			case 'H':
				height = parseInt(value, 10)
				break
			case 'F': {
				const [num, den] = value.split(':')
				frameRateNum = parseInt(num!, 10)
				frameRateDen = parseInt(den!, 10)
				break
			}
			case 'I':
				interlace = value as Y4mInterlaceType
				break
			case 'A': {
				const [anum, aden] = value.split(':')
				aspectNum = parseInt(anum!, 10)
				aspectDen = parseInt(aden!, 10)
				break
			}
			case 'C':
				// Color space is the full tag (e.g., "C420", "C422")
				colorSpace = part as Y4mColorSpaceType
				break
		}
	}

	if (width === 0 || height === 0) {
		throw new Error('Invalid Y4M: missing width or height')
	}

	return {
		width,
		height,
		frameRateNum,
		frameRateDen,
		interlace,
		aspectNum,
		aspectDen,
		colorSpace,
	}
}

/**
 * Parse Y4M info
 */
export function parseY4mInfo(data: Uint8Array): Y4mInfo {
	const header = parseY4mHeader(data)
	const frameSize = getFrameSize(header.width, header.height, header.colorSpace)

	// Count frames
	let frameCount = 0
	let offset = findFirstFrame(data)

	while (offset < data.length) {
		// Skip FRAME header
		while (offset < data.length && data[offset] !== 0x0a) {
			offset++
		}
		offset++ // Skip newline

		if (offset + frameSize <= data.length) {
			frameCount++
			offset += frameSize
		} else {
			break
		}
	}

	const frameRate = header.frameRateNum / header.frameRateDen

	return {
		width: header.width,
		height: header.height,
		frameRate,
		frameCount,
		duration: frameCount / frameRate,
		colorSpace: header.colorSpace,
		isInterlaced: header.interlace !== Y4mInterlace.PROGRESSIVE,
	}
}

/**
 * Decode Y4M video
 */
export function decodeY4m(data: Uint8Array): Y4mVideo {
	const header = parseY4mHeader(data)
	const frames: Y4mFrame[] = []
	const frameSize = getFrameSize(header.width, header.height, header.colorSpace)

	let offset = findFirstFrame(data)

	while (offset < data.length) {
		// Skip FRAME header
		const frameStart = offset
		while (offset < data.length && data[offset] !== 0x0a) {
			offset++
		}
		offset++ // Skip newline

		if (offset + frameSize > data.length) break

		const frame = parseFrame(data, offset, header.width, header.height, header.colorSpace)
		frames.push(frame)
		offset += frameSize
	}

	return { header, frames }
}

/**
 * Decode Y4M to RGBA frames
 */
export function decodeY4mFrames(data: Uint8Array): ImageData[] {
	const video = decodeY4m(data)
	return video.frames.map((frame) => frameToRgba(frame, video.header))
}

/**
 * Get a specific frame as RGBA
 */
export function decodeY4mFrame(data: Uint8Array, frameIndex: number): ImageData {
	const video = decodeY4m(data)

	if (frameIndex < 0 || frameIndex >= video.frames.length) {
		throw new Error(`Invalid frame index: ${frameIndex}`)
	}

	return frameToRgba(video.frames[frameIndex]!, video.header)
}

/**
 * Find first FRAME marker
 */
function findFirstFrame(data: Uint8Array): number {
	// Skip header line
	let offset = 10
	while (offset < data.length && data[offset] !== 0x0a) {
		offset++
	}
	offset++ // Skip newline
	return offset
}

/**
 * Get frame data size for color space
 */
function getFrameSize(width: number, height: number, colorSpace: Y4mColorSpaceType): number {
	const ySize = width * height

	switch (colorSpace) {
		case Y4mColorSpace.CMONO:
			return ySize
		case Y4mColorSpace.C420:
		case Y4mColorSpace.C420JPEG:
		case Y4mColorSpace.C420MPEG2:
		case Y4mColorSpace.C420PALDV:
			return ySize + (ySize >> 1) // Y + U/4 + V/4
		case Y4mColorSpace.C422:
			return ySize * 2 // Y + U/2 + V/2
		case Y4mColorSpace.C444:
			return ySize * 3 // Y + U + V
		default:
			return ySize + (ySize >> 1)
	}
}

/**
 * Parse frame data
 */
function parseFrame(
	data: Uint8Array,
	offset: number,
	width: number,
	height: number,
	colorSpace: Y4mColorSpaceType
): Y4mFrame {
	const ySize = width * height

	const y = data.slice(offset, offset + ySize)
	let u: Uint8Array
	let v: Uint8Array

	switch (colorSpace) {
		case Y4mColorSpace.CMONO:
			u = new Uint8Array(0)
			v = new Uint8Array(0)
			break
		case Y4mColorSpace.C420:
		case Y4mColorSpace.C420JPEG:
		case Y4mColorSpace.C420MPEG2:
		case Y4mColorSpace.C420PALDV: {
			const uvSize = ySize >> 2
			u = data.slice(offset + ySize, offset + ySize + uvSize)
			v = data.slice(offset + ySize + uvSize, offset + ySize + uvSize * 2)
			break
		}
		case Y4mColorSpace.C422: {
			const uvSize = ySize >> 1
			u = data.slice(offset + ySize, offset + ySize + uvSize)
			v = data.slice(offset + ySize + uvSize, offset + ySize + uvSize * 2)
			break
		}
		case Y4mColorSpace.C444:
			u = data.slice(offset + ySize, offset + ySize * 2)
			v = data.slice(offset + ySize * 2, offset + ySize * 3)
			break
		default: {
			const uvSize = ySize >> 2
			u = data.slice(offset + ySize, offset + ySize + uvSize)
			v = data.slice(offset + ySize + uvSize, offset + ySize + uvSize * 2)
		}
	}

	return { y, u, v }
}

/**
 * Convert YUV frame to RGBA
 */
function frameToRgba(frame: Y4mFrame, header: Y4mHeader): ImageData {
	const { width, height, colorSpace } = header
	const data = new Uint8Array(width * height * 4)

	for (let py = 0; py < height; py++) {
		for (let px = 0; px < width; px++) {
			const yIdx = py * width + px
			const y = frame.y[yIdx]!

			let u: number
			let v: number

			switch (colorSpace) {
				case Y4mColorSpace.CMONO:
					u = 128
					v = 128
					break
				case Y4mColorSpace.C420:
				case Y4mColorSpace.C420JPEG:
				case Y4mColorSpace.C420MPEG2:
				case Y4mColorSpace.C420PALDV: {
					const uvWidth = width >> 1
					const uvX = px >> 1
					const uvY = py >> 1
					const uvIdx = uvY * uvWidth + uvX
					u = frame.u[uvIdx] ?? 128
					v = frame.v[uvIdx] ?? 128
					break
				}
				case Y4mColorSpace.C422: {
					const uvWidth = width >> 1
					const uvX = px >> 1
					const uvIdx = py * uvWidth + uvX
					u = frame.u[uvIdx] ?? 128
					v = frame.v[uvIdx] ?? 128
					break
				}
				case Y4mColorSpace.C444:
					u = frame.u[yIdx] ?? 128
					v = frame.v[yIdx] ?? 128
					break
				default:
					u = 128
					v = 128
			}

			// BT.601 YUV to RGB
			const [r, g, b] = yuvToRgb(y, u, v)

			const outIdx = (py * width + px) * 4
			data[outIdx] = r
			data[outIdx + 1] = g
			data[outIdx + 2] = b
			data[outIdx + 3] = 255
		}
	}

	return { width, height, data }
}

/**
 * YUV to RGB conversion (BT.601)
 */
function yuvToRgb(y: number, u: number, v: number): [number, number, number] {
	const yy = y - 16
	const uu = u - 128
	const vv = v - 128

	let r = Math.round(1.164 * yy + 1.596 * vv)
	let g = Math.round(1.164 * yy - 0.392 * uu - 0.813 * vv)
	let b = Math.round(1.164 * yy + 2.017 * uu)

	return [clamp(r), clamp(g), clamp(b)]
}

function clamp(v: number): number {
	return Math.max(0, Math.min(255, v))
}
