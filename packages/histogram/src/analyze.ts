/**
 * Histogram analysis
 */

import type { ImageData } from '@mconv/core'
import type { ChannelStats, Histogram, ImageStats } from './types'

/**
 * Calculate histogram for an image
 */
export function calculateHistogram(image: ImageData): Histogram {
	const { data } = image
	const red = new Uint32Array(256)
	const green = new Uint32Array(256)
	const blue = new Uint32Array(256)
	const luminance = new Uint32Array(256)
	const alpha = new Uint32Array(256)

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i]!
		const g = data[i + 1]!
		const b = data[i + 2]!
		const a = data[i + 3]!

		red[r]++
		green[g]++
		blue[b]++
		alpha[a]++

		// Calculate luminance (BT.709)
		const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
		luminance[lum]++
	}

	return { red, green, blue, luminance, alpha }
}

/**
 * Calculate image statistics
 */
export function calculateStats(image: ImageData): ImageStats {
	const histogram = calculateHistogram(image)

	const redStats = calculateChannelStats(histogram.red)
	const greenStats = calculateChannelStats(histogram.green)
	const blueStats = calculateChannelStats(histogram.blue)
	const lumStats = calculateChannelStats(histogram.luminance)

	return {
		red: redStats,
		green: greenStats,
		blue: blueStats,
		luminance: lumStats,
		mean: lumStats.mean,
		stdDev: lumStats.stdDev,
	}
}

/**
 * Calculate statistics for a single channel
 */
export function calculateChannelStats(histogram: Uint32Array): ChannelStats {
	let min = 255
	let max = 0
	let sum = 0
	let count = 0

	// Find min, max, sum, count
	for (let i = 0; i < 256; i++) {
		const freq = histogram[i]!
		if (freq > 0) {
			if (i < min) min = i
			if (i > max) max = i
			sum += i * freq
			count += freq
		}
	}

	if (count === 0) {
		return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, count: 0 }
	}

	const mean = sum / count

	// Calculate standard deviation
	let variance = 0
	for (let i = 0; i < 256; i++) {
		const freq = histogram[i]!
		if (freq > 0) {
			const diff = i - mean
			variance += diff * diff * freq
		}
	}
	const stdDev = Math.sqrt(variance / count)

	// Calculate median
	let median = 0
	let cumulative = 0
	const midpoint = count / 2
	for (let i = 0; i < 256; i++) {
		cumulative += histogram[i]!
		if (cumulative >= midpoint) {
			median = i
			break
		}
	}

	return { min, max, mean, median, stdDev, count }
}

/**
 * Find percentile value in histogram
 */
export function findPercentile(histogram: Uint32Array, percentile: number): number {
	let total = 0
	for (let i = 0; i < 256; i++) {
		total += histogram[i]!
	}

	const target = total * (percentile / 100)
	let cumulative = 0

	for (let i = 0; i < 256; i++) {
		cumulative += histogram[i]!
		if (cumulative >= target) {
			return i
		}
	}

	return 255
}

/**
 * Calculate cumulative distribution function
 */
export function calculateCDF(histogram: Uint32Array): Float64Array {
	const cdf = new Float64Array(256)
	let total = 0

	for (let i = 0; i < 256; i++) {
		total += histogram[i]!
	}

	if (total === 0) return cdf

	let cumulative = 0
	for (let i = 0; i < 256; i++) {
		cumulative += histogram[i]!
		cdf[i] = cumulative / total
	}

	return cdf
}

/**
 * Check if image is low contrast
 */
export function isLowContrast(image: ImageData, threshold = 50): boolean {
	const stats = calculateStats(image)
	return stats.luminance.max - stats.luminance.min < threshold
}

/**
 * Check if image is underexposed
 */
export function isUnderexposed(image: ImageData, threshold = 80): boolean {
	const stats = calculateStats(image)
	return stats.luminance.mean < threshold
}

/**
 * Check if image is overexposed
 */
export function isOverexposed(image: ImageData, threshold = 180): boolean {
	const stats = calculateStats(image)
	return stats.luminance.mean > threshold
}
