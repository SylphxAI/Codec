import { describe, expect, it } from 'bun:test'
import {
	ExifOrientation,
	ExifTags,
	ExifType,
	hasExif,
	parseExifData,
	parseExifFromJpeg,
} from './exif'
import {
	IccColorSpace,
	IccProfileClass,
	IccRenderingIntent,
	isIcc,
	parseIcc,
	parseIccFromJpeg,
} from './icc'

describe('EXIF Parser', () => {
	// Create minimal TIFF/EXIF data
	function createTestExif(
		tags: Array<{ tag: number; type: ExifType; value: unknown }>
	): Uint8Array {
		const parts: number[] = []

		// TIFF header (little endian)
		parts.push(0x49, 0x49) // 'II' = little endian
		parts.push(0x2a, 0x00) // TIFF marker
		parts.push(0x08, 0x00, 0x00, 0x00) // IFD0 offset = 8

		// IFD0
		const tagCount = tags.length
		parts.push(tagCount & 0xff, (tagCount >> 8) & 0xff)

		let valueOffset = 8 + 2 + tagCount * 12 + 4 // After IFD entries and next IFD pointer
		const valueData: number[] = []

		for (const { tag, type, value } of tags) {
			// Tag
			parts.push(tag & 0xff, (tag >> 8) & 0xff)
			// Type
			parts.push(type & 0xff, (type >> 8) & 0xff)

			if (type === ExifType.ASCII && typeof value === 'string') {
				const str = `${value}\0`
				// Count
				parts.push(str.length & 0xff, (str.length >> 8) & 0xff, 0, 0)

				if (str.length <= 4) {
					// Value fits in 4 bytes
					for (let i = 0; i < 4; i++) {
						parts.push(i < str.length ? str.charCodeAt(i) : 0)
					}
				} else {
					// Offset to value
					parts.push(
						valueOffset & 0xff,
						(valueOffset >> 8) & 0xff,
						(valueOffset >> 16) & 0xff,
						(valueOffset >> 24) & 0xff
					)
					for (let i = 0; i < str.length; i++) {
						valueData.push(str.charCodeAt(i))
					}
					valueOffset += str.length
				}
			} else if (type === ExifType.SHORT && typeof value === 'number') {
				// Count = 1
				parts.push(0x01, 0x00, 0x00, 0x00)
				// Value
				parts.push(value & 0xff, (value >> 8) & 0xff, 0x00, 0x00)
			} else if (type === ExifType.LONG && typeof value === 'number') {
				// Count = 1
				parts.push(0x01, 0x00, 0x00, 0x00)
				// Value
				parts.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff)
			} else if (type === ExifType.RATIONAL && typeof value === 'number') {
				// Count = 1
				parts.push(0x01, 0x00, 0x00, 0x00)
				// Offset
				parts.push(
					valueOffset & 0xff,
					(valueOffset >> 8) & 0xff,
					(valueOffset >> 16) & 0xff,
					(valueOffset >> 24) & 0xff
				)
				// Rational value (numerator/denominator)
				const num = Math.round(value * 1000)
				const den = 1000
				valueData.push(num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, (num >> 24) & 0xff)
				valueData.push(den & 0xff, (den >> 8) & 0xff, (den >> 16) & 0xff, (den >> 24) & 0xff)
				valueOffset += 8
			} else {
				// Default: count = 1, value = 0
				parts.push(0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00)
			}
		}

		// Next IFD pointer (0 = none)
		parts.push(0x00, 0x00, 0x00, 0x00)

		// Append value data
		parts.push(...valueData)

		return new Uint8Array(parts)
	}

	// Create JPEG with EXIF
	function createJpegWithExif(exifData: Uint8Array): Uint8Array {
		const parts: number[] = []

		// SOI
		parts.push(0xff, 0xd8)

		// APP1 marker with EXIF
		parts.push(0xff, 0xe1)
		const segmentLen = 2 + 6 + exifData.length // length + "Exif\0\0" + data
		parts.push((segmentLen >> 8) & 0xff, segmentLen & 0xff)
		// EXIF header
		parts.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00) // "Exif\0\0"
		// EXIF data
		for (let i = 0; i < exifData.length; i++) {
			parts.push(exifData[i]!)
		}

		// EOI
		parts.push(0xff, 0xd9)

		return new Uint8Array(parts)
	}

	describe('hasExif', () => {
		it('should detect EXIF in JPEG', () => {
			const exif = createTestExif([])
			const jpeg = createJpegWithExif(exif)
			expect(hasExif(jpeg)).toBe(true)
		})

		it('should detect EXIF in TIFF format', () => {
			const exif = createTestExif([])
			expect(hasExif(exif)).toBe(true)
		})

		it('should return false for non-EXIF data', () => {
			expect(hasExif(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(hasExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})
	})

	describe('parseExifData', () => {
		it('should parse Make and Model', () => {
			const exif = createTestExif([
				{ tag: 0x010f, type: ExifType.ASCII, value: 'TestMake' },
				{ tag: 0x0110, type: ExifType.ASCII, value: 'TestModel' },
			])
			const data = parseExifData(exif)

			expect(data).not.toBeNull()
			expect(data!.make).toBe('TestMake')
			expect(data!.model).toBe('TestModel')
		})

		it('should parse Orientation', () => {
			const exif = createTestExif([{ tag: 0x0112, type: ExifType.SHORT, value: 6 }])
			const data = parseExifData(exif)

			expect(data).not.toBeNull()
			expect(data!.orientation).toBe(ExifOrientation.ROTATE_90)
		})

		it('should parse ISO', () => {
			const exif = createTestExif([{ tag: 0x8827, type: ExifType.SHORT, value: 400 }])
			const data = parseExifData(exif)

			expect(data).not.toBeNull()
			expect(data!.iso).toBe(400)
		})

		it('should handle empty EXIF', () => {
			const exif = createTestExif([])
			const data = parseExifData(exif)

			expect(data).not.toBeNull()
			expect(data!.raw).toBeDefined()
		})
	})

	describe('parseExifFromJpeg', () => {
		it('should extract EXIF from JPEG', () => {
			const exif = createTestExif([{ tag: 0x010f, type: ExifType.ASCII, value: 'Canon' }])
			const jpeg = createJpegWithExif(exif)
			const data = parseExifFromJpeg(jpeg)

			expect(data).not.toBeNull()
			expect(data!.make).toBe('Canon')
		})

		it('should return null for JPEG without EXIF', () => {
			const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
			const data = parseExifFromJpeg(jpeg)
			expect(data).toBeNull()
		})
	})
})

describe('ICC Parser', () => {
	// Create minimal ICC profile
	function createTestIcc(
		options: {
			profileClass?: string
			colorSpace?: string
			description?: string
		} = {}
	): Uint8Array {
		const { profileClass = 'mntr', colorSpace = 'RGB ', description = 'Test Profile' } = options

		const data = new Uint8Array(256)

		// Profile size (will be set at end)
		// Preferred CMM
		writeString(data, 4, '    ')
		// Version (4.0.0)
		data[8] = 4
		data[9] = 0
		// Profile class
		writeString(data, 12, profileClass)
		// Color space
		writeString(data, 16, colorSpace)
		// PCS
		writeString(data, 20, 'XYZ ')
		// Date/time
		writeU16BE(data, 24, 2024)
		writeU16BE(data, 26, 1)
		writeU16BE(data, 28, 1)
		// Signature 'acsp'
		writeString(data, 36, 'acsp')
		// Platform
		writeString(data, 40, 'APPL')
		// Flags
		writeU32BE(data, 44, 0)
		// Manufacturer
		writeString(data, 48, 'TEST')
		// Model
		writeU32BE(data, 52, 0)
		// Attributes (8 bytes)
		// Rendering intent
		writeU32BE(data, 64, 0)
		// Illuminant (D50)
		writeS15Fixed16(data, 68, 0.9642)
		writeS15Fixed16(data, 72, 1.0)
		writeS15Fixed16(data, 76, 0.8249)
		// Creator
		writeString(data, 80, 'TEST')

		// Tag count = 1 (description)
		writeU32BE(data, 128, 1)

		// Tag table entry for 'desc'
		writeString(data, 132, 'desc')
		writeU32BE(data, 136, 148) // offset
		writeU32BE(data, 140, 50) // size

		// Description tag (textDescriptionType)
		writeString(data, 148, 'desc')
		writeU32BE(data, 152, 0) // reserved
		writeU32BE(data, 156, description.length + 1)
		for (let i = 0; i < description.length; i++) {
			data[160 + i] = description.charCodeAt(i)
		}

		// Set profile size
		writeU32BE(data, 0, 256)

		return data
	}

	function writeString(data: Uint8Array, offset: number, str: string): void {
		for (let i = 0; i < str.length; i++) {
			data[offset + i] = str.charCodeAt(i)
		}
	}

	function writeU16BE(data: Uint8Array, offset: number, value: number): void {
		data[offset] = (value >> 8) & 0xff
		data[offset + 1] = value & 0xff
	}

	function writeU32BE(data: Uint8Array, offset: number, value: number): void {
		data[offset] = (value >> 24) & 0xff
		data[offset + 1] = (value >> 16) & 0xff
		data[offset + 2] = (value >> 8) & 0xff
		data[offset + 3] = value & 0xff
	}

	function writeS15Fixed16(data: Uint8Array, offset: number, value: number): void {
		const fixed = Math.round(value * 65536)
		writeU32BE(data, offset, fixed < 0 ? fixed + 0x100000000 : fixed)
	}

	describe('isIcc', () => {
		it('should identify ICC profiles', () => {
			const icc = createTestIcc()
			expect(isIcc(icc)).toBe(true)
		})

		it('should reject non-ICC data', () => {
			expect(isIcc(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isIcc(new Uint8Array(100))).toBe(false)
		})

		it('should handle short data', () => {
			expect(isIcc(new Uint8Array([]))).toBe(false)
			expect(isIcc(new Uint8Array(50))).toBe(false)
		})
	})

	describe('parseIcc', () => {
		it('should parse ICC header', () => {
			const icc = createTestIcc()
			const profile = parseIcc(icc)

			expect(profile).not.toBeNull()
			expect(profile!.header.signature).toBe('acsp')
			expect(profile!.header.colorSpace).toBe('RGB')
			expect(profile!.header.profileClass).toBe('mntr')
		})

		it('should parse description tag', () => {
			const icc = createTestIcc({ description: 'sRGB IEC61966-2.1' })
			const profile = parseIcc(icc)

			expect(profile).not.toBeNull()
			expect(profile!.description).toBe('sRGB IEC61966-2.1')
		})

		it('should parse illuminant', () => {
			const icc = createTestIcc()
			const profile = parseIcc(icc)

			expect(profile).not.toBeNull()
			expect(profile!.header.illuminant.x).toBeCloseTo(0.9642, 2)
			expect(profile!.header.illuminant.y).toBeCloseTo(1.0, 2)
			expect(profile!.header.illuminant.z).toBeCloseTo(0.8249, 2)
		})

		it('should handle different profile classes', () => {
			const display = createTestIcc({ profileClass: 'mntr' })
			const input = createTestIcc({ profileClass: 'scnr' })

			expect(parseIcc(display)!.header.profileClass).toBe('mntr')
			expect(parseIcc(input)!.header.profileClass).toBe('scnr')
		})
	})
})
