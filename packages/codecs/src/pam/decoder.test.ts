import { describe, expect, it } from 'bun:test'
import { PAMCodec } from './codec'
import { decodePam } from './decoder'
import { encodePam } from './encoder'

describe('PAM Decoder', () => {
	describe('decodePam', () => {
		it('should decode RGB_ALPHA PAM', () => {
			const pam = encodePam({
				width: 2,
				height: 2,
				data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 128]),
			})

			const decoded = decodePam(pam)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
			expect(decoded.data[3]).toBe(255) // A
			expect(decoded.data[15]).toBe(128) // Alpha of last pixel
		})

		it('should decode GRAYSCALE PAM', () => {
			const header = `P7
WIDTH 2
HEIGHT 2
DEPTH 1
MAXVAL 255
TUPLTYPE GRAYSCALE
ENDHDR
`
			const headerBytes = new TextEncoder().encode(header)
			const pixelData = new Uint8Array([0, 128, 255, 64])
			const pam = new Uint8Array(headerBytes.length + pixelData.length)
			pam.set(headerBytes, 0)
			pam.set(pixelData, headerBytes.length)

			const decoded = decodePam(pam)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(0) // Gray
			expect(decoded.data[4]).toBe(128) // Gray
		})

		it('should throw for invalid magic', () => {
			const invalid = new Uint8Array([0x50, 0x36]) // P6 (not P7)
			expect(() => decodePam(invalid)).toThrow('Invalid PAM')
		})
	})

	describe('encodePam', () => {
		it('should encode with correct header', () => {
			const pam = encodePam({
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			})

			const text = new TextDecoder().decode(pam.subarray(0, 100))

			expect(text).toContain('P7')
			expect(text).toContain('WIDTH 4')
			expect(text).toContain('HEIGHT 4')
			expect(text).toContain('DEPTH 4')
			expect(text).toContain('MAXVAL 255')
			expect(text).toContain('TUPLTYPE RGB_ALPHA')
			expect(text).toContain('ENDHDR')
		})
	})

	describe('PAMCodec', () => {
		it('should detect PAM files', () => {
			const codec = new PAMCodec()

			const valid = new Uint8Array([0x50, 0x37]) // P7
			expect(codec.canDecode(valid)).toBe(true)

			const invalid = new Uint8Array([0x50, 0x36]) // P6
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should have correct metadata', () => {
			const codec = new PAMCodec()
			expect(codec.name).toBe('PAM')
			expect(codec.extensions).toContain('.pam')
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

			const encoded = encodePam(original)
			const decoded = decodePam(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})

		it('should handle transparency', () => {
			const original = {
				width: 2,
				height: 2,
				data: new Uint8Array([
					255,
					0,
					0,
					0, // Fully transparent
					0,
					255,
					0,
					128, // Semi-transparent
					0,
					0,
					255,
					255, // Opaque
					255,
					255,
					255,
					64, // Low alpha
				]),
			}

			const encoded = encodePam(original)
			const decoded = decodePam(encoded)

			expect(decoded.data[3]).toBe(0) // Transparent
			expect(decoded.data[7]).toBe(128) // Semi-transparent
			expect(decoded.data[11]).toBe(255) // Opaque
			expect(decoded.data[15]).toBe(64) // Low alpha
		})
	})
})
