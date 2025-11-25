/**
 * LZW compression/decompression for GIF
 *
 * GIF uses a variant of LZW with variable-width codes starting at minCodeSize+1 bits
 */

/**
 * Decompress LZW-encoded data
 */
export function lzwDecompress(data: Uint8Array, minCodeSize: number): Uint8Array {
	const clearCode = 1 << minCodeSize
	const endCode = clearCode + 1

	let codeSize = minCodeSize + 1
	let nextCode = endCode + 1
	let maxCode = 1 << codeSize

	// Initialize code table with single-character strings
	let codeTable: number[][] = []
	for (let i = 0; i < clearCode; i++) {
		codeTable[i] = [i]
	}
	codeTable[clearCode] = [] // Clear code
	codeTable[endCode] = [] // End code

	const output: number[] = []
	let bitBuffer = 0
	let bitsInBuffer = 0
	let dataPos = 0

	// Read a code of current size
	const readCode = (): number => {
		while (bitsInBuffer < codeSize) {
			if (dataPos >= data.length) return endCode
			bitBuffer |= data[dataPos++]! << bitsInBuffer
			bitsInBuffer += 8
		}
		const code = bitBuffer & ((1 << codeSize) - 1)
		bitBuffer >>= codeSize
		bitsInBuffer -= codeSize
		return code
	}

	// First code must be clear code
	let code = readCode()
	if (code !== clearCode) {
		throw new Error('LZW data must start with clear code')
	}

	// Read first actual code
	let prevCode = readCode()
	if (prevCode === endCode) {
		return new Uint8Array(output)
	}

	// Output first code
	const firstEntry = codeTable[prevCode]
	if (firstEntry) {
		output.push(...firstEntry)
	}

	while (true) {
		code = readCode()

		if (code === endCode) break

		if (code === clearCode) {
			// Reset code table
			codeSize = minCodeSize + 1
			nextCode = endCode + 1
			maxCode = 1 << codeSize
			codeTable = []
			for (let i = 0; i < clearCode; i++) {
				codeTable[i] = [i]
			}
			codeTable[clearCode] = []
			codeTable[endCode] = []

			prevCode = readCode()
			if (prevCode === endCode) break

			const entry = codeTable[prevCode]
			if (entry) {
				output.push(...entry)
			}
			continue
		}

		let entry: number[]
		const prevEntry = codeTable[prevCode]

		if (code < nextCode && codeTable[code]) {
			// Code exists in table
			entry = codeTable[code]!
		} else if (code === nextCode && prevEntry) {
			// Special case: code not yet in table
			entry = [...prevEntry, prevEntry[0]!]
		} else {
			throw new Error(`Invalid LZW code: ${code}`)
		}

		output.push(...entry)

		// Add new code to table
		if (nextCode < 4096 && prevEntry) {
			codeTable[nextCode++] = [...prevEntry, entry[0]!]

			if (nextCode >= maxCode && codeSize < 12) {
				codeSize++
				maxCode = 1 << codeSize
			}
		}

		prevCode = code
	}

	return new Uint8Array(output)
}

/**
 * Compress data using LZW
 */
export function lzwCompress(data: Uint8Array, minCodeSize: number): Uint8Array {
	const clearCode = 1 << minCodeSize
	const endCode = clearCode + 1

	let codeSize = minCodeSize + 1
	let nextCode = endCode + 1
	let maxCode = 1 << codeSize

	// Code table maps string (as key) to code
	let codeTable: Map<string, number> = new Map()
	for (let i = 0; i < clearCode; i++) {
		codeTable.set(String.fromCharCode(i), i)
	}

	const output: number[] = []
	let bitBuffer = 0
	let bitsInBuffer = 0

	// Write a code
	const writeCode = (code: number) => {
		bitBuffer |= code << bitsInBuffer
		bitsInBuffer += codeSize
		while (bitsInBuffer >= 8) {
			output.push(bitBuffer & 0xff)
			bitBuffer >>= 8
			bitsInBuffer -= 8
		}
	}

	// Flush remaining bits
	const flush = () => {
		if (bitsInBuffer > 0) {
			output.push(bitBuffer & 0xff)
		}
	}

	// Write clear code
	writeCode(clearCode)

	if (data.length === 0) {
		writeCode(endCode)
		flush()
		return new Uint8Array(output)
	}

	let prefix = String.fromCharCode(data[0]!)

	for (let i = 1; i < data.length; i++) {
		const char = String.fromCharCode(data[i]!)
		const combined = prefix + char

		if (codeTable.has(combined)) {
			prefix = combined
		} else {
			// Output code for prefix
			writeCode(codeTable.get(prefix)!)

			// Add new code if table not full
			if (nextCode < 4096) {
				codeTable.set(combined, nextCode++)

				if (nextCode > maxCode && codeSize < 12) {
					codeSize++
					maxCode = 1 << codeSize
				}
			} else {
				// Table full, emit clear code and reset
				writeCode(clearCode)
				codeSize = minCodeSize + 1
				nextCode = endCode + 1
				maxCode = 1 << codeSize
				codeTable = new Map()
				for (let j = 0; j < clearCode; j++) {
					codeTable.set(String.fromCharCode(j), j)
				}
			}

			prefix = char
		}
	}

	// Output remaining prefix
	writeCode(codeTable.get(prefix)!)
	writeCode(endCode)
	flush()

	return new Uint8Array(output)
}
