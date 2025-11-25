import { describe, expect, it } from 'bun:test'
import { VTFCodec } from './codec'
import { decodeVtf } from './decoder'
import { encodeVtf } from './encoder'
import { VTF_MAGIC } from './types'

describe('VTF Decoder', () => {
	describe('decodeVtf', () => {
		it('should decode uncompressed RGBA VTF', () => {
			const vtf = encodeVtf({
				width: 2,
				height: 2,
				data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
			})

			const decoded = decodeVtf(vtf)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
			expect(decoded.data[3]).toBe(255) // A
		})

		it('should throw for invalid magic', () => {
			const invalid = new Uint8Array(80)
			expect(() => decodeVtf(invalid)).toThrow('Invalid VTF')
		})
	})

	describe('encodeVtf', () => {
		it('should encode with correct header', () => {
			const vtf = encodeVtf({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			const view = new DataView(vtf.buffer)

			expect(view.getUint32(0, true)).toBe(VTF_MAGIC)
			expect(view.getUint16(16, true)).toBe(4) // Width
			expect(view.getUint16(18, true)).toBe(4) // Height
		})

		it('should have correct size', () => {
			const vtf = encodeVtf({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			// Header (80) + data (4*4*4 = 64)
			expect(vtf.length).toBe(80 + 64)
		})
	})

	describe('VTFCodec', () => {
		it('should detect VTF files', () => {
			const codec = new VTFCodec()

			const valid = new Uint8Array(16)
			const view = new DataView(valid.buffer)
			view.setUint32(0, VTF_MAGIC, true)
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array(16)
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new VTFCodec()
			expect(codec.name).toBe('VTF')
			expect(codec.extensions).toContain('.vtf')
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

			const encoded = encodeVtf(original)
			const decoded = decodeVtf(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})
	})
})
