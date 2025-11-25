/**
 * SVG decoder - Full SVG support
 * Rasterizes SVG to bitmap ImageData
 */

import type { ImageData } from '@sylphx/codec-core'
import { parseSvg } from './parser'
import { renderSvg } from './renderer'
import type { SvgDecodeOptions, SvgInfo } from './types'

/**
 * Check if data is an SVG file
 */
export function isSvg(data: Uint8Array | string): boolean {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data.slice(0, 1000))
	const trimmed = text.trim().toLowerCase()

	// Check for SVG tag or XML with SVG
	return (
		trimmed.startsWith('<svg') ||
		(trimmed.startsWith('<?xml') && trimmed.includes('<svg')) ||
		trimmed.includes('<!doctype svg')
	)
}

/**
 * Parse SVG info without full decode
 */
export function parseSvgInfo(data: Uint8Array | string): SvgInfo {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
	const doc = parseSvg(text)

	return {
		width: doc.width,
		height: doc.height,
		viewBox: doc.viewBox,
	}
}

/**
 * Decode SVG to ImageData
 */
export function decodeSvg(data: Uint8Array | string, options?: SvgDecodeOptions): ImageData {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
	const doc = parseSvg(text)

	return renderSvg(doc, options?.width, options?.height, options?.background)
}
