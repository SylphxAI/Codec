import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import { lzwCompress } from './lzw'
import { GIF89A, GRAPHIC_CONTROL_EXTENSION, IMAGE_SEPARATOR, TRAILER } from './types'

/**
 * Quantize RGBA image to 256-color palette
 * Uses a simple median cut algorithm
 */
function quantize(image: ImageData): { indices: Uint8Array; palette: Uint8Array } {
	const { width, height, data } = image
	const pixelCount = width * height

	// Collect unique colors
	const colorCounts = new Map<number, number>()
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i]!
		const g = data[i + 1]!
		const b = data[i + 2]!
		const key = (r << 16) | (g << 8) | b
		colorCounts.set(key, (colorCounts.get(key) || 0) + 1)
	}

	// If 256 or fewer colors, use them directly
	const uniqueColors = Array.from(colorCounts.keys())

	let palette: number[]
	if (uniqueColors.length <= 256) {
		palette = uniqueColors
	} else {
		// Simple median cut quantization
		palette = medianCut(uniqueColors, 256)
	}

	// Pad palette to power of 2
	const paletteSize = Math.max(2, 2 ** Math.ceil(Math.log2(palette.length)))
	while (palette.length < paletteSize) {
		palette.push(0)
	}

	// Build color lookup map
	const colorMap = new Map<number, number>()
	for (let i = 0; i < palette.length; i++) {
		colorMap.set(palette[i]!, i)
	}

	// Map pixels to palette indices
	const indices = new Uint8Array(pixelCount)
	for (let i = 0; i < pixelCount; i++) {
		const r = data[i * 4]!
		const g = data[i * 4 + 1]!
		const b = data[i * 4 + 2]!
		const key = (r << 16) | (g << 8) | b

		if (colorMap.has(key)) {
			indices[i] = colorMap.get(key)!
		} else {
			// Find nearest color
			indices[i] = findNearestColor(r, g, b, palette)
		}
	}

	// Convert palette to RGB bytes
	const paletteBytes = new Uint8Array(palette.length * 3)
	for (let i = 0; i < palette.length; i++) {
		const color = palette[i]!
		paletteBytes[i * 3] = (color >> 16) & 0xff
		paletteBytes[i * 3 + 1] = (color >> 8) & 0xff
		paletteBytes[i * 3 + 2] = color & 0xff
	}

	return { indices, palette: paletteBytes }
}

/**
 * Simple median cut color quantization
 */
function medianCut(colors: number[], maxColors: number): number[] {
	interface Box {
		colors: number[]
		rMin: number
		rMax: number
		gMin: number
		gMax: number
		bMin: number
		bMax: number
	}

	const makeBox = (colors: number[]): Box => {
		let rMin = 255
		let rMax = 0
		let gMin = 255
		let gMax = 0
		let bMin = 255
		let bMax = 0

		for (const c of colors) {
			const r = (c >> 16) & 0xff
			const g = (c >> 8) & 0xff
			const b = c & 0xff
			rMin = Math.min(rMin, r)
			rMax = Math.max(rMax, r)
			gMin = Math.min(gMin, g)
			gMax = Math.max(gMax, g)
			bMin = Math.min(bMin, b)
			bMax = Math.max(bMax, b)
		}

		return { colors, rMin, rMax, gMin, gMax, bMin, bMax }
	}

	const boxes: Box[] = [makeBox(colors)]

	while (boxes.length < maxColors) {
		// Find box with largest range
		let maxRange = 0
		let splitIdx = 0

		for (let i = 0; i < boxes.length; i++) {
			const box = boxes[i]!
			if (box.colors.length <= 1) continue
			const range = Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin)
			if (range > maxRange) {
				maxRange = range
				splitIdx = i
			}
		}

		if (maxRange === 0) break

		const box = boxes[splitIdx]!
		const rRange = box.rMax - box.rMin
		const gRange = box.gMax - box.gMin
		const bRange = box.bMax - box.bMin

		// Sort by longest axis
		let sortedColors: number[]
		if (rRange >= gRange && rRange >= bRange) {
			sortedColors = [...box.colors].sort((a, b) => ((a >> 16) & 0xff) - ((b >> 16) & 0xff))
		} else if (gRange >= bRange) {
			sortedColors = [...box.colors].sort((a, b) => ((a >> 8) & 0xff) - ((b >> 8) & 0xff))
		} else {
			sortedColors = [...box.colors].sort((a, b) => (a & 0xff) - (b & 0xff))
		}

		// Split at median
		const mid = Math.floor(sortedColors.length / 2)
		boxes.splice(splitIdx, 1, makeBox(sortedColors.slice(0, mid)), makeBox(sortedColors.slice(mid)))
	}

	// Return average color of each box
	return boxes.map((box) => {
		let rSum = 0
		let gSum = 0
		let bSum = 0
		for (const c of box.colors) {
			rSum += (c >> 16) & 0xff
			gSum += (c >> 8) & 0xff
			bSum += c & 0xff
		}
		const n = box.colors.length
		const r = Math.round(rSum / n)
		const g = Math.round(gSum / n)
		const b = Math.round(bSum / n)
		return (r << 16) | (g << 8) | b
	})
}

