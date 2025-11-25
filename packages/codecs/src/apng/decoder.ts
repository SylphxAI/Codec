import type { VideoData, VideoFrame } from '@sylphx/codec-core'
import {
	type AnimationControl,
	type ApngChunk,
	ApngChunkType,
	type ApngFrame,
	BlendOp,
	type ColorType,
	DisposeOp,
	type FrameControl,
	type IHDRData,
	PNG_SIGNATURE,
} from './types'

/**
 * Read 32-bit big-endian unsigned integer
 */
function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) |
			(data[offset + 1]! << 16) |
			(data[offset + 2]! << 8) |
			data[offset + 3]!) >>>
		0
	)
}

/**
 * Read 16-bit big-endian unsigned integer
 */
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

/**
 * Calculate CRC32
 */
const crcTable: number[] = []
for (let n = 0; n < 256; n++) {
	let c = n
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	}
	crcTable[n] = c
}

function crc32(data: Uint8Array, start: number, length: number): number {
	let crc = 0xffffffff
	for (let i = start; i < start + length; i++) {
		crc = crcTable[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
	}
	return (crc ^ 0xffffffff) >>> 0
}

/**
 * Parse PNG/APNG chunks
 */
function parseChunks(data: Uint8Array): ApngChunk[] {
	const chunks: ApngChunk[] = []
	let offset = 8 // Skip signature

	while (offset < data.length) {
		const length = readU32BE(data, offset)
		const type = readU32BE(data, offset + 4)
		const chunkData = data.slice(offset + 8, offset + 8 + length)
		const expectedCrc = readU32BE(data, offset + 8 + length)

		// Verify CRC
		const actualCrc = crc32(data, offset + 4, length + 4)
		if (actualCrc !== expectedCrc) {
			throw new Error(
				`CRC mismatch in chunk ${String.fromCharCode((type >> 24) & 0xff, (type >> 16) & 0xff, (type >> 8) & 0xff, type & 0xff)}`
			)
		}

		chunks.push({ type, data: chunkData })
		offset += 12 + length

		// Stop at IEND
		if (type === ApngChunkType.IEND) break
	}

	return chunks
}

/**
 * Parse IHDR chunk
 */
function parseIHDR(data: Uint8Array): IHDRData {
	if (data.length !== 13) {
		throw new Error('Invalid IHDR chunk length')
	}

	return {
		width: readU32BE(data, 0),
		height: readU32BE(data, 4),
		bitDepth: data[8]!,
		colorType: data[9]! as ColorType,
		compressionMethod: data[10]!,
		filterMethod: data[11]!,
		interlaceMethod: data[12]!,
	}
}

/**
 * Parse acTL (Animation Control) chunk
 */
function parseACTL(data: Uint8Array): AnimationControl {
	if (data.length !== 8) {
		throw new Error('Invalid acTL chunk length')
	}

	return {
		numFrames: readU32BE(data, 0),
		numPlays: readU32BE(data, 4),
	}
}

/**
 * Parse fcTL (Frame Control) chunk
 */
function parseFCTL(data: Uint8Array): FrameControl {
	if (data.length !== 26) {
		throw new Error('Invalid fcTL chunk length')
	}

	return {
		sequenceNumber: readU32BE(data, 0),
		width: readU32BE(data, 4),
		height: readU32BE(data, 8),
		xOffset: readU32BE(data, 12),
		yOffset: readU32BE(data, 16),
		delayNum: readU16BE(data, 20),
		delayDen: readU16BE(data, 22),
		disposeOp: data[24]! as DisposeOp,
		blendOp: data[25]! as BlendOp,
	}
}

/**
 * Simple DEFLATE inflate implementation
 * In production, this would use a proper zlib library
 */
function inflate(data: Uint8Array): Uint8Array {
	// This is a simplified placeholder - in practice, import from ../png/inflate
	// For now, we'll assume the data can be imported from the PNG codec
	throw new Error('inflate not implemented - import from ../png/inflate')
}

/**
 * Paeth predictor function
 */
function paethPredictor(a: number, b: number, c: number): number {
	const p = a + b - c
	const pa = Math.abs(p - a)
	const pb = Math.abs(p - b)
	const pc = Math.abs(p - c)

	if (pa <= pb && pa <= pc) return a
	if (pb <= pc) return b
	return c
}

/**
 * Unfilter a scanline
 */
function unfilterScanline(
	filter: number,
	current: Uint8Array,
	previous: Uint8Array | null,
	bpp: number
): void {
	const len = current.length

	switch (filter) {
		case 0: // None
			break

		case 1: // Sub
			for (let i = bpp; i < len; i++) {
				current[i] = (current[i]! + current[i - bpp]!) & 0xff
			}
			break

		case 2: // Up
			if (previous) {
				for (let i = 0; i < len; i++) {
					current[i] = (current[i]! + previous[i]!) & 0xff
				}
			}
			break

		case 3: // Average
			for (let i = 0; i < len; i++) {
				const a = i >= bpp ? current[i - bpp]! : 0
				const b = previous ? previous[i]! : 0
				current[i] = (current[i]! + Math.floor((a + b) / 2)) & 0xff
			}
			break

		case 4: // Paeth
			for (let i = 0; i < len; i++) {
				const a = i >= bpp ? current[i - bpp]! : 0
				const b = previous ? previous[i]! : 0
				const c = i >= bpp && previous ? previous[i - bpp]! : 0
				current[i] = (current[i]! + paethPredictor(a, b, c)) & 0xff
			}
			break

		default:
			throw new Error(`Unknown filter type: ${filter}`)
	}
}

/**
 * Get bytes per pixel based on color type
 */
function getBytesPerPixel(colorType: ColorType): number {
	switch (colorType) {
		case 0: // Grayscale
			return 1
		case 2: // RGB
			return 3
		case 3: // Indexed
			return 1
		case 4: // Grayscale + Alpha
			return 2
		case 6: // RGBA
			return 4
		default:
			return 4
	}
}

/**
 * Convert raw pixels to RGBA
 */
function toRGBA(
	raw: Uint8Array,
	width: number,
	height: number,
	colorType: ColorType,
	palette?: Uint8Array,
	transparency?: Uint8Array
): Uint8Array {
	const output = new Uint8Array(width * height * 4)
	let rawOffset = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const outIdx = (y * width + x) * 4
			let r = 0
			let g = 0
			let b = 0
			let a = 255

			switch (colorType) {
				case 0: // Grayscale
					r = g = b = raw[rawOffset++]!
					if (transparency && transparency.length >= 2) {
						const transVal = (transparency[0]! << 8) | transparency[1]!
						if (r === (transVal & 0xff)) a = 0
					}
					break

				case 2: // RGB
					r = raw[rawOffset++]!
					g = raw[rawOffset++]!
					b = raw[rawOffset++]!
					if (transparency && transparency.length >= 6) {
						const tr = (transparency[0]! << 8) | transparency[1]!
						const tg = (transparency[2]! << 8) | transparency[3]!
						const tb = (transparency[4]! << 8) | transparency[5]!
						if (r === (tr & 0xff) && g === (tg & 0xff) && b === (tb & 0xff)) a = 0
					}
					break

				case 3: // Indexed
					{
						const idx = raw[rawOffset++]!
						if (palette) {
							r = palette[idx * 3]!
							g = palette[idx * 3 + 1]!
							b = palette[idx * 3 + 2]!
						}
						if (transparency && idx < transparency.length) {
							a = transparency[idx]!
						}
					}
					break

				case 4: // Grayscale + Alpha
					r = g = b = raw[rawOffset++]!
					a = raw[rawOffset++]!
					break

				case 6: // RGBA
					r = raw[rawOffset++]!
					g = raw[rawOffset++]!
					b = raw[rawOffset++]!
					a = raw[rawOffset++]!
					break
			}

			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = a
		}
	}

	return output
}

