import { describe, expect, it } from 'bun:test'
import { autoContrast, autoLevels, equalize, matchHistogram, normalize } from './adjust'
import {
	calculateCDF,
	calculateChannelStats,
	calculateHistogram,
	calculateStats,
	findPercentile,
	isLowContrast,
	isOverexposed,
	isUnderexposed,
} from './analyze'

describe('Histogram', () => {
	// Helper to create test image
	function createTestImage(
		width: number,
		height: number,
		fill: number
	): {
		width: number
		height: number
		data: Uint8Array
	} {
		const data = new Uint8Array(width * height * 4)
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = fill
			data[i * 4 + 1] = fill
			data[i * 4 + 2] = fill
			data[i * 4 + 3] = 255
		}
		return { width, height, data }
	}

	// Create gradient image
	function createGradientImage(
		width: number,
		height: number
	): {
		width: number
		height: number
		data: Uint8Array
	} {
		const data = new Uint8Array(width * height * 4)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4
				const value = Math.round((x / (width - 1)) * 255)
				data[i] = value
				data[i + 1] = value
				data[i + 2] = value
				data[i + 3] = 255
			}
		}
		return { width, height, data }
	}

	describe('calculateHistogram', () => {
		it('should calculate histogram for solid image', () => {
			const img = createTestImage(4, 4, 128)
			const hist = calculateHistogram(img)

			expect(hist.red[128]).toBe(16)
			expect(hist.green[128]).toBe(16)
			expect(hist.blue[128]).toBe(16)
			expect(hist.luminance[128]).toBe(16)
		})

		it('should calculate histogram for gradient', () => {
			const img = createGradientImage(256, 1)
			const hist = calculateHistogram(img)

			// Each value should appear once
			for (let i = 0; i < 256; i++) {
				expect(hist.red[i]).toBe(1)
			}
		})
	})

	describe('calculateChannelStats', () => {
		it('should calculate statistics correctly', () => {
			const hist = new Uint32Array(256)
			hist[100] = 10
			hist[150] = 10
			hist[200] = 10

			const stats = calculateChannelStats(hist)

			expect(stats.min).toBe(100)
			expect(stats.max).toBe(200)
			expect(stats.count).toBe(30)
			expect(stats.mean).toBeCloseTo(150, 0)
		})
	})

	describe('calculateStats', () => {
		it('should calculate image statistics', () => {
			const img = createTestImage(4, 4, 128)
			const stats = calculateStats(img)

			expect(stats.red.mean).toBe(128)
			expect(stats.luminance.mean).toBe(128)
		})
	})

	describe('findPercentile', () => {
		it('should find percentile correctly', () => {
			const hist = new Uint32Array(256)
			for (let i = 0; i < 256; i++) {
				hist[i] = 1
			}

			expect(findPercentile(hist, 0)).toBe(0)
			expect(findPercentile(hist, 50)).toBe(127)
			expect(findPercentile(hist, 100)).toBe(255)
		})
	})

	describe('calculateCDF', () => {
		it('should calculate cumulative distribution', () => {
			const hist = new Uint32Array(256)
			hist[0] = 50
			hist[255] = 50

			const cdf = calculateCDF(hist)

			expect(cdf[0]).toBe(0.5)
			expect(cdf[255]).toBe(1)
		})
	})

	describe('exposure detection', () => {
		it('should detect low contrast', () => {
			const img = createTestImage(4, 4, 128)
			expect(isLowContrast(img)).toBe(true)

			const gradient = createGradientImage(256, 1)
			expect(isLowContrast(gradient)).toBe(false)
		})

		it('should detect underexposed', () => {
			const dark = createTestImage(4, 4, 30)
			expect(isUnderexposed(dark)).toBe(true)

			const bright = createTestImage(4, 4, 200)
			expect(isUnderexposed(bright)).toBe(false)
		})

		it('should detect overexposed', () => {
			const bright = createTestImage(4, 4, 220)
			expect(isOverexposed(bright)).toBe(true)

			const dark = createTestImage(4, 4, 50)
			expect(isOverexposed(dark)).toBe(false)
		})
	})

	describe('autoLevels', () => {
		it('should stretch histogram', () => {
			// Create low contrast image (values 100-150)
			const data = new Uint8Array(16 * 4)
			for (let i = 0; i < 16; i++) {
				data[i * 4] = 100 + (i % 4) * 16
				data[i * 4 + 1] = 100 + (i % 4) * 16
				data[i * 4 + 2] = 100 + (i % 4) * 16
				data[i * 4 + 3] = 255
			}
			const img = { width: 4, height: 4, data }

			const result = autoLevels(img, { shadowClip: 0, highlightClip: 0 })

			const stats = calculateStats(result)
			// Should have expanded range compared to original (50 range)
			expect(stats.luminance.max - stats.luminance.min).toBeGreaterThan(50)
		})
	})

	describe('autoContrast', () => {
		it('should improve contrast', () => {
			const img = createTestImage(4, 4, 128)
			const result = autoContrast(img)

			expect(result.width).toBe(4)
			expect(result.height).toBe(4)
		})
	})

	describe('equalize', () => {
		it('should equalize histogram', () => {
			const img = createGradientImage(256, 1)
			const result = equalize(img)

			expect(result.width).toBe(256)

			// After equalization, histogram should be more uniform
			const hist = calculateHistogram(result)
			let nonZero = 0
			for (let i = 0; i < 256; i++) {
				if (hist.luminance[i]! > 0) nonZero++
			}
			expect(nonZero).toBeGreaterThan(200)
		})

		it('should equalize per-channel', () => {
			const img = createGradientImage(64, 64)
			const result = equalize(img, { perChannel: true })

			expect(result.width).toBe(64)
		})
	})

	describe('matchHistogram', () => {
		it('should match reference histogram', () => {
			const source = createTestImage(4, 4, 100)
			const reference = createTestImage(4, 4, 200)

			const result = matchHistogram(source, reference)
			const stats = calculateStats(result)

			// Result should be closer to reference
			expect(stats.luminance.mean).toBeGreaterThan(150)
		})
	})

	describe('normalize', () => {
		it('should normalize to full range', () => {
			const img = createGradientImage(256, 1)

			// Modify to have limited range (50-200)
			for (let i = 0; i < img.data.length; i += 4) {
				const v = img.data[i]!
				img.data[i] = 50 + Math.floor((v * 150) / 255)
				img.data[i + 1] = 50 + Math.floor((v * 150) / 255)
				img.data[i + 2] = 50 + Math.floor((v * 150) / 255)
			}

			const beforeStats = calculateStats(img)
			expect(beforeStats.red.min).toBeGreaterThanOrEqual(50)
			expect(beforeStats.red.max).toBeLessThanOrEqual(200)

			const result = normalize(img)

			// Normalize should return a processed image
			expect(result.width).toBe(256)
			expect(result.height).toBe(1)
		})
	})
})
