import type { ImageData, VideoData, VideoFrame } from '@sylphx/codec-core'
import {
	VP8LBitReader,
	VP8LBitWriter,
	buildHuffmanTable,
	decodeHuffman,
	readHuffmanCodeLength,
} from './bitstream'
import {
	CHUNK_ANIM,
	CHUNK_ANMF,
	CHUNK_VP8L,
	CHUNK_VP8X,
	RIFF_SIGNATURE,
	VP8L_SIGNATURE,
	WEBP_SIGNATURE,
} from './types'

// Animation blending mode
const BLEND_ALPHA = 0
const BLEND_NONE = 1

// Animation disposal mode
const DISPOSE_NONE = 0
const DISPOSE_BACKGROUND = 1

interface WebPFrame {
	x: number
	y: number
	width: number
	height: number
	duration: number
	blending: number
	disposal: number
	imageData: Uint8Array // RGBA pixels
}

interface AnimatedWebP {
	width: number
	height: number
	loopCount: number
	bgColor: number
	frames: WebPFrame[]
}

/**
 * Read 32-bit little-endian value
 */
function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	)
}

/**
 * Read 24-bit little-endian value
 */
function readU24LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16)
}

/**
 * Write 32-bit little-endian value
 */
function writeU32LE(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]
}

/**
 * Write 24-bit little-endian value
 */
function writeU24LE(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]
}

/**
 * Decode VP8L frame data
 */
function decodeVP8LFrame(data: Uint8Array): ImageData {
	// Check signature
	if (data[0] !== VP8L_SIGNATURE) {
		throw new Error('Invalid VP8L signature')
	}

	const reader = new VP8LBitReader(data, 1)

	// Read image size
	const width = reader.readBits(14) + 1
	const height = reader.readBits(14) + 1
	const hasAlpha = reader.readBit() === 1
	const version = reader.readBits(3)

	if (version !== 0) {
		throw new Error(`Unsupported VP8L version: ${version}`)
	}

	// Skip transforms (not yet supported)
	while (reader.readBit()) {
		throw new Error('Transforms not yet supported')
	}

	// Read color cache size
	let colorCacheSize = 0
	if (reader.readBit()) {
		const colorCacheBits = reader.readBits(4)
		if (colorCacheBits > 11) {
			throw new Error(`Invalid color cache bits: ${colorCacheBits}`)
		}
		colorCacheSize = 1 << colorCacheBits
	}

	// Decode image data
	const pixels = decodeImageData(reader, width, height, colorCacheSize)

	// Convert ARGB to RGBA
	const output = new Uint8Array(width * height * 4)
	for (let i = 0; i < width * height; i++) {
		const argb = pixels[i]!
		output[i * 4] = (argb >> 16) & 0xff // R
		output[i * 4 + 1] = (argb >> 8) & 0xff // G
		output[i * 4 + 2] = argb & 0xff // B
		output[i * 4 + 3] = hasAlpha ? (argb >> 24) & 0xff : 255 // A
	}

	return { width, height, data: output }
}

interface HuffmanGroup {
	green: { codes: number[]; lengths: number[] }
	red: { codes: number[]; lengths: number[] }
	blue: { codes: number[]; lengths: number[] }
	alpha: { codes: number[]; lengths: number[] }
	distance: { codes: number[]; lengths: number[] }
}

/**
 * Decode image data using entropy coding
 */