/**
 * Decode compressed frame data to RGBA
 */
function decodeFrameData(
	compressed: Uint8Array,
	width: number,
	height: number,
	colorType: ColorType,
	palette?: Uint8Array,
	transparency?: Uint8Array
): Uint8Array {
	// Import inflate from PNG codec
	const { inflate: pngInflate } = require('../png/inflate')
	const decompressed = pngInflate(compressed)

	const bpp = getBytesPerPixel(colorType)
	const scanlineBytes = width * bpp

	// Unfilter scanlines
	const raw = new Uint8Array(scanlineBytes * height)
	let prevScanline: Uint8Array | null = null

	for (let y = 0; y < height; y++) {
		const filterByte = decompressed[y * (scanlineBytes + 1)]!
		const scanline = decompressed.slice(
			y * (scanlineBytes + 1) + 1,
			y * (scanlineBytes + 1) + 1 + scanlineBytes
		)

		const currentScanline = new Uint8Array(scanline)
		unfilterScanline(filterByte, currentScanline, prevScanline, bpp)
		raw.set(currentScanline, y * scanlineBytes)
		prevScanline = currentScanline
	}

	// Convert to RGBA
	return toRGBA(raw, width, height, colorType, palette, transparency)
}

/**
 * Concatenate Uint8Arrays
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
	const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
	const result = new Uint8Array(totalLength)
	let offset = 0
	for (const arr of arrays) {
		result.set(arr, offset)
		offset += arr.length
	}
	return result
}

/**
 * Render frame to canvas with blend operation
 */
