/**
 * TIFF compression algorithms
 */

/**
 * Decompress PackBits-compressed data
 */
export function decompressPackBits(data: Uint8Array, expectedSize: number): Uint8Array {
	const output = new Uint8Array(expectedSize)
	let srcPos = 0
	let dstPos = 0

	while (srcPos < data.length && dstPos < expectedSize) {
		const n = data[srcPos++]!

		if (n >= 0 && n <= 127) {
			// Copy next n+1 bytes literally
			const count = n + 1
			for (let i = 0; i < count && dstPos < expectedSize; i++) {
				output[dstPos++] = data[srcPos++]!
			}
		} else if (n >= 129) {
			// Repeat next byte 257-n times
			const count = 257 - n
			const value = data[srcPos++]!
			for (let i = 0; i < count && dstPos < expectedSize; i++) {
				output[dstPos++] = value
			}
		}
		// n == 128 is no-op
	}

	return output
}

/**
 * Compress data using PackBits
 */
export function compressPackBits(data: Uint8Array): Uint8Array {
	const output: number[] = []
	let pos = 0

	while (pos < data.length) {
		// Check for run of same bytes
		const runStart = pos
		while (pos < data.length - 1 && data[pos] === data[pos + 1] && pos - runStart < 127) {
			pos++
		}

		const runLength = pos - runStart + 1

		if (runLength >= 2) {
			// Encode run
			output.push(257 - runLength)
			output.push(data[runStart]!)
			pos++
		} else {
			// Look for literal sequence
			const literalStart = pos
			while (
				pos < data.length &&
				(pos >= data.length - 1 || data[pos] !== data[pos + 1]) &&
				pos - literalStart < 127
			) {
				pos++
			}

			const literalLength = pos - literalStart
			if (literalLength > 0) {
				output.push(literalLength - 1)
				for (let i = 0; i < literalLength; i++) {
					output.push(data[literalStart + i]!)
				}
			}
		}
	}

	return new Uint8Array(output)
}
