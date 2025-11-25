/**
 * Bit reading/writing utilities for WebP VP8L
 */

/**
 * Bit reader for VP8L bitstream (LSB first)
 */
export class VP8LBitReader {
	private data: Uint8Array
	private pos: number
	private bitBuffer: number
	private bitsInBuffer: number

	constructor(data: Uint8Array, startPos = 0) {
		this.data = data
		this.pos = startPos
		this.bitBuffer = 0
		this.bitsInBuffer = 0
	}

	/**
	 * Read n bits (LSB first)
	 */
	readBits(n: number): number {
		while (this.bitsInBuffer < n && this.pos < this.data.length) {
			this.bitBuffer |= this.data[this.pos++]! << this.bitsInBuffer
			this.bitsInBuffer += 8
		}

		const result = this.bitBuffer & ((1 << n) - 1)
		this.bitBuffer >>>= n
		this.bitsInBuffer -= n
		return result
	}

	/**
	 * Read a single bit
	 */
	readBit(): number {
		return this.readBits(1)
	}

	/**
	 * Check if more data available
	 */
	hasMore(): boolean {
		return this.pos < this.data.length || this.bitsInBuffer > 0
	}

	/**
	 * Get current byte position
	 */
	getPosition(): number {
		return this.pos
	}
}

/**
 * Bit writer for VP8L bitstream (LSB first)
 */
export class VP8LBitWriter {
	private buffer: number[]
	private bitBuffer: number
	private bitsInBuffer: number

	constructor() {
		this.buffer = []
		this.bitBuffer = 0
		this.bitsInBuffer = 0
	}

	/**
	 * Write n bits (LSB first)
	 */
	writeBits(value: number, n: number): void {
		this.bitBuffer |= (value & ((1 << n) - 1)) << this.bitsInBuffer
		this.bitsInBuffer += n

		while (this.bitsInBuffer >= 8) {
			this.buffer.push(this.bitBuffer & 0xff)
			this.bitBuffer >>>= 8
			this.bitsInBuffer -= 8
		}
	}

	/**
	 * Write a single bit
	 */
	writeBit(value: number): void {
		this.writeBits(value, 1)
	}

	/**
	 * Flush remaining bits
	 */
	flush(): void {
		if (this.bitsInBuffer > 0) {
			this.buffer.push(this.bitBuffer & 0xff)
			this.bitBuffer = 0
			this.bitsInBuffer = 0
		}
	}

	/**
	 * Get the written data
	 */
	getData(): Uint8Array {
		this.flush()
		return new Uint8Array(this.buffer)
	}
}

/**
 * Read a canonical Huffman code length from bitstream
 */
export function readHuffmanCodeLength(reader: VP8LBitReader, numSymbols: number): number[] {
	const codeLengths = new Array(numSymbols).fill(0)

	// Check for simple code
	const simpleCode = reader.readBit()

	if (simpleCode) {
		// Simple code: 1 or 2 symbols
		const numBits = reader.readBit()
		const firstSymbol = reader.readBits(numBits ? 8 : 1)

		if (reader.readBit()) {
			// Two symbols
			const secondSymbol = reader.readBits(8)
			codeLengths[firstSymbol] = 1
			codeLengths[secondSymbol] = 1
		} else {
			// One symbol
			codeLengths[firstSymbol] = 1
		}
	} else {
		// Normal code: read code lengths
		const numCodeLengths = reader.readBits(4) + 4

		// Code length code order
		const codeOrder = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
		const codeLengthCodeLengths = new Array(19).fill(0)

		for (let i = 0; i < numCodeLengths; i++) {
			codeLengthCodeLengths[codeOrder[i]!] = reader.readBits(3)
		}

		// Build Huffman table for code lengths
		const codeLengthTable = buildHuffmanTable(codeLengthCodeLengths)

		// Read actual code lengths
		let i = 0
		while (i < numSymbols) {
			const symbol = decodeHuffman(reader, codeLengthTable)

			if (symbol < 16) {
				codeLengths[i++] = symbol
			} else if (symbol === 16) {
				// Repeat previous
				const repeat = reader.readBits(2) + 3
				const prev = i > 0 ? codeLengths[i - 1]! : 0
				for (let j = 0; j < repeat && i < numSymbols; j++) {
					codeLengths[i++] = prev
				}
			} else if (symbol === 17) {
				// Repeat 0 (3-10 times)
				const repeat = reader.readBits(3) + 3
				i += repeat
			} else if (symbol === 18) {
				// Repeat 0 (11-138 times)
				const repeat = reader.readBits(7) + 11
				i += repeat
			}
		}
	}

	return codeLengths
}

/**
 * Build Huffman decoding table from code lengths
 */
export function buildHuffmanTable(codeLengths: number[]): { codes: number[]; lengths: number[] } {
	const maxLen = Math.max(...codeLengths, 1)
	const counts = new Array(maxLen + 1).fill(0)
	const nextCode = new Array(maxLen + 1).fill(0)

	// Count codes of each length
	for (const len of codeLengths) {
		if (len > 0) counts[len]++
	}

	// Compute starting code for each length
	let code = 0
	for (let i = 1; i <= maxLen; i++) {
		code = (code + counts[i - 1]!) << 1
		nextCode[i] = code
	}

	// Assign codes to symbols
	const codes: number[] = []
	const lengths: number[] = []

	for (let symbol = 0; symbol < codeLengths.length; symbol++) {
		const len = codeLengths[symbol]!
		if (len > 0) {
			codes[symbol] = nextCode[len]++
			lengths[symbol] = len
		}
	}

	return { codes, lengths }
}

/**
 * Decode a Huffman symbol from bitstream
 */
export function decodeHuffman(
	reader: VP8LBitReader,
	table: { codes: number[]; lengths: number[] }
): number {
	let code = 0
	let len = 0

	// Try each possible length
	for (let bits = 1; bits <= 15; bits++) {
		code = (code << 1) | reader.readBit()
		len++

		// Search for matching symbol
		for (let symbol = 0; symbol < table.lengths.length; symbol++) {
			if (table.lengths[symbol] === len && table.codes[symbol] === code) {
				return symbol
			}
		}
	}

	throw new Error('Invalid Huffman code')
}
