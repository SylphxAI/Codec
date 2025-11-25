import { describe, expect, it } from 'bun:test'
import { KTXCodec } from './codec'
import { decodeKtx } from './decoder'
import { encodeKtx } from './encoder'
import { KTX1_MAGIC } from './types'

describe('KTX Decoder', () => {
	describe('decodeKtx', () => {
		it('should decode uncompressed RGBA KTX', () => {
			const ktx = encodeKtx({
				width: 2,
				height: 2,
				data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
			})

			const decoded = decodeKtx(ktx)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
			expect(decoded.data[3]).toBe(255) // A
		})

		it('should throw for invalid magic', () => {
			const invalid = new Uint8Array(68)
			expect(() => decodeKtx(invalid)).toThrow('Invalid KTX')
		})
	})

	describe('encodeKtx', () => {
		it('should encode with correct header', () => {
			const ktx = encodeKtx({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			// Check magic
			for (let i = 0; i < 12; i++) {
				expect(ktx[i]).toBe(KTX1_MAGIC[i])
			}

			const view = new DataView(ktx.buffer)
			expect(view.getUint32(36, true)).toBe(4) // Width
			expect(view.getUint32(40, true)).toBe(4) // Height
		})

		it('should have correct size', () => {
			const ktx = encodeKtx({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			// Header (64) + imageSize (4) + data (4*4*4 = 64, no padding needed)
			expect(ktx.length).toBe(64 + 4 + 64)
		})
	})

	describe('KTXCodec', () => {
		it('should detect KTX files', () => {
			const codec = new KTXCodec()

			const valid = new Uint8Array(12)
			valid.set(KTX1_MAGIC)
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array(12)
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new KTXCodec()
			expect(codec.name).toBe('KTX')
			expect(codec.extensions).toContain('.ktx')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip RGBA', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array([
					255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 128, 0, 0, 200, 0, 128,
					0, 150, 0, 0, 128, 100, 128, 128, 0, 50, 64, 0, 0, 255, 0, 64, 0, 255, 0, 0, 64, 255, 64,
					64, 0, 255, 32, 0, 0, 0, 0, 32, 0, 64, 0, 0, 32, 128, 32, 32, 0, 192,
				]),
			}

			const encoded = encodeKtx(original)
			const decoded = decodeKtx(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})

		it('should handle non-power-of-two dimensions', () => {
			const original = {
				width: 3,
				height: 5,
				data: new Uint8Array(3 * 5 * 4),
			}

			// Fill with pattern
			for (let i = 0; i < 15; i++) {
				original.data[i * 4] = i * 16
				original.data[i * 4 + 1] = 255 - i * 16
				original.data[i * 4 + 2] = 128
				original.data[i * 4 + 3] = 255
			}

			const encoded = encodeKtx(original)
			const decoded = decodeKtx(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})
	})
})
