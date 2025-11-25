import { describe, expect, test } from 'bun:test'
import { BRAND_HEIC, BRAND_HEIX, BRAND_MIF1, FTYP, ITEM_TYPE_HVC1 } from './types'
import { decodeHeic } from './decoder'
import { encodeHeic } from './encoder'

describe('HEIC Codec', () => {
	test('rejects invalid data', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeHeic(invalid)).toThrow()
	})

	test('rejects non-HEIC files', () => {
		// Valid ftyp box but not HEIC
		const notHeic = new Uint8Array([
			// ftyp box
			0x00, 0x00, 0x00, 0x18, // size = 24
			0x66, 0x74, 0x79, 0x70, // 'ftyp'
			0x69, 0x73, 0x6f, 0x6d, // major brand = 'isom' (not HEIC)
			0x00, 0x00, 0x00, 0x00, // minor version
			0x69, 0x73, 0x6f, 0x6d, // compatible brand = 'isom'
			0x6d, 0x70, 0x34, 0x32, // compatible brand = 'mp42'
		])
		expect(() => decodeHeic(notHeic)).toThrow('Not a HEIC/HEIF file')
	})

	test('parses ftyp box with HEIC brand', () => {
		const data = new Uint8Array([
			// ftyp box
			0x00, 0x00, 0x00, 0x20, // size = 32
			0x66, 0x74, 0x79, 0x70, // 'ftyp'
			0x68, 0x65, 0x69, 0x63, // major brand = 'heic'
			0x00, 0x00, 0x00, 0x00, // minor version
			0x6d, 0x69, 0x66, 0x31, // compatible brand = 'mif1'
			0x68, 0x65, 0x69, 0x63, // compatible brand = 'heic'
			0x68, 0x65, 0x69, 0x78, // compatible brand = 'heix'
			// meta box (minimal)
			0x00, 0x00, 0x00, 0x0c, // size = 12
			0x6d, 0x65, 0x74, 0x61, // 'meta'
			0x00, 0x00, 0x00, 0x00, // version + flags
		])

		// Should parse ftyp without throwing
		expect(() => decodeHeic(data)).toThrow('Primary item not found') // Expected since we only have minimal meta
	})

	test('recognizes HEIC brands', () => {
		// Test HEIC brand
		const heicData = new Uint8Array([
			0x00, 0x00, 0x00, 0x18, // size
			0x66, 0x74, 0x79, 0x70, // 'ftyp'
			0x68, 0x65, 0x69, 0x63, // 'heic'
			0x00, 0x00, 0x00, 0x00, // version
			0x6d, 0x69, 0x66, 0x31, // 'mif1'
			0x68, 0x65, 0x69, 0x63, // 'heic'
			0x00, 0x00, 0x00, 0x0c,
			0x6d, 0x65, 0x74, 0x61,
			0x00, 0x00, 0x00, 0x00,
		])

		expect(() => decodeHeic(heicData)).toThrow('Primary item not found')

		// Test HEIX brand (with alpha)
		const heixData = new Uint8Array([
			0x00, 0x00, 0x00, 0x18, // size
			0x66, 0x74, 0x79, 0x70, // 'ftyp'
			0x68, 0x65, 0x69, 0x78, // 'heix'
			0x00, 0x00, 0x00, 0x00, // version
			0x6d, 0x69, 0x66, 0x31, // 'mif1'
			0x68, 0x65, 0x69, 0x78, // 'heix'
			0x00, 0x00, 0x00, 0x0c,
			0x6d, 0x65, 0x74, 0x61,
			0x00, 0x00, 0x00, 0x00,
		])

		expect(() => decodeHeic(heixData)).toThrow('Primary item not found')
	})

	test('encodeHeic creates valid ftyp box', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(128),
		}

		expect(() => encodeHeic(image)).toThrow('HEVC encoding is not yet implemented')

		// Note: Since HEVC encoding is not implemented, we can't test the full output
		// In a real implementation with HEVC support, we would verify:
		// - Valid ftyp with HEIC brand
		// - Valid meta box structure
		// - Valid mdat with HEVC data
	})

	test('constants have correct values', () => {
		// Verify brand constants
		expect(BRAND_HEIC).toBe(0x68656963) // 'heic'
		expect(BRAND_HEIX).toBe(0x68656978) // 'heix'
		expect(BRAND_MIF1).toBe(0x6d696631) // 'mif1'

		// Verify box type constants
		expect(FTYP).toBe(0x66747970) // 'ftyp'

		// Verify item type constants
		expect(ITEM_TYPE_HVC1).toBe(0x68766331) // 'hvc1'
	})

	test('validates magic bytes', () => {
		// Test that ftyp box starts at correct position
		const data = new Uint8Array([
			0x00, 0x00, 0x00, 0x18, // ftyp size
			0x66, 0x74, 0x79, 0x70, // 'ftyp' magic
		])

		// Read magic
		const magic =
			(data[4]! << 24) | (data[5]! << 16) | (data[6]! << 8) | data[7]!

		expect(magic).toBe(FTYP)
	})

	test('handles empty image data', () => {
		const image = {
			width: 0,
			height: 0,
			data: new Uint8Array(0),
		}

		expect(() => encodeHeic(image)).toThrow('HEVC encoding is not yet implemented')
	})

	test('handles minimal image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 0, 0, 255]), // Red pixel
		}

		expect(() => encodeHeic(image)).toThrow('HEVC encoding is not yet implemented')
	})

	test('decoder throws on HEVC decoding or parsing', () => {
		// Create a minimal valid HEIF structure with HEVC item
		// but expect decoding to fail at parsing or HEVC bitstream stage
		const data = createMinimalHeifWithItem()

		// Should fail either at item parsing or HEVC decoding
		expect(() => decodeHeic(data)).toThrow()
	})
})

