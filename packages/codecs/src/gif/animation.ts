import type { ImageData, VideoData, VideoFrame } from '@mconv/core'
import { parseGif } from './decoder'
import { lzwCompress } from './lzw'
import {
	APPLICATION_EXTENSION,
	type ColorTable,
	DisposalMethod,
	GIF89A,
	GRAPHIC_CONTROL_EXTENSION,
	type GifFrame,
	type GifImage,
	IMAGE_SEPARATOR,
	TRAILER,
} from './types'

/**
 * Decode animated GIF to VideoData
 */
export function decodeGifAnimation(data: Uint8Array): VideoData {
	const gif = parseGif(data)
	const { width, height } = gif.screenDescriptor

	const frames: VideoFrame[] = []
	let timestamp = 0

	// Canvas for compositing frames
	const canvas = new Uint8Array(width * height * 4)
	const previousCanvas = new Uint8Array(width * height * 4)

	// Fill with background color
	fillBackground(canvas, gif)

	for (const frame of gif.frames) {
		// Save previous state if needed
		const disposal = frame.graphicControl?.disposalMethod ?? DisposalMethod.None
		if (disposal === DisposalMethod.RestorePrevious) {
			previousCanvas.set(canvas)
		}

		// Render frame to canvas
		renderFrameToCanvas(canvas, frame, gif, width, height)

		// Get delay time (default to 100ms if not specified or 0)
		const delayTime = frame.graphicControl?.delayTime || 100

		// Create frame copy
		const frameImage: ImageData = {
			width,
			height,
			data: new Uint8Array(canvas),
		}

		frames.push({
			image: frameImage,
			timestamp,
			duration: delayTime,
		})

		timestamp += delayTime

		// Handle disposal
		if (disposal === DisposalMethod.RestoreBackground) {
			// Clear the frame area to background
			clearFrameArea(canvas, frame, gif)
		} else if (disposal === DisposalMethod.RestorePrevious) {
			canvas.set(previousCanvas)
		}
	}

	const totalDuration = timestamp
	const fps = frames.length > 0 ? frames.length / (totalDuration / 1000) : 10

	return {
		width,
		height,
		frames,
		duration: totalDuration,
		fps,
	}
}

/**
 * Fill canvas with background color
 */
function fillBackground(canvas: Uint8Array, gif: GifImage): void {
	const bgIndex = gif.screenDescriptor.backgroundColorIndex
	const colorTable = gif.globalColorTable

	if (colorTable && bgIndex * 3 + 2 < colorTable.length) {
		const r = colorTable[bgIndex * 3]!
		const g = colorTable[bgIndex * 3 + 1]!
		const b = colorTable[bgIndex * 3 + 2]!
		for (let i = 0; i < canvas.length; i += 4) {
			canvas[i] = r
			canvas[i + 1] = g
			canvas[i + 2] = b
			canvas[i + 3] = 255
		}
	} else {
		// Default to transparent
		canvas.fill(0)
	}
}

/**
 * Render a frame to the canvas
 */
function renderFrameToCanvas(
	canvas: Uint8Array,
	frame: GifFrame,
	gif: GifImage,
	canvasWidth: number,
	canvasHeight: number
): void {
	const { imageDescriptor, localColorTable, graphicControl, imageData } = frame
	const palette = localColorTable ?? gif.globalColorTable

	if (!palette) return

	const transparentIndex = graphicControl?.hasTransparency
		? graphicControl.transparentColorIndex
		: -1

	// Handle interlacing
	const passStarts = [0, 4, 2, 1]
	const passIncrements = [8, 8, 4, 2]

	let srcIdx = 0
	if (imageDescriptor.interlaced) {
		for (let pass = 0; pass < 4; pass++) {
			for (let y = passStarts[pass]!; y < imageDescriptor.height; y += passIncrements[pass]!) {
				for (let x = 0; x < imageDescriptor.width; x++) {
					if (srcIdx >= imageData.length) break
					const colorIdx = imageData[srcIdx++]!
					const destX = imageDescriptor.left + x
					const destY = imageDescriptor.top + y

					if (destX < canvasWidth && destY < canvasHeight && colorIdx !== transparentIndex) {
						const destIdx = (destY * canvasWidth + destX) * 4
						canvas[destIdx] = palette[colorIdx * 3]!
						canvas[destIdx + 1] = palette[colorIdx * 3 + 1]!
						canvas[destIdx + 2] = palette[colorIdx * 3 + 2]!
						canvas[destIdx + 3] = 255
					}
				}
			}
		}
	} else {
		for (let y = 0; y < imageDescriptor.height; y++) {
			for (let x = 0; x < imageDescriptor.width; x++) {
				if (srcIdx >= imageData.length) break
				const colorIdx = imageData[srcIdx++]!
				const destX = imageDescriptor.left + x
				const destY = imageDescriptor.top + y

				if (destX < canvasWidth && destY < canvasHeight && colorIdx !== transparentIndex) {
					const destIdx = (destY * canvasWidth + destX) * 4
					canvas[destIdx] = palette[colorIdx * 3]!
					canvas[destIdx + 1] = palette[colorIdx * 3 + 1]!
					canvas[destIdx + 2] = palette[colorIdx * 3 + 2]!
					canvas[destIdx + 3] = 255
				}
			}
		}
	}
}

