/**
 * Pure TypeScript deflate (zlib compression) implementation
 * Uses a simplified approach: stored blocks only for now (no compression)
 * This can be enhanced later with LZ77 + Huffman for better compression
 */

/**
 * Adler-32 checksum
 */
function adler32(data: Uint8Array): number {
	let a = 1
	let b = 0
	const MOD = 65521

	for (let i = 0; i < data.length; i++) {
		a = (a + data[i]!) % MOD
		b = (b + a) % MOD
	}

	return ((b << 16) | a) >>> 0
}

/**
 * Create deflate stored block (no compression)
 */
function createStoredBlock(data: Uint8Array, isFinal: boolean): Uint8Array {
	const maxBlockSize = 65535
	const blocks: Uint8Array[] = []

	for (let i = 0; i < data.length; i += maxBlockSize) {
		const blockData = data.slice(i, Math.min(i + maxBlockSize, data.length))
		const isLast = isFinal && i + maxBlockSize >= data.length

		// Block header: BFINAL (1 bit) + BTYPE (2 bits) = 00 for stored
		// Stored format: [header byte] [LEN] [NLEN] [data]
		const block = new Uint8Array(5 + blockData.length)

		// Header byte: BFINAL=isLast, BTYPE=00 (stored)
		block[0] = isLast ? 0x01 : 0x00

		// LEN (2 bytes, little-endian)
		block[1] = blockData.length & 0xff
		block[2] = (blockData.length >> 8) & 0xff

		// NLEN (one's complement of LEN)
		const nlen = blockData.length ^ 0xffff
		block[3] = nlen & 0xff
		block[4] = (nlen >> 8) & 0xff

		// Data
		block.set(blockData, 5)

		blocks.push(block)
	}

	// Concatenate blocks
	const totalLength = blocks.reduce((sum, b) => sum + b.length, 0)
	const result = new Uint8Array(totalLength)
	let offset = 0
	for (const block of blocks) {
		result.set(block, offset)
		offset += block.length
	}

	return result
}

/**
 * Deflate data (raw, no zlib header)
 */
export function deflateRaw(data: Uint8Array): Uint8Array {
	// For now, use stored blocks (no compression)
	// This produces valid deflate but larger output
	return createStoredBlock(data, true)
}

/**
 * Deflate data with zlib wrapper
 */
export function deflate(data: Uint8Array): Uint8Array {
	const compressed = deflateRaw(data)

	// Zlib header
	const cmf = 0x78 // CM=8 (deflate), CINFO=7 (32K window)
	const flg = 0x01 // FCHECK to make (CMF*256+FLG) % 31 == 0, no FDICT, FLEVEL=0
	// Check: 0x78 * 256 + 0x01 = 30721, 30721 % 31 = 0 ✓

	// Adler-32 checksum
	const checksum = adler32(data)

	// Output: header + compressed + checksum
	const output = new Uint8Array(2 + compressed.length + 4)
	output[0] = cmf
	output[1] = flg
	output.set(compressed, 2)

	// Adler-32 (big-endian)
	output[2 + compressed.length] = (checksum >> 24) & 0xff
	output[2 + compressed.length + 1] = (checksum >> 16) & 0xff
	output[2 + compressed.length + 2] = (checksum >> 8) & 0xff
	output[2 + compressed.length + 3] = checksum & 0xff

	return output
}