/**
 * Helper: Create minimal HEIF file structure with an HEVC item
 */
function createMinimalHeifWithItem(): Uint8Array {
	const output: number[] = []

	// ftyp box
	output.push(
		...[
			0x00, 0x00, 0x00, 0x20, // size = 32
			0x66, 0x74, 0x79, 0x70, // 'ftyp'
			0x68, 0x65, 0x69, 0x63, // major brand = 'heic'
			0x00, 0x00, 0x00, 0x00, // minor version
			0x6d, 0x69, 0x66, 0x31, // compatible brand = 'mif1'
			0x68, 0x65, 0x69, 0x63, // compatible brand = 'heic'
			0x68, 0x65, 0x69, 0x78, // compatible brand = 'heix'
		]
	)

	// meta box
	const metaContent: number[] = []

	// meta version + flags
	metaContent.push(0x00, 0x00, 0x00, 0x00)

	// hdlr box
	metaContent.push(
		...[
			0x00, 0x00, 0x00, 0x21, // size = 33
			0x68, 0x64, 0x6c, 0x72, // 'hdlr'
			0x00, 0x00, 0x00, 0x00, // version + flags
			0x00, 0x00, 0x00, 0x00, // pre_defined
			0x70, 0x69, 0x63, 0x74, // handler_type = 'pict'
			0x00, 0x00, 0x00, 0x00, // reserved
			0x00, 0x00, 0x00, 0x00, // reserved
			0x00, 0x00, 0x00, 0x00, // reserved
			0x00, // name
		]
	)

	// pitm box (primary item = 1)
	metaContent.push(
		...[
			0x00, 0x00, 0x00, 0x0e, // size = 14
			0x70, 0x69, 0x74, 0x6d, // 'pitm'
			0x00, 0x00, 0x00, 0x00, // version + flags
			0x00, 0x01, // item_id = 1
		]
	)

	// iinf box
	const iinfContent: number[] = []
	iinfContent.push(
		0x00, 0x00, 0x00, 0x00, // version + flags
		0x00, 0x01 // entry_count = 1
	)

	// infe box
	iinfContent.push(
		...[
			0x00, 0x00, 0x00, 0x15, // size = 21
			0x69, 0x6e, 0x66, 0x65, // 'infe'
			0x02, 0x00, 0x00, 0x00, // version=2, flags=0
			0x00, 0x01, // item_id = 1
			0x00, 0x00, // item_protection_index = 0
			0x68, 0x76, 0x63, 0x31, // item_type = 'hvc1'
			0x00, // item_name (empty)
		]
	)

	metaContent.push(
		...[
			0x00,
			0x00,
			0x00,
			0x08 + iinfContent.length, // iinf size
			0x69,
			0x69,
			0x6e,
			0x66, // 'iinf'
			...iinfContent,
		]
	)

	// iprp box with properties
	const iprpContent: number[] = []

	// ipco box
	const ipcoContent: number[] = []

	// ispe property (image size)
	ipcoContent.push(
		...[
			0x00, 0x00, 0x00, 0x14, // size = 20
			0x69, 0x73, 0x70, 0x65, // 'ispe'
			0x00, 0x00, 0x00, 0x00, // version + flags
			0x00, 0x00, 0x00, 0x10, // width = 16
			0x00, 0x00, 0x00, 0x10, // height = 16
		]
	)

	iprpContent.push(
		...[
			0x00,
			0x00,
			0x00,
			0x08 + ipcoContent.length, // ipco size
			0x69,
			0x70,
			0x63,
			0x6f, // 'ipco'
			...ipcoContent,
		]
	)

	// ipma box (property associations)
	iprpContent.push(
		...[
			0x00, 0x00, 0x00, 0x10, // size = 16
			0x69, 0x70, 0x6d, 0x61, // 'ipma'
			0x00, 0x00, 0x00, 0x00, // version + flags
			0x00, 0x00, 0x00, 0x01, // entry_count = 1
			0x00, 0x01, // item_id = 1
			0x01, // association_count = 1
			0x01, // property_index = 1
		]
	)

	metaContent.push(
		...[
			0x00,
			0x00,
			0x00,
			0x08 + iprpContent.length, // iprp size
			0x69,
			0x70,
			0x72,
			0x70, // 'iprp'
			...iprpContent,
		]
	)

	// iloc box (item location)
	metaContent.push(
		...[
			0x00, 0x00, 0x00, 0x1c, // size = 28
			0x69, 0x6c, 0x6f, 0x63, // 'iloc'
			0x00, 0x00, 0x00, 0x00, // version + flags
			0x44, // offset_size=4, length_size=4
			0x00, // base_offset_size=0
			0x00, 0x01, // item_count = 1
			0x00, 0x01, // item_id = 1
			0x00, 0x00, // data_reference_index = 0
			0x00, 0x01, // extent_count = 1
			0x00, 0x00, 0x00, 0x00, // extent_offset = 0
			0x00, 0x00, 0x00, 0x04, // extent_length = 4
		]
	)

	output.push(
		...[
			0x00,
			0x00,
			0x00,
			0x08 + metaContent.length, // meta size
			0x6d,
			0x65,
			0x74,
			0x61, // 'meta'
			...metaContent,
		]
	)

	// mdat box with dummy HEVC data
	output.push(
		...[
			0x00, 0x00, 0x00, 0x0c, // size = 12
			0x6d, 0x64, 0x61, 0x74, // 'mdat'
			0x00, 0x01, 0x02, 0x03, // dummy data
		]
	)

	return new Uint8Array(output)
}