/**
 * Clear frame area to background
 */
function clearFrameArea(canvas: Uint8Array, frame: GifFrame, gif: GifImage): void {
	const { imageDescriptor } = frame
	const canvasWidth = gif.screenDescriptor.width

	const bgIndex = gif.screenDescriptor.backgroundColorIndex
	const colorTable = gif.globalColorTable
	let r = 0
	let g = 0
	let b = 0
	let a = 0
	if (colorTable && bgIndex * 3 + 2 < colorTable.length) {
		r = colorTable[bgIndex * 3]!
		g = colorTable[bgIndex * 3 + 1]!
		b = colorTable[bgIndex * 3 + 2]!
		a = 255
	}

	for (let y = 0; y < imageDescriptor.height; y++) {
		for (let x = 0; x < imageDescriptor.width; x++) {
			const destX = imageDescriptor.left + x
			const destY = imageDescriptor.top + y
			const destIdx = (destY * canvasWidth + destX) * 4
			canvas[destIdx] = r
			canvas[destIdx + 1] = g
			canvas[destIdx + 2] = b
			canvas[destIdx + 3] = a
		}
	}
}

/**
 * Encode VideoData to animated GIF
 */
export function encodeGifAnimation(video: VideoData): Uint8Array {
	const { width, height, frames } = video

	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	// Build global palette from first frame
	const firstFrame = frames[0]!.image
	const { palette } = quantizeImage(firstFrame)

	const output: number[] = []

	// Header
	for (const c of GIF89A) {
		output.push(c.charCodeAt(0))
	}

	// Logical Screen Descriptor
	output.push(width & 0xff, (width >> 8) & 0xff)
	output.push(height & 0xff, (height >> 8) & 0xff)

	const colorTableSizeBits = Math.ceil(Math.log2(palette.length / 3)) - 1
	const packed = 0x80 | ((colorTableSizeBits & 0x07) << 4) | (colorTableSizeBits & 0x07)
	output.push(packed)
	output.push(0) // Background Color Index
	output.push(0) // Pixel Aspect Ratio

	// Global Color Table
	for (let i = 0; i < palette.length; i++) {
		output.push(palette[i]!)
	}

	// NETSCAPE Application Extension (for looping)
	output.push(0x21) // Extension Introducer
	output.push(APPLICATION_EXTENSION)
	output.push(11) // Block size
	// "NETSCAPE2.0"
	output.push(0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30)
	output.push(3) // Sub-block size
	output.push(1) // Sub-block ID
	output.push(0, 0) // Loop count (0 = infinite)
	output.push(0) // Block terminator

	// Encode each frame
	for (const frame of frames) {
		encodeFrame(output, frame.image, frame.duration, palette)
	}

	// Trailer
	output.push(TRAILER)

	return new Uint8Array(output)
}

/**
 * Quantize image to 256 colors and get palette
 */
