import { describe, expect, test } from 'bun:test'
import { decodeNef, extractMetadata, parseNef } from './decoder'
import { encodeNef } from './encoder'
import { NefCompression, Photometric } from './types'

describe('NEF Decoder', () => {
	test('decode throws on invalid byte order', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeNef(invalid)).toThrow('Invalid NEF byte order')
	})

	test('decode throws on invalid magic number', () => {
		// Valid byte order but wrong magic
		const invalid = new Uint8Array([0x49, 0x49, 0x00, 0x00])
		expect(() => decodeNef(invalid)).toThrow('Invalid NEF magic number')
	})

	test('parseNef extracts structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeNef(image)
		const nef = parseNef(encoded)

		expect(nef.littleEndian).toBe(true)
		expect(nef.ifds.length).toBe(1)
	})

	test('extractMetadata reads basic info', () => {
		const image = {
			width: 64,
			height: 48,
			data: new Uint8Array(64 * 48 * 4).fill(128),
		}

		const encoded = encodeNef(image)
		const nef = parseNef(encoded)
		const metadata = extractMetadata(nef)

		expect(metadata.width).toBe(64)
		expect(metadata.height).toBe(48)
		expect(metadata.compression).toBe(NefCompression.None)
		expect(metadata.photometric).toBe(Photometric.RGB)
		expect(metadata.make).toBe('Nikon')
		expect(metadata.model).toBe('NEF')
	})

	test('encode and decode roundtrip preserves dimensions', () => {
		const original = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(200),
		}

		const encoded = encodeNef(original)
		const decoded = decodeNef(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)
		expect(decoded.data.length).toBe(original.data.length)
	})

	test('encode and decode roundtrip preserves RGB values', () => {
		// Create a simple test image with distinct colors
		const original = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill with a gradient pattern
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const idx = (y * 4 + x) * 4
				original.data[idx] = x * 64 // R
				original.data[idx + 1] = y * 64 // G
				original.data[idx + 2] = 128 // B
				original.data[idx + 3] = 255 // A
			}
		}

		const encoded = encodeNef(original)
		const decoded = decodeNef(encoded)

		// Check RGB values match
		for (let i = 0; i < original.width * original.height; i++) {
			expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
			expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
			expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
		}
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodeNef(image)
		const decoded = decodeNef(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
		expect(decoded.data[3]).toBe(255) // A
	})

	test('handles large image dimensions', () => {
		const image = {
			width: 128,
			height: 96,
			data: new Uint8Array(128 * 96 * 4).fill(100),
		}

		const encoded = encodeNef(image)
		const decoded = decodeNef(encoded)

		expect(decoded.width).toBe(128)
		expect(decoded.height).toBe(96)
	})

	test('encodes without alpha when not needed', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4),
		}

		// Fill with opaque pixels
		for (let i = 0; i < image.data.length; i += 4) {
			image.data[i] = 100 // R
			image.data[i + 1] = 150 // G
			image.data[i + 2] = 200 // B
			image.data[i + 3] = 255 // A (opaque)
		}

		const encoded = encodeNef(image)
		const nef = parseNef(encoded)
		const metadata = extractMetadata(nef)

		// Should use 3 samples per pixel (RGB only)
		expect(metadata.bitsPerSample.length).toBe(3)
	})

	test('encodes with alpha when needed', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4),
		}

		// Fill with semi-transparent pixels
		for (let i = 0; i < image.data.length; i += 4) {
			image.data[i] = 100 // R
			image.data[i + 1] = 150 // G
			image.data[i + 2] = 200 // B
			image.data[i + 3] = 128 // A (semi-transparent)
		}

		const encoded = encodeNef(image)
		const nef = parseNef(encoded)
		const metadata = extractMetadata(nef)

		// Should use 4 samples per pixel (RGBA)
		expect(metadata.bitsPerSample.length).toBe(4)
	})

	test('handles strips correctly', () => {
		// Create image with height that requires multiple strips
		const image = {
			width: 16,
			height: 48, // Should create 3 strips (16 rows each)
			data: new Uint8Array(16 * 48 * 4),
		}

		// Fill each strip with different color
		for (let y = 0; y < 48; y++) {
			const stripColor = Math.floor(y / 16) * 80 + 50
			for (let x = 0; x < 16; x++) {
				const idx = (y * 16 + x) * 4
				image.data[idx] = stripColor
				image.data[idx + 1] = stripColor
				image.data[idx + 2] = stripColor
				image.data[idx + 3] = 255
			}
		}

		const encoded = encodeNef(image)
		const decoded = decodeNef(encoded)

		expect(decoded.width).toBe(16)
		expect(decoded.height).toBe(48)

		// Verify strip colors are preserved
		expect(decoded.data[0]).toBe(50) // First strip
		expect(decoded.data[(16 * 16) * 4]).toBe(130) // Second strip
		expect(decoded.data[(16 * 32) * 4]).toBe(210) // Third strip
	})

	test('parseNef handles no IFD gracefully', () => {
		// Create minimal invalid NEF (header only, no IFD)
		const data = new Uint8Array(8)
		data[0] = 0x49 // I
		data[1] = 0x49 // I
		data[2] = 42 // Magic
		data[3] = 0
		data[4] = 0 // IFD offset = 0 (invalid)
		data[5] = 0
		data[6] = 0
		data[7] = 0

		const nef = parseNef(data)
		expect(nef.ifds.length).toBe(0)
	})

	test('decodeNef throws when no IFDs present', () => {
		// Create minimal invalid NEF (header only, no IFD)
		const data = new Uint8Array(8)
		data[0] = 0x49 // I
		data[1] = 0x49 // I
		data[2] = 42 // Magic
		data[3] = 0
		data[4] = 0 // IFD offset = 0
		data[5] = 0
		data[6] = 0
		data[7] = 0

		expect(() => decodeNef(data)).toThrow('No image data in NEF')
	})
})

describe('NEF Format Compatibility', () => {
	test('creates valid TIFF-based NEF header', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeNef(image)

		// Check little-endian signature
		expect(encoded[0]).toBe(0x49) // I
		expect(encoded[1]).toBe(0x49) // I

		// Check magic number (42)
		expect(encoded[2]).toBe(42)
		expect(encoded[3]).toBe(0)

		// Should have IFD offset
		const ifdOffset = encoded[4] | (encoded[5]! << 8) | (encoded[6]! << 16) | (encoded[7]! << 24)
		expect(ifdOffset).toBeGreaterThan(0)
	})

	test('metadata contains Nikon identification', () => {
		const image = {
			width: 32,
			height: 32,
			data: new Uint8Array(32 * 32 * 4).fill(150),
		}

		const encoded = encodeNef(image)
		const nef = parseNef(encoded)
		const metadata = extractMetadata(nef)

		expect(metadata.make).toBe('Nikon')
		expect(metadata.model).toBe('NEF')
		expect(metadata.software).toBe('mconv/codecs')
	})
})