function renderFrameToCanvas(
	canvas: Uint8Array,
	frame: ApngFrame,
	canvasWidth: number,
	canvasHeight: number
): void {
	const { imageData, control } = frame
	const { width, height, xOffset, yOffset, blendOp } = control

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const destX = xOffset + x
			const destY = yOffset + y

			if (destX >= canvasWidth || destY >= canvasHeight) continue

			const srcIdx = (y * width + x) * 4
			const destIdx = (destY * canvasWidth + destX) * 4

			const srcR = imageData[srcIdx]!
			const srcG = imageData[srcIdx + 1]!
			const srcB = imageData[srcIdx + 2]!
			const srcA = imageData[srcIdx + 3]!

			if (blendOp === BlendOp.Source) {
				// Source: replace
				canvas[destIdx] = srcR
				canvas[destIdx + 1] = srcG
				canvas[destIdx + 2] = srcB
				canvas[destIdx + 3] = srcA
			} else {
				// Over: alpha composite
				const dstA = canvas[destIdx + 3]!
				if (srcA === 255) {
					canvas[destIdx] = srcR
					canvas[destIdx + 1] = srcG
					canvas[destIdx + 2] = srcB
					canvas[destIdx + 3] = 255
				} else if (srcA > 0) {
					const outA = srcA + dstA * (1 - srcA / 255)
					if (outA > 0) {
						canvas[destIdx] = Math.round(
							(srcR * srcA + canvas[destIdx]! * dstA * (1 - srcA / 255)) / outA
						)
						canvas[destIdx + 1] = Math.round(
							(srcG * srcA + canvas[destIdx + 1]! * dstA * (1 - srcA / 255)) / outA
						)
						canvas[destIdx + 2] = Math.round(
							(srcB * srcA + canvas[destIdx + 2]! * dstA * (1 - srcA / 255)) / outA
						)
						canvas[destIdx + 3] = Math.round(outA)
					}
				}
			}
		}
	}
}

/**
 * Clear frame area to background (transparent black)
 */
function clearFrameArea(canvas: Uint8Array, frame: ApngFrame, canvasWidth: number): void {
	const { control } = frame
	const { width, height, xOffset, yOffset } = control

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const destX = xOffset + x
			const destY = yOffset + y
			const destIdx = (destY * canvasWidth + destX) * 4
			canvas[destIdx] = 0
			canvas[destIdx + 1] = 0
			canvas[destIdx + 2] = 0
			canvas[destIdx + 3] = 0
		}
	}
}

/**
 * Decode APNG to VideoData
 */
