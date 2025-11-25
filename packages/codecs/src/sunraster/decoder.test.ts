import { describe, expect, it } from 'bun:test'
import { SunRasterCodec } from './codec'
import { decodeSunRaster } from './decoder'
import { encodeSunRaster } from './encoder'

describe('Sun Raster Decoder', () => {
	describe('decodeSunRaster', () => {
		it('should decode uncompressed Sun Raster', () => {
			const ras = encodeSunRaster(
				{
					width: 2,
					height: 2,
					data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
				},
				{ compress: false }
			)

			const decoded = decodeSunRaster(ras)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
		})

		it('should decode RLE compressed Sun Raster', () => {
			const ras = encodeSunRaster(
				{
					width: 8,
					height: 8,
					data: new Uint8Array(8 * 8 * 4).fill(128),
				},
				{ compress: true }
			)

			const decoded = decodeSunRaster(ras)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
		})

		it('should throw for invalid magic', () => {
			const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
			expect(() => decodeSunRaster(invalid)).toThrow('Invalid Sun Raster')
		})
	})

	describe('encodeSunRaster', () => {
		it('should encode with correct magic', () => {
			const ras = encodeSunRaster({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			expect(ras[0]).toBe(0x59)
			expect(ras[1]).toBe(0xa6)
			expect(ras[2]).toBe(0x6a)
			expect(ras[3]).toBe(0x95)
		})

		it('should encode dimensions correctly', () => {
			const ras = encodeSunRaster({
				width: 100,
				height: 50,
				data: new Uint8Array(100 * 50 * 4).fill(0),
			})

			const view = new DataView(ras.buffer)
			expect(view.getUint32(4, false)).toBe(100) // Width
			expect(view.getUint32(8, false)).toBe(50) // Height
			expect(view.getUint32(12, false)).toBe(24) // Depth
		})
	})

	describe('SunRasterCodec', () => {
		it('should detect Sun Raster files', () => {
			const codec = new SunRasterCodec()

			const valid = new Uint8Array([0x59, 0xa6, 0x6a, 0x95])
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new SunRasterCodec()
			expect(codec.name).toBe('Sun Raster')
			expect(codec.extensions).toContain('.ras')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip uncompressed', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array([
					255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 128, 0, 0, 255, 0, 128,
					0, 255, 0, 0, 128, 255, 128, 128, 0, 255, 64, 0, 0, 255, 0, 64, 0, 255, 0, 0, 64, 255, 64,
					64, 0, 255, 32, 0, 0, 255, 0, 32, 0, 255, 0, 0, 32, 255, 32, 32, 0, 255,
				]),
			}

			const encoded = encodeSunRaster(original, { compress: false })
			const decoded = decodeSunRaster(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			// Check RGB values (alpha may change)
			for (let i = 0; i < 16; i++) {
				expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
				expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
				expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
			}
		})

		it('should roundtrip RLE compressed', () => {
			const original = {
				width: 8,
				height: 8,
				data: new Uint8Array(8 * 8 * 4),
			}

			// Solid color (good for RLE)
			for (let i = 0; i < 64; i++) {
				original.data[i * 4] = 200
				original.data[i * 4 + 1] = 100
				original.data[i * 4 + 2] = 50
				original.data[i * 4 + 3] = 255
			}

			const encoded = encodeSunRaster(original, { compress: true })
			const decoded = decodeSunRaster(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)
		})
	})
})