function quantizeImage(image: ImageData): { indices: Uint8Array; palette: Uint8Array } {
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

	const uniqueColors = Array.from(colorCounts.keys())
	let paletteColors: number[]

	if (uniqueColors.length <= 256) {
		paletteColors = uniqueColors
	} else {
		paletteColors = medianCut(uniqueColors, 256)
	}

	// Pad palette to power of 2
	const paletteSize = Math.max(2, 2 ** Math.ceil(Math.log2(paletteColors.length)))
	while (paletteColors.length < paletteSize) {
		paletteColors.push(0)
	}

	// Build color lookup map
	const colorMap = new Map<number, number>()
	for (let i = 0; i < paletteColors.length; i++) {
		colorMap.set(paletteColors[i]!, i)
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
			indices[i] = findNearestColor(r, g, b, paletteColors)
		}
	}

	// Convert palette to RGB bytes
	const palette = new Uint8Array(paletteColors.length * 3)
	for (let i = 0; i < paletteColors.length; i++) {
		const color = paletteColors[i]!
		palette[i * 3] = (color >> 16) & 0xff
		palette[i * 3 + 1] = (color >> 8) & 0xff
		palette[i * 3 + 2] = color & 0xff
	}

	return { indices, palette }
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

	const makeBox = (boxColors: number[]): Box => {
		let rMin = 255
		let rMax = 0
		let gMin = 255
		let gMax = 0
		let bMin = 255
		let bMax = 0

		for (const c of boxColors) {
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

		return { colors: boxColors, rMin, rMax, gMin, gMax, bMin, bMax }
	}

	const boxes: Box[] = [makeBox(colors)]

	while (boxes.length < maxColors) {
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

		let sortedColors: number[]
		if (rRange >= gRange && rRange >= bRange) {
			sortedColors = [...box.colors].sort((a, b) => ((a >> 16) & 0xff) - ((b >> 16) & 0xff))
		} else if (gRange >= bRange) {
			sortedColors = [...box.colors].sort((a, b) => ((a >> 8) & 0xff) - ((b >> 8) & 0xff))
		} else {
			sortedColors = [...box.colors].sort((a, b) => (a & 0xff) - (b & 0xff))
		}

		const mid = Math.floor(sortedColors.length / 2)
		boxes.splice(splitIdx, 1, makeBox(sortedColors.slice(0, mid)), makeBox(sortedColors.slice(mid)))
	}

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
		return (Math.round(rSum / n) << 16) | (Math.round(gSum / n) << 8) | Math.round(bSum / n)
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
		const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
		if (dist < minDist) {
			minDist = dist
			nearest = i
		}
	}

	return nearest
}

/**
 * Encode a single frame
 */
function encodeFrame(
	output: number[],
	image: ImageData,
	delayMs: number,
	globalPalette: Uint8Array
): void {
	const { width, height, data } = image

	// Convert delay to centiseconds
	const delayCentiseconds = Math.round(delayMs / 10)

	// Graphic Control Extension
	output.push(0x21) // Extension Introducer
	output.push(GRAPHIC_CONTROL_EXTENSION)
	output.push(4) // Block size
	output.push(0) // Packed: no disposal, no transparency
	output.push(delayCentiseconds & 0xff, (delayCentiseconds >> 8) & 0xff)
	output.push(0) // Transparent color index
	output.push(0) // Block terminator

	// Image Descriptor
	output.push(IMAGE_SEPARATOR)
	output.push(0, 0) // Left position
	output.push(0, 0) // Top position
	output.push(width & 0xff, (width >> 8) & 0xff)
	output.push(height & 0xff, (height >> 8) & 0xff)
	output.push(0) // Packed: no local color table

	// Map pixels to global palette indices
	const pixelCount = width * height
	const indices = new Uint8Array(pixelCount)

	// Build palette lookup
	const paletteColors: number[] = []
	for (let i = 0; i < globalPalette.length; i += 3) {
		paletteColors.push(
			(globalPalette[i]! << 16) | (globalPalette[i + 1]! << 8) | globalPalette[i + 2]!
		)
	}

	for (let i = 0; i < pixelCount; i++) {
		const r = data[i * 4]!
		const g = data[i * 4 + 1]!
		const b = data[i * 4 + 2]!
		indices[i] = findNearestColor(r, g, b, paletteColors)
	}

	// LZW compress
	const minCodeSize = Math.max(2, Math.ceil(Math.log2(globalPalette.length / 3)))
	output.push(minCodeSize)

	const compressed = lzwCompress(indices, minCodeSize)

	// Write sub-blocks
	let pos = 0
	while (pos < compressed.length) {
		const blockSize = Math.min(255, compressed.length - pos)
		output.push(blockSize)
		for (let i = 0; i < blockSize; i++) {
			output.push(compressed[pos++]!)
		}
	}
	output.push(0) // Block terminator
}
