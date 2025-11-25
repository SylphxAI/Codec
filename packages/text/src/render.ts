/**
 * Text rendering functions
 */

import type { ImageData } from '@sylphx/codec-core'
import { getDefaultFont } from './font'
import type { BitmapFont, DrawTextOptions, TextMetrics, TextRenderOptions } from './types'

/**
 * Measure text dimensions
 */
export function measureText(
	text: string,
	font: BitmapFont = getDefaultFont(),
	options: TextRenderOptions = {}
): TextMetrics {
	const { letterSpacing = 0, wrapWidth } = options
	const lines = splitLines(text, font, letterSpacing, wrapWidth)

	const lineWidths = lines.map((line) => measureLine(line, font, letterSpacing))
	const width = Math.max(...lineWidths, 0)
	const height = lines.length * font.lineHeight

	return {
		width,
		height,
		lines: lines.length,
		lineWidths,
	}
}

/**
 * Render text to a new image
 */
export function renderText(
	text: string,
	font: BitmapFont = getDefaultFont(),
	options: TextRenderOptions = {}
): ImageData {
	const {
		color = [0, 0, 0],
		backgroundColor = null,
		letterSpacing = 0,
		align = 'left',
		wrapWidth,
	} = options

	const metrics = measureText(text, font, options)

	// Create output image
	const width = wrapWidth || metrics.width || 1
	const height = metrics.height || font.lineHeight
	const data = new Uint8Array(width * height * 4)

	// Fill background
	if (backgroundColor) {
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = backgroundColor[0]
			data[i * 4 + 1] = backgroundColor[1]
			data[i * 4 + 2] = backgroundColor[2]
			data[i * 4 + 3] = backgroundColor[3]
		}
	}

	// Render text
	const lines = splitLines(text, font, letterSpacing, wrapWidth)

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx]!
		const lineWidth = metrics.lineWidths[lineIdx]!
		const y = lineIdx * font.lineHeight

		// Calculate x position based on alignment
		let x = 0
		if (align === 'center') {
			x = Math.floor((width - lineWidth) / 2)
		} else if (align === 'right') {
			x = width - lineWidth
		}

		renderLine(data, width, height, line, x, y, font, color, letterSpacing)
	}

	return { width, height, data }
}

/**
 * Draw text onto an existing image
 */
export function drawText(
	image: ImageData,
	text: string,
	font: BitmapFont = getDefaultFont(),
	options: DrawTextOptions
): ImageData {
	const { x, y, color = [0, 0, 0], letterSpacing = 0, wrapWidth } = options

	// Create a copy of the image
	const output = new Uint8Array(image.data.length)
	output.set(image.data)

	const lines = splitLines(text, font, letterSpacing, wrapWidth)

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx]!
		const lineY = y + lineIdx * font.lineHeight

		renderLine(output, image.width, image.height, line, x, lineY, font, color, letterSpacing)
	}

	return { width: image.width, height: image.height, data: output }
}

/**
 * Split text into lines, optionally word-wrapping
 */
function splitLines(
	text: string,
	font: BitmapFont,
	letterSpacing: number,
	wrapWidth?: number
): string[] {
	const rawLines = text.split('\n')

	if (!wrapWidth) {
		return rawLines
	}

	const wrappedLines: string[] = []

	for (const rawLine of rawLines) {
		if (rawLine === '') {
			wrappedLines.push('')
			continue
		}

		const words = rawLine.split(' ')
		let currentLine = ''

		for (const word of words) {
			const testLine = currentLine ? `${currentLine} ${word}` : word
			const testWidth = measureLine(testLine, font, letterSpacing)

			if (testWidth > wrapWidth && currentLine) {
				wrappedLines.push(currentLine)
				currentLine = word
			} else {
				currentLine = testLine
			}
		}

		if (currentLine) {
			wrappedLines.push(currentLine)
		}
	}

	return wrappedLines
}

/**
 * Measure width of a single line
 */
function measureLine(line: string, font: BitmapFont, letterSpacing: number): number {
	let width = 0

	for (let i = 0; i < line.length; i++) {
		const char = line.charCodeAt(i)
		const glyph = font.glyphs.get(char) || font.defaultGlyph

		if (glyph) {
			width += glyph.advance + letterSpacing
		}
	}

	// Remove trailing letter spacing
	if (line.length > 0) {
		width -= letterSpacing
	}

	return width
}

/**
 * Render a single line of text
 */
function renderLine(
	data: Uint8Array,
	imageWidth: number,
	imageHeight: number,
	line: string,
	startX: number,
	startY: number,
	font: BitmapFont,
	color: [number, number, number],
	letterSpacing: number
): void {
	let x = startX

	for (let i = 0; i < line.length; i++) {
		const char = line.charCodeAt(i)
		const glyph = font.glyphs.get(char) || font.defaultGlyph

		if (glyph) {
			renderGlyph(data, imageWidth, imageHeight, glyph, x + glyph.xOffset, startY + glyph.yOffset, color)
			x += glyph.advance + letterSpacing
		}
	}
}

/**
 * Render a single glyph
 */
function renderGlyph(
	data: Uint8Array,
	imageWidth: number,
	imageHeight: number,
	glyph: { width: number; height: number; bitmap: Uint8Array },
	x: number,
	y: number,
	color: [number, number, number]
): void {
	for (let row = 0; row < glyph.height; row++) {
		const py = y + row
		if (py < 0 || py >= imageHeight) continue

		const rowBits = glyph.bitmap[row]!

		for (let col = 0; col < glyph.width; col++) {
			const px = x + col
			if (px < 0 || px >= imageWidth) continue

			// Check if bit is set (MSB first)
			const bit = (rowBits >> (7 - col)) & 1

			if (bit) {
				const idx = (py * imageWidth + px) * 4
				data[idx] = color[0]
				data[idx + 1] = color[1]
				data[idx + 2] = color[2]
				data[idx + 3] = 255
			}
		}
	}
}

/**
 * Create a text label image with padding
 */
export function createTextLabel(
	text: string,
	font: BitmapFont = getDefaultFont(),
	options: TextRenderOptions & { padding?: number } = {}
): ImageData {
	const { padding = 4, backgroundColor = [255, 255, 255, 255], ...renderOptions } = options

	const metrics = measureText(text, font, renderOptions)
	const width = metrics.width + padding * 2
	const height = metrics.height + padding * 2

	// Create image with background
	const data = new Uint8Array(width * height * 4)
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = backgroundColor[0]
		data[i * 4 + 1] = backgroundColor[1]
		data[i * 4 + 2] = backgroundColor[2]
		data[i * 4 + 3] = backgroundColor[3]
	}

	const image: ImageData = { width, height, data }

	return drawText(image, text, font, {
		x: padding,
		y: padding,
		...renderOptions,
	})
}
