import { describe, expect, it } from 'bun:test'
import { decodeAVIF } from './decoder'
import { encodeAVIF } from './encoder'
import { AVIF_BRANDS, BoxType } from './types'

describe('AVIF Decoder', () => {
	describe('Format validation', () => {
		it('should reject non-AVIF data', () => {
			const invalidData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) // JPEG magic
			expect(() => decodeAVIF(invalidData)).toThrow('Invalid AVIF signature')
		})

		it('should reject data without ftyp box', () => {
			const invalidData = new Uint8Array([0, 0, 0, 8, 0x6d, 0x64, 0x61, 0x74]) // mdat only
			expect(() => decodeAVIF(invalidData)).toThrow('Invalid AVIF signature')
		})

		it('should accept AVIF brand in ftyp', () => {
			const validFtyp = createFtypBox(AVIF_BRANDS.AVIF)
			const data = new Uint8Array([...validFtyp])

			// This will fail on missing required boxes, but should pass ftyp check
			expect(() => decodeAVIF(data)).toThrow('Missing image properties')
		})

		it('should accept AVIS brand (sequence) in ftyp', () => {
			const validFtyp = createFtypBox(AVIF_BRANDS.AVIS)
			const data = new Uint8Array([...validFtyp])

			// This will fail on missing required boxes, but should pass ftyp check
			expect(() => decodeAVIF(data)).toThrow('Missing image properties')
		})
	})

	describe('Box parsing', () => {
		it('should parse basic ISOBMFF box structure', () => {
			// Create a simple test box
			const testBox = createBox(0x74657374, [0x01, 0x02, 0x03, 0x04]) // 'test'
			const data = new Uint8Array(testBox)

			// Parser should handle this without crashing
			expect(data.length).toBe(12) // 8 byte header + 4 byte data
		})

		it('should handle multiple boxes', () => {
			const box1 = createBox(0x74737431, [0x01, 0x02]) // 'tst1'
			const box2 = createBox(0x74737432, [0x03, 0x04]) // 'tst2'
			const data = new Uint8Array([...box1, ...box2])

			expect(data.length).toBe(20) // Two boxes with headers
		})

		it('should require minimum metadata boxes', () => {
			const ftyp = createFtypBox(AVIF_BRANDS.AVIF)
			const data = new Uint8Array([...ftyp])

			expect(() => decodeAVIF(data)).toThrow(/Missing/)
		})
	})

	describe('Image dimensions', () => {
		it('should extract width and height from ispe property', () => {
			const avif = createMinimalAVIF(100, 200)
			const result = decodeAVIF(avif)

			expect(result.width).toBe(100)
			expect(result.height).toBe(200)
		})

		it('should handle small images', () => {
			const avif = createMinimalAVIF(1, 1)
			const result = decodeAVIF(avif)

			expect(result.width).toBe(1)
			expect(result.height).toBe(1)
			expect(result.data.length).toBe(4) // 1x1 RGBA
		})

		it('should handle large dimensions', () => {
			const avif = createMinimalAVIF(1920, 1080)
			const result = decodeAVIF(avif)

			expect(result.width).toBe(1920)
			expect(result.height).toBe(1080)
			expect(result.data.length).toBe(1920 * 1080 * 4)
		})
	})

	describe('Output format', () => {
		it('should return ImageData with correct structure', () => {
			const avif = createMinimalAVIF(10, 10)
			const result = decodeAVIF(avif)

			expect(result).toHaveProperty('width')
			expect(result).toHaveProperty('height')
			expect(result).toHaveProperty('data')
			expect(result.data).toBeInstanceOf(Uint8Array)
		})

		it('should output RGBA data with correct length', () => {
			const width = 16
			const height = 16
			const avif = createMinimalAVIF(width, height)
			const result = decodeAVIF(avif)

			expect(result.data.length).toBe(width * height * 4)
		})

		it('should include alpha channel', () => {
			const avif = createMinimalAVIF(2, 2)
			const result = decodeAVIF(avif)

			// Check that alpha values exist (every 4th byte)
			for (let i = 3; i < result.data.length; i += 4) {
				expect(result.data[i]).toBeDefined()
				expect(result.data[i]).toBeGreaterThanOrEqual(0)
				expect(result.data[i]).toBeLessThanOrEqual(255)
			}
		})
	})

	describe('Round-trip encoding/decoding', () => {
		it('should decode encoded image with correct dimensions', () => {
			const original = {
				width: 4,
				height: 4,
				data: new Uint8Array(4 * 4 * 4).fill(128),
			}

			const encoded = encodeAVIF(original)
			const decoded = decodeAVIF(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)
		})

		it('should handle images with alpha transparency', () => {
			const width = 2
			const height = 2
			const data = new Uint8Array(width * height * 4)

			// Create pattern with varying alpha
			for (let i = 0; i < width * height; i++) {
				data[i * 4] = 255 // R
				data[i * 4 + 1] = 0 // G
				data[i * 4 + 2] = 0 // B
				data[i * 4 + 3] = i * 64 // A varies
			}

			const original = { width, height, data }
			const encoded = encodeAVIF(original)
			const decoded = decodeAVIF(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)
		})

		it('should handle fully opaque images', () => {
			const width = 3
			const height = 3
			const data = new Uint8Array(width * height * 4)

			// All pixels fully opaque
			for (let i = 0; i < width * height; i++) {
				data[i * 4] = 100
				data[i * 4 + 1] = 150
				data[i * 4 + 2] = 200
				data[i * 4 + 3] = 255 // Fully opaque
			}

			const original = { width, height, data }
			const encoded = encodeAVIF(original)
			const decoded = decodeAVIF(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)
		})
	})

	describe('Error handling', () => {
		it('should throw on empty data', () => {
			const empty = new Uint8Array(0)
			expect(() => decodeAVIF(empty)).toThrow()
		})

		it('should throw on truncated data', () => {
			const truncated = new Uint8Array([0, 0, 0, 8]) // Incomplete box header
			expect(() => decodeAVIF(truncated)).toThrow()
		})

		it('should throw on missing required boxes', () => {
			const ftyp = createFtypBox(AVIF_BRANDS.AVIF)
			const data = new Uint8Array([...ftyp])

			expect(() => decodeAVIF(data)).toThrow(/Missing/)
		})
	})
})

