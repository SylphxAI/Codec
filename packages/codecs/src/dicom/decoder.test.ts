import { describe, expect, test } from 'bun:test'
import { decodeDicom, parseDicom } from './decoder'
import { encodeDicom } from './encoder'
import { DICOM_MAGIC, DICOM_MAGIC_OFFSET, DicomTag } from './types'

describe('DICOM Codec', () => {
	test('encode creates valid DICOM', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeDicom(image)

		// Check preamble (128 bytes of zeros)
		for (let i = 0; i < DICOM_MAGIC_OFFSET; i++) {
			expect(encoded[i]).toBe(0)
		}

		// Check magic
		const magic = String.fromCharCode(
			encoded[DICOM_MAGIC_OFFSET]!,
			encoded[DICOM_MAGIC_OFFSET + 1]!,
			encoded[DICOM_MAGIC_OFFSET + 2]!,
			encoded[DICOM_MAGIC_OFFSET + 3]!
		)
		expect(magic).toBe(DICOM_MAGIC)
	})

	test('encode and decode roundtrip (grayscale)', () => {
		// Create a simple grayscale test image
		const original = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill with grayscale gradient
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const idx = (y * 4 + x) * 4
				const gray = (y * 4 + x) * 16
				original.data[idx] = gray // R
				original.data[idx + 1] = gray // G
				original.data[idx + 2] = gray // B
				original.data[idx + 3] = 255 // A
			}
		}

		const encoded = encodeDicom(original)
		const decoded = decodeDicom(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check grayscale values match
		for (let i = 0; i < original.width * original.height; i++) {
			const originalGray = original.data[i * 4]!
			const decodedGray = decoded.data[i * 4]!
			expect(decodedGray).toBe(originalGray)
			// RGB should all be the same (grayscale)
			expect(decoded.data[i * 4 + 1]).toBe(decodedGray)
			expect(decoded.data[i * 4 + 2]).toBe(decodedGray)
		}
	})

	test('encode and decode roundtrip (RGB)', () => {
		// Create a simple RGB test image
		const original = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Fill with distinct colors
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const idx = (y * 4 + x) * 4
				original.data[idx] = x * 64 // R
				original.data[idx + 1] = y * 64 // G
				original.data[idx + 2] = 128 // B
				original.data[idx + 3] = 255 // A
			}
		}

		const encoded = encodeDicom(original)
		const decoded = decodeDicom(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check RGB values match
		for (let i = 0; i < original.width * original.height; i++) {
			expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
			expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
			expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
		}
	})

	test('decode throws on invalid magic', () => {
		const invalid = new Uint8Array(200)
		// Fill with some data but no valid DICM magic
		for (let i = 0; i < DICOM_MAGIC_OFFSET; i++) {
			invalid[i] = 0
		}
		invalid[DICOM_MAGIC_OFFSET] = 0x44 // D
		invalid[DICOM_MAGIC_OFFSET + 1] = 0x49 // I
		invalid[DICOM_MAGIC_OFFSET + 2] = 0x58 // X (invalid)
		invalid[DICOM_MAGIC_OFFSET + 3] = 0x4d // M

		expect(() => decodeDicom(invalid)).toThrow('Invalid DICOM magic')
	})

	test('parseDicom extracts structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeDicom(image)
		const dicom = parseDicom(encoded)

		expect(dicom.littleEndian).toBe(true)
		expect(dicom.explicitVR).toBe(true)
		expect(dicom.elements.size).toBeGreaterThan(0)

		// Check key elements exist
		expect(dicom.elements.has(DicomTag.Rows)).toBe(true)
		expect(dicom.elements.has(DicomTag.Columns)).toBe(true)
		expect(dicom.elements.has(DicomTag.PixelData)).toBe(true)

		// Verify dimensions
		const rows = dicom.elements.get(DicomTag.Rows)
		const columns = dicom.elements.get(DicomTag.Columns)
		expect(rows?.value).toBe(16)
		expect(columns?.value).toBe(16)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodeDicom(image)
		const decoded = decodeDicom(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
	})

	test('handles white image', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(255),
		}

		const encoded = encodeDicom(image)
		const decoded = decodeDicom(encoded)

		expect(decoded.width).toBe(8)
		expect(decoded.height).toBe(8)

		// All pixels should be white
		for (let i = 0; i < decoded.data.length; i += 4) {
			expect(decoded.data[i]).toBe(255) // R
			expect(decoded.data[i + 1]).toBe(255) // G
			expect(decoded.data[i + 2]).toBe(255) // B
		}
	})

	test('handles black image', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4),
		}

		// Set alpha to 255
		for (let i = 3; i < image.data.length; i += 4) {
			image.data[i] = 255
		}

		const encoded = encodeDicom(image)
		const decoded = decodeDicom(encoded)

		expect(decoded.width).toBe(8)
		expect(decoded.height).toBe(8)

		// All pixels should be black
		for (let i = 0; i < decoded.data.length; i += 4) {
			expect(decoded.data[i]).toBe(0) // R
			expect(decoded.data[i + 1]).toBe(0) // G
			expect(decoded.data[i + 2]).toBe(0) // B
		}
	})

	test('preserves image dimensions', () => {
		const dimensions = [
			{ width: 1, height: 1 },
			{ width: 16, height: 16 },
			{ width: 64, height: 32 },
			{ width: 100, height: 75 },
		]

		for (const { width, height } of dimensions) {
			const image = {
				width,
				height,
				data: new Uint8Array(width * height * 4).fill(128),
			}

			// Set alpha
			for (let i = 3; i < image.data.length; i += 4) {
				image.data[i] = 255
			}

			const encoded = encodeDicom(image)
			const decoded = decodeDicom(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)
		}
	})
})
