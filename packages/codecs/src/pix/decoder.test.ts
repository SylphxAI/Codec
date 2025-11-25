import { describe, expect, it } from 'bun:test'
import { PIXCodec } from './codec'
import { decodePix } from './decoder'
import { encodePix } from './encoder'

describe('PIX Decoder', () => {
	describe('decodePix', () => {
		it('should decode PIX with RLE', () => {
			const pix = encodePix({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			const decoded = decodePix(pix)

			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(4)
			expect(decoded.data[0]).toBe(128) // R
			expect(decoded.data[1]).toBe(128) // G
			expect(decoded.data[2]).toBe(128) // B
			expect(decoded.data[3]).toBe(255) // A
		})

		it('should decode PIX with varied pixels', () => {
			const original = {
				width: 2,
				height: 2,
				data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
			}

			const pix = encodePix(original)
			const decoded = decodePix(pix)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R of pixel 0
			expect(decoded.data[4]).toBe(0) // R of pixel 1
		})
	})

	describe('encodePix', () => {
		it('should encode with correct header', () => {
			const pix = encodePix({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			const view = new DataView(pix.buffer)

			expect(view.getUint16(0, false)).toBe(4) // Width
			expect(view.getUint16(2, false)).toBe(4) // Height
			expect(view.getUint16(8, false)).toBe(24) // Depth
		})

		it('should compress solid colors efficiently', () => {
			const solidImage = {
				width: 100,
				height: 100,
				data: new Uint8Array(100 * 100 * 4).fill(128),
			}

			const pix = encodePix(solidImage)

			// Should be much smaller than uncompressed (100*100*3 = 30000)
			expect(pix.length).toBeLessThan(5000)
		})
	})

	describe('PIXCodec', () => {
		it('should detect PIX files', () => {
			const codec = new PIXCodec()

			// Create a valid PIX header
			const valid = new Uint8Array(10)
			const view = new DataView(valid.buffer)
			view.setUint16(0, 100, false) // Width
			view.setUint16(2, 100, false) // Height
			view.setUint16(8, 24, false) // Depth

			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array(10)
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new PIXCodec()
			expect(codec.name).toBe('PIX')
			expect(codec.extensions).toContain('.pix')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip varied image', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array([
					255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 128, 64, 32, 255, 32,
					64, 128, 255, 64, 128, 32, 255, 128, 32, 64, 255, 200, 100, 50, 255, 50, 100, 200, 255,
					100, 200, 50, 255, 200, 50, 100, 255, 0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255,
					255, 64, 64, 64, 255,
				]),
			}

			const encoded = encodePix(original)
			const decoded = decodePix(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			// Check RGB values (alpha is always 255 in decoded)
			for (let i = 0; i < 16; i++) {
				expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
				expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
				expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
			}
		})

		it('should roundtrip solid color', () => {
			const original = {
				width: 8,
				height: 8,
				data: new Uint8Array(8 * 8 * 4),
			}

			// Fill with solid color
			for (let i = 0; i < 64; i++) {
				original.data[i * 4] = 200
				original.data[i * 4 + 1] = 100
				original.data[i * 4 + 2] = 50
				original.data[i * 4 + 3] = 255
			}

			const encoded = encodePix(original)
			const decoded = decodePix(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			for (let i = 0; i < 64; i++) {
				expect(decoded.data[i * 4]).toBe(200) // R
				expect(decoded.data[i * 4 + 1]).toBe(100) // G
				expect(decoded.data[i * 4 + 2]).toBe(50) // B
			}
		})
	})
})
