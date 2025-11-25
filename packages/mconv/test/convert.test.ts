import { describe, expect, test } from 'bun:test'
import { convert, detectFormat, loadImage, saveImage } from '../src'

describe('mconv', () => {
	// Create a simple 8x8 test image
	const createTestImage = () => ({
		width: 8,
		height: 8,
		data: new Uint8Array(8 * 8 * 4).map((_, i) => {
			const pixel = Math.floor(i / 4)
			const channel = i % 4
			if (channel === 3) return 255 // Alpha
			return (pixel * 17 + channel * 50) % 256
		}),
	})

	describe('loadImage', () => {
		test('loads BMP image', async () => {
			const original = createTestImage()
			const bmp = await saveImage(original, 'bmp')
			const loaded = await loadImage(bmp)

			expect(loaded.width).toBe(8)
			expect(loaded.height).toBe(8)
		})

		test('loads PNG image', async () => {
			const original = createTestImage()
			const png = await saveImage(original, 'png')
			const loaded = await loadImage(png)

			expect(loaded.width).toBe(8)
			expect(loaded.height).toBe(8)
		})

		test('loads JPEG image', async () => {
			const original = createTestImage()
			const jpeg = await saveImage(original, 'jpeg')
			const loaded = await loadImage(jpeg)

			expect(loaded.width).toBe(8)
			expect(loaded.height).toBe(8)
		})

		test('loads GIF image', async () => {
			const original = createTestImage()
			const gif = await saveImage(original, 'gif')
			const loaded = await loadImage(gif)

			expect(loaded.width).toBe(8)
			expect(loaded.height).toBe(8)
		})

		test('loads TIFF image', async () => {
			const original = createTestImage()
			const tiff = await saveImage(original, 'tiff')
			const loaded = await loadImage(tiff)

			expect(loaded.width).toBe(8)
			expect(loaded.height).toBe(8)
		})
	})

	describe('convert', () => {
		test('converts BMP to PNG', async () => {
			const original = createTestImage()
			const bmp = await saveImage(original, 'bmp')

			const png = await convert(bmp, { format: 'png' })
			const format = detectFormat(png)

			expect(format).toBe('png')
		})

		test('converts PNG to JPEG', async () => {
			const original = createTestImage()
			const png = await saveImage(original, 'png')

			const jpeg = await convert(png, { format: 'jpeg' })
			const format = detectFormat(jpeg)

			expect(format).toBe('jpeg')
		})

		test('converts with resize', async () => {
			const original = createTestImage()
			const bmp = await saveImage(original, 'bmp')

			const resized = await convert(bmp, {
				format: 'png',
				resize: { width: 16, height: 16 },
			})

			const loaded = await loadImage(resized)
			expect(loaded.width).toBe(16)
			expect(loaded.height).toBe(16)
		})

		test('maintains format when not specified', async () => {
			const original = createTestImage()
			const gif = await saveImage(original, 'gif')

			const converted = await convert(gif)
			const format = detectFormat(converted)

			expect(format).toBe('gif')
		})
	})

	describe('detectFormat', () => {
		test('detects BMP', async () => {
			const image = createTestImage()
			const bmp = await saveImage(image, 'bmp')
			expect(detectFormat(bmp)).toBe('bmp')
		})

		test('detects PNG', async () => {
			const image = createTestImage()
			const png = await saveImage(image, 'png')
			expect(detectFormat(png)).toBe('png')
		})

		test('detects JPEG', async () => {
			const image = createTestImage()
			const jpeg = await saveImage(image, 'jpeg')
			expect(detectFormat(jpeg)).toBe('jpeg')
		})

		test('detects GIF', async () => {
			const image = createTestImage()
			const gif = await saveImage(image, 'gif')
			expect(detectFormat(gif)).toBe('gif')
		})

		test('detects TIFF', async () => {
			const image = createTestImage()
			const tiff = await saveImage(image, 'tiff')
			expect(detectFormat(tiff)).toBe('tiff')
		})

		test('detects ICO', async () => {
			const image = { width: 16, height: 16, data: new Uint8Array(16 * 16 * 4).fill(128) }
			const ico = await saveImage(image, 'ico')
			expect(detectFormat(ico)).toBe('ico')
		})
	})
})
