/**
 * Pure TypeScript inflate (zlib/deflate decompression) implementation
 * Based on RFC 1951 (DEFLATE) and RFC 1950 (ZLIB)
 */

/**
 * Bit reader for reading bits from a byte stream
 */
class BitReader {
	private data: Uint8Array
	private pos = 0
	private bitPos = 0
	private currentByte = 0

	constructor(data: Uint8Array) {
		this.data = data
		if (data.length > 0) {
			this.currentByte = data[0]!
		}
	}

	/**
	 * Read n bits (LSB first)
	 */
	readBits(n: number): number {
		let result = 0
		let bitsRead = 0

		while (bitsRead < n) {
			if (this.bitPos === 8) {
				this.pos++
				if (this.pos >= this.data.length) {
					throw new Error('Unexpected end of data')
				}
				this.currentByte = this.data[this.pos]!
				this.bitPos = 0
			}

			const bitsAvailable = 8 - this.bitPos
			const bitsToRead = Math.min(bitsAvailable, n - bitsRead)
			const mask = (1 << bitsToRead) - 1
			const bits = (this.currentByte >> this.bitPos) & mask

			result |= bits << bitsRead
			bitsRead += bitsToRead
			this.bitPos += bitsToRead
		}

		return result
	}

	/**
	 * Read a byte (aligned)
	 */
	readByte(): number {
		this.alignToByte()
		if (this.pos >= this.data.length) {
			throw new Error('Unexpected end of data')
		}
		const byte = this.data[this.pos++]!
		// Update currentByte for subsequent bit reads
		if (this.pos < this.data.length) {
			this.currentByte = this.data[this.pos]!
		}
		return byte
	}

	/**
	 * Read bytes
	 */
	readBytes(n: number): Uint8Array {
		this.alignToByte()
		if (this.pos + n > this.data.length) {
			throw new Error('Unexpected end of data')
		}
		const result = this.data.slice(this.pos, this.pos + n)
		this.pos += n
		// Update currentByte for subsequent bit reads
		if (this.pos < this.data.length) {
			this.currentByte = this.data[this.pos]!
		}
		return result
	}

	/**
	 * Align to byte boundary
	 */
	alignToByte(): void {
		if (this.bitPos > 0) {
			this.bitPos = 0
			this.pos++
			if (this.pos < this.data.length) {
				this.currentByte = this.data[this.pos]!
			}
		}
	}

	/**
	 * Check if at end of data
	 */
	isAtEnd(): boolean {
		return this.pos >= this.data.length
	}
}

/**
 * Huffman code table for decoding
 */
class HuffmanTable {
	private counts: number[] = []
	private symbols: number[] = []
	private maxBits = 0

	constructor(lengths: number[]) {
		if (lengths.length === 0) return

		// Count code lengths
		this.maxBits = Math.max(...lengths)
		const blCount = new Array(this.maxBits + 1).fill(0)
		for (const len of lengths) {
			if (len > 0) blCount[len]++
		}

		// Calculate starting codes for each length
		const nextCode = new Array(this.maxBits + 1).fill(0)
		let code = 0
		for (let bits = 1; bits <= this.maxBits; bits++) {
			code = (code + blCount[bits - 1]!) << 1
			nextCode[bits] = code
		}

		// Build lookup table
		this.counts = blCount
		this.symbols = new Array(lengths.length).fill(-1)

		// Assign codes to symbols
		const codes: number[] = []
		for (let i = 0; i < lengths.length; i++) {
			const len = lengths[i]!
			if (len > 0) {
				codes[i] = nextCode[len]!
				nextCode[len]!++
			}
		}

		// Build reverse lookup (code -> symbol)
		this.symbols = []
		for (let i = 0; i < lengths.length; i++) {
			if (lengths[i]! > 0) {
				this.symbols.push(i)
			}
		}

		// Store for decoding
		this._lengths = lengths
		this._codes = codes
	}

	private _lengths: number[] = []
	private _codes: number[] = []

	/**
	 * Decode a symbol from the bit reader
	 */
	decode(reader: BitReader): number {
		let code = 0
		let first = 0
		let index = 0

		for (let len = 1; len <= this.maxBits; len++) {
			code |= reader.readBits(1)
			const count = this.counts[len]!

			if (code - first < count) {
				// Find symbol with this code
				for (let i = 0; i < this._lengths.length; i++) {
					if (this._lengths[i] === len && this._codes[i] === code) {
						return i
					}
				}
			}

			first = (first + count) << 1
			code <<= 1
			index += count
		}

		throw new Error('Invalid Huffman code')
	}
}

/**
 * Fixed Huffman tables for literal/length and distance codes
 */
