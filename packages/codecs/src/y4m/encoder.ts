/**
 * Y4M (YUV4MPEG2) encoder
 * Encodes video frames to Y4M format
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	Y4M_FRAME_MAGIC,
	Y4M_MAGIC,
	Y4mColorSpace,
	Y4mInterlace,
	type Y4mColorSpaceType,
	type Y4mEncodeOptions,
	type Y4mFrame,
	type Y4mHeader,
	type Y4mVideo,
} from './types'

/**
 * Encode video to Y4M
 */
export function encodeY4m(video: Y4mVideo): Uint8Array {
	const { header, frames } = video

	// Build header string
	const headerStr = buildHeaderString(header)
	const headerBytes = new TextEncoder().encode(headerStr + '\n')

	// Calculate frame size
	const frameSize = getFrameSize(header.width, header.height, header.colorSpace)
	const frameHeaderBytes = new TextEncoder().encode(Y4M_FRAME_MAGIC + '\n')

	// Calculate total size
	const totalSize = headerBytes.length + frames.length * (frameHeaderBytes.length + frameSize)

	const output = new Uint8Array(totalSize)
	let offset = 0

	// Write header
	output.set(headerBytes, offset)
	offset += headerBytes.length

	// Write frames
	for (const frame of frames) {
		output.set(frameHeaderBytes, offset)
		offset += frameHeaderBytes.length

		offset = writeFrame(output, offset, frame, header.colorSpace)
	}

	return output
}

/**
 * Encode RGBA frames to Y4M
 */
export function encodeY4mFrames(frames: ImageData[], options: Y4mEncodeOptions = {}): Uint8Array {
	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const firstFrame = frames[0]!
	const { width, height } = firstFrame

	// Parse frame rate
	let frameRateNum = 30
	let frameRateDen = 1

	if (options.frameRate) {
		if (Array.isArray(options.frameRate)) {
			;[frameRateNum, frameRateDen] = options.frameRate
		} else {
			frameRateNum = options.frameRate
			frameRateDen = 1
		}
	}

	const header: Y4mHeader = {
		width,
		height,
		frameRateNum,
		frameRateDen,
		interlace: options.interlace ?? Y4mInterlace.PROGRESSIVE,
		aspectNum: options.aspectRatio?.[0] ?? 1,
		aspectDen: options.aspectRatio?.[1] ?? 1,
		colorSpace: options.colorSpace ?? Y4mColorSpace.C420,
	}

	const y4mFrames = frames.map((frame) => rgbaToFrame(frame, header.colorSpace))

	return encodeY4m({ header, frames: y4mFrames })
}

/**
 * Build header string
 */
function buildHeaderString(header: Y4mHeader): string {
	const parts: string[] = [Y4M_MAGIC]

	parts.push(`W${header.width}`)
	parts.push(`H${header.height}`)
	parts.push(`F${header.frameRateNum}:${header.frameRateDen}`)
	parts.push(`I${header.interlace}`)
	parts.push(`A${header.aspectNum}:${header.aspectDen}`)

	// Only include color space if not default
	if (header.colorSpace !== Y4mColorSpace.C420) {
		parts.push(header.colorSpace)
	}

	return parts.join(' ')
}

/**
 * Get frame data size
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
			return ySize + (ySize >> 1)
		case Y4mColorSpace.C422:
			return ySize * 2
		case Y4mColorSpace.C444:
			return ySize * 3
		default:
			return ySize + (ySize >> 1)
	}
}

/**
 * Write frame to output
 */
function writeFrame(
	output: Uint8Array,
	offset: number,
	frame: Y4mFrame,
	colorSpace: Y4mColorSpaceType
): number {
	// Write Y plane
	output.set(frame.y, offset)
	offset += frame.y.length

	// Write U and V planes (if not mono)
	if (colorSpace !== Y4mColorSpace.CMONO) {
		output.set(frame.u, offset)
		offset += frame.u.length
		output.set(frame.v, offset)
		offset += frame.v.length
	}

	return offset
}

/**
 * Convert RGBA frame to YUV
 */
