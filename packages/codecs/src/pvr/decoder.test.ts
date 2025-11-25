import { describe, expect, it } from 'bun:test'
import { PVRCodec } from './codec'
import { decodePvr } from './decoder'
import { encodePvr } from './encoder'
import { PVR3_MAGIC } from './types'

describe('PVR Decoder', () => {
	describe('decodePvr', () => {
		it('should decode uncompressed RGBA PVR', () => {
			const pvr = encodePvr({
				width: 2,
				height: 2,
				data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
			})

			const decoded = decodePvr(pvr)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
			expect(decoded.data[3]).toBe(255) // A
		})

		it('should throw for invalid magic', () => {
			const invalid = new Uint8Array(52)
			expect(() => decodePvr(invalid)).toThrow('Invalid PVR')
		})
	})

	describe('encodePvr', () => {
		it('should encode with correct header', () => {
			const pvr = encodePvr({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			const view = new DataView(pvr.buffer)

			expect(view.getUint32(0, true)).toBe(PVR3_MAGIC)
			expect(view.getUint32(24, true)).toBe(4) // Height
			expect(view.getUint32(28, true)).toBe(4) // Width
		})

		it('should have correct size', () => {
			const pvr = encodePvr({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			// Header (52) + data (4*4*4 = 64)
			expect(pvr.length).toBe(52 + 64)
		})
	})

	describe('PVRCodec', () => {
		it('should detect PVR files', () => {
			const codec = new PVRCodec()

			const valid = new Uint8Array(52)
			const view = new DataView(valid.buffer)
			view.setUint32(0, PVR3_MAGIC, true)
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array(52)
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new PVRCodec()
			expect(codec.name).toBe('PVR')
			expect(codec.extensions).toContain('.pvr')
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

			const encoded = encodePvr(original)
			const decoded = decodePvr(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})
	})
})
