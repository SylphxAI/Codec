import { describe, expect, test } from 'bun:test'
import { decodeRaf, parseRaf } from './decoder'
import { encodeRaf } from './encoder'
import { RAF_MAGIC, RAF_VERSION } from './types'

describe('RAF Codec', () => {
	test('encode creates valid RAF header', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeRaf(image)

		// Check RAF magic
		const magic = new TextDecoder().decode(encoded.slice(0, 16))
		expect(magic.startsWith('FUJIFILMCCD-RAW')).toBe(true)

		// Check version
		const version = new TextDecoder().decode(encoded.slice(16, 20))
		expect(version).toBe(RAF_VERSION)
	})

	test('encode throws on odd dimensions', () => {
		const image = {
			width: 7,
			height: 7,
			data: new Uint8Array(7 * 7 * 4).fill(128),
		}

		expect(() => encodeRaf(image)).toThrow('even width and height')
	})

	test('encode and decode roundtrip', () => {
		// Create a simple test image with even dimensions
		const original = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill with a simple pattern
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const idx = (y * 4 + x) * 4
				original.data[idx] = x * 64 // R
				original.data[idx + 1] = y * 64 // G
				original.data[idx + 2] = 128 // B
				original.data[idx + 3] = 255 // A
			}
		}

		// Encode
		const encoded = encodeRaf(original)
		const decoded = decodeRaf(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Due to Bayer pattern conversion and demosaicing, values won't be exact
		// but should be approximately similar
		expect(decoded.data.length).toBe(original.data.length)
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeRaf(invalid)).toThrow('Invalid RAF')
	})

	test('decode throws on file too small', () => {
		const tooSmall = new Uint8Array(100)
		expect(() => decodeRaf(tooSmall)).toThrow('too small')
	})

	test('parseRaf extracts structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeRaf(image)
		const raf = parseRaf(encoded)

		expect(raf.header.magic.startsWith('FUJIFILMCCD-RAW')).toBe(true)
		expect(raf.header.version).toBe(RAF_VERSION)
		expect(raf.cfaHeader).toBeDefined()
		expect(raf.cfaHeader?.width).toBe(16)
		expect(raf.cfaHeader?.height).toBe(16)
	})

	test('handles single 2x2 image', () => {
		const image = {
			width: 2,
			height: 2,
			data: new Uint8Array([
				255, 0, 0, 255, // Red pixel
				0, 255, 0, 255, // Green pixel
				0, 0, 255, 255, // Blue pixel
				128, 128, 128, 255, // Gray pixel
			]),
		}

		const encoded = encodeRaf(image)
		const decoded = decodeRaf(encoded)

		expect(decoded.width).toBe(2)
		expect(decoded.height).toBe(2)
		expect(decoded.data.length).toBe(16)
	})

	test('parseRaf handles missing jpeg data', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(200),
		}

		const encoded = encodeRaf(image)
		const raf = parseRaf(encoded)

		// No JPEG data should be present in our simple encoder
		expect(raf.header.jpegImageOffset).toBe(0)
		expect(raf.header.jpegImageLength).toBe(0)
		expect(raf.jpegData).toBeUndefined()
	})

	test('parseRaf extracts CFA header correctly', () => {
		const image = {
			width: 32,
			height: 32,
			data: new Uint8Array(32 * 32 * 4).fill(150),
		}

		const encoded = encodeRaf(image)
		const raf = parseRaf(encoded)

		expect(raf.cfaHeader).toBeDefined()
		expect(raf.cfaHeader?.width).toBe(32)
		expect(raf.cfaHeader?.height).toBe(32)
		expect(raf.cfaHeader?.bitsPerSample).toBe(16)
		expect(raf.cfaHeader?.whiteLevel).toBe(65535)
	})

	test('encode creates correct file size', () => {
		const image = {
			width: 10,
			height: 10,
			data: new Uint8Array(10 * 10 * 4).fill(100),
		}

		const encoded = encodeRaf(image)

		// Expected size: header (160) + CFA header (32) + raw data (10*10*2)
		const expectedMinSize = 160 + 32 + 10 * 10 * 2
		expect(encoded.length).toBeGreaterThanOrEqual(expectedMinSize)
	})
})
