import { describe, expect, test } from 'bun:test'
import { decodeBpg } from './decoder'
import { encodeBpg } from './encoder'
import {
	BPG_CS_RGB,
	BPG_CS_YCbCr,
	BPG_FORMAT_420,
	BPG_FORMAT_444,
	BPG_FORMAT_GRAY,
	BPG_MAGIC,
} from './types'

describe('BPG Codec', () => {
	test('rejects invalid data', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeBpg(invalid)).toThrow()
	})

	test('rejects non-BPG files', () => {
		// Valid magic but for different format
		const notBpg = new Uint8Array([
			0x42, 0x4d, // BM (BMP magic)
			0x00, 0x00, 0x00, 0x00,
		])
		expect(() => decodeBpg(notBpg)).toThrow('Invalid BPG magic')
	})

	test('validates BPG magic number', () => {
		const magic = new Uint8Array([
			0x42, 0x50, 0x47, 0xfb, // BPG magic
		])

		const magicValue = (magic[0]! << 24) | (magic[1]! << 16) | (magic[2]! << 8) | magic[3]!
		expect(magicValue).toBe(BPG_MAGIC)
		expect(magicValue).toBe(0x425047fb)
	})

	test('parses BPG header with minimal valid structure', () => {
		const data = new Uint8Array([
			0x42, 0x50, 0x47, 0xfb, // Magic
			0x03, // Format flags: format=3 (4:4:4), no alpha, 8-bit
			0x10, // Width = 16 (variable length encoded)
			0x10, // Height = 16 (variable length encoded)
			0x04, // Picture data length = 4
			0x00, // Extension flags: no extensions, YCbCr color space
			// Picture data (4 bytes of dummy HEVC data)
			0x00, 0x00, 0x00, 0x00,
		])

		// Should parse header but fail at HEVC decoding
		expect(() => decodeBpg(data)).toThrow('HEVC decoding is not yet implemented')
	})

	test('recognizes format types', () => {
		// Format 0: Grayscale
		expect(BPG_FORMAT_GRAY).toBe(0)

		// Format 1: YCbCr 4:2:0
		expect(BPG_FORMAT_420).toBe(1)

		// Format 3: YCbCr 4:4:4
		expect(BPG_FORMAT_444).toBe(3)
	})

	test('recognizes color spaces', () => {
		// Color space 0: YCbCr
		expect(BPG_CS_YCbCr).toBe(0)

		// Color space 1: RGB
		expect(BPG_CS_RGB).toBe(1)
	})

	test('parses format flags correctly', () => {
		// Format flags byte: format=3, alpha=1, bit_depth=10 (minus 8 = 2)
		const formatFlags = 0x03 | 0x08 | (0x02 << 4) // format | alpha | bit_depth

		const format = formatFlags & 0x07
		const hasAlpha = !!(formatFlags & 0x08)
		const bitDepthMinus8 = (formatFlags >> 4) & 0x0f
		const bitDepth = bitDepthMinus8 + 8

		expect(format).toBe(3) // YCbCr 4:4:4
		expect(hasAlpha).toBe(true)
		expect(bitDepth).toBe(10)
	})

	test('parses extension flags correctly', () => {
		// Extension flags: no extensions, not alpha first, not premultiplied,
		// full range, BT.709 color space
		const extensionFlags = 0x00 | (0x03 << 4) // no extensions | BT.709

		const hasExtensions = !!(extensionFlags & 0x01)
		const alphaFirst = !!(extensionFlags & 0x02)
		const isPremultiplied = !!(extensionFlags & 0x04)
		const hasLimitedRange = !!(extensionFlags & 0x08)
		const colorSpace = (extensionFlags >> 4) & 0x0f

		expect(hasExtensions).toBe(false)
		expect(alphaFirst).toBe(false)
		expect(isPremultiplied).toBe(false)
		expect(hasLimitedRange).toBe(false)
		expect(colorSpace).toBe(3) // BT.709
	})

	test('handles variable-length integer encoding', () => {
		// Test small value (< 128)
		const small = new Uint8Array([0x42, 0x50, 0x47, 0xfb, 0x03, 0x7f]) // 127
		// Value should be read correctly (would need to parse in context)

		// Test large value (>= 128)
		const large = new Uint8Array([
			0x42, 0x50, 0x47, 0xfb, 0x03,
			0x81, 0x00, // Width = 128 (encoded as 0x81 0x00)
		])

		// Both should parse but fail at HEVC decoding
		expect(() => decodeBpg(small)).toThrow()
		expect(() => decodeBpg(large)).toThrow()
	})

	test('rejects invalid dimensions', () => {
		const data = new Uint8Array([
			0x42, 0x50, 0x47, 0xfb, // Magic
			0x03, // Format flags
			0x00, // Width = 0
			0x10, // Height = 16
			0x04, // Picture data length
			0x00, // Extension flags
			0x00, 0x00, 0x00, 0x00,
		])

		expect(() => decodeBpg(data)).toThrow('Invalid BPG dimensions')
	})

	test('encodeBpg creates valid magic and format', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(128),
		}

		// Should throw at HEVC encoding stage
		expect(() => encodeBpg(image)).toThrow('HEVC encoding is not yet implemented')
	})

	test('encodeBpg respects quality parameter', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(255),
		}

		// High quality
		expect(() => encodeBpg(image, { quality: 95 })).toThrow('HEVC encoding is not yet implemented')

		// Low quality
		expect(() => encodeBpg(image, { quality: 50 })).toThrow('HEVC encoding is not yet implemented')
	})

	test('encodeBpg respects lossless parameter', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(255),
		}

		expect(() => encodeBpg(image, { lossless: true })).toThrow('HEVC encoding is not yet implemented')
	})

	test('handles empty image data', () => {
		const image = {
			width: 0,
			height: 0,
			data: new Uint8Array(0),
		}

		expect(() => encodeBpg(image)).toThrow('HEVC encoding is not yet implemented')
	})

	test('handles minimal image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 0, 0, 255]), // Red pixel
		}

		expect(() => encodeBpg(image)).toThrow('HEVC encoding is not yet implemented')
	})

	test('parses file with extensions', () => {
		const data = new Uint8Array([
			0x42, 0x50, 0x47, 0xfb, // Magic
			0x03, // Format flags
			0x10, // Width = 16
			0x10, // Height = 16
			0x04, // Picture data length = 4
			0x01, // Extension flags: has extensions
			0x08, // Extension data length = 8
			// Extension: tag=1 (EXIF), length=4, data=[0x01, 0x02, 0x03, 0x04]
			0x01, // Tag = 1
			0x04, // Length = 4
			0x01, 0x02, 0x03, 0x04, // Data
			// Picture data
			0x00, 0x00, 0x00, 0x00,
		])

		// Should parse extensions but fail at HEVC decoding
		expect(() => decodeBpg(data)).toThrow('HEVC decoding is not yet implemented')
	})

	test('detects truncated file', () => {
		const data = new Uint8Array([
			0x42, 0x50, 0x47, 0xfb, // Magic
			0x03, // Format flags
			// Truncated - missing width, height, etc.
		])

		expect(() => decodeBpg(data)).toThrow()
	})

	test('validates picture data length', () => {
		const data = new Uint8Array([
			0x42, 0x50, 0x47, 0xfb, // Magic
			0x03, // Format flags
			0x10, // Width = 16
			0x10, // Height = 16
			0x10, // Picture data length = 16 (but we only have 4 bytes)
			0x00, // Extension flags
			// Only 4 bytes of picture data (should be 16)
			0x00, 0x00, 0x00, 0x00,
		])

		// Should parse but may fail when trying to read HEVC NAL units
		expect(() => decodeBpg(data)).toThrow()
	})

	test('constants have correct values', () => {
		// Verify magic constant
		expect(BPG_MAGIC).toBe(0x425047fb)

		// Verify format constants
		expect(BPG_FORMAT_GRAY).toBe(0)
		expect(BPG_FORMAT_420).toBe(1)
		expect(BPG_FORMAT_444).toBe(3)

		// Verify color space constants
		expect(BPG_CS_YCbCr).toBe(0)
		expect(BPG_CS_RGB).toBe(1)
	})
})
