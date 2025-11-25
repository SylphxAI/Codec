/**
 * JPEG Huffman decoding
 */

import type { HuffmanTable } from './types'

/**
 * Build Huffman decoding tables from bits and values
 */
export function buildHuffmanTable(bits: number[], values: number[]): HuffmanTable {
	const huffSize: number[] = []
	const huffCode: number[] = []

	// Generate size table (JPEG spec Figure C.1)
	let k = 0
	for (let i = 1; i <= 16; i++) {
		for (let j = 0; j < bits[i - 1]!; j++) {
			huffSize[k++] = i
		}
	}
	huffSize[k] = 0
	const lastK = k

	// Generate code table (JPEG spec Figure C.2)
	k = 0
	let code = 0
	let si = huffSize[0]!

	while (huffSize[k]! !== 0) {
		while (huffSize[k] === si) {
			huffCode[k++] = code++
		}
		code <<= 1
		si++
	}

	// Generate decoding tables (JPEG spec Figure F.15)
	const maxCode: number[] = new Array(17).fill(-1)
	const valPtr: number[] = new Array(17).fill(0)

	let j = 0
	for (let i = 1; i <= 16; i++) {
		if (bits[i - 1]! !== 0) {
			valPtr[i] = j
			maxCode[i] = huffCode[j + bits[i - 1]! - 1]!
			j += bits[i - 1]!
		}
	}

	return {
		bits,
		values,
		maxCode,
		valPtr,
		huffVal: values,
	}
}

/**
 * Bit reader for JPEG entropy-coded data
 */
export class JpegBitReader {
	private data: Uint8Array
	private pos: number
	private bitBuffer = 0
	private bitsInBuffer = 0

	constructor(data: Uint8Array, startPos: number) {
		this.data = data
		this.pos = startPos
	}

	/**
	 * Get current position in data
	 */
	getPosition(): number {
		return this.pos
	}

	/**
	 * Read next byte, handling stuffed 0x00 after 0xFF
	 */
	private nextByte(): number {
		if (this.pos >= this.data.length) {
			return 0xff // Padding
		}

		const byte = this.data[this.pos++]!

		// Handle byte stuffing: 0xFF 0x00 -> 0xFF
		if (byte === 0xff) {
			const next = this.data[this.pos]
			if (next === 0x00) {
				this.pos++ // Skip stuffed byte
			} else if (next !== undefined && next >= 0xd0 && next <= 0xd7) {
				// RST marker - skip it and continue
				this.pos++
				return this.nextByte()
			}
		}

		return byte
	}

	/**
	 * Read n bits from stream
	 */
	readBits(n: number): number {
		while (this.bitsInBuffer < n) {
			this.bitBuffer = (this.bitBuffer << 8) | this.nextByte()
			this.bitsInBuffer += 8
		}

		this.bitsInBuffer -= n
		return (this.bitBuffer >> this.bitsInBuffer) & ((1 << n) - 1)
	}

	/**
	 * Peek at n bits without consuming
	 */
	peekBits(n: number): number {
		while (this.bitsInBuffer < n) {
			this.bitBuffer = (this.bitBuffer << 8) | this.nextByte()
			this.bitsInBuffer += 8
		}

		return (this.bitBuffer >> (this.bitsInBuffer - n)) & ((1 << n) - 1)
	}

	/**
	 * Skip n bits
	 */
	skipBits(n: number): void {
		this.readBits(n)
	}

	/**
	 * Decode a Huffman symbol
	 */
	decodeHuffman(table: HuffmanTable): number {
		let code = 0

		for (let i = 1; i <= 16; i++) {
			code = (code << 1) | this.readBits(1)

			if (code <= table.maxCode[i]!) {
				const j = table.valPtr[i]! + code - (table.maxCode[i]! - table.bits[i - 1]! + 1)
				return table.huffVal[j]!
			}
		}

		throw new Error('Invalid Huffman code')
	}

	/**
	 * Receive and extend a value (JPEG spec Figure F.12)
	 */
	receiveExtend(length: number): number {
		if (length === 0) return 0

		const value = this.readBits(length)
		const threshold = 1 << (length - 1)

		if (value < threshold) {
			return value - (2 * threshold - 1)
		}
		return value
	}

	/**
	 * Align to byte boundary
	 */
	alignToByte(): void {
		this.bitsInBuffer = 0
		this.bitBuffer = 0
	}
}