function decodeImageData(
	reader: VP8LBitReader,
	width: number,
	height: number,
	colorCacheSize: number
): Uint32Array {
	const numPixels = width * height
	const pixels = new Uint32Array(numPixels)

	const colorCache = colorCacheSize > 0 ? new Uint32Array(colorCacheSize) : null

	const useMetaHuffman = reader.readBit()
	if (useMetaHuffman) {
		throw new Error('Meta Huffman codes not yet supported')
	}

	const huffmanGroup = readHuffmanGroup(reader, colorCacheSize)

	let pixelIdx = 0
	while (pixelIdx < numPixels) {
		const code = decodeHuffman(reader, huffmanGroup.green)

		if (code < 256) {
			const green = code
			const red = decodeHuffman(reader, huffmanGroup.red)
			const blue = decodeHuffman(reader, huffmanGroup.blue)
			const alpha = decodeHuffman(reader, huffmanGroup.alpha)

			const pixel = (alpha << 24) | (red << 16) | (green << 8) | blue
			pixels[pixelIdx++] = pixel

			if (colorCache) {
				const hash = (pixel * 0x1e35a7bd) >>> (32 - Math.log2(colorCacheSize))
				colorCache[hash] = pixel
			}
		} else if (code < 256 + 24) {
			const lengthCode = code - 256
			const length = decodeLengthOrDistance(reader, lengthCode)

			const distanceCode = decodeHuffman(reader, huffmanGroup.distance)
			const distance = decodeLengthOrDistance(reader, distanceCode)

			for (let i = 0; i < length && pixelIdx < numPixels; i++) {
				const srcIdx = pixelIdx - distance
				if (srcIdx < 0) {
					pixels[pixelIdx++] = 0xff000000
				} else {
					const pixel = pixels[srcIdx]!
					pixels[pixelIdx++] = pixel

					if (colorCache) {
						const hash = (pixel * 0x1e35a7bd) >>> (32 - Math.log2(colorCacheSize))
						colorCache[hash] = pixel
					}
				}
			}
		} else if (colorCache) {
			const cacheIdx = code - 256 - 24
			if (cacheIdx < colorCacheSize) {
				const pixel = colorCache[cacheIdx]!
				pixels[pixelIdx++] = pixel
			}
		}
	}

	return pixels
}

/**
 * Read a Huffman group
 */
function readHuffmanGroup(reader: VP8LBitReader, colorCacheSize: number): HuffmanGroup {
	const greenSize = 256 + 24 + colorCacheSize
	const greenLengths = readHuffmanCodeLength(reader, greenSize)
	const redLengths = readHuffmanCodeLength(reader, 256)
	const blueLengths = readHuffmanCodeLength(reader, 256)
	const alphaLengths = readHuffmanCodeLength(reader, 256)
	const distanceLengths = readHuffmanCodeLength(reader, 40)

	return {
		green: buildHuffmanTable(greenLengths),
		red: buildHuffmanTable(redLengths),
		blue: buildHuffmanTable(blueLengths),
		alpha: buildHuffmanTable(alphaLengths),
		distance: buildHuffmanTable(distanceLengths),
	}
}

/**
 * Decode length or distance from extra bits
 */
function decodeLengthOrDistance(reader: VP8LBitReader, code: number): number {
	const extraBits = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]
	const offsets = [
		1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
		3073,
	]

	if (code < extraBits.length) {
		const extra = extraBits[code]!
		const offset = offsets[code]!
		return offset + reader.readBits(extra)
	}

	return code + 1
}

/**
 * Parse animated WebP
 */
