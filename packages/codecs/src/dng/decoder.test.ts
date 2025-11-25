import { describe, expect, test } from 'bun:test'
import { decodeDNG, isDNG, parseDNG } from './decoder'
import { encodeDNG } from './encoder'
import { DNGTag, DNG_VERSION_1_4 } from './types'

describe('DNG Codec', () => {
	test('encode creates valid DNG', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const encoded = encodeDNG(image)

		// Check little-endian signature
		expect(encoded[0]).toBe(0x49) // I
		expect(encoded[1]).toBe(0x49) // I

		// Check magic number
		expect(encoded[2]).toBe(42)
		expect(encoded[3]).toBe(0)

		// Verify it's recognized as DNG
		expect(isDNG(encoded)).toBe(true)
	})

	test('encode and decode roundtrip (uncompressed)', () => {
		// Create a simple test image
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

		// Encode without compression
		const encoded = encodeDNG(original, { quality: 100 })
		const decoded = decodeDNG(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check RGB values match
		for (let i = 0; i < original.width * original.height; i++) {
			expect(decoded.data[i * 4]).toBe(original.data[i * 4]) // R
			expect(decoded.data[i * 4 + 1]).toBe(original.data[i * 4 + 1]) // G
			expect(decoded.data[i * 4 + 2]).toBe(original.data[i * 4 + 2]) // B
		}
	})

	test('encode and decode roundtrip (PackBits)', () => {
		const original = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(200),
		}

		// Use default compression
		const encoded = encodeDNG(original)
		const decoded = decodeDNG(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check values
		for (let i = 0; i < decoded.data.length; i += 4) {
			expect(decoded.data[i]).toBe(200) // R
			expect(decoded.data[i + 1]).toBe(200) // G
			expect(decoded.data[i + 2]).toBe(200) // B
		}
	})

	test('encode with DNG metadata', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(128),
		}

		const metadata = {
			dngVersion: DNG_VERSION_1_4,
			uniqueCameraModel: 'Test Camera',
			cameraSerialNumber: '12345',
			baselineExposure: 0,
			baselineNoise: 1.0,
			baselineSharpness: 1.0,
		}

		const encoded = encodeDNG(image, { metadata })
		const parsed = parseDNG(encoded)

		expect(parsed.metadata).toBeDefined()
		expect(parsed.metadata?.dngVersion).toEqual(DNG_VERSION_1_4)
		expect(parsed.metadata?.uniqueCameraModel).toBe('Test Camera')
		expect(parsed.metadata?.cameraSerialNumber).toBe('12345')
	})

	test('parseDNG extracts DNG structure', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(100),
		}

		const encoded = encodeDNG(image)
		const dng = parseDNG(encoded)

		expect(dng.littleEndian).toBe(true)
		expect(dng.isBigTiff).toBe(false)
		expect(dng.ifds.length).toBe(1)
		expect(dng.metadata).toBeDefined()
		expect(dng.metadata?.dngVersion).toBeDefined()
	})

	test('parseDNG extracts DNG metadata tags', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(128),
		}

		const metadata = {
			uniqueCameraModel: 'Nikon D850',
			localizedCameraModel: 'D850',
			cameraSerialNumber: 'SN123456',
			whiteLevel: [16383],
			blackLevel: [600],
		}

		const encoded = encodeDNG(image, { metadata })
		const parsed = parseDNG(encoded)

		expect(parsed.metadata?.uniqueCameraModel).toBe('Nikon D850')
		expect(parsed.metadata?.localizedCameraModel).toBe('D850')
		expect(parsed.metadata?.cameraSerialNumber).toBe('SN123456')
		expect(parsed.metadata?.whiteLevel).toEqual([16383])
		expect(parsed.metadata?.blackLevel).toEqual([600])
	})

	test('isDNG validates DNG files', () => {
		const validDNG = encodeDNG({
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(128),
		})

		expect(isDNG(validDNG)).toBe(true)

		// Invalid signature
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(isDNG(invalid)).toBe(false)

		// Too short
		expect(isDNG(new Uint8Array([0x49, 0x49]))).toBe(false)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([255, 128, 64, 255]), // Orange pixel
		}

		const encoded = encodeDNG(image)
		const decoded = decodeDNG(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(128) // G
		expect(decoded.data[2]).toBe(64) // B
	})

	test('handles image with alpha channel', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Create semi-transparent pattern
		for (let i = 0; i < image.data.length; i += 4) {
			image.data[i] = 255 // R
			image.data[i + 1] = 128 // G
			image.data[i + 2] = 64 // B
			image.data[i + 3] = 128 // A (50% transparent)
		}

		const encoded = encodeDNG(image)
		const decoded = decodeDNG(encoded)

		expect(decoded.width).toBe(4)
		expect(decoded.height).toBe(4)

		// Check first pixel has semi-transparency preserved
		expect(decoded.data[0]).toBe(255)
		expect(decoded.data[1]).toBe(128)
		expect(decoded.data[2]).toBe(64)
		expect(decoded.data[3]).toBe(128)
	})

	test('decode throws on invalid DNG', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeDNG(invalid)).toThrow()
	})

	test('handles color calibration metadata', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(128),
		}

		const metadata = {
			colorMatrix1: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
			colorMatrix2: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
			calibrationIlluminant1: 21, // D65
			calibrationIlluminant2: 17, // Standard Light A
		}

		const encoded = encodeDNG(image, { metadata })
		const parsed = parseDNG(encoded)

		expect(parsed.metadata?.colorMatrix1).toEqual(metadata.colorMatrix1)
		expect(parsed.metadata?.colorMatrix2).toEqual(metadata.colorMatrix2)
		expect(parsed.metadata?.calibrationIlluminant1).toBe(21)
		expect(parsed.metadata?.calibrationIlluminant2).toBe(17)
	})

	test('handles lens information', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(128),
		}

		const metadata = {
			lensInfo: [24, 70, 2.8, 2.8], // 24-70mm f/2.8
		}

		const encoded = encodeDNG(image, { metadata })
		const parsed = parseDNG(encoded)

		expect(parsed.metadata?.lensInfo).toEqual([24, 70, 2.8, 2.8])
	})

	test('handles profile information', () => {
		const image = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4).fill(128),
		}

		const metadata = {
			profileName: 'Adobe Standard',
			profileCopyright: 'Copyright Adobe Systems Inc.',
		}

		const encoded = encodeDNG(image, { metadata })
		const parsed = parseDNG(encoded)

		expect(parsed.metadata?.profileName).toBe('Adobe Standard')
		expect(parsed.metadata?.profileCopyright).toBe('Copyright Adobe Systems Inc.')
	})
})