export function decodeApng(data: Uint8Array): VideoData {
	// Verify signature
	for (let i = 0; i < 8; i++) {
		if (data[i] !== PNG_SIGNATURE[i]) {
			throw new Error('Invalid PNG signature')
		}
	}

	// Parse chunks
	const chunks = parseChunks(data)

	// Get IHDR
	const ihdrChunk = chunks.find((c) => c.type === ApngChunkType.IHDR)
	if (!ihdrChunk) {
		throw new Error('Missing IHDR chunk')
	}
	const ihdr = parseIHDR(ihdrChunk.data)

	// Validate
	if (ihdr.compressionMethod !== 0) {
		throw new Error('Unknown compression method')
	}
	if (ihdr.filterMethod !== 0) {
		throw new Error('Unknown filter method')
	}
	if (ihdr.interlaceMethod !== 0) {
		throw new Error('Interlaced APNG not supported')
	}

	// Get PLTE (palette)
	const plteChunk = chunks.find((c) => c.type === ApngChunkType.PLTE)
	const palette = plteChunk?.data

	// Get tRNS (transparency)
	const trnsChunk = chunks.find((c) => c.type === ApngChunkType.tRNS)
	const transparency = trnsChunk?.data

	// Get acTL (animation control)
	const actlChunk = chunks.find((c) => c.type === ApngChunkType.acTL)
	if (!actlChunk) {
		throw new Error('Missing acTL chunk - not an APNG')
	}
	const actl = parseACTL(actlChunk.data)

	// Parse frame controls and data
	const frameControls: FrameControl[] = []
	const frameDataChunks: Map<number, Uint8Array[]> = new Map()
	const idatData: Uint8Array[] = []
	let currentFrameIdx = -1

	for (const chunk of chunks) {
		if (chunk.type === ApngChunkType.fcTL) {
			const fc = parseFCTL(chunk.data)
			frameControls.push(fc)
			currentFrameIdx = frameControls.length - 1
			frameDataChunks.set(currentFrameIdx, [])
		} else if (chunk.type === ApngChunkType.IDAT) {
			if (currentFrameIdx >= 0) {
				// Part of animated frame
				const chunks = frameDataChunks.get(currentFrameIdx)!
				chunks.push(chunk.data)
			} else {
				// Default image (first frame if fcTL appeared before)
				idatData.push(chunk.data)
			}
		} else if (chunk.type === ApngChunkType.fdAT) {
			// Skip sequence number (4 bytes)
			const frameData = chunk.data.slice(4)
			if (currentFrameIdx >= 0) {
				const chunks = frameDataChunks.get(currentFrameIdx)!
				chunks.push(frameData)
			}
		}
	}

	// Decode frames
	const frames: ApngFrame[] = []

	for (let i = 0; i < frameControls.length; i++) {
		const fc = frameControls[i]!
		let dataChunks: Uint8Array[]

		if (i === 0 && idatData.length > 0) {
			// First frame uses IDAT data
			dataChunks = idatData
		} else {
			dataChunks = frameDataChunks.get(i) || []
		}

		const compressed = concatUint8Arrays(dataChunks)
		const imageData = decodeFrameData(
			compressed,
			fc.width,
			fc.height,
			ihdr.colorType,
			palette,
			transparency
		)

		frames.push({
			control: fc,
			imageData,
		})
	}

	// Composite frames to video frames
	const videoFrames: VideoFrame[] = []
	let timestamp = 0

	// Canvas for compositing frames
	const canvas = new Uint8Array(ihdr.width * ihdr.height * 4)
	const previousCanvas = new Uint8Array(ihdr.width * ihdr.height * 4)

	for (const frame of frames) {
		// Save previous state if needed
		if (frame.control.disposeOp === DisposeOp.Previous) {
			previousCanvas.set(canvas)
		}

		// Render frame to canvas
		renderFrameToCanvas(canvas, frame, ihdr.width, ihdr.height)

		// Calculate delay in milliseconds
		const delayDen = frame.control.delayDen || 100 // Default to 100 if 0
		const delayMs = (frame.control.delayNum / delayDen) * 1000

		// Create frame copy
		videoFrames.push({
			image: {
				width: ihdr.width,
				height: ihdr.height,
				data: new Uint8Array(canvas),
			},
			timestamp,
			duration: delayMs,
		})

		timestamp += delayMs

		// Handle disposal
		if (frame.control.disposeOp === DisposeOp.Background) {
			clearFrameArea(canvas, frame, ihdr.width)
		} else if (frame.control.disposeOp === DisposeOp.Previous) {
			canvas.set(previousCanvas)
		}
	}

	const totalDuration = timestamp
	const fps = videoFrames.length > 0 ? videoFrames.length / (totalDuration / 1000) : 10

	return {
		width: ihdr.width,
		height: ihdr.height,
		frames: videoFrames,
		duration: totalDuration,
		fps,
	}
}
