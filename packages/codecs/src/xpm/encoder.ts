/**
 * XPM (X Pixmap) encoder
 * Encodes RGBA to text-based XPM format
 */

import type { ImageData } from '@mconv/core'
import type { XPMEncodeOptions } from './types'

// Characters used for color encoding
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Encode image to XPM format
 */
export function encodeXpm(image: ImageData, options: XPMEncodeOptions = {}): Uint8Array {
	const { width, height, data } = image

	// Build color palette
	const colorMap = new Map<string, number>()
	const colors: string[] = []

	for (let i = 0; i < width * height; i++) {
		const pos = i * 4
		const colorKey = `${data[pos]!},${data[pos + 1]!},${data[pos + 2]!},${data[pos + 3]!}`

		if (!colorMap.has(colorKey)) {
			colorMap.set(colorKey, colors.length)
			colors.push(colorKey)
		}
	}

	const ncolors = colors.length

	// Determine chars per pixel
	let cpp = options.charsPerPixel
	if (!cpp) {
		cpp = ncolors <= CHARS.length ? 1 : 2
	}

	// Generate character codes for each color
	const colorCodes: string[] = []
	for (let i = 0; i < ncolors; i++) {
		if (cpp === 1) {
			colorCodes.push(CHARS[i % CHARS.length]!)
		} else {
			const c1 = CHARS[Math.floor(i / CHARS.length) % CHARS.length]!
			const c2 = CHARS[i % CHARS.length]!
			colorCodes.push(c1 + c2)
		}
	}

	// Build XPM content
	const lines: string[] = []

	// Header comment
	lines.push('/* XPM */')
	lines.push('static char *image[] = {')

	// Values line
	lines.push(`"${width} ${height} ${ncolors} ${cpp}",`)

	// Color definitions
	for (let i = 0; i < ncolors; i++) {
		const code = colorCodes[i]!
		const [r, g, b, a] = colors[i]!.split(',').map(Number)

		let colorDef: string
		if (a === 0) {
			colorDef = `"${code}\tc None"`
		} else {
			const hex = `#${r!.toString(16).padStart(2, '0')}${g!.toString(16).padStart(2, '0')}${b!.toString(16).padStart(2, '0')}`
			colorDef = `"${code}\tc ${hex}"`
		}

		lines.push(`${colorDef},`)
	}

	// Pixel data
	for (let y = 0; y < height; y++) {
		let row = '"'
		for (let x = 0; x < width; x++) {
			const pos = (y * width + x) * 4
			const colorKey = `${data[pos]!},${data[pos + 1]!},${data[pos + 2]!},${data[pos + 3]!}`
			const idx = colorMap.get(colorKey)!
			row += colorCodes[idx]!
		}
		row += '"'
		if (y < height - 1) row += ','
		lines.push(row)
	}

	lines.push('};')

	const text = lines.join('\n')
	return new TextEncoder().encode(text)
}
