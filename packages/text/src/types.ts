/**
 * Text rendering types
 */

import type { ImageData } from '@mconv/core'

/** Glyph data for a single character */
export interface Glyph {
	/** Character code */
	char: number
	/** Glyph width in pixels */
	width: number
	/** Glyph height in pixels */
	height: number
	/** X offset from origin */
	xOffset: number
	/** Y offset from baseline */
	yOffset: number
	/** Advance width (spacing to next character) */
	advance: number
	/** Bitmap data (1 bit per pixel, row-major) */
	bitmap: Uint8Array
}

/** Bitmap font */
export interface BitmapFont {
	/** Font name */
	name: string
	/** Font size in pixels */
	size: number
	/** Line height */
	lineHeight: number
	/** Baseline position from top */
	baseline: number
	/** Character glyphs */
	glyphs: Map<number, Glyph>
	/** Default glyph for missing characters */
	defaultGlyph?: Glyph
}

/** Text render options */
export interface TextRenderOptions {
	/** Text color [R, G, B] (default: [0, 0, 0]) */
	color?: [number, number, number]
	/** Background color [R, G, B, A] or null for transparent (default: null) */
	backgroundColor?: [number, number, number, number] | null
	/** Line spacing multiplier (default: 1.0) */
	lineSpacing?: number
	/** Letter spacing in pixels (default: 0) */
	letterSpacing?: number
	/** Text alignment (default: 'left') */
	align?: 'left' | 'center' | 'right'
	/** Word wrap width in pixels (default: no wrap) */
	wrapWidth?: number
}

/** Text measurement result */
export interface TextMetrics {
	/** Total width in pixels */
	width: number
	/** Total height in pixels */
	height: number
	/** Number of lines */
	lines: number
	/** Width of each line */
	lineWidths: number[]
}

/** Draw text options (for drawing onto existing image) */
export interface DrawTextOptions extends TextRenderOptions {
	/** X position */
	x: number
	/** Y position */
	y: number
}
