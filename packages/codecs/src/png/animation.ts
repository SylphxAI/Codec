import type { ImageData, VideoData, VideoFrame } from '@mconv/core'
import { deflate } from './deflate'
import { inflate } from './inflate'
import { ColorType, PNG_SIGNATURE } from './types'

// APNG chunk types
const CHUNK_acTL = 0x6163544c // acTL
const CHUNK_fcTL = 0x6663544c // fcTL
const CHUNK_fdAT = 0x66644154 // fdAT
const CHUNK_IHDR = 0x49484452 // IHDR
const CHUNK_IDAT = 0x49444154 // IDAT
const CHUNK_IEND = 0x49454e44 // IEND
const CHUNK_PLTE = 0x504c5445 // PLTE
const CHUNK_tRNS = 0x74524e53 // tRNS

// Dispose operations
const APNG_DISPOSE_OP_NONE = 0
const APNG_DISPOSE_OP_BACKGROUND = 1
const APNG_DISPOSE_OP_PREVIOUS = 2

// Blend operations
const APNG_BLEND_OP_SOURCE = 0
const APNG_BLEND_OP_OVER = 1

interface APNGFrame {
	width: number
	height: number
	xOffset: number
	yOffset: number
	delayNum: number
	delayDen: number
	disposeOp: number
	blendOp: number
	imageData: Uint8Array // Raw RGBA pixels
}

interface APNGImage {
	width: number
	height: number
	numFrames: number
	numPlays: number
	frames: APNGFrame[]
}

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
 * Write 32-bit big-endian unsigned integer
 */
function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
}

/**
 * Write 16-bit big-endian unsigned integer
 */
function writeU16BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 8) & 0xff
	data[offset + 1] = value & 0xff
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
 * Paeth predictor
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
	}
}

/**
 * Decode compressed frame data to RGBA
 */
