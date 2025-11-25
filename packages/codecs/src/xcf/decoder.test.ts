import { describe, expect, it } from 'bun:test'
import { decodeXcf, isXcf, parseXcf } from './index'
import { XcfImageType } from './types'

describe('XCF Codec', () => {
	// Create a minimal valid XCF file (no layers, just header)
	function createMinimalXcf(width: number, height: number, imageType: XcfImageType): Uint8Array {
		const parts: Uint8Array[] = []

		// File Header
		// Signature "gimp xcf" + version "001" + null
		const signature = 'gimp xcf 001\x00'
		parts.push(new TextEncoder().encode(signature))

		// Width (4 bytes, big endian)
		parts.push(new Uint8Array([
			(width >> 24) & 0xff,
			(width >> 16) & 0xff,
			(width >> 8) & 0xff,
			width & 0xff,
		]))

		// Height (4 bytes, big endian)
		parts.push(new Uint8Array([
			(height >> 24) & 0xff,
			(height >> 16) & 0xff,
			(height >> 8) & 0xff,
			height & 0xff,
		]))

		// Image type (4 bytes)
		parts.push(new Uint8Array([
			(imageType >> 24) & 0xff,
			(imageType >> 16) & 0xff,
			(imageType >> 8) & 0xff,
			imageType & 0xff,
		]))

		// Image properties end marker
		parts.push(new Uint8Array([0, 0, 0, 0])) // PROP_END
		parts.push(new Uint8Array([0, 0, 0, 0])) // size = 0

		// Layer pointers (null to end list)
		parts.push(new Uint8Array([0, 0, 0, 0]))

		// Concatenate all parts
		let totalLen = 0
		for (const p of parts) totalLen += p.length
		const result = new Uint8Array(totalLen)
		let offset = 0
		for (const p of parts) {
			result.set(p, offset)
			offset += p.length
		}

		return result
	}

	describe('isXcf', () => {
		it('should identify XCF files', () => {
			const xcf = createMinimalXcf(4, 4, XcfImageType.RGB)
			expect(isXcf(xcf)).toBe(true)
		})

		it('should reject non-XCF files', () => {
			expect(isXcf(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isXcf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isXcf(new Uint8Array([0x38, 0x42, 0x50, 0x53]))).toBe(false) // PSD
		})

		it('should handle short data', () => {
			expect(isXcf(new Uint8Array([]))).toBe(false)
			expect(isXcf(new Uint8Array([0x67]))).toBe(false)
		})
	})

	describe('parseXcf', () => {
		it('should parse XCF header', () => {
			const xcf = createMinimalXcf(16, 8, XcfImageType.RGB)
			const info = parseXcf(xcf)

			expect(info.header.signature).toContain('gimp xcf')
			expect(info.header.version).toBe(1)
			expect(info.header.width).toBe(16)
			expect(info.header.height).toBe(8)
			expect(info.header.imageType).toBe(XcfImageType.RGB)
		})

		it('should detect alpha channel for RGB', () => {
			const xcfRGB = createMinimalXcf(4, 4, XcfImageType.RGB)
			expect(parseXcf(xcfRGB).hasAlpha).toBe(true)
		})

		it('should detect alpha channel for Grayscale', () => {
			const xcfGray = createMinimalXcf(4, 4, XcfImageType.GRAYSCALE)
			expect(parseXcf(xcfGray).hasAlpha).toBe(true)
		})

		it('should not detect alpha for Indexed', () => {
			const xcfIndexed = createMinimalXcf(4, 4, XcfImageType.INDEXED)
			expect(parseXcf(xcfIndexed).hasAlpha).toBe(false)
		})
	})

	describe('decodeXcf', () => {
		it('should decode minimal RGB XCF', () => {
			const xcf = createMinimalXcf(8, 8, XcfImageType.RGB)
			const img = decodeXcf(xcf)

			expect(img.width).toBe(8)
			expect(img.height).toBe(8)
			expect(img.data.length).toBe(8 * 8 * 4)

			// Should be white background (no layers)
			expect(img.data[0]).toBe(255)
			expect(img.data[1]).toBe(255)
			expect(img.data[2]).toBe(255)
			expect(img.data[3]).toBe(255)
		})

		it('should decode minimal Grayscale XCF', () => {
			const xcf = createMinimalXcf(8, 8, XcfImageType.GRAYSCALE)
			const img = decodeXcf(xcf)

			expect(img.width).toBe(8)
			expect(img.height).toBe(8)
			expect(img.data.length).toBe(8 * 8 * 4)
		})

		it('should handle various image sizes', () => {
			const sizes = [[1, 1], [4, 4], [16, 8], [32, 32]]

			for (const [w, h] of sizes) {
				const xcf = createMinimalXcf(w!, h!, XcfImageType.RGB)
				const img = decodeXcf(xcf)

				expect(img.width).toBe(w)
				expect(img.height).toBe(h)
				expect(img.data.length).toBe(w! * h! * 4)
			}
		})

		it('should decode small images', () => {
			const xcf = createMinimalXcf(1, 1, XcfImageType.RGB)
			const img = decodeXcf(xcf)

			expect(img.width).toBe(1)
			expect(img.height).toBe(1)
			expect(img.data.length).toBe(4)
		})

		it('should return valid pixel data', () => {
			const xcf = createMinimalXcf(4, 4, XcfImageType.RGB)
			const img = decodeXcf(xcf)

			// Check all pixels are in valid range
			for (let i = 0; i < img.data.length; i++) {
				expect(img.data[i]).toBeGreaterThanOrEqual(0)
				expect(img.data[i]).toBeLessThanOrEqual(255)
			}
		})
	})
})
