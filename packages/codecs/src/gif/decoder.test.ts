import { describe, expect, test } from 'bun:test'
import { decodeGif, parseGif } from './decoder'
import { encodeGif } from './encoder'
import { lzwCompress, lzwDecompress } from './lzw'

describe('LZW Compression', () => {
	test('compress and decompress roundtrip', () => {
		const original = new Uint8Array([1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3])
		const compressed = lzwCompress(original, 8)
		const decompressed = lzwDecompress(compressed, 8)

		expect(decompressed).toEqual(original)
	})

	test('handles repeated data efficiently', () => {
		const repeated = new Uint8Array(100).fill(42)
		const compressed = lzwCompress(repeated, 8)
		const decompressed = lzwDecompress(compressed, 8)

		expect(decompressed).toEqual(repeated)
		// Compression should make it smaller
		expect(compressed.length).toBeLessThan(repeated.length)
	})

	test('handles empty data', () => {
		const empty = new Uint8Array(0)
		const compressed = lzwCompress(empty, 8)
		const decompressed = lzwDecompress(compressed, 8)

		expect(decompressed).toEqual(empty)
	})

	test('handles small code sizes', () => {
		const data = new Uint8Array([0, 1, 0, 1, 0, 1, 0])
		const compressed = lzwCompress(data, 2) // 4 colors max
		const decompressed = lzwDecompress(compressed, 2)

		expect(decompressed).toEqual(data)
	})
})

describe('GIF Codec', () => {
	test('encode creates valid GIF', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeGif(image)

		// Check GIF signature
		expect(encoded[0]).toBe(0x47) // G
		expect(encoded[1]).toBe(0x49) // I
		expect(encoded[2]).toBe(0x46) // F
		expect(encoded[3]).toBe(0x38) // 8
		expect(encoded[4]).toBe(0x39) // 9
		expect(encoded[5]).toBe(0x61) // a

		// Check ends with trailer
		expect(encoded[encoded.length - 1]).toBe(0x3b)
	})

	test('encode and decode roundtrip', () => {
		// Create a simple 4x4 test image with 4 distinct colors
		const original = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill quadrants with different colors
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const idx = (y * 4 + x) * 4
				if (x < 2 && y < 2) {
					// Red
					original.data[idx] = 255
					original.data[idx + 1] = 0
					original.data[idx + 2] = 0
				} else if (x >= 2 && y < 2) {
					// Green
					original.data[idx] = 0
					original.data[idx + 1] = 255
					original.data[idx + 2] = 0
				} else if (x < 2 && y >= 2) {
					// Blue
					original.data[idx] = 0
					original.data[idx + 1] = 0
					original.data[idx + 2] = 255
				} else {
					// White
					original.data[idx] = 255
					original.data[idx + 1] = 255
					original.data[idx + 2] = 255
				}
				original.data[idx + 3] = 255 // Alpha
			}
		}

		const encoded = encodeGif(original)
		const decoded = decodeGif(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check colors are preserved (GIF is lossless for palettized images)
		// Top-left should be red
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(0) // G
		expect(decoded.data[2]).toBe(0) // B
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeGif(invalid)).toThrow('Invalid GIF signature')
	})

	test('parseGif extracts structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(200),
		}

		const encoded = encodeGif(image)
		const gif = parseGif(encoded)

		expect(gif.version).toBe('GIF89a')
		expect(gif.screenDescriptor.width).toBe(16)
		expect(gif.screenDescriptor.height).toBe(16)
		expect(gif.screenDescriptor.hasGlobalColorTable).toBe(true)
		expect(gif.frames.length).toBe(1)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodeGif(image)
		const decoded = decodeGif(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)

		// Check roughly orange (exact match since single color)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
	})
})
