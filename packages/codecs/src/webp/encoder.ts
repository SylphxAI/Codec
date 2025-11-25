import type { EncodeOptions, ImageData } from '@mconv/core'
import { VP8LBitWriter } from './bitstream'
import { CHUNK_VP8L, RIFF_SIGNATURE, VP8L_SIGNATURE, WEBP_SIGNATURE } from './types'

/**
 * Write 32-bit little-endian value
 */
function writeU32LE(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]
}

/**
 * Encode ImageData to WebP (lossless)
 */
export function encodeWebP(image: ImageData, _options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Convert RGBA to ARGB pixels
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

	// Encode VP8L bitstream
	const vp8lData = encodeVP8L(pixels, width, height, hasAlpha)

	// Build RIFF container
	const output: number[] = []

	// RIFF header
	output.push(...writeU32LE(RIFF_SIGNATURE))

	// File size placeholder (will be updated)
	const fileSizePos = output.length
	output.push(0, 0, 0, 0)

	// WEBP signature
	output.push(...writeU32LE(WEBP_SIGNATURE))

	// VP8L chunk
	output.push(...writeU32LE(CHUNK_VP8L))
	output.push(...writeU32LE(vp8lData.length))
	for (const byte of vp8lData) {
		output.push(byte)
	}

	// Pad to even boundary
	if (vp8lData.length & 1) {
		output.push(0)
	}

	// Update file size
	const fileSize = output.length - 8
	output[fileSizePos] = fileSize & 0xff
	output[fileSizePos + 1] = (fileSize >> 8) & 0xff
	output[fileSizePos + 2] = (fileSize >> 16) & 0xff
	output[fileSizePos + 3] = (fileSize >> 24) & 0xff

	return new Uint8Array(output)
}

/**
 * Encode VP8L (lossless) bitstream
 */
function encodeVP8L(
	pixels: Uint32Array,
	width: number,
	height: number,
	hasAlpha: boolean
): Uint8Array {
	const writer = new VP8LBitWriter()

	// Write VP8L signature
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

	// Encode image data using simple Huffman coding
	encodeImageDataSimple(writer, pixels, width, height)

	// Get bitstream
	const bitstreamData = writer.getData()
	for (const byte of bitstreamData) {
		output.push(byte)
	}

	return new Uint8Array(output)
}

/**
 * Simple image data encoding with literals only
 */
function encodeImageDataSimple(
	writer: VP8LBitWriter,
	pixels: Uint32Array,
	_width: number,
	_height: number
): void {
	// Collect symbol frequencies
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
	distanceLengths[0] = 1 // At least one code

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

	// Encode pixels as literals
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
 * Build canonical Huffman code lengths from frequencies
 */
function buildCodeLengths(freq: number[]): number[] {
	const MAX_CODE_LENGTH = 15

	// Find symbols with non-zero frequency
	const symbols: { symbol: number; freq: number }[] = []
	for (let i = 0; i < freq.length; i++) {
		if (freq[i]! > 0) {
			symbols.push({ symbol: i, freq: freq[i]! })
		}
	}

	if (symbols.length === 0) {
		// No symbols - use first symbol with length 1
		const lengths = new Array(freq.length).fill(0)
		lengths[0] = 1
		return lengths
	}

	if (symbols.length === 1) {
		// Single symbol
		const lengths = new Array(freq.length).fill(0)
		lengths[symbols[0]!.symbol] = 1
		return lengths
	}

	// Sort by frequency (ascending)
	symbols.sort((a, b) => a.freq - b.freq)

	// Build Huffman tree using simple algorithm
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

	// Get code lengths from tree
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

	// Ensure at least length 1 for used symbols
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
	// Check if we can use simple code
	const usedSymbols: number[] = []
	for (let i = 0; i < lengths.length; i++) {
		if (lengths[i]! > 0) {
			usedSymbols.push(i)
		}
	}

	if (usedSymbols.length <= 2) {
		// Simple code
		writer.writeBit(1)

		if (usedSymbols.length === 1) {
			const symbol = usedSymbols[0]!
			if (symbol < 2) {
				writer.writeBit(0) // 1-bit symbol
				writer.writeBits(symbol, 1)
			} else {
				writer.writeBit(1) // 8-bit symbol
				writer.writeBits(symbol, 8)
			}
			writer.writeBit(0) // Single symbol
		} else {
			const first = usedSymbols[0]!
			const second = usedSymbols[1]!
			writer.writeBit(1) // 8-bit symbol
			writer.writeBits(first, 8)
			writer.writeBit(1) // Two symbols
			writer.writeBits(second, 8)
		}
	} else {
		// Normal code
		writer.writeBit(0)

		// Write code length code lengths
		const codeOrder = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
		const codeLengthCodeLengths = new Array(19).fill(0)

		// Simple: just use direct code lengths (no RLE)
		let maxUsedLength = 0
		for (let i = 0; i < lengths.length && i < 16; i++) {
			if (lengths[i]! > 0) {
				codeLengthCodeLengths[lengths[i]!] = 3
				maxUsedLength = Math.max(maxUsedLength, i + 1)
			}
		}

		// Find how many code lengths to write
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

		// Write actual code lengths
		for (let i = 0; i < lengths.length; i++) {
			const len = lengths[i]!
			// Simple: write each length as 3-bit value (0-7)
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

	// Count codes of each length
	for (const len of lengths) {
		if (len > 0) counts[len]++
	}

	// Compute starting code for each length
	let code = 0
	for (let i = 1; i <= maxLen; i++) {
		code = (code + counts[i - 1]!) << 1
		nextCode[i] = code
	}

	// Assign codes
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
		// Write bits MSB first (canonical Huffman)
		for (let i = entry.length - 1; i >= 0; i--) {
			writer.writeBit((entry.code >> i) & 1)
		}
	}
}
