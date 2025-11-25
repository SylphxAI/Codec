/**
 * MJPEG (Motion JPEG) decoder
 * Decodes raw MJPEG streams (concatenated JPEGs)
 */

import type { ImageData } from '@sylphx/codec-core'
import { decodeJpeg } from '../jpeg'
import type { MjpegDecodeOptions, MjpegFrame, MjpegInfo, MjpegStream } from './types'

const JPEG_SOI = 0xffd8
const JPEG_EOI = 0xffd9

/**
 * Check if data is a raw MJPEG stream
 */
export function isMjpeg(data: Uint8Array): boolean {
	if (data.length < 4) return false
	// Check for JPEG SOI marker
	return data[0] === 0xff && data[1] === 0xd8
}

/**
 * Parse MJPEG stream info without decoding
 */
export function parseMjpegInfo(data: Uint8Array, frameRate = 30): MjpegInfo {
	const frameOffsets = findFrameOffsets(data)
	const frameCount = frameOffsets.length

	// Get dimensions from first frame
	let width = 0
	let height = 0

	if (frameCount > 0) {
		const firstFrame = extractFrame(data, frameOffsets[0]!)
		const dims = parseJpegDimensions(firstFrame)
		width = dims.width
		height = dims.height
	}

	const duration = frameCount > 0 ? (frameCount / frameRate) * 1000 : 0

	return {
		width,
		height,
		frameCount,
		frameRate,
		duration,
	}
}

/**
 * Decode MJPEG stream
 */
export function decodeMjpeg(data: Uint8Array, options: MjpegDecodeOptions = {}): MjpegStream {
	const { startFrame = 0, endFrame, decodeFrames = false } = options

	const frameOffsets = findFrameOffsets(data)
	const totalFrames = frameOffsets.length
	const endIdx = endFrame !== undefined ? Math.min(endFrame + 1, totalFrames) : totalFrames

	const frames: MjpegFrame[] = []
	let width = 0
	let height = 0

	for (let i = startFrame; i < endIdx; i++) {
		const frameData = extractFrame(data, frameOffsets[i]!)

		const frame: MjpegFrame = {
			index: i,
			timestamp: (i / 30) * 1000, // Assume 30fps
			data: frameData,
		}

		if (decodeFrames) {
			frame.image = decodeJpeg(frameData)
			if (i === startFrame) {
				width = frame.image.width
				height = frame.image.height
			}
		} else if (i === startFrame) {
			const dims = parseJpegDimensions(frameData)
			width = dims.width
			height = dims.height
		}

		frames.push(frame)
	}

	const frameRate = 30
	const info: MjpegInfo = {
		width,
		height,
		frameCount: totalFrames,
		frameRate,
		duration: (totalFrames / frameRate) * 1000,
	}

	return { info, frames }
}

/**
 * Decode a single frame from MJPEG stream
 */
export function decodeMjpegFrame(data: Uint8Array, frameIndex: number): ImageData | null {
	const frameOffsets = findFrameOffsets(data)

	if (frameIndex < 0 || frameIndex >= frameOffsets.length) {
		return null
	}

	const frameData = extractFrame(data, frameOffsets[frameIndex]!)
	return decodeJpeg(frameData)
}

/**
 * Extract all frames as JPEG data
 */
export function extractMjpegFrames(data: Uint8Array): Uint8Array[] {
	const frameOffsets = findFrameOffsets(data)
	return frameOffsets.map((offset) => extractFrame(data, offset))
}

/**
 * Find all JPEG frame start offsets
 */
function findFrameOffsets(data: Uint8Array): number[] {
	const offsets: number[] = []

	for (let i = 0; i < data.length - 1; i++) {
		if (data[i] === 0xff && data[i + 1] === 0xd8) {
			offsets.push(i)
		}
	}

	return offsets
}

/**
 * Extract a single frame from the stream
 */
function extractFrame(data: Uint8Array, startOffset: number): Uint8Array {
	// Find EOI marker
	let endOffset = startOffset + 2

	while (endOffset < data.length - 1) {
		if (data[endOffset] === 0xff && data[endOffset + 1] === 0xd9) {
			return data.slice(startOffset, endOffset + 2)
		}
		endOffset++
	}

	// If no EOI found, return rest of data
	return data.slice(startOffset)
}

/**
 * Parse JPEG dimensions without full decode
 */
function parseJpegDimensions(data: Uint8Array): { width: number; height: number } {
	let offset = 2 // Skip SOI

	while (offset < data.length - 4) {
		if (data[offset] !== 0xff) {
			offset++
			continue
		}

		const marker = data[offset + 1]!

		// SOF markers (Start of Frame)
		if (
			marker === 0xc0 || // Baseline
			marker === 0xc1 || // Extended sequential
			marker === 0xc2 // Progressive
		) {
			const height = (data[offset + 5]! << 8) | data[offset + 6]!
			const width = (data[offset + 7]! << 8) | data[offset + 8]!
			return { width, height }
		}

		// Skip to next marker
		if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
			offset += 2
		} else {
			const length = (data[offset + 2]! << 8) | data[offset + 3]!
			offset += 2 + length
		}
	}

	return { width: 0, height: 0 }
}