/**
 * Find nearest color in palette
 */
function findNearestColor(r: number, g: number, b: number, palette: number[]): number {
	let minDist = Number.POSITIVE_INFINITY
	let nearest = 0

	for (let i = 0; i < palette.length; i++) {
		const c = palette[i]!
		const pr = (c >> 16) & 0xff
		const pg = (c >> 8) & 0xff
		const pb = c & 0xff

		// Squared Euclidean distance
		const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
		if (dist < minDist) {
			minDist = dist
			nearest = i
		}
	}

	return nearest
}

/**
 * Encode ImageData to GIF
 */
export function encodeGif(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height } = image
	const { indices, palette } = quantize(image)

	const output: number[] = []

	// Header
	for (const c of GIF89A) {
		output.push(c.charCodeAt(0))
	}

	// Logical Screen Descriptor
	output.push(width & 0xff, (width >> 8) & 0xff)
	output.push(height & 0xff, (height >> 8) & 0xff)

	// Packed byte: Global Color Table Flag, Color Resolution, Sort Flag, Size
	const colorTableSizeBits = Math.ceil(Math.log2(palette.length / 3)) - 1
	const packed = 0x80 | ((colorTableSizeBits & 0x07) << 4) | (colorTableSizeBits & 0x07)
	output.push(packed)

	output.push(0) // Background Color Index
	output.push(0) // Pixel Aspect Ratio

	// Global Color Table
	for (let i = 0; i < palette.length; i++) {
		output.push(palette[i]!)
	}

	// Graphic Control Extension (for transparency support in future)
	output.push(0x21) // Extension Introducer
	output.push(GRAPHIC_CONTROL_EXTENSION)
	output.push(4) // Block size
	output.push(0) // Packed: no disposal, no user input, no transparency
	output.push(0, 0) // Delay time
	output.push(0) // Transparent color index
	output.push(0) // Block terminator

	// Image Descriptor
	output.push(IMAGE_SEPARATOR)
	output.push(0, 0) // Left position
	output.push(0, 0) // Top position
	output.push(width & 0xff, (width >> 8) & 0xff)
	output.push(height & 0xff, (height >> 8) & 0xff)
	output.push(0) // Packed: no local color table, not interlaced

	// Image Data
	const minCodeSize = Math.max(2, Math.ceil(Math.log2(palette.length / 3)))
	output.push(minCodeSize)

	// LZW compress
	const compressed = lzwCompress(indices, minCodeSize)

	// Write sub-blocks (max 255 bytes each)
	let pos = 0
	while (pos < compressed.length) {
		const blockSize = Math.min(255, compressed.length - pos)
		output.push(blockSize)
		for (let i = 0; i < blockSize; i++) {
			output.push(compressed[pos++]!)
		}
	}
	output.push(0) // Block terminator

	// Trailer
	output.push(TRAILER)

	return new Uint8Array(output)
}
