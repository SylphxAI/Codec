import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import {
	decodeIlbm,
	encodeIlbm,
	isIlbm,
	parseIlbmHeader,
	parseIlbmInfo,
} from './index'

describe('ILBM Codec', () => {
	// Create test image with solid color
	function createTestImage(width: number, height: number, color: number[]): ImageData {
		const data = new Uint8Array(width * height * 4)
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = color[0]!
			data[i * 4 + 1] = color[1]!
			data[i * 4 + 2] = color[2]!
			data[i * 4 + 3] = 255
		}
		return { width, height, data }
	}

	// Create gradient image
	function createGradientImage(width: number, height: number): ImageData {
		const data = new Uint8Array(width * height * 4)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4
				data[i] = Math.round((x / width) * 255)
				data[i + 1] = Math.round((y / height) * 255)
				data[i + 2] = 128
				data[i + 3] = 255
			}
		}
		return { width, height, data }
	}

	describe('isIlbm', () => {
		it('should identify ILBM files', () => {
			const img = createTestImage(16, 16, [255, 0, 0])
			const ilbm = encodeIlbm(img)
			expect(isIlbm(ilbm)).toBe(true)
		})

		it('should reject non-ILBM files', () => {
			expect(isIlbm(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isIlbm(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isIlbm(new Uint8Array([]))).toBe(false)
			expect(isIlbm(new Uint8Array([0x46, 0x4f, 0x52, 0x4d]))).toBe(false) // Just FORM
		})
	})

	describe('parseIlbmHeader', () => {
		it('should parse ILBM header', () => {
			const img = createTestImage(32, 24, [0, 255, 0])
			const ilbm = encodeIlbm(img)

			const header = parseIlbmHeader(ilbm)

			expect(header.width).toBe(32)
			expect(header.height).toBe(24)
			expect(header.numPlanes).toBeGreaterThan(0)
		})
	})

	describe('parseIlbmInfo', () => {
		it('should parse ILBM info', () => {
			const img = createTestImage(32, 24, [0, 255, 0])
			const ilbm = encodeIlbm(img)

			const info = parseIlbmInfo(ilbm)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.numPlanes).toBeGreaterThan(0)
			expect(info.numColors).toBeGreaterThan(1)
		})
	})

	describe('encodeIlbm', () => {
		it('should encode image', () => {
			const img = createTestImage(16, 16, [255, 0, 0])
			const ilbm = encodeIlbm(img)

			expect(isIlbm(ilbm)).toBe(true)
			expect(ilbm.length).toBeGreaterThan(12)
		})

		it('should encode without compression', () => {
			const img = createTestImage(16, 16, [0, 255, 0])
			const ilbm = encodeIlbm(img, { compress: false })

			expect(isIlbm(ilbm)).toBe(true)
			const info = parseIlbmInfo(ilbm)
			expect(info.compression).toBe(0)
		})

		it('should encode with compression', () => {
			const img = createTestImage(16, 16, [0, 0, 255])
			const ilbm = encodeIlbm(img, { compress: true })

			expect(isIlbm(ilbm)).toBe(true)
			const info = parseIlbmInfo(ilbm)
			expect(info.compression).toBe(1)
		})

		it('should respect numPlanes option', () => {
			const img = createTestImage(16, 16, [128, 128, 128])
			const ilbm = encodeIlbm(img, { numPlanes: 4 })

			const info = parseIlbmInfo(ilbm)
			expect(info.numPlanes).toBe(4)
			expect(info.numColors).toBe(16)
		})
	})

	describe('decodeIlbm', () => {
		it('should decode ILBM image', () => {
			const original = createTestImage(16, 16, [200, 100, 50])
			const ilbm = encodeIlbm(original)
			const decoded = decodeIlbm(ilbm)

			expect(decoded.width).toBe(16)
			expect(decoded.height).toBe(16)
			expect(decoded.data.length).toBe(16 * 16 * 4)
		})

		it('should decode uncompressed ILBM', () => {
			const original = createTestImage(8, 8, [255, 0, 0])
			const ilbm = encodeIlbm(original, { compress: false })
			const decoded = decodeIlbm(ilbm)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
		})

		it('should decode compressed ILBM', () => {
			const original = createTestImage(8, 8, [0, 255, 0])
			const ilbm = encodeIlbm(original, { compress: true })
			const decoded = decodeIlbm(ilbm)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip solid color image', () => {
			const original = createTestImage(16, 16, [200, 100, 50])

			const encoded = encodeIlbm(original)
			const decoded = decodeIlbm(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			// Color should be approximately preserved (quantization may cause slight changes)
			// Check first pixel
			expect(decoded.data[0]).toBeGreaterThan(150)
			expect(decoded.data[0]).toBeLessThan(255)
		})

		it('should roundtrip with different sizes', () => {
			for (const size of [8, 16, 32, 64]) {
				const original = createTestImage(size, size, [128, 64, 192])
				const encoded = encodeIlbm(original)
				const decoded = decodeIlbm(encoded)

				expect(decoded.width).toBe(size)
				expect(decoded.height).toBe(size)
			}
		})

		it('should roundtrip gradient image', () => {
			const original = createGradientImage(32, 32)
			const encoded = encodeIlbm(original)
			const decoded = decodeIlbm(encoded)

			expect(decoded.width).toBe(32)
			expect(decoded.height).toBe(32)
		})

		it('should roundtrip with compression', () => {
			const original = createTestImage(16, 16, [100, 150, 200])

			const uncompressed = encodeIlbm(original, { compress: false })
			const compressed = encodeIlbm(original, { compress: true })

			// Compressed should be smaller for solid color
			expect(compressed.length).toBeLessThanOrEqual(uncompressed.length)

			// Both should decode to same dimensions
			const decodedUncomp = decodeIlbm(uncompressed)
			const decodedComp = decodeIlbm(compressed)

			expect(decodedUncomp.width).toBe(decodedComp.width)
			expect(decodedUncomp.height).toBe(decodedComp.height)
		})
	})
})