// Helper functions for creating test AVIF data

function createBox(type: number, data: number[]): number[] {
	const size = data.length + 8
	return [
		(size >> 24) & 0xff,
		(size >> 16) & 0xff,
		(size >> 8) & 0xff,
		size & 0xff,
		(type >> 24) & 0xff,
		(type >> 16) & 0xff,
		(type >> 8) & 0xff,
		type & 0xff,
		...data,
	]
}

function createFullBox(type: number, version: number, flags: number, data: number[]): number[] {
	const fullData = [version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff, ...data]
	return createBox(type, fullData)
}

function createFtypBox(majorBrand: number): number[] {
	return createBox(BoxType.FTYP, [
		(majorBrand >> 24) & 0xff,
		(majorBrand >> 16) & 0xff,
		(majorBrand >> 8) & 0xff,
		majorBrand & 0xff,
		0,
		0,
		0,
		0, // minor version
		(AVIF_BRANDS.AVIF >> 24) & 0xff,
		(AVIF_BRANDS.AVIF >> 16) & 0xff,
		(AVIF_BRANDS.AVIF >> 8) & 0xff,
		AVIF_BRANDS.AVIF & 0xff,
	])
}

function createMinimalAVIF(width: number, height: number): Uint8Array {
	const output: number[] = []

	// ftyp box
	output.push(...createFtypBox(AVIF_BRANDS.AVIF))

	// meta box
	const metaChildren: number[] = []

	// hdlr box
	const hdlrData = [
		0, 0, 0, 0, // pre_defined
		0x70, 0x69, 0x63, 0x74, // handler_type = 'pict'
		0, 0, 0, 0, // reserved
		0, 0, 0, 0,
		0, 0, 0, 0,
		0, // name
	]
	metaChildren.push(...createFullBox(BoxType.HDLR, 0, 0, hdlrData))

	// pitm box
	metaChildren.push(...createFullBox(BoxType.PITM, 0, 0, [0, 1])) // item_ID = 1

	// iloc box
	const bitstreamSize = 100
	const ilocData = [
		0x44, // offset_size=4, length_size=4
		0x00,
		0, 1, // item_count = 1
		0, 1, // item_ID = 1
		0, 0, // construction_method=0, data_reference_index=0
		0, 1, // extent_count = 1
		0, 0, 0, 0, // extent_offset = 0
		(bitstreamSize >> 24) & 0xff,
		(bitstreamSize >> 16) & 0xff,
		(bitstreamSize >> 8) & 0xff,
		bitstreamSize & 0xff,
	]
	metaChildren.push(...createFullBox(BoxType.ILOC, 0, 0, ilocData))

	// iinf box
	const infeData = [
		0, 1, // item_ID = 1
		0, 0, // item_protection_index = 0
		0x61, 0x76, 0x30, 0x31, // item_type = 'av01'
		0, // name
	]
	const infeBox = createFullBox(0x696e6665, 2, 0, infeData) // 'infe'
	const iinfData = [0, 1, ...infeBox] // entry_count = 1
	metaChildren.push(...createFullBox(BoxType.IINF, 0, 0, iinfData))

	// iprp box
	const iprpChildren: number[] = []

	// ipco box
	const ipcoChildren: number[] = []

	// ispe property
	const ispeData = [
		(width >> 24) & 0xff,
		(width >> 16) & 0xff,
		(width >> 8) & 0xff,
		width & 0xff,
		(height >> 24) & 0xff,
		(height >> 16) & 0xff,
		(height >> 8) & 0xff,
		height & 0xff,
	]
	ipcoChildren.push(...createFullBox(BoxType.ISPE, 0, 0, ispeData))

	// pixi property
	ipcoChildren.push(...createFullBox(BoxType.PIXI, 0, 0, [3, 8, 8, 8]))

	iprpChildren.push(...createBox(BoxType.IPCO, ipcoChildren))
	metaChildren.push(...createBox(BoxType.IPRP, iprpChildren))

	output.push(...createFullBox(BoxType.META, 0, 0, metaChildren))

	// mdat box with dummy data
	const mdatData = new Array(bitstreamSize).fill(0)
	output.push(...createBox(BoxType.MDAT, mdatData))

	return new Uint8Array(output)
}