function rgbaToFrame(image: ImageData, colorSpace: Y4mColorSpaceType): Y4mFrame {
	const { width, height, data } = image
	const ySize = width * height

	const y = new Uint8Array(ySize)

	switch (colorSpace) {
		case Y4mColorSpace.CMONO: {
			// Only Y plane
			for (let i = 0; i < ySize; i++) {
				const r = data[i * 4]!
				const g = data[i * 4 + 1]!
				const b = data[i * 4 + 2]!
				y[i] = rgbToY(r, g, b)
			}
			return { y, u: new Uint8Array(0), v: new Uint8Array(0) }
		}

		case Y4mColorSpace.C420:
		case Y4mColorSpace.C420JPEG:
		case Y4mColorSpace.C420MPEG2:
		case Y4mColorSpace.C420PALDV: {
			const uvWidth = width >> 1
			const uvHeight = height >> 1
			const uvSize = uvWidth * uvHeight
			const u = new Uint8Array(uvSize)
			const v = new Uint8Array(uvSize)

			// Y plane - full resolution
			for (let i = 0; i < ySize; i++) {
				const r = data[i * 4]!
				const g = data[i * 4 + 1]!
				const b = data[i * 4 + 2]!
				y[i] = rgbToY(r, g, b)
			}

			// U and V planes - subsampled 2x2
			for (let uvY = 0; uvY < uvHeight; uvY++) {
				for (let uvX = 0; uvX < uvWidth; uvX++) {
					// Average 2x2 block
					let rSum = 0
					let gSum = 0
					let bSum = 0

					for (let dy = 0; dy < 2; dy++) {
						for (let dx = 0; dx < 2; dx++) {
							const px = uvX * 2 + dx
							const py = uvY * 2 + dy
							if (px < width && py < height) {
								const idx = (py * width + px) * 4
								rSum += data[idx]!
								gSum += data[idx + 1]!
								bSum += data[idx + 2]!
							}
						}
					}

					const rAvg = rSum >> 2
					const gAvg = gSum >> 2
					const bAvg = bSum >> 2

					const uvIdx = uvY * uvWidth + uvX
					u[uvIdx] = rgbToU(rAvg, gAvg, bAvg)
					v[uvIdx] = rgbToV(rAvg, gAvg, bAvg)
				}
			}

			return { y, u, v }
		}

		case Y4mColorSpace.C422: {
			const uvWidth = width >> 1
			const uvSize = uvWidth * height
			const u = new Uint8Array(uvSize)
			const v = new Uint8Array(uvSize)

			// Y plane - full resolution
			for (let i = 0; i < ySize; i++) {
				const r = data[i * 4]!
				const g = data[i * 4 + 1]!
				const b = data[i * 4 + 2]!
				y[i] = rgbToY(r, g, b)
			}

			// U and V planes - subsampled horizontally
			for (let py = 0; py < height; py++) {
				for (let uvX = 0; uvX < uvWidth; uvX++) {
					// Average 2 horizontal pixels
					const px1 = uvX * 2
					const px2 = Math.min(uvX * 2 + 1, width - 1)

					const idx1 = (py * width + px1) * 4
					const idx2 = (py * width + px2) * 4

					const rAvg = (data[idx1]! + data[idx2]!) >> 1
					const gAvg = (data[idx1 + 1]! + data[idx2 + 1]!) >> 1
					const bAvg = (data[idx1 + 2]! + data[idx2 + 2]!) >> 1

					const uvIdx = py * uvWidth + uvX
					u[uvIdx] = rgbToU(rAvg, gAvg, bAvg)
					v[uvIdx] = rgbToV(rAvg, gAvg, bAvg)
				}
			}

			return { y, u, v }
		}

		case Y4mColorSpace.C444: {
			const u = new Uint8Array(ySize)
			const v = new Uint8Array(ySize)

			// All planes - full resolution
			for (let i = 0; i < ySize; i++) {
				const r = data[i * 4]!
				const g = data[i * 4 + 1]!
				const b = data[i * 4 + 2]!
				y[i] = rgbToY(r, g, b)
				u[i] = rgbToU(r, g, b)
				v[i] = rgbToV(r, g, b)
			}

			return { y, u, v }
		}

		default: {
			// Default to 4:2:0
			return rgbaToFrame(image, Y4mColorSpace.C420)
		}
	}
}

/**
 * RGB to Y (BT.601)
 */
function rgbToY(r: number, g: number, b: number): number {
	return clamp(Math.round(16 + 0.257 * r + 0.504 * g + 0.098 * b))
}

/**
 * RGB to U (Cb) (BT.601)
 */
function rgbToU(r: number, g: number, b: number): number {
	return clamp(Math.round(128 - 0.148 * r - 0.291 * g + 0.439 * b))
}

/**
 * RGB to V (Cr) (BT.601)
 */
function rgbToV(r: number, g: number, b: number): number {
	return clamp(Math.round(128 + 0.439 * r - 0.368 * g - 0.071 * b))
}

function clamp(v: number): number {
	return Math.max(0, Math.min(255, v))
}