function parseAnimatedWebP(data: Uint8Array): AnimatedWebP {
	// Verify RIFF header
	if (readU32LE(data, 0) !== RIFF_SIGNATURE) {
		throw new Error('Invalid WebP: not a RIFF file')
	}

	if (readU32LE(data, 8) !== WEBP_SIGNATURE) {
		throw new Error('Invalid WebP: not a WEBP file')
	}

	let pos = 12
	let width = 0
	let height = 0
	let loopCount = 0
	let bgColor = 0
	const frames: WebPFrame[] = []

	while (pos < data.length) {
		const chunkType = readU32LE(data, pos)
		const chunkSize = readU32LE(data, pos + 4)
		const chunkData = data.slice(pos + 8, pos + 8 + chunkSize)

		if (chunkType === CHUNK_VP8X) {
			// Extended format header
			width = readU24LE(chunkData, 4) + 1
			height = readU24LE(chunkData, 7) + 1
		} else if (chunkType === CHUNK_ANIM) {
			// Animation global data
			bgColor = readU32LE(chunkData, 0)
			loopCount = chunkData[4]! | (chunkData[5]! << 8)
		} else if (chunkType === CHUNK_ANMF) {
			// Animation frame
			const frameX = readU24LE(chunkData, 0) * 2
			const frameY = readU24LE(chunkData, 3) * 2
			const frameWidth = (readU24LE(chunkData, 6) & 0xffffff) + 1
			const frameHeight = (readU24LE(chunkData, 9) & 0xffffff) + 1
			const duration = readU24LE(chunkData, 12)
			const flags = chunkData[15]!
			const blending = (flags >> 1) & 1
			const disposal = flags & 1

			// Frame data starts at offset 16
			const frameDataStart = 16
			const frameChunkType = readU32LE(chunkData, frameDataStart)
			const frameChunkSize = readU32LE(chunkData, frameDataStart + 4)
			const frameVP8LData = chunkData.slice(frameDataStart + 8, frameDataStart + 8 + frameChunkSize)

			if (frameChunkType === CHUNK_VP8L) {
				const image = decodeVP8LFrame(frameVP8LData)
				frames.push({
					x: frameX,
					y: frameY,
					width: frameWidth,
					height: frameHeight,
					duration,
					blending,
					disposal,
					imageData: image.data,
				})
			}
		} else if (chunkType === CHUNK_VP8L) {
			// Single frame (non-animated)
			const image = decodeVP8LFrame(chunkData)
			width = image.width
			height = image.height
			frames.push({
				x: 0,
				y: 0,
				width: image.width,
				height: image.height,
				duration: 100,
				blending: BLEND_NONE,
				disposal: DISPOSE_NONE,
				imageData: image.data,
			})
		}

		pos += 8 + chunkSize + (chunkSize & 1)
	}

	return { width, height, loopCount, bgColor, frames }
}

/**
 * Decode animated WebP to VideoData
 */