function getFixedLitLenTable(): HuffmanTable {
	const lengths = new Array(288)
	for (let i = 0; i <= 143; i++) lengths[i] = 8
	for (let i = 144; i <= 255; i++) lengths[i] = 9
	for (let i = 256; i <= 279; i++) lengths[i] = 7
	for (let i = 280; i <= 287; i++) lengths[i] = 8
	return new HuffmanTable(lengths)
}

function getFixedDistTable(): HuffmanTable {
	const lengths = new Array(32).fill(5)
	return new HuffmanTable(lengths)
}

// Length base values and extra bits
const LENGTH_BASE = [
	3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
	163, 195, 227, 258,
]
const LENGTH_EXTRA = [
	0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]

// Distance base values and extra bits
const DIST_BASE = [
	1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
	3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const DIST_EXTRA = [
	0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]

// Code length alphabet order
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

/**
 * Inflate compressed data (raw deflate, no zlib header)
 */
export function inflateRaw(data: Uint8Array): Uint8Array {
	const reader = new BitReader(data)
	const output: number[] = []

	let bfinal = 0
	while (bfinal === 0) {
		bfinal = reader.readBits(1)
		const btype = reader.readBits(2)

		if (btype === 0) {
			// Stored block
			reader.alignToByte()
			const len = reader.readByte() | (reader.readByte() << 8)
			const nlen = reader.readByte() | (reader.readByte() << 8)
			if ((len ^ 0xffff) !== nlen) {
				throw new Error('Invalid stored block length')
			}
			const bytes = reader.readBytes(len)
			for (let i = 0; i < bytes.length; i++) {
				output.push(bytes[i]!)
			}
		} else if (btype === 1 || btype === 2) {
			// Compressed block
			let litLenTable: HuffmanTable
			let distTable: HuffmanTable

			if (btype === 1) {
				// Fixed Huffman codes
				litLenTable = getFixedLitLenTable()
				distTable = getFixedDistTable()
			} else {
				// Dynamic Huffman codes
				const hlit = reader.readBits(5) + 257
				const hdist = reader.readBits(5) + 1
				const hclen = reader.readBits(4) + 4

				// Read code length code lengths
				const clLengths = new Array(19).fill(0)
				for (let i = 0; i < hclen; i++) {
					clLengths[CL_ORDER[i]!] = reader.readBits(3)
				}
				const clTable = new HuffmanTable(clLengths)

				// Read literal/length and distance code lengths
				const lengths: number[] = []
				while (lengths.length < hlit + hdist) {
					const sym = clTable.decode(reader)
					if (sym < 16) {
						lengths.push(sym)
					} else if (sym === 16) {
						const repeat = reader.readBits(2) + 3
						const last = lengths[lengths.length - 1] ?? 0
						for (let i = 0; i < repeat; i++) lengths.push(last)
					} else if (sym === 17) {
						const repeat = reader.readBits(3) + 3
						for (let i = 0; i < repeat; i++) lengths.push(0)
					} else if (sym === 18) {
						const repeat = reader.readBits(7) + 11
						for (let i = 0; i < repeat; i++) lengths.push(0)
					}
				}

				litLenTable = new HuffmanTable(lengths.slice(0, hlit))
				distTable = new HuffmanTable(lengths.slice(hlit))
			}

			// Decode symbols
			while (true) {
				const sym = litLenTable.decode(reader)
				if (sym < 256) {
					// Literal
					output.push(sym)
				} else if (sym === 256) {
					// End of block
					break
				} else {
					// Length-distance pair
					const lengthIdx = sym - 257
					const length = LENGTH_BASE[lengthIdx]! + reader.readBits(LENGTH_EXTRA[lengthIdx]!)

					const distSym = distTable.decode(reader)
					const distance = DIST_BASE[distSym]! + reader.readBits(DIST_EXTRA[distSym]!)

					// Copy from output buffer
					const start = output.length - distance
					for (let i = 0; i < length; i++) {
						output.push(output[start + i]!)
					}
				}
			}
		} else {
			throw new Error('Invalid block type')
		}
	}

	return new Uint8Array(output)
}

/**
 * Inflate zlib-compressed data (with zlib header)
 */
export function inflate(data: Uint8Array): Uint8Array {
	// Check zlib header
	if (data.length < 2) {
		throw new Error('Invalid zlib data')
	}

	const cmf = data[0]!
	const flg = data[1]!

	// Check compression method (must be 8 = deflate)
	const cm = cmf & 0x0f
	if (cm !== 8) {
		throw new Error(`Unsupported compression method: ${cm}`)
	}

	// Check header checksum
	if ((cmf * 256 + flg) % 31 !== 0) {
		throw new Error('Invalid zlib header checksum')
	}

	// Check for preset dictionary (not supported)
	const fdict = (flg >> 5) & 1
	if (fdict) {
		throw new Error('Preset dictionary not supported')
	}

	// Decompress (skip 2-byte header, ignore 4-byte Adler-32 checksum at end)
	return inflateRaw(data.slice(2, -4))
}
