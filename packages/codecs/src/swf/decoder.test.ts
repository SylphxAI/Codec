import { describe, expect, test } from 'bun:test'
import { decodeSwf, decodeSwfAnimation, parseSwf } from './decoder'
import { encodeSwf, encodeSwfAnimation } from './encoder'
import { SwfTagType } from './types'

describe('SWF Codec', () => {
	test('encode creates valid SWF', () => {
		const image = {
			width: 16,
			height: 16,
			data: new Uint8Array(16 * 16 * 4).fill(128),
		}

		const encoded = encodeSwf(image)

		// Check SWF signature (CWS for compressed)
		expect(encoded[0]).toBe(0x43) // C
		expect(encoded[1]).toBe(0x57) // W
		expect(encoded[2]).toBe(0x53) // S

		// Check version
		expect(encoded[3]).toBe(10)
	})

	test('encode creates valid uncompressed SWF', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(255),
		}

		const encoded = encodeSwf(image, { quality: 0 })

		// Check SWF signature (FWS for uncompressed)
		expect(encoded[0]).toBe(0x46) // F
		expect(encoded[1]).toBe(0x57) // W
		expect(encoded[2]).toBe(0x53) // S
	})

	test('encode and decode roundtrip', () => {
		const original = {
			width: 4,
			height: 4,
			data: new Uint8Array(4 * 4 * 4),
		}

		// Create a simple pattern
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const idx = (y * 4 + x) * 4
				if (x < 2) {
					// Left side: red
					original.data[idx] = 255
					original.data[idx + 1] = 0
					original.data[idx + 2] = 0
				} else {
					// Right side: blue
					original.data[idx] = 0
					original.data[idx + 1] = 0
					original.data[idx + 2] = 255
				}
				original.data[idx + 3] = 255
			}
		}

		const encoded = encodeSwf(original)
		const decoded = decodeSwf(encoded)

		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Check left side is red
		expect(decoded.data[0]).toBe(255) // R
		expect(decoded.data[1]).toBe(0) // G
		expect(decoded.data[2]).toBe(0) // B
		expect(decoded.data[3]).toBe(255) // A

		// Check right side is blue
		const rightIdx = 2 * 4 // First pixel on right side
		expect(decoded.data[rightIdx]).toBe(0) // R
		expect(decoded.data[rightIdx + 1]).toBe(0) // G
		expect(decoded.data[rightIdx + 2]).toBe(255) // B
		expect(decoded.data[rightIdx + 3]).toBe(255) // A
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00])
		expect(() => decodeSwf(invalid)).toThrow()
	})

	test('parseSwf extracts structure', () => {
		const image = {
			width: 32,
			height: 32,
			data: new Uint8Array(32 * 32 * 4).fill(100),
		}

		const encoded = encodeSwf(image)
		const swf = parseSwf(encoded)

		expect(swf.header.signature).toBe('FWS') // Decompressed signature
		expect(swf.header.version).toBe(10)
		expect(swf.header.frameCount).toBe(1)

		// Check frame size (in TWIPS, 1/20th pixel)
		expect(swf.header.frameSize.xMin).toBe(0)
		expect(swf.header.frameSize.xMax).toBe(32 * 20)
		expect(swf.header.frameSize.yMin).toBe(0)
		expect(swf.header.frameSize.yMax).toBe(32 * 20)

		// Check tags
		expect(swf.tags.length).toBeGreaterThan(0)

		// Should have background color tag
		const bgTag = swf.tags.find((tag) => tag.type === SwfTagType.SetBackgroundColor)
		expect(bgTag).toBeDefined()

		// Should have bitmap tag
		const bitmapTag = swf.tags.find(
			(tag) =>
				tag.type === SwfTagType.DefineBitsLossless || tag.type === SwfTagType.DefineBitsLossless2
		)
		expect(bitmapTag).toBeDefined()

		// Should have end tag
		const endTag = swf.tags[swf.tags.length - 1]
		expect(endTag?.type).toBe(SwfTagType.End)
	})

	test('handles single pixel image', () => {
		const image = {
			width: 1,
			height: 1,
			data: new Uint8Array([200, 100, 50, 255]),
		}

		const encoded = encodeSwf(image)
		const decoded = decodeSwf(encoded)

		expect(decoded.width).toBe(1)
		expect(decoded.height).toBe(1)
		expect(decoded.data[0]).toBe(200)
		expect(decoded.data[1]).toBe(100)
		expect(decoded.data[2]).toBe(50)
		expect(decoded.data[3]).toBe(255)
	})

	test('handles transparency', () => {
		const image = {
			width: 2,
			height: 2,
			data: new Uint8Array([
				255, 0, 0, 255, // Red, opaque
				0, 255, 0, 128, // Green, semi-transparent
				0, 0, 255, 64, // Blue, mostly transparent
				255, 255, 255, 0, // White, fully transparent
			]),
		}

		const encoded = encodeSwf(image)
		const decoded = decodeSwf(encoded)

		expect(decoded.width).toBe(2)
		expect(decoded.height).toBe(2)

		// Check first pixel (opaque red)
		expect(decoded.data[0]).toBe(255)
		expect(decoded.data[1]).toBe(0)
		expect(decoded.data[2]).toBe(0)
		expect(decoded.data[3]).toBe(255)
	})

	test('encodeSwfAnimation creates valid animated SWF', () => {
		const video = {
			width: 8,
			height: 8,
			frameRate: 15,
			frames: [
				{
					image: {
						width: 8,
						height: 8,
						data: new Uint8Array(8 * 8 * 4).fill(255),
					},
					timestamp: 0,
					duration: 66.67,
				},
				{
					image: {
						width: 8,
						height: 8,
						data: new Uint8Array(8 * 8 * 4).fill(128),
					},
					timestamp: 66.67,
					duration: 66.67,
				},
			],
		}

		const encoded = encodeSwfAnimation(video)

		// Check SWF signature
		expect(encoded[0]).toBe(0x43) // C
		expect(encoded[1]).toBe(0x57) // W
		expect(encoded[2]).toBe(0x53) // S
	})

	test('decodeSwfAnimation extracts frames', () => {
		const video = {
			width: 4,
			height: 4,
			frameRate: 30,
			frames: [
				{
					image: {
						width: 4,
						height: 4,
						data: new Uint8Array(4 * 4 * 4).fill(255),
					},
					timestamp: 0,
					duration: 33.33,
				},
				{
					image: {
						width: 4,
						height: 4,
						data: new Uint8Array(4 * 4 * 4).fill(128),
					},
					timestamp: 33.33,
					duration: 33.33,
				},
			],
		}

		const encoded = encodeSwfAnimation(video)
		const decoded = decodeSwfAnimation(encoded)

		expect(decoded.width).toBe(video.width)
		expect(decoded.height).toBe(video.height)
		expect(decoded.frameRate).toBe(video.frameRate)
		expect(decoded.frames.length).toBe(video.frames.length)
	})

	test('handles large image', () => {
		const image = {
			width: 256,
			height: 256,
			data: new Uint8Array(256 * 256 * 4),
		}

		// Create gradient
		for (let y = 0; y < 256; y++) {
			for (let x = 0; x < 256; x++) {
				const idx = (y * 256 + x) * 4
				image.data[idx] = x
				image.data[idx + 1] = y
				image.data[idx + 2] = (x + y) / 2
				image.data[idx + 3] = 255
			}
		}

		const encoded = encodeSwf(image)
		const decoded = decodeSwf(encoded)

		expect(decoded.width).toBe(256)
		expect(decoded.height).toBe(256)

		// Check corners
		expect(decoded.data[0]).toBe(0) // Top-left
		expect(decoded.data[1]).toBe(0)

		const bottomRightIdx = (255 * 256 + 255) * 4
		expect(decoded.data[bottomRightIdx]).toBe(255) // Bottom-right
		expect(decoded.data[bottomRightIdx + 1]).toBe(255)
	})

	test('parseSwf extracts background color', () => {
		const image = {
			width: 8,
			height: 8,
			data: new Uint8Array(8 * 8 * 4).fill(200),
		}

		const encoded = encodeSwf(image)
		const swf = parseSwf(encoded)

		expect(swf.backgroundColor).toBeDefined()
		expect(swf.backgroundColor?.red).toBe(255)
		expect(swf.backgroundColor?.green).toBe(255)
		expect(swf.backgroundColor?.blue).toBe(255)
	})
})
