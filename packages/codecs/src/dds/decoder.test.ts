import { describe, expect, it } from 'bun:test'
import { DDSCodec } from './codec'
import { decodeDds } from './decoder'
import { encodeDds } from './encoder'

describe('DDS Decoder', () => {
	describe('decodeDds', () => {
		it('should decode uncompressed RGBA', () => {
			// Create a simple 2x2 RGBA DDS
			const dds = encodeDds(
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
				{ format: 'rgba' }
			)

			const decoded = decodeDds(dds)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
			expect(decoded.data[3]).toBe(255) // A
		})

		it('should decode uncompressed RGB', () => {
			const dds = encodeDds(
				{
					width: 2,
					height: 2,
					data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
				},
				{ format: 'rgb' }
			)

			const decoded = decodeDds(dds)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
			expect(decoded.data[3]).toBe(255) // A (default)
		})

		it('should decode BGRA format', () => {
			const dds = encodeDds(
				{
					width: 2,
					height: 2,
					data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]),
				},
				{ format: 'bgra' }
			)

			const decoded = decodeDds(dds)

			expect(decoded.width).toBe(2)
			expect(decoded.height).toBe(2)
			// BGRA should be converted back to RGBA
			expect(decoded.data[0]).toBe(255) // R
			expect(decoded.data[1]).toBe(0) // G
			expect(decoded.data[2]).toBe(0) // B
		})

		it('should decode DXT1 compressed format', () => {
			// Create 4x4 image (minimum DXT1 block size)
			const data = new Uint8Array(4 * 4 * 4)
			for (let i = 0; i < 16; i++) {
				data[i * 4] = 255 // R
				data[i * 4 + 1] = 0 // G
				data[i * 4 + 2] = 0 // B
				data[i * 4 + 3] = 255 // A
			}

			const dds = encodeDds({ width: 4, height: 4, data }, { format: 'dxt1' })
			const decoded = decodeDds(dds)

			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(4)
			// DXT1 has some color loss, check approximate values
			expect(decoded.data[0]).toBeGreaterThan(200) // R should be high
		})

		it('should decode DXT5 compressed format', () => {
			const data = new Uint8Array(4 * 4 * 4)
			for (let i = 0; i < 16; i++) {
				data[i * 4] = 0 // R
				data[i * 4 + 1] = 255 // G
				data[i * 4 + 2] = 0 // B
				data[i * 4 + 3] = 128 // A (semi-transparent)
			}

			const dds = encodeDds({ width: 4, height: 4, data }, { format: 'dxt5' })
			const decoded = decodeDds(dds)

			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(4)
			// Check approximate green and alpha
			expect(decoded.data[1]).toBeGreaterThan(200) // G should be high
			expect(decoded.data[3]).toBeGreaterThan(100) // A should be roughly 128
			expect(decoded.data[3]).toBeLessThan(200)
		})

		it('should throw error for invalid magic number', () => {
			const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
			expect(() => decodeDds(invalid)).toThrow('Invalid DDS file')
		})

		it('should handle 8x8 images', () => {
			const data = new Uint8Array(8 * 8 * 4)
			for (let i = 0; i < 64; i++) {
				data[i * 4] = i * 4
				data[i * 4 + 1] = 128
				data[i * 4 + 2] = 255 - i * 4
				data[i * 4 + 3] = 255
			}

			const dds = encodeDds({ width: 8, height: 8, data }, { format: 'rgba' })
			const decoded = decodeDds(dds)

			expect(decoded.width).toBe(8)
			expect(decoded.height).toBe(8)
			expect(decoded.data.length).toBe(8 * 8 * 4)
		})
	})

	describe('DDSCodec', () => {
		it('should detect DDS files', () => {
			const codec = new DDSCodec()

			// Valid DDS header
			const valid = new Uint8Array([0x44, 0x44, 0x53, 0x20])
			expect(codec.canDecode(valid)).toBe(true)

			// Invalid header
			const invalid = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			expect(codec.canDecode(invalid)).toBe(false)
		})

		it('should encode and decode', () => {
			const codec = new DDSCodec({ format: 'rgba' })

			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array(64).fill(128),
			}

			const encoded = codec.encode(original)
			const decoded = codec.decode(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)
		})

		it('should have correct metadata', () => {
			const codec = new DDSCodec()
			expect(codec.name).toBe('DDS')
			expect(codec.extensions).toContain('.dds')
			expect(codec.mimeTypes).toContain('image/vnd-ms.dds')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip RGBA format', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array([
					255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 128, 0, 0, 255, 0, 128,
					0, 255, 0, 0, 128, 255, 128, 128, 0, 255, 64, 0, 0, 255, 0, 64, 0, 255, 0, 0, 64, 255, 64,
					64, 0, 255, 32, 0, 0, 255, 0, 32, 0, 255, 0, 0, 32, 255, 32, 32, 0, 255,
				]),
			}

			const encoded = encodeDds(original, { format: 'rgba' })
			const decoded = decodeDds(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			// Exact match for uncompressed
			for (let i = 0; i < original.data.length; i++) {
				expect(decoded.data[i]).toBe(original.data[i])
			}
		})

		it('should approximately roundtrip DXT1', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array(64),
			}

			// Solid red
			for (let i = 0; i < 16; i++) {
				original.data[i * 4] = 255
				original.data[i * 4 + 1] = 0
				original.data[i * 4 + 2] = 0
				original.data[i * 4 + 3] = 255
			}

			const encoded = encodeDds(original, { format: 'dxt1' })
			const decoded = decodeDds(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			// DXT1 is lossy, check approximate values
			for (let i = 0; i < 16; i++) {
				expect(decoded.data[i * 4]).toBeGreaterThan(200) // R high
				expect(decoded.data[i * 4 + 1]).toBeLessThan(50) // G low
				expect(decoded.data[i * 4 + 2]).toBeLessThan(50) // B low
			}
		})

		it('should approximately roundtrip DXT5 with alpha', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array(64),
			}

			// Semi-transparent blue
			for (let i = 0; i < 16; i++) {
				original.data[i * 4] = 0
				original.data[i * 4 + 1] = 0
				original.data[i * 4 + 2] = 255
				original.data[i * 4 + 3] = 128
			}

			const encoded = encodeDds(original, { format: 'dxt5' })
			const decoded = decodeDds(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)

			// Check approximate values
			for (let i = 0; i < 16; i++) {
				expect(decoded.data[i * 4]).toBeLessThan(50) // R low
				expect(decoded.data[i * 4 + 1]).toBeLessThan(50) // G low
				expect(decoded.data[i * 4 + 2]).toBeGreaterThan(200) // B high
				expect(decoded.data[i * 4 + 3]).toBeGreaterThan(90) // A approx 128
				expect(decoded.data[i * 4 + 3]).toBeLessThan(170)
			}
		})
	})
})