function decodeFrameData(
	compressed: Uint8Array,
	width: number,
	height: number,
	colorType: number,
	bitDepth: number,
	palette?: Uint8Array,
	transparency?: Uint8Array
): Uint8Array {
	const decompressed = inflate(compressed)
	const bpp =
		colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 3 ? 1 : 1
	const scanlineBytes = width * bpp

	// Unfilter
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
 * Parse APNG chunks
 */
function parseAPNG(data: Uint8Array): APNGImage {
	// Verify signature
	for (let i = 0; i < 8; i++) {
		if (data[i] !== PNG_SIGNATURE[i]) {
			throw new Error('Invalid PNG signature')
		}
	}

	let offset = 8
	let width = 0
	let height = 0
	let colorType = 0
	let bitDepth = 0
	let numFrames = 1
	let numPlays = 0
	let palette: Uint8Array | undefined
	let transparency: Uint8Array | undefined

	interface FrameControl {
		sequenceNumber: number
		width: number
		height: number
		xOffset: number
		yOffset: number
		delayNum: number
		delayDen: number
		disposeOp: number
		blendOp: number
	}

	const frameControls: FrameControl[] = []
	const frameDataChunks: Map<number, Uint8Array[]> = new Map()
	let currentFrameIdx = -1
	const idatData: Uint8Array[] = []

	// Parse chunks
	while (offset < data.length) {
		const length = readU32BE(data, offset)
		const type = readU32BE(data, offset + 4)
		const chunkData = data.slice(offset + 8, offset + 8 + length)

		if (type === CHUNK_IHDR) {
			width = readU32BE(chunkData, 0)
			height = readU32BE(chunkData, 4)
			bitDepth = chunkData[8]!
			colorType = chunkData[9]!
		} else if (type === CHUNK_PLTE) {
			palette = chunkData
		} else if (type === CHUNK_tRNS) {
			transparency = chunkData
		} else if (type === CHUNK_acTL) {
			numFrames = readU32BE(chunkData, 0)
			numPlays = readU32BE(chunkData, 4)
		} else if (type === CHUNK_fcTL) {
			const fc: FrameControl = {
				sequenceNumber: readU32BE(chunkData, 0),
				width: readU32BE(chunkData, 4),
				height: readU32BE(chunkData, 8),
				xOffset: readU32BE(chunkData, 12),
				yOffset: readU32BE(chunkData, 16),
				delayNum: readU16BE(chunkData, 20),
				delayDen: readU16BE(chunkData, 22),
				disposeOp: chunkData[24]!,
				blendOp: chunkData[25]!,
			}
			frameControls.push(fc)
			currentFrameIdx = frameControls.length - 1
			frameDataChunks.set(currentFrameIdx, [])
		} else if (type === CHUNK_IDAT) {
			if (currentFrameIdx >= 0) {
				// Part of animated frame
				const chunks = frameDataChunks.get(currentFrameIdx)!
				chunks.push(chunkData)
			} else {
				// Default image (also first frame if fcTL appeared before)
				idatData.push(chunkData)
			}
		} else if (type === CHUNK_fdAT) {
			// Skip sequence number (4 bytes)
			const frameData = chunkData.slice(4)
			if (currentFrameIdx >= 0) {
				const chunks = frameDataChunks.get(currentFrameIdx)!
				chunks.push(frameData)
			}
		} else if (type === CHUNK_IEND) {
			break
		}

		offset += 12 + length
	}

	// If no animation control, treat as single frame
	if (frameControls.length === 0) {
		const compressed = concatUint8Arrays(idatData)
		const frameData = decodeFrameData(
			compressed,
			width,
			height,
			colorType,
			bitDepth,
			palette,
			transparency
		)
		return {
			width,
			height,
			numFrames: 1,
			numPlays: 0,
			frames: [
				{
					width,
					height,
					xOffset: 0,
					yOffset: 0,
					delayNum: 1,
					delayDen: 10,
					disposeOp: APNG_DISPOSE_OP_NONE,
					blendOp: APNG_BLEND_OP_SOURCE,
					imageData: frameData,
				},
			],
		}
	}

	// Decode frames
	const frames: APNGFrame[] = []

	for (let i = 0; i < frameControls.length; i++) {
		const fc = frameControls[i]!
		let chunks: Uint8Array[]

		if (i === 0 && idatData.length > 0) {
			// First frame uses IDAT data
			chunks = idatData
		} else {
			chunks = frameDataChunks.get(i) || []
		}

		const compressed = concatUint8Arrays(chunks)
		const frameData = decodeFrameData(
			compressed,
			fc.width,
			fc.height,
			colorType,
			bitDepth,
			palette,
			transparency
		)

		frames.push({
			width: fc.width,
			height: fc.height,
			xOffset: fc.xOffset,
			yOffset: fc.yOffset,
			delayNum: fc.delayNum,
			delayDen: fc.delayDen || 100, // Default to 100 if 0
			disposeOp: fc.disposeOp,
			blendOp: fc.blendOp,
			imageData: frameData,
		})
	}

	return {
		width,
		height,
		numFrames,
		numPlays,
		frames,
	}
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
 * Decode APNG to VideoData
 */
export function decodeApngAnimation(data: Uint8Array): VideoData {
	const apng = parseAPNG(data)
	const { width, height, frames } = apng

	const videoFrames: VideoFrame[] = []
	let timestamp = 0

	// Canvas for compositing frames
	const canvas = new Uint8Array(width * height * 4)
	const previousCanvas = new Uint8Array(width * height * 4)

	for (const frame of frames) {
		// Save previous state if needed
		if (frame.disposeOp === APNG_DISPOSE_OP_PREVIOUS) {
			previousCanvas.set(canvas)
		}

		// Render frame to canvas
		renderFrameToCanvas(canvas, frame, width, height)

		// Calculate delay in milliseconds
		const delayMs = (frame.delayNum / frame.delayDen) * 1000

		// Create frame copy
		videoFrames.push({
			image: {
				width,
				height,
				data: new Uint8Array(canvas),
			},
			timestamp,
			duration: delayMs,
		})

		timestamp += delayMs

		// Handle disposal
		if (frame.disposeOp === APNG_DISPOSE_OP_BACKGROUND) {
			clearFrameArea(canvas, frame, width)
		} else if (frame.disposeOp === APNG_DISPOSE_OP_PREVIOUS) {
			canvas.set(previousCanvas)
		}
	}

	const totalDuration = timestamp
	const fps = videoFrames.length > 0 ? videoFrames.length / (totalDuration / 1000) : 10

	return {
		width,
		height,
		frames: videoFrames,
		duration: totalDuration,
		fps,
	}
}

/**
 * Render frame to canvas
 */
function renderFrameToCanvas(
	canvas: Uint8Array,
	frame: APNGFrame,
	canvasWidth: number,
	canvasHeight: number
): void {
	const { imageData, width, height, xOffset, yOffset, blendOp } = frame

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

			if (blendOp === APNG_BLEND_OP_SOURCE) {
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
 * Clear frame area to background (transparent)
 */
function clearFrameArea(canvas: Uint8Array, frame: APNGFrame, canvasWidth: number): void {
	const { width, height, xOffset, yOffset } = frame

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
 * Create a PNG chunk
 */
function createChunk(type: string, data: Uint8Array): Uint8Array {
	const chunk = new Uint8Array(12 + data.length)

	writeU32BE(chunk, 0, data.length)
	chunk[4] = type.charCodeAt(0)
	chunk[5] = type.charCodeAt(1)
	chunk[6] = type.charCodeAt(2)
	chunk[7] = type.charCodeAt(3)
	chunk.set(data, 8)

	const crc = crc32(chunk, 4, data.length + 4)
	writeU32BE(chunk, 8 + data.length, crc)

	return chunk
}

/**
 * Filter scanline for compression
 */
function filterScanline(current: Uint8Array, previous: Uint8Array | null, bpp: number): Uint8Array {
	// Use Sub filter (simple and effective)
	const filtered = new Uint8Array(current.length + 1)
	filtered[0] = 1 // Sub filter

	for (let i = 0; i < current.length; i++) {
		const a = i >= bpp ? current[i - bpp]! : 0
		filtered[i + 1] = (current[i]! - a) & 0xff
	}

	return filtered
}

/**
 * Compress frame data
 */
function compressFrameData(image: ImageData): Uint8Array {
	const { width, height, data } = image
	const bpp = 4 // RGBA
	const scanlineBytes = width * bpp

	const filteredData = new Uint8Array((scanlineBytes + 1) * height)
	let prevScanline: Uint8Array | null = null
	let offset = 0

	for (let y = 0; y < height; y++) {
		const scanline = data.slice(y * scanlineBytes, (y + 1) * scanlineBytes)
		const filtered = filterScanline(scanline, prevScanline, bpp)
		filteredData.set(filtered, offset)
		offset += filtered.length
		prevScanline = scanline
	}

	return deflate(filteredData)
}

/**
 * Encode VideoData to APNG
 */
export function encodeApngAnimation(video: VideoData): Uint8Array {
	const { width, height, frames } = video

	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const chunks: Uint8Array[] = []
	let sequenceNumber = 0

	// Signature
	chunks.push(PNG_SIGNATURE)

	// IHDR
	const ihdrData = new Uint8Array(13)
	writeU32BE(ihdrData, 0, width)
	writeU32BE(ihdrData, 4, height)
	ihdrData[8] = 8 // Bit depth
	ihdrData[9] = ColorType.RGBA // Color type
	ihdrData[10] = 0 // Compression
	ihdrData[11] = 0 // Filter
	ihdrData[12] = 0 // Interlace
	chunks.push(createChunk('IHDR', ihdrData))

	// acTL (animation control)
	const actlData = new Uint8Array(8)
	writeU32BE(actlData, 0, frames.length) // num_frames
	writeU32BE(actlData, 4, 0) // num_plays (0 = infinite)
	chunks.push(createChunk('acTL', actlData))

	// Encode frames
	for (let i = 0; i < frames.length; i++) {
		const frame = frames[i]!
		const { image, duration } = frame

		// Calculate delay as fraction
		const delayMs = duration || 100
		let delayNum = Math.round(delayMs)
		let delayDen = 1000

		// Simplify fraction
		const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
		const d = gcd(delayNum, delayDen)
		delayNum = delayNum / d
		delayDen = delayDen / d

		// Ensure values fit in 16 bits
		while (delayNum > 65535 || delayDen > 65535) {
			delayNum = Math.floor(delayNum / 2)
			delayDen = Math.floor(delayDen / 2)
		}

		// fcTL (frame control)
		const fctlData = new Uint8Array(26)
		writeU32BE(fctlData, 0, sequenceNumber++) // sequence_number
		writeU32BE(fctlData, 4, image.width) // width
		writeU32BE(fctlData, 8, image.height) // height
		writeU32BE(fctlData, 12, 0) // x_offset
		writeU32BE(fctlData, 16, 0) // y_offset
		writeU16BE(fctlData, 20, delayNum) // delay_num
		writeU16BE(fctlData, 22, delayDen) // delay_den
		fctlData[24] = APNG_DISPOSE_OP_NONE // dispose_op
		fctlData[25] = APNG_BLEND_OP_SOURCE // blend_op
		chunks.push(createChunk('fcTL', fctlData))

		// Compress frame data
		const compressed = compressFrameData(image)

		if (i === 0) {
			// First frame uses IDAT
			chunks.push(createChunk('IDAT', compressed))
		} else {
			// Subsequent frames use fdAT
			const fdatData = new Uint8Array(4 + compressed.length)
			writeU32BE(fdatData, 0, sequenceNumber++) // sequence_number
			fdatData.set(compressed, 4)
			chunks.push(createChunk('fdAT', fdatData))
		}
	}

	// IEND
	chunks.push(createChunk('IEND', new Uint8Array(0)))

	// Combine all chunks
	return concatUint8Arrays(chunks)
}
