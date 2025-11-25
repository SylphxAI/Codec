import { describe, expect, it } from 'bun:test'
import { FarbfeldCodec } from './codec'
import { decodeFarbfeld } from './decoder'
import { encodeFarbfeld } from './encoder'

describe('Farbfeld Decoder', () => {
	describe('decodeFarbfeld', () => {
		it('should decode simple image', () => {
			const ff = encodeFarbfeld({
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
			})

			const decoded = decodeFarbfeld(ff)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
			expect(decoded.data[3]).toBe(255) // A
		})

		it('should throw error for invalid magic', () => {
			const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
			expect(() => decodeFarbfeld(invalid)).toThrow('Invalid Farbfeld file')
		})

		it('should throw error for truncated file', () => {
			// Valid header but not enough pixel data
			const truncated = new Uint8Array([
				0x66,
				0x61,
				0x72,
				0x62,
				0x66,
				0x65,
				0x6c,
				0x64, // magic
				0x00,
				0x00,
				0x00,
				0x02, // width = 2
				0x00,
				0x00,
				0x00,
				0x02, // height = 2
				// Missing pixel data
			])
			expect(() => decodeFarbfeld(truncated)).toThrow('truncated')
		})

		it('should handle grayscale-like values', () => {
			const ff = encodeFarbfeld({
				width: 1,
				height: 4,
				data: new Uint8Array([
					0, 0, 0, 255, 85, 85, 85, 255, 170, 170, 170, 255, 255, 255, 255, 255,
				]),
			})

			const decoded = decodeFarbfeld(ff)

			expect(decoded.width).toBe(1)
			expect(decoded.height).toBe(4)
			expect(decoded.data[0]).toBe(0)
			expect(decoded.data[4]).toBe(85)
			expect(decoded.data[8]).toBe(170)
			expect(decoded.data[12]).toBe(255)
		})
	})

	describe('encodeFarbfeld', () => {
		it('should encode with correct magic', () => {
			const ff = encodeFarbfeld({
				width: 1,
				height: 1,
				data: new Uint8Array([255, 128, 64, 255]),
			})

			// Check magic bytes
			expect(ff[0]).toBe(0x66) // f
			expect(ff[1]).toBe(0x61) // a
			expect(ff[2]).toBe(0x72) // r
			expect(ff[3]).toBe(0x62) // b
			expect(ff[4]).toBe(0x66) // f
			expect(ff[5]).toBe(0x65) // e
			expect(ff[6]).toBe(0x6c) // l
			expect(ff[7]).toBe(0x64) // d
		})

		it('should encode dimensions correctly', () => {
			const ff = encodeFarbfeld({
				width: 256,
				height: 512,
				data: new Uint8Array(256 * 512 * 4),
			})

			const view = new DataView(ff.buffer)
			expect(view.getUint32(8, false)).toBe(256) // width
			expect(view.getUint32(12, false)).toBe(512) // height
		})

		it('should have correct output size', () => {
			const ff = encodeFarbfeld({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4),
			})

			// 16 header + 4*4*8 pixel data = 16 + 128 = 144
			expect(ff.length).toBe(144)
		})
	})

	describe('FarbfeldCodec', () => {
		it('should detect Farbfeld files', () => {
			const codec = new FarbfeldCodec()

			const valid = encodeFarbfeld({
				width: 1,
				height: 1,
				data: new Uint8Array([0, 0, 0, 255]),
			})
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new FarbfeldCodec()
			expect(codec.name).toBe('Farbfeld')
			expect(codec.extensions).toContain('.ff')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip perfectly', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array([
					255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 128, 0, 0, 255, 0, 128,
					0, 255, 0, 0, 128, 255, 128, 128, 0, 255, 64, 0, 0, 255, 0, 64, 0, 255, 0, 0, 64, 255, 64,
					64, 0, 255, 32, 0, 0, 255, 0, 32, 0, 255, 0, 0, 32, 255, 32, 32, 0, 255,
				]),
			}

			const encoded = encodeFarbfeld(original)
			const decoded = decodeFarbfeld(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			// Should be lossless
			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})

		it('should handle alpha channel', () => {
			const original = {
				width: 2,
				height: 2,
				data: new Uint8Array([
					255,
					0,
					0,
					0, // Transparent red
					0,
					255,
					0,
					128, // Semi-transparent green
					0,
					0,
					255,
					255, // Opaque blue
					255,
					255,
					255,
					64, // Low-alpha white
				]),
			}

			const encoded = encodeFarbfeld(original)
			const decoded = decodeFarbfeld(encoded)

			expect(decoded.data[3]).toBe(0) // Alpha = 0
			expect(decoded.data[7]).toBe(128) // Alpha = 128
			expect(decoded.data[11]).toBe(255) // Alpha = 255
			expect(decoded.data[15]).toBe(64) // Alpha = 64
		})

		it('should handle larger images', () => {
			const width = 64
			const height = 64
			const data = new Uint8Array(width * height * 4)

			for (let i = 0; i < width * height; i++) {
				data[i * 4] = i % 256
				data[i * 4 + 1] = (i * 2) % 256
				data[i * 4 + 2] = (i * 3) % 256
				data[i * 4 + 3] = 255
			}

			const original = { width, height, data }
			const encoded = encodeFarbfeld(original)
			const decoded = decodeFarbfeld(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)

			for (let i = 0; i < data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})
	})
})
