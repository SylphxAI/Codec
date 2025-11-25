/**
 * FLI/FLC (FLIC) encoder
 * Encodes animations to FLC format
 */

import type { ImageData } from '@mconv/core'
import {
	FLIC_MAGIC_FLC,
	type FlicAnimation,
	FlicChunkType,
	type FlicEncodeOptions,
	type FlicInfo,
} from './types'

/**
 * Encode images to FLC animation
 */
export function encodeFlic(images: ImageData[], options: FlicEncodeOptions = {}): Uint8Array {
	const { delay = 66 } = options

	if (images.length === 0) {
		return new Uint8Array(0)
	}

	const width = images[0]!.width
	const height = images[0]!.height

	// Build global palette from all frames
	const { palette, quantized } = buildPaletteAndQuantize(images)

	// Encode frames
	const frameChunks: Uint8Array[] = []
	let prevFrame: Uint8Array | null = null

	for (let i = 0; i < quantized.length; i++) {
		const frame = quantized[i]!
		const frameData = encodeFrame(frame, prevFrame, palette, width, height, i === 0)
		frameChunks.push(frameData)
		prevFrame = frame
	}

	// Calculate total size
	const headerSize = 128
	let framesSize = 0
	for (const chunk of frameChunks) {
		framesSize += chunk.length
	}

	const totalSize = headerSize + framesSize
	const output = new Uint8Array(totalSize)

	// Write header
	writeU32LE(output, 0, totalSize) // File size
	writeU16LE(output, 4, FLIC_MAGIC_FLC) // Magic
	writeU16LE(output, 6, images.length) // Frame count
	writeU16LE(output, 8, width) // Width
	writeU16LE(output, 10, height) // Height
	writeU16LE(output, 12, 8) // Depth (8 bits)
	writeU16LE(output, 14, 0) // Flags
	writeU32LE(output, 16, delay) // Delay
	// Rest of header is zeros (reserved)

	// Write frames
	let offset = headerSize
	for (const chunk of frameChunks) {
		output.set(chunk, offset)
		offset += chunk.length
	}

	return output
}

/**
 * Create FLIC animation object from images
 */
export function createFlicAnimation(
	images: ImageData[],
	options: FlicEncodeOptions = {}
): FlicAnimation {
	const { delay = 66 } = options

	if (images.length === 0) {
		return {
			info: {
				isFLC: true,
				width: 0,
				height: 0,
				frameCount: 0,
				delay,
				duration: 0,
			},
			frames: [],
		}
	}

	const width = images[0]!.width
	const height = images[0]!.height

	const info: FlicInfo = {
		isFLC: true,
		width,
		height,
		frameCount: images.length,
		delay,
		duration: images.length * delay,
	}

	const frames = images.map((image, index) => ({
		index,
		timestamp: index * delay,
		image,
	}))

	return { info, frames }
}

