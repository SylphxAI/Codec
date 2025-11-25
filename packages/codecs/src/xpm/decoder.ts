/**
 * XPM (X Pixmap) decoder
 * Parses text-based XPM format to RGBA
 */

import type { ImageData } from '@mconv/core'

/**
 * Decode XPM image to RGBA
 */
export function decodeXpm(data: Uint8Array): ImageData {
	const text = new TextDecoder().decode(data)

	// Extract strings from XPM
	const strings = extractStrings(text)

	if (strings.length < 2) {
		throw new Error('Invalid XPM: not enough data')
	}

	// Parse header: "width height ncolors chars_per_pixel"
	const header = strings[0]!.split(/\s+/)
	const width = Number.parseInt(header[0]!, 10)
	const height = Number.parseInt(header[1]!, 10)
	const ncolors = Number.parseInt(header[2]!, 10)
	const cpp = Number.parseInt(header[3]!, 10)

	if (Number.isNaN(width) || Number.isNaN(height) || Number.isNaN(ncolors) || Number.isNaN(cpp)) {
		throw new Error('Invalid XPM header')
	}

	if (strings.length < 1 + ncolors + height) {
		throw new Error('Invalid XPM: truncated data')
	}

	// Parse color table
	const colorTable = new Map<string, [number, number, number, number]>()

	for (let i = 1; i <= ncolors; i++) {
		const line = strings[i]!
		const chars = line.substring(0, cpp)
		const rest = line.substring(cpp)

		// Parse color definition
		const color = parseColor(rest)
		colorTable.set(chars, color)
	}

	// Parse pixels
	const pixels = new Uint8Array(width * height * 4)
	let dstPos = 0

	for (let y = 0; y < height; y++) {
		const row = strings[1 + ncolors + y]!

		for (let x = 0; x < width; x++) {
			const chars = row.substring(x * cpp, (x + 1) * cpp)
			const color = colorTable.get(chars)

			if (!color) {
				throw new Error(`Unknown color: ${chars}`)
			}

			pixels[dstPos++] = color[0]
			pixels[dstPos++] = color[1]
			pixels[dstPos++] = color[2]
			pixels[dstPos++] = color[3]
		}
	}

	return { width, height, data: pixels }
}

/**
 * Extract quoted strings from XPM
 */
function extractStrings(text: string): string[] {
	const strings: string[] = []
	const regex = /"([^"]*)"/g
	let match: RegExpExecArray | null = regex.exec(text)

	while (match !== null) {
		strings.push(match[1]!)
		match = regex.exec(text)
	}

	return strings
}

/**
 * Parse color definition
 */
function parseColor(input: string): [number, number, number, number] {
	// Trim and look for color key
	const def = input.trim()

	// Format: "c #RRGGBB" or "c color_name" or "s symbolic c #RRGGBB"
	// Look for 'c' color key (color visual)
	const cMatch = def.match(/\bc\s+(#[0-9a-fA-F]{3,8}|\w+)/i)

	if (cMatch) {
		return parseColorValue(cMatch[1]!)
	}

	// Try to find any color definition
	const hexMatch = def.match(/#([0-9a-fA-F]{3,8})/)
	if (hexMatch) {
		return parseColorValue(`#${hexMatch[1]!}`)
	}

	// Check for 'None' (transparent)
	if (def.toLowerCase().includes('none')) {
		return [0, 0, 0, 0]
	}

	// Default to black
	return [0, 0, 0, 255]
}

/**
 * Parse color value (hex or name)
 */
function parseColorValue(value: string): [number, number, number, number] {
	if (value.startsWith('#')) {
		return parseHexColor(value.substring(1))
	}

	// Handle named colors
	return getNamedColor(value.toLowerCase())
}

/**
 * Parse hex color
 */
function parseHexColor(hex: string): [number, number, number, number] {
	let r: number
	let g: number
	let b: number
	let a: number

	if (hex.length === 3) {
		// #RGB
		r = Number.parseInt(hex[0]! + hex[0]!, 16)
		g = Number.parseInt(hex[1]! + hex[1]!, 16)
		b = Number.parseInt(hex[2]! + hex[2]!, 16)
		a = 255
	} else if (hex.length === 4) {
		// #RGBA
		r = Number.parseInt(hex[0]! + hex[0]!, 16)
		g = Number.parseInt(hex[1]! + hex[1]!, 16)
		b = Number.parseInt(hex[2]! + hex[2]!, 16)
		a = Number.parseInt(hex[3]! + hex[3]!, 16)
	} else if (hex.length === 6) {
		// #RRGGBB
		r = Number.parseInt(hex.substring(0, 2), 16)
		g = Number.parseInt(hex.substring(2, 4), 16)
		b = Number.parseInt(hex.substring(4, 6), 16)
		a = 255
	} else if (hex.length === 8) {
		// #RRGGBBAA
		r = Number.parseInt(hex.substring(0, 2), 16)
		g = Number.parseInt(hex.substring(2, 4), 16)
		b = Number.parseInt(hex.substring(4, 6), 16)
		a = Number.parseInt(hex.substring(6, 8), 16)
	} else {
		return [0, 0, 0, 255]
	}

	return [r, g, b, a]
}

/**
 * Get named color (basic set)
 */
function getNamedColor(name: string): [number, number, number, number] {
	const colors: Record<string, [number, number, number, number]> = {
		black: [0, 0, 0, 255],
		white: [255, 255, 255, 255],
		red: [255, 0, 0, 255],
		green: [0, 128, 0, 255],
		blue: [0, 0, 255, 255],
		yellow: [255, 255, 0, 255],
		cyan: [0, 255, 255, 255],
		magenta: [255, 0, 255, 255],
		gray: [128, 128, 128, 255],
		grey: [128, 128, 128, 255],
		orange: [255, 165, 0, 255],
		pink: [255, 192, 203, 255],
		purple: [128, 0, 128, 255],
		brown: [165, 42, 42, 255],
		none: [0, 0, 0, 0],
		transparent: [0, 0, 0, 0],
	}

	return colors[name] ?? [0, 0, 0, 255]
}