export function decodeWebPAnimation(data: Uint8Array): VideoData {
	const webp = parseAnimatedWebP(data)
	const { width, height, frames } = webp

	const videoFrames: VideoFrame[] = []
	let timestamp = 0

	// Canvas for compositing
	const canvas = new Uint8Array(width * height * 4)
	const previousCanvas = new Uint8Array(width * height * 4)

	for (const frame of frames) {
		// Save previous state if needed
		if (frame.disposal === DISPOSE_BACKGROUND) {
			// Will clear after rendering
		}
		previousCanvas.set(canvas)

		// Render frame to canvas
		renderFrameToCanvas(canvas, frame, width, height)

		// Create frame
		videoFrames.push({
			image: {
				width,
				height,
				data: new Uint8Array(canvas),
			},
			timestamp,
			duration: frame.duration || 100,
		})

		timestamp += frame.duration || 100

		// Handle disposal
		if (frame.disposal === DISPOSE_BACKGROUND) {
			clearFrameArea(canvas, frame, width)
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
	frame: WebPFrame,
	canvasWidth: number,
	canvasHeight: number
): void {
	const { imageData, width, height, x, y, blending } = frame

	for (let fy = 0; fy < height; fy++) {
		for (let fx = 0; fx < width; fx++) {
			const destX = x + fx
			const destY = y + fy

			if (destX >= canvasWidth || destY >= canvasHeight) continue

			const srcIdx = (fy * width + fx) * 4
			const destIdx = (destY * canvasWidth + destX) * 4

			const srcR = imageData[srcIdx]!
			const srcG = imageData[srcIdx + 1]!
			const srcB = imageData[srcIdx + 2]!
			const srcA = imageData[srcIdx + 3]!

			if (blending === BLEND_NONE) {
				canvas[destIdx] = srcR
				canvas[destIdx + 1] = srcG
				canvas[destIdx + 2] = srcB
				canvas[destIdx + 3] = srcA
			} else {
				// Alpha blending
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
 * Clear frame area
 */
function clearFrameArea(canvas: Uint8Array, frame: WebPFrame, canvasWidth: number): void {
	const { width, height, x, y } = frame

	for (let fy = 0; fy < height; fy++) {
		for (let fx = 0; fx < width; fx++) {
			const destX = x + fx
			const destY = y + fy
			const destIdx = (destY * canvasWidth + destX) * 4
			canvas[destIdx] = 0
			canvas[destIdx + 1] = 0
			canvas[destIdx + 2] = 0
			canvas[destIdx + 3] = 0
		}
	}
}

/**
 * Encode VP8L frame data
 */
function encodeVP8LFrame(image: ImageData): Uint8Array {
	const { width, height, data } = image

	// Convert RGBA to ARGB
	const pixels = new Uint32Array(width * height)
	let hasAlpha = false

	for (let i = 0; i < width * height; i++) {
		const r = data[i * 4]!
		const g = data[i * 4 + 1]!
		const b = data[i * 4 + 2]!
		const a = data[i * 4 + 3]!

		if (a !== 255) hasAlpha = true
		pixels[i] = (a << 24) | (r << 16) | (g << 8) | b
	}

	const writer = new VP8LBitWriter()
	const output: number[] = [VP8L_SIGNATURE]

	// Write header
	writer.writeBits(width - 1, 14)
	writer.writeBits(height - 1, 14)
	writer.writeBit(hasAlpha ? 1 : 0)
	writer.writeBits(0, 3) // Version 0

	// No transforms
	writer.writeBit(0)

	// No color cache
	writer.writeBit(0)

	// No meta Huffman codes
	writer.writeBit(0)

	// Encode image data
	encodeImageDataSimple(writer, pixels)

	const bitstreamData = writer.getData()
	for (const byte of bitstreamData) {
		output.push(byte)
	}

	return new Uint8Array(output)
}

/**
 * Simple image data encoding with literals only
 */
function encodeImageDataSimple(writer: VP8LBitWriter, pixels: Uint32Array): void {
	// Collect frequencies
	const greenFreq = new Array(256 + 24).fill(0)
	const redFreq = new Array(256).fill(0)
	const blueFreq = new Array(256).fill(0)
	const alphaFreq = new Array(256).fill(0)

	for (const pixel of pixels) {
		const a = (pixel >> 24) & 0xff
		const r = (pixel >> 16) & 0xff
		const g = (pixel >> 8) & 0xff
		const b = pixel & 0xff

		greenFreq[g]++
		redFreq[r]++
		blueFreq[b]++
		alphaFreq[a]++
	}

	// Build Huffman codes
	const greenLengths = buildCodeLengths(greenFreq)
	const redLengths = buildCodeLengths(redFreq)
	const blueLengths = buildCodeLengths(blueFreq)
	const alphaLengths = buildCodeLengths(alphaFreq)
	const distanceLengths = new Array(40).fill(0)
	distanceLengths[0] = 1

	// Write Huffman tables
	writeHuffmanCode(writer, greenLengths)
	writeHuffmanCode(writer, redLengths)
	writeHuffmanCode(writer, blueLengths)
	writeHuffmanCode(writer, alphaLengths)
	writeHuffmanCode(writer, distanceLengths)

	// Build encoding tables
	const greenCodes = buildEncodingTable(greenLengths)
	const redCodes = buildEncodingTable(redLengths)
	const blueCodes = buildEncodingTable(blueLengths)
	const alphaCodes = buildEncodingTable(alphaLengths)

	// Encode pixels
	for (const pixel of pixels) {
		const a = (pixel >> 24) & 0xff
		const r = (pixel >> 16) & 0xff
		const g = (pixel >> 8) & 0xff
		const b = pixel & 0xff

		writeHuffmanSymbol(writer, greenCodes, g)
		writeHuffmanSymbol(writer, redCodes, r)
		writeHuffmanSymbol(writer, blueCodes, b)
		writeHuffmanSymbol(writer, alphaCodes, a)
	}
}

/**
 * Build canonical Huffman code lengths
 */
function buildCodeLengths(freq: number[]): number[] {
	const MAX_CODE_LENGTH = 15

	const symbols: { symbol: number; freq: number }[] = []
	for (let i = 0; i < freq.length; i++) {
		if (freq[i]! > 0) {
			symbols.push({ symbol: i, freq: freq[i]! })
		}
	}

	if (symbols.length === 0) {
		const lengths = new Array(freq.length).fill(0)
		lengths[0] = 1
		return lengths
	}

	if (symbols.length === 1) {
		const lengths = new Array(freq.length).fill(0)
		lengths[symbols[0]!.symbol] = 1
		return lengths
	}

	symbols.sort((a, b) => a.freq - b.freq)

	interface Node {
		freq: number
		symbol?: number
		left?: Node
		right?: Node
	}

	const nodes: Node[] = symbols.map((s) => ({ freq: s.freq, symbol: s.symbol }))

	while (nodes.length > 1) {
		nodes.sort((a, b) => a.freq - b.freq)
		const left = nodes.shift()!
		const right = nodes.shift()!
		nodes.push({ freq: left.freq + right.freq, left, right })
	}

	const lengths = new Array(freq.length).fill(0)

	const assignLengths = (node: Node, depth: number) => {
		if (node.symbol !== undefined) {
			lengths[node.symbol] = Math.min(depth, MAX_CODE_LENGTH)
		} else {
			if (node.left) assignLengths(node.left, depth + 1)
			if (node.right) assignLengths(node.right, depth + 1)
		}
	}

	assignLengths(nodes[0]!, 0)

	for (let i = 0; i < lengths.length; i++) {
		if (freq[i]! > 0 && lengths[i] === 0) {
			lengths[i] = 1
		}
	}

	return lengths
}

/**
 * Write Huffman code to bitstream
 */
function writeHuffmanCode(writer: VP8LBitWriter, lengths: number[]): void {
	const usedSymbols: number[] = []
	for (let i = 0; i < lengths.length; i++) {
		if (lengths[i]! > 0) {
			usedSymbols.push(i)
		}
	}

	if (usedSymbols.length <= 2) {
		writer.writeBit(1)

		if (usedSymbols.length === 1) {
			const symbol = usedSymbols[0]!
			if (symbol < 2) {
				writer.writeBit(0)
				writer.writeBits(symbol, 1)
			} else {
				writer.writeBit(1)
				writer.writeBits(symbol, 8)
			}
			writer.writeBit(0)
		} else {
			const first = usedSymbols[0]!
			const second = usedSymbols[1]!
			writer.writeBit(1)
			writer.writeBits(first, 8)
			writer.writeBit(1)
			writer.writeBits(second, 8)
		}
	} else {
		writer.writeBit(0)

		const codeOrder = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
		const codeLengthCodeLengths = new Array(19).fill(0)

		for (let i = 0; i < lengths.length && i < 16; i++) {
			if (lengths[i]! > 0) {
				codeLengthCodeLengths[lengths[i]!] = 3
			}
		}

		let numCodeLengths = 4
		for (let i = 18; i >= 4; i--) {
			if (codeLengthCodeLengths[codeOrder[i]!]! > 0) {
				numCodeLengths = i + 1
				break
			}
		}

		writer.writeBits(numCodeLengths - 4, 4)

		for (let i = 0; i < numCodeLengths; i++) {
			writer.writeBits(codeLengthCodeLengths[codeOrder[i]!]!, 3)
		}

		for (let i = 0; i < lengths.length; i++) {
			const len = lengths[i]!
			writer.writeBits(len & 7, 3)
		}
	}
}

interface EncodingEntry {
	code: number
	length: number
}

/**
 * Build encoding table from code lengths
 */
function buildEncodingTable(lengths: number[]): EncodingEntry[] {
	const table: EncodingEntry[] = []
	const maxLen = Math.max(...lengths, 1)
	const counts = new Array(maxLen + 1).fill(0)
	const nextCode = new Array(maxLen + 1).fill(0)

	for (const len of lengths) {
		if (len > 0) counts[len]++
	}

	let code = 0
	for (let i = 1; i <= maxLen; i++) {
		code = (code + counts[i - 1]!) << 1
		nextCode[i] = code
	}

	for (let symbol = 0; symbol < lengths.length; symbol++) {
		const len = lengths[symbol]!
		if (len > 0) {
			table[symbol] = { code: nextCode[len]++, length: len }
		} else {
			table[symbol] = { code: 0, length: 0 }
		}
	}

	return table
}

/**
 * Write a Huffman-encoded symbol
 */
function writeHuffmanSymbol(writer: VP8LBitWriter, table: EncodingEntry[], symbol: number): void {
	const entry = table[symbol]
	if (entry && entry.length > 0) {
		for (let i = entry.length - 1; i >= 0; i--) {
			writer.writeBit((entry.code >> i) & 1)
		}
	}
}

/**
 * Encode VideoData to animated WebP
 */
export function encodeWebPAnimation(video: VideoData): Uint8Array {
	const { width, height, frames } = video

	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const output: number[] = []

	// RIFF header
	output.push(...writeU32LE(RIFF_SIGNATURE))
	const fileSizePos = output.length
	output.push(0, 0, 0, 0) // Placeholder

	// WEBP signature
	output.push(...writeU32LE(WEBP_SIGNATURE))

	// VP8X chunk (extended format)
	output.push(...writeU32LE(CHUNK_VP8X))
	output.push(...writeU32LE(10)) // Chunk size
	output.push(0x02) // Flags: has animation
	output.push(0, 0, 0) // Reserved
	output.push(...writeU24LE(width - 1))
	output.push(...writeU24LE(height - 1))

	// ANIM chunk (animation parameters)
	output.push(...writeU32LE(CHUNK_ANIM))
	output.push(...writeU32LE(6)) // Chunk size
	output.push(0, 0, 0, 0) // Background color (transparent)
	output.push(0, 0) // Loop count (0 = infinite)

	// ANMF chunks (frames)
	for (const frame of frames) {
		const vp8lData = encodeVP8LFrame(frame.image)

		// VP8L chunk size (with padding)
		const vp8lChunkSize = 8 + vp8lData.length
		const vp8lPadding = vp8lData.length & 1 ? 1 : 0

		// Frame header size: 16 bytes
		// Frame data: VP8L chunk (8 byte header + data + padding)
		const anmfDataSize = 16 + vp8lChunkSize + vp8lPadding

		output.push(...writeU32LE(CHUNK_ANMF))
		output.push(...writeU32LE(anmfDataSize))

		// Frame position (divided by 2)
		output.push(...writeU24LE(0)) // X / 2
		output.push(...writeU24LE(0)) // Y / 2

		// Frame size - 1
		output.push(...writeU24LE(frame.image.width - 1))
		output.push(...writeU24LE(frame.image.height - 1))

		// Duration in ms (24-bit)
		const duration = frame.duration || 100
		output.push(...writeU24LE(duration))

		// Flags: blending = none (bit 1), disposal = none (bit 0)
		output.push(0x02) // No blending, no disposal

		// VP8L chunk
		output.push(...writeU32LE(CHUNK_VP8L))
		output.push(...writeU32LE(vp8lData.length))
		for (const byte of vp8lData) {
			output.push(byte)
		}

		// Pad VP8L to even boundary
		if (vp8lPadding) {
			output.push(0)
		}

		// Pad ANMF chunk to even boundary
		if (anmfDataSize & 1) {
			output.push(0)
		}
	}

	// Update file size
	const fileSize = output.length - 8
	output[fileSizePos] = fileSize & 0xff
	output[fileSizePos + 1] = (fileSize >> 8) & 0xff
	output[fileSizePos + 2] = (fileSize >> 16) & 0xff
	output[fileSizePos + 3] = (fileSize >> 24) & 0xff

	return new Uint8Array(output)
}
