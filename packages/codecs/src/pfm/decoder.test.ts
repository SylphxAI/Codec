import { describe, expect, it } from 'bun:test'
import { PFMCodec } from './codec'
import { decodePfm } from './decoder'
import { encodePfm } from './encoder'

describe('PFM Decoder', () => {
	describe('decodePfm', () => {
		it('should decode color PFM', () => {
			const pfm = encodePfm({
				width: 2,
				height: 2,
				data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
			})

			const decoded = decodePfm(pfm)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			// Values will be different due to gamma round-trip, but relative order preserved
			expect(decoded.data[0]).toBeGreaterThan(150) // R is high
			expect(decoded.data[1]).toBeLessThan(100) // G is low
			expect(decoded.data[2]).toBeLessThan(100) // B is low
		})

		it('should decode grayscale PFM', () => {
			// Manually construct grayscale PFM
			const header = 'Pf\n2 2\n-1.0\n'
			const headerBytes = new TextEncoder().encode(header)
			const floatData = new ArrayBuffer(2 * 2 * 4) // 4 floats
			const floatView = new DataView(floatData)

			// Bottom-to-top order: row 1 then row 0
			floatView.setFloat32(0, 0.5, true) // (0,1)
			floatView.setFloat32(4, 0.6, true) // (1,1)
			floatView.setFloat32(8, 0.2, true) // (0,0)
			floatView.setFloat32(12, 0.8, true) // (1,0)

			const pfm = new Uint8Array(headerBytes.length + floatData.byteLength)
			pfm.set(headerBytes, 0)
			pfm.set(new Uint8Array(floatData), headerBytes.length)

			const decoded = decodePfm(pfm)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			// Grayscale should have equal RGB values
			expect(decoded.data[0]).toBe(decoded.data[1])
			expect(decoded.data[1]).toBe(decoded.data[2])
		})

		it('should throw for invalid magic', () => {
			const invalid = new Uint8Array([0x50, 0x36]) // P6 (not PF or Pf)
			expect(() => decodePfm(invalid)).toThrow('Invalid PFM')
		})
	})

	describe('encodePfm', () => {
		it('should encode with correct header', () => {
			const pfm = encodePfm({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			const text = new TextDecoder().decode(pfm.subarray(0, 20))

			expect(text).toContain('PF')
			expect(text).toContain('4 4')
			expect(text).toContain('-1.0')
		})

		it('should have correct size', () => {
			const pfm = encodePfm({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			// Header ~12 bytes + 4*4*3*4 = 192 bytes float data
			expect(pfm.length).toBeGreaterThan(192)
		})
	})

	describe('PFMCodec', () => {
		it('should detect color PFM files', () => {
			const codec = new PFMCodec()

			const validColor = new Uint8Array([0x50, 0x46]) // PF
			expect(codec.canDecode(validColor)).toBe(true)

			const validGray = new Uint8Array([0x50, 0x66]) // Pf
			expect(codec.canDecode(validGray)).toBe(true)

			const invalid = new Uint8Array([0x50, 0x37]) // P7
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new PFMCodec()
			expect(codec.name).toBe('PFM')
			expect(codec.extensions).toContain('.pfm')
		})
	})

	describe('roundtrip', () => {
		it('should approximately roundtrip colors', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4),
			}

			// Fill with gradient
			for (let i = 0; i < 16; i++) {
				original.data[i * 4] = i * 16 // R
				original.data[i * 4 + 1] = 255 - i * 16 // G
				original.data[i * 4 + 2] = 128 // B
				original.data[i * 4 + 3] = 255 // A
			}

			const encoded = encodePfm(original)
			const decoded = decodePfm(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			// Due to gamma conversion, values won't be exact but should be close
			for (let i = 0; i < 16; i++) {
				const origR = original.data[i * 4]!
				const decR = decoded.data[i * 4]!
				// Allow higher tolerance for gamma round-trip and tone mapping
				expect(Math.abs(origR - decR)).toBeLessThan(80)
			}
		})
	})
})
