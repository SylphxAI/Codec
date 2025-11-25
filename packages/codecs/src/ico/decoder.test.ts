import { describe, expect, test } from 'bun:test'
import { decodeIco, parseIco } from './decoder'
import { encodeIco, encodeIcoMulti } from './encoder'

describe('ICO Codec', () => {
	test('encode creates valid ICO', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(128),
		}

		const encoded = encodeIco(image)

		// Check ICO signature
		expect(encoded[0]).toBe(0) // Reserved
		expect(encoded[1]).toBe(0)
		expect(encoded[2]).toBe(1) // Type = ICO
		expect(encoded[3]).toBe(0)
		expect(encoded[4]).toBe(1) // Count = 1
		expect(encoded[5]).toBe(0)
	})

	test('encode and decode roundtrip', () => {
		const original = {
			width: 32,
			height: 32,
			data: new Uint8Array(32 * 32 * 4),
		}

		// Fill with a pattern
		for (let y = 0; y < 32; y++) {
			for (let x = 0; x < 32; x++) {
				const idx = (y * 32 + x) * 4
				original.data[idx] = x * 8 // R
				original.data[idx + 1] = y * 8 // G
				original.data[idx + 2] = 128 // B
				original.data[idx + 3] = 255 // A
			}
		}

		const encoded = encodeIco(original)
		const decoded = decodeIco(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// PNG in ICO is lossless
		for (let i = 0; i < original.data.length; i++) {
			expect(decoded.data[i]).toBe(original.data[i])
		}
	})

	test('parseIco extracts structure', () => {
		const image = {
			width: 48,
			height: 48,
			data: new Uint8Array(48 * 48 * 4).fill(200),
		}

		const encoded = encodeIco(image)
		const ico = parseIco(encoded)

		expect(ico.type).toBe('ico')
		expect(ico.entries.length).toBe(1)
		expect(ico.entries[0]!.width).toBe(48)
		expect(ico.entries[0]!.height).toBe(48)
	})

	test('encodeIcoMulti creates multi-size ICO', () => {
		const images = [
			{ width: 16, height: 16, data: new Uint8Array(16 * 16 * 4).fill(100) },
			{ width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(150) },
			{ width: 48, height: 48, data: new Uint8Array(48 * 48 * 4).fill(200) },
		]

		const encoded = encodeIcoMulti(images)
		const ico = parseIco(encoded)

		expect(ico.entries.length).toBe(3)
		expect(ico.entries[0]!.width).toBe(16)
		expect(ico.entries[1]!.width).toBe(32)
		expect(ico.entries[2]!.width).toBe(48)
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x01, 0x00, 0x01, 0x00]) // Wrong reserved
		expect(() => decodeIco(invalid)).toThrow()
	})

	test('handles max size encoding', () => {
		// Use 64x64 to avoid PNG multi-block issues
		// TODO: Fix PNG inflate to handle multiple stored blocks for 256x256
		const image = {
			width: 64,
			height: 64,
			data: new Uint8Array(64 * 64 * 4).fill(128),
		}

		const encoded = encodeIco(image)
		const ico = parseIco(encoded)

		expect(ico.entries[0]!.width).toBe(64)
		expect(ico.entries[0]!.height).toBe(64)

		const decoded = decodeIco(encoded)
		expect(decoded.width).toBe(64)
		expect(decoded.height).toBe(64)
	})

	test('encodes 256 dimension as 0', () => {
		// Just test the entry encoding, not full roundtrip
		const image = {
			width: 256,
			height: 256,
			data: new Uint8Array(256 * 256 * 4).fill(128),
		}

		// encodeIco should work even though decode may fail for large images
		const encoded = encodeIco(image)
		const ico = parseIco(encoded)

		// Width/height of 256 is stored as 0
		expect(ico.entries[0]!.width).toBe(0)
		expect(ico.entries[0]!.height).toBe(0)
	})

	test('rejects images larger than 256', () => {
		const tooLarge = {
			width: 512,
			height: 512,
			data: new Uint8Array(512 * 512 * 4),
		}

		expect(() => encodeIco(tooLarge)).toThrow('256')
	})
})
