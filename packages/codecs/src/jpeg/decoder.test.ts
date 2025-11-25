import { describe, expect, test } from 'bun:test'
import { decodeJpeg } from './decoder'
import { encodeJpeg } from './encoder'

describe('JPEG Codec', () => {
	test('encode creates valid JPEG', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeJpeg(image)

		// Check JPEG signature
		expect(encoded[0]).toBe(0xff)
		expect(encoded[1]).toBe(0xd8) // SOI

		// Check ends with EOI
		expect(encoded[encoded.length - 2]).toBe(0xff)
		expect(encoded[encoded.length - 1]).toBe(0xd9) // EOI
	})

	test('encode and decode roundtrip (lossy)', () => {
		// Create a simple 8x8 test image
		const original = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4),
		}

		// Fill with a gradient
		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				const idx = (y * 8 + x) * 4
				original.data[idx] = Math.floor((x / 7) * 255) // R
				original.data[idx + 1] = Math.floor((y / 7) * 255) // G
				original.data[idx + 2] = 128 // B
				original.data[idx + 3] = 255 // A
			}
		}

		// Encode with high quality
		const encoded = encodeJpeg(original, { quality: 100 })

		// Decode back
		const decoded = decodeJpeg(encoded)

		// Verify dimensions
		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// JPEG is lossy, so we check that values are close
		let totalDiff = 0
		for (let i = 0; i < decoded.data.length; i += 4) {
			totalDiff += Math.abs(decoded.data[i]! - original.data[i]!)
			totalDiff += Math.abs(decoded.data[i + 1]! - original.data[i + 1]!)
			totalDiff += Math.abs(decoded.data[i + 2]! - original.data[i + 2]!)
		}
		const avgDiff = totalDiff / ((decoded.data.length / 4) * 3)

		// Average difference should be small for high quality
		expect(avgDiff).toBeLessThan(30)
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeJpeg(invalid)).toThrow('Invalid JPEG signature')
	})

	test('quality option affects file size', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4),
		}

		// Random-ish data
		for (let i = 0; i < image.data.length; i++) {
			image.data[i] = (i * 7) % 256
		}

		const lowQuality = encodeJpeg(image, { quality: 10 })
		const highQuality = encodeJpeg(image, { quality: 95 })

		// Lower quality should produce smaller file
		expect(lowQuality.length).toBeLessThan(highQuality.length)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 0, 0, 255]), // Red pixel
		}

		const encoded = encodeJpeg(image)
		const decoded = decodeJpeg(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)

		// Check it's roughly red (JPEG is lossy)
		expect(decoded.data[0]).toBeGreaterThan(200) // R
		expect(decoded.data[1]).toBeLessThan(80) // G
		expect(decoded.data[2]).toBeLessThan(80) // B
	})
})