function buildPaletteAndQuantize(images: ImageData[]): {
	palette: Uint8Array
	quantized: Uint8Array[]
} {
	// Simple median cut quantization to 256 colors
	// Collect all unique colors
	const colorCounts = new Map<number, number>()

	for (const img of images) {
		for (let i = 0; i < img.data.length; i += 4) {
			const r = img.data[i]! >> 3
			const g = img.data[i + 1]! >> 3
			const b = img.data[i + 2]! >> 3
			const key = (r << 10) | (g << 5) | b
			colorCounts.set(key, (colorCounts.get(key) || 0) + 1)
		}
	}

	// Sort by frequency and take top 256
	const sortedColors = Array.from(colorCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 256)
		.map(([key]) => key)

	// Build palette
	const palette = new Uint8Array(768)
	for (let i = 0; i < sortedColors.length; i++) {
		const key = sortedColors[i]!
		palette[i * 3] = ((key >> 10) & 0x1f) << 3
		palette[i * 3 + 1] = ((key >> 5) & 0x1f) << 3
		palette[i * 3 + 2] = (key & 0x1f) << 3
	}

	// Build color lookup
	const colorLookup = new Map<number, number>()
	for (let i = 0; i < sortedColors.length; i++) {
		colorLookup.set(sortedColors[i]!, i)
	}

	// Quantize each image
	const quantized: Uint8Array[] = []

	for (const img of images) {
		const frame = new Uint8Array(img.width * img.height)

		for (let i = 0; i < img.data.length / 4; i++) {
			const r = img.data[i * 4]! >> 3
			const g = img.data[i * 4 + 1]! >> 3
			const b = img.data[i * 4 + 2]! >> 3
			const key = (r << 10) | (g << 5) | b

			let colorIdx = colorLookup.get(key)
			if (colorIdx === undefined) {
				// Find nearest color
				colorIdx = findNearestColor(r << 3, g << 3, b << 3, palette, sortedColors.length)
			}

			frame[i] = colorIdx
		}

		quantized.push(frame)
	}

	return { palette, quantized }
}

function findNearestColor(
	r: number,
	g: number,
	b: number,
	palette: Uint8Array,
	count: number
): number {
	let best = 0
	let bestDist = Number.MAX_VALUE

	for (let i = 0; i < count; i++) {
		const pr = palette[i * 3]!
		const pg = palette[i * 3 + 1]!
		const pb = palette[i * 3 + 2]!
		const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
		if (dist < bestDist) {
			bestDist = dist
			best = i
		}
	}

	return best
}

function encodeFrame(
	frame: Uint8Array,
	prevFrame: Uint8Array | null,
	palette: Uint8Array,
	width: number,
	height: number,
	isFirst: boolean
): Uint8Array {
	const chunks: Uint8Array[] = []

	// First frame includes palette
	if (isFirst) {
		chunks.push(encodePalette(palette))
	}

	// Encode pixel data
	if (isFirst || prevFrame === null) {
		chunks.push(encodeByteRun(frame, width, height))
	} else {
		chunks.push(encodeDelta(frame, prevFrame, width, height))
	}

	// Calculate frame size
	let chunksSize = 0
	for (const chunk of chunks) {
		chunksSize += chunk.length
	}

	const frameSize = 16 + chunksSize // Frame header + chunks
	const output = new Uint8Array(frameSize)

	// Frame header
	writeU32LE(output, 0, frameSize)
	writeU16LE(output, 4, FlicChunkType.FRAME)
	writeU16LE(output, 6, chunks.length)
	// 8 bytes reserved

	// Write chunks
	let offset = 16
	for (const chunk of chunks) {
		output.set(chunk, offset)
		offset += chunk.length
	}

	return output
}

function encodePalette(palette: Uint8Array): Uint8Array {
	// COLOR_256 chunk
	const size = 6 + 2 + 2 + 768 // Header + packet count + (skip, count) + colors
	const output = new Uint8Array(size)

	writeU32LE(output, 0, size)
	writeU16LE(output, 4, FlicChunkType.COLOR_256)
	writeU16LE(output, 6, 1) // 1 packet
	output[8] = 0 // Skip 0 colors
	output[9] = 0 // Copy 256 colors (0 means 256)

	// Copy palette
	for (let i = 0; i < 768; i++) {
		output[10 + i] = palette[i]!
	}

	return output
}

