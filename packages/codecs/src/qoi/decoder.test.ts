import { describe, expect, test } from 'bun:test'
import { QoiCodec } from './codec'
import { QOI_MAGIC } from './types'

describe('QOI Codec', () => {
	// Helper to create a simple test image
	const createTestImage = (width: number, height: number) => ({
		width,
		height,
		data: new Uint8Array(width * height * 4).map((_, i) => {
			const pixel = Math.floor(i / 4)
			const channel = i % 4
			if (channel === 3) return 255 // Alpha
			return (pixel * 17 + channel * 50) % 256
		}),
	})

	// Helper to create image with alpha
	const createAlphaImage = (width: number, height: number) => ({
		width,
		height,
		data: new Uint8Array(width * height * 4).map((_, i) => {
			const pixel = Math.floor(i / 4)
			const channel = i % 4
			if (channel === 3) return pixel % 2 === 0 ? 128 : 255 // Varying alpha
			return (pixel * 17 + channel * 50) % 256
		}),
	})

	// Helper to create image with runs (good for RLE)
	const createRunImage = (width: number, height: number) => ({
		width,
		height,
		data: new Uint8Array(width * height * 4).map((_, i) => {
			const channel = i % 4
			if (channel === 3) return 255
			return 128 // Same color for all pixels
		}),
	})

	describe('encode', () => {
		test('encodes QOI with correct magic', () => {
			const image = createTestImage(4, 4)
			const encoded = QoiCodec.encode(image)

			// Check magic "qoif"
			const magic = (encoded[0]! << 24) | (encoded[1]! << 16) | (encoded[2]! << 8) | encoded[3]!
			expect(magic).toBe(QOI_MAGIC)
		})

		test('encodes dimensions correctly', () => {
			const image = createTestImage(256, 128)
			const encoded = QoiCodec.encode(image)

			// Width (big-endian)
			const width = (encoded[4]! << 24) | (encoded[5]! << 16) | (encoded[6]! << 8) | encoded[7]!
			expect(width).toBe(256)

			// Height (big-endian)
			const height = (encoded[8]! << 24) | (encoded[9]! << 16) | (encoded[10]! << 8) | encoded[11]!
			expect(height).toBe(128)
		})

		test('encodes RGB image (channels=3)', () => {
			const image = createTestImage(4, 4) // No alpha variation
			const encoded = QoiCodec.encode(image)

			expect(encoded[12]).toBe(3) // RGB
		})

		test('encodes RGBA image (channels=4)', () => {
			const image = createAlphaImage(4, 4) // Has alpha variation
			const encoded = QoiCodec.encode(image)

			expect(encoded[12]).toBe(4) // RGBA
		})

		test('has correct end marker', () => {
			const image = createTestImage(2, 2)
			const encoded = QoiCodec.encode(image)

			// End marker: 7x 0x00 + 1x 0x01
			expect(encoded[encoded.length - 8]).toBe(0x00)
			expect(encoded[encoded.length - 7]).toBe(0x00)
			expect(encoded[encoded.length - 6]).toBe(0x00)
			expect(encoded[encoded.length - 5]).toBe(0x00)
			expect(encoded[encoded.length - 4]).toBe(0x00)
			expect(encoded[encoded.length - 3]).toBe(0x00)
			expect(encoded[encoded.length - 2]).toBe(0x00)
			expect(encoded[encoded.length - 1]).toBe(0x01)
		})
	})

	describe('decode', () => {
		test('decodes encoded QOI', () => {
			const original = createTestImage(8, 8)
			const encoded = QoiCodec.encode(original)
			const decoded = QoiCodec.decode(encoded)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
			expect(decoded.data.length).toBe(8 * 8 * 4)
		})

		test('preserves pixel data through encode/decode cycle', () => {
			const original = createTestImage(4, 4)
			const encoded = QoiCodec.encode(original)
			const decoded = QoiCodec.decode(encoded)

			expect(decoded.data).toEqual(original.data)
		})

		test('preserves alpha through encode/decode cycle', () => {
			const original = createAlphaImage(4, 4)
			const encoded = QoiCodec.encode(original)
			const decoded = QoiCodec.decode(encoded)

			expect(decoded.data).toEqual(original.data)
		})

		test('handles run-length encoding efficiently', () => {
			const original = createRunImage(64, 64)
			const encoded = QoiCodec.encode(original)
			const decoded = QoiCodec.decode(encoded)

			expect(decoded.data).toEqual(original.data)

			// Solid color should compress very well
			expect(encoded.length).toBeLessThan(original.data.length / 10)
		})
	})

	describe('edge cases', () => {
		test('handles 1x1 image', () => {
			const original = {
				width: 1,
				height: 1,
				data: new Uint8Array([255, 128, 64, 255]),
			}
			const encoded = QoiCodec.encode(original)
			const decoded = QoiCodec.decode(encoded)

			expect(decoded.width).toBe(1)
			expect(decoded.height).toBe(1)
			expect(decoded.data[0]).toBe(255)
			expect(decoded.data[1]).toBe(128)
			expect(decoded.data[2]).toBe(64)
			expect(decoded.data[3]).toBe(255)
		})

		test('handles large image', () => {
			const original = createTestImage(256, 256)
			const encoded = QoiCodec.encode(original)
			const decoded = QoiCodec.decode(encoded)

			expect(decoded.width).toBe(256)
			expect(decoded.height).toBe(256)
			expect(decoded.data).toEqual(original.data)
		})

		test('throws on invalid QOI', () => {
			expect(() => QoiCodec.decode(new Uint8Array([0, 1, 2]))).toThrow()
		})

		test('throws on bad magic', () => {
			const badData = new Uint8Array(14)
			badData[0] = 0x00 // Wrong magic
			expect(() => QoiCodec.decode(badData)).toThrow('Invalid QOI: bad magic')
		})
	})

	describe('op codes', () => {
		test('handles index lookups', () => {
			// Create image with repeated patterns that will use index lookups
			const width = 8
			const height = 8
			const data = new Uint8Array(width * height * 4)
			for (let i = 0; i < width * height; i++) {
				const color = i % 4 // 4 different colors
				data[i * 4] = color * 60
				data[i * 4 + 1] = color * 70
				data[i * 4 + 2] = color * 80
				data[i * 4 + 3] = 255
			}
			const original = { width, height, data }

			const encoded = QoiCodec.encode(original)
			const decoded = QoiCodec.decode(encoded)

			expect(decoded.data).toEqual(original.data)
		})

		test('handles diff encoding', () => {
			// Create image with small color differences
			const width = 4
			const height = 4
			const data = new Uint8Array(width * height * 4)
			for (let i = 0; i < width * height; i++) {
				data[i * 4] = 128 + (i % 3) - 1 // Small R variation
				data[i * 4 + 1] = 128 + ((i + 1) % 3) - 1 // Small G variation
				data[i * 4 + 2] = 128 + ((i + 2) % 3) - 1 // Small B variation
				data[i * 4 + 3] = 255
			}
			const original = { width, height, data }

			const encoded = QoiCodec.encode(original)
			const decoded = QoiCodec.decode(encoded)

			expect(decoded.data).toEqual(original.data)
		})

		test('handles luma encoding', () => {
			// Create image with medium color differences (luma range)
			const width = 4
			const height = 4
			const data = new Uint8Array(width * height * 4)
			for (let i = 0; i < width * height; i++) {
				const g = 128 + ((i * 5) % 30) // Medium G variation
				data[i * 4] = g + (i % 8) - 4 // R close to G
				data[i * 4 + 1] = g
				data[i * 4 + 2] = g + ((i + 2) % 8) - 4 // B close to G
				data[i * 4 + 3] = 255
			}
			const original = { width, height, data }

			const encoded = QoiCodec.encode(original)
			const decoded = QoiCodec.decode(encoded)

			expect(decoded.data).toEqual(original.data)
		})
	})
})
