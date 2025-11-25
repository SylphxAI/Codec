import { describe, expect, it } from 'bun:test'
import { decodeExr, decodeExrHdr, encodeExr, encodeExrHdr, isExr, parseHeader } from './index'
import { ExrCompression, ExrPixelType } from './types'

describe('EXR Codec', () => {
	// Create test HDR image
	function createTestHdrImage(
		width: number,
		height: number
	): { width: number; height: number; data: Float32Array } {
		const data = new Float32Array(width * height * 4)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4
				// Create gradient with HDR values
				data[i] = (x / width) * 2 // R: 0-2
				data[i + 1] = (y / height) * 2 // G: 0-2
				data[i + 2] = 0.5 // B: constant
				data[i + 3] = 1 // A: opaque
			}
		}
		return { width, height, data }
	}

	// Create test LDR image
	function createTestImage(
		width: number,
		height: number
	): { width: number; height: number; data: Uint8Array } {
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

	describe('encodeExrHdr/decodeExrHdr roundtrip', () => {
		it('should encode and decode HDR image', () => {
			const original = createTestHdrImage(8, 8)
			const encoded = encodeExrHdr(original)

			expect(isExr(encoded)).toBe(true)

			const decoded = decodeExrHdr(encoded)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
			expect(decoded.data.length).toBe(8 * 8 * 4)

			// Check values are approximately preserved (HALF precision loses some accuracy)
			const tolerance = 0.01
			for (let i = 0; i < 10; i++) {
				const idx = i * 4
				expect(Math.abs(decoded.data[idx]! - original.data[idx]!)).toBeLessThan(tolerance)
			}
		})

		it('should handle various image sizes', () => {
			const sizes = [
				[1, 1],
				[4, 4],
				[16, 8],
				[7, 13],
			]

			for (const [w, h] of sizes) {
				const original = createTestHdrImage(w!, h!)
				const encoded = encodeExrHdr(original)
				const decoded = decodeExrHdr(encoded)

				expect(decoded.width).toBe(w)
				expect(decoded.height).toBe(h)
			}
		})
	})

	describe('encodeExr/decodeExr roundtrip', () => {
		it('should encode LDR and decode back', () => {
			const original = createTestImage(8, 8)
			const encoded = encodeExr(original)

			expect(isExr(encoded)).toBe(true)

			const decoded = decodeExr(encoded)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)

			// Values may differ due to tone mapping, but should be in valid range
			for (let i = 0; i < decoded.data.length; i++) {
				expect(decoded.data[i]).toBeGreaterThanOrEqual(0)
				expect(decoded.data[i]).toBeLessThanOrEqual(255)
			}
		})
	})

	describe('parseHeader', () => {
		it('should parse EXR header', () => {
			const img = createTestHdrImage(16, 16)
			const encoded = encodeExrHdr(img)

			const header = parseHeader(encoded)

			expect(header.version).toBe(2)
			expect(header.isTiled).toBe(false)
			expect(header.compression).toBe(ExrCompression.NONE)
			expect(header.dataWindow.xMax).toBe(15)
			expect(header.dataWindow.yMax).toBe(15)
			expect(header.channels.length).toBe(4)
		})

		it('should parse channel info', () => {
			const img = createTestHdrImage(4, 4)
			const encoded = encodeExrHdr(img)

			const header = parseHeader(encoded)

			const channelNames = header.channels.map((c) => c.name).sort()
			expect(channelNames).toEqual(['A', 'B', 'G', 'R'])

			for (const ch of header.channels) {
				expect(ch.pixelType).toBe(ExrPixelType.HALF)
				expect(ch.xSampling).toBe(1)
				expect(ch.ySampling).toBe(1)
			}
		})
	})

	describe('isExr', () => {
		it('should identify EXR files', () => {
			const img = createTestHdrImage(4, 4)
			const encoded = encodeExrHdr(img)

			expect(isExr(encoded)).toBe(true)
		})

		it('should reject non-EXR data', () => {
			expect(isExr(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isExr(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isExr(new Uint8Array([]))).toBe(false)
			expect(isExr(new Uint8Array([0x76]))).toBe(false)
		})
	})

	describe('HDR values', () => {
		it('should preserve HDR range', () => {
			// Create image with high dynamic range
			const data = new Float32Array(4 * 4 * 4)
			data[0] = 0.001 // Very dark
			data[1] = 0.001
			data[2] = 0.001
			data[3] = 1

			data[4] = 10 // Very bright
			data[5] = 10
			data[6] = 10
			data[7] = 1

			const original = { width: 4, height: 1, data }
			const encoded = encodeExrHdr(original)
			const decoded = decodeExrHdr(encoded)

			// Dark value should be preserved
			expect(decoded.data[0]).toBeLessThan(0.01)

			// Bright value should be high (HALF can represent up to 65504)
			expect(decoded.data[4]).toBeGreaterThan(5)
		})
	})
})