function encodeByteRun(frame: Uint8Array, width: number, height: number): Uint8Array {
	// Estimate max size
	const parts: number[] = []

	for (let y = 0; y < height; y++) {
		const lineStart = y * width
		const lineData: number[] = []
		let x = 0

		while (x < width) {
			// Count run length
			let runLen = 1
			while (
				x + runLen < width &&
				runLen < 127 &&
				frame[lineStart + x + runLen] === frame[lineStart + x]
			) {
				runLen++
			}

			if (runLen >= 3) {
				// RLE run
				lineData.push(runLen)
				lineData.push(frame[lineStart + x]!)
				x += runLen
			} else {
				// Literal run - find length
				let litLen = 1
				while (x + litLen < width && litLen < 127) {
					// Check if next pixel starts a run
					if (
						x + litLen + 2 < width &&
						frame[lineStart + x + litLen] === frame[lineStart + x + litLen + 1] &&
						frame[lineStart + x + litLen] === frame[lineStart + x + litLen + 2]
					) {
						break
					}
					litLen++
				}

				// Literal: (256 - count)
				lineData.push(256 - litLen)
				for (let i = 0; i < litLen; i++) {
					lineData.push(frame[lineStart + x + i]!)
				}
				x += litLen
			}
		}

		// Packet count for this line
		parts.push(Math.ceil(lineData.length / 2))
		parts.push(...lineData)
	}

	const size = 6 + parts.length
	const output = new Uint8Array(size)

	writeU32LE(output, 0, size)
	writeU16LE(output, 4, FlicChunkType.BYTE_RUN)

	for (let i = 0; i < parts.length; i++) {
		output[6 + i] = parts[i]! & 0xff
	}

	return output
}

function encodeDelta(
	frame: Uint8Array,
	prevFrame: Uint8Array,
	width: number,
	height: number
): Uint8Array {
	// Simple delta encoding - find changed lines
	const changedLines: { y: number; data: number[] }[] = []

	for (let y = 0; y < height; y++) {
		const lineStart = y * width
		let hasChanges = false

		for (let x = 0; x < width; x++) {
			if (frame[lineStart + x] !== prevFrame[lineStart + x]) {
				hasChanges = true
				break
			}
		}

		if (hasChanges) {
			// Encode line changes
			const lineData: number[] = []
			let x = 0

			while (x < width) {
				// Skip unchanged pixels
				let skip = 0
				while (x < width && skip < 255 && frame[lineStart + x] === prevFrame[lineStart + x]) {
					skip++
					x++
				}

				if (x >= width) break

				lineData.push(skip)

				// Find changed pixels
				let changeLen = 0
				while (
					x + changeLen < width &&
					changeLen < 127 &&
					frame[lineStart + x + changeLen] !== prevFrame[lineStart + x + changeLen]
				) {
					changeLen++
				}

				lineData.push(changeLen)
				for (let i = 0; i < changeLen; i++) {
					lineData.push(frame[lineStart + x + i]!)
				}
				x += changeLen
			}

			changedLines.push({ y, data: lineData })
		}
	}

	// If no changes, use BLACK chunk (shouldn't happen, but handle it)
	if (changedLines.length === 0) {
		const output = new Uint8Array(6)
		writeU32LE(output, 0, 6)
		writeU16LE(output, 4, FlicChunkType.LITERAL)
		return output
	}

	// Build delta chunk
	const parts: number[] = []

	// Start line
	const startLine = changedLines[0]!.y
	parts.push(startLine & 0xff, (startLine >> 8) & 0xff)

	// Line count
	const lineCount = changedLines[changedLines.length - 1]!.y - startLine + 1
	parts.push(lineCount & 0xff, (lineCount >> 8) & 0xff)

	// Lines
	let currentY = startLine
	for (const line of changedLines) {
		// Add empty lines if there are gaps
		while (currentY < line.y) {
			parts.push(0) // 0 packets
			currentY++
		}

		// Packet count (estimate)
		parts.push(Math.ceil(line.data.length / 2))
		parts.push(...line.data)
		currentY++
	}

	const size = 6 + parts.length
	const output = new Uint8Array(size)

	writeU32LE(output, 0, size)
	writeU16LE(output, 4, FlicChunkType.DELTA_FLI)

	for (let i = 0; i < parts.length; i++) {
		output[6 + i] = parts[i]! & 0xff
	}

	return output
}

// Binary writing helpers
function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}
