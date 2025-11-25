import { describe, expect, it } from 'bun:test'
import { SGICodec } from './codec'
import { decodeSgi } from './decoder'
import { encodeSgi } from './encoder'

describe('SGI Decoder', () => {
	describe('decodeSgi', () => {
		it('should decode uncompressed SGI', () => {
			const sgi = encodeSgi(
				{
					width: 2,
					height: 2,
					data: new Uint8Array([
						255,
						0,
						0,
						255, // Red
						0,
						255,
						0,
						255, // Green
						0,
						0,
						255,
						255, // Blue
						255,
						255,
						0,
						255, // Yellow
					]),
				},
				{ compress: false }
			)

			const decoded = decodeSgi(sgi)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
		})

		it('should decode RLE compressed SGI', () => {
			const sgi = encodeSgi(
				{
					width: 8,
					height: 8,
					data: new Uint8Array(8 * 8 * 4).fill(128),
				},
				{ compress: true }
			)

			const decoded = decodeSgi(sgi)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
		})

		it('should throw for invalid magic', () => {
			const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
			expect(() => decodeSgi(invalid)).toThrow('Invalid SGI file')
		})
	})

	describe('encodeSgi', () => {
		it('should encode with correct magic', () => {
			const sgi = encodeSgi({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			expect(sgi[0]).toBe(0x01)
			expect(sgi[1]).toBe(0xda)
		})

		it('should encode uncompressed correctly', () => {
			const sgi = encodeSgi(
				{
					width: 2,
					height: 2,
					data: new Uint8Array(2 * 2 * 4).fill(128),
				},
				{ compress: false }
			)

			expect(sgi[2]).toBe(0) // Storage = verbatim
		})

		it('should encode RLE correctly', () => {
			const sgi = encodeSgi(
				{
					width: 2,
					height: 2,
					data: new Uint8Array(2 * 2 * 4).fill(128),
				},
				{ compress: true }
			)

			expect(sgi[2]).toBe(1) // Storage = RLE
		})
	})

	describe('SGICodec', () => {
		it('should detect SGI files', () => {
			const codec = new SGICodec()

			const valid = new Uint8Array([0x01, 0xda, 0x00, 0x01])
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new SGICodec()
			expect(codec.name).toBe('SGI')
			expect(codec.extensions).toContain('.sgi')
			expect(codec.extensions).toContain('.rgb')
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

			const encoded = encodeSgi(original, { compress: false })
			const decoded = decodeSgi(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})

		it('should roundtrip RLE compressed', () => {
			const original = {
				width: 8,
				height: 8,
				data: new Uint8Array(8 * 8 * 4),
			}

			// Create pattern good for RLE
			for (let y = 0; y < 8; y++) {
				for (let x = 0; x < 8; x++) {
					const i = (y * 8 + x) * 4
					const val = y < 4 ? 255 : 0
					original.data[i] = val
					original.data[i + 1] = val
					original.data[i + 2] = val
					original.data[i + 3] = 255
				}
			}

			const encoded = encodeSgi(original, { compress: true })
			const decoded = decodeSgi(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})

		it('should handle grayscale', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4),
			}

			// Grayscale gradient
			for (let i = 0; i < 16; i++) {
				const val = i * 16
				original.data[i * 4] = val
				original.data[i * 4 + 1] = val
				original.data[i * 4 + 2] = val
				original.data[i * 4 + 3] = 255
			}

			const encoded = encodeSgi(original)
			const decoded = decodeSgi(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)
		})
	})
})
