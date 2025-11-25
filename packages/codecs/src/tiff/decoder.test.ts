import { describe, expect, test } from 'bun:test'
import { compressPackBits, decompressPackBits } from './compression'
import { decodeTiff, parseTiff } from './decoder'
import { encodeTiff } from './encoder'

describe('PackBits Compression', () => {
	test('compress and decompress roundtrip', () => {
		const original = new Uint8Array([1, 2, 3, 4, 5, 5, 5, 5, 5, 6, 7, 8])
		const compressed = compressPackBits(original)
		const decompressed = decompressPackBits(compressed, original.length)

		expect(decompressed).toEqual(original)
	})

	test('handles run of same bytes', () => {
		const repeated = new Uint8Array(50).fill(42)
		const compressed = compressPackBits(repeated)
		const decompressed = decompressPackBits(compressed, repeated.length)

		expect(decompressed).toEqual(repeated)
		// Compression should make it smaller
		expect(compressed.length).toBeLessThan(repeated.length)
	})

	test('handles literal sequence', () => {
		const sequence = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
		const compressed = compressPackBits(sequence)
		const decompressed = decompressPackBits(compressed, sequence.length)

		expect(decompressed).toEqual(sequence)
	})
})

describe('TIFF Codec', () => {
	test('encode creates valid TIFF', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeTiff(image)

		// Check little-endian signature
		expect(encoded[0]).toBe(0x49) // I
		expect(encoded[1]).toBe(0x49) // I

		// Check magic number
		expect(encoded[2]).toBe(42)
		expect(encoded[3]).toBe(0)
	})

	test('encode and decode roundtrip (uncompressed)', () => {
		// Create a simple test image
		const original = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill with distinct colors
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const idx = (y * 4 + x) * 4
				original.data[idx] = x * 64 // R
				original.data[idx + 1] = y * 64 // G
				original.data[idx + 2] = 128 // B
				original.data[idx + 3] = 255 // A
			}
		}

		// Encode without compression
		const encoded = encodeTiff(original, { quality: 100 })
		const decoded = decodeTiff(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check RGB values match (ignore alpha as we may drop it)
		for (let i = 0; i < original.width * original.height; i++) {
			expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
			expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
			expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
		}
	})

	test('encode and decode roundtrip (PackBits)', () => {
		const original = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(200),
		}

		// Use default compression
		const encoded = encodeTiff(original)
		const decoded = decodeTiff(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check values
		for (let i = 0; i < decoded.data.length; i += 4) {
			expect(decoded.data[i]).toBe(200) // R
			expect(decoded.data[i + 1]).toBe(200) // G
			expect(decoded.data[i + 2]).toBe(200) // B
		}
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeTiff(invalid)).toThrow('Invalid TIFF byte order')
	})

	test('parseTiff extracts structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeTiff(image)
		const tiff = parseTiff(encoded)

		expect(tiff.littleEndian).toBe(true)
		expect(tiff.isBigTiff).toBe(false)
		expect(tiff.ifds.length).toBe(1)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodeTiff(image)
		const decoded = decodeTiff(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
	})
})
