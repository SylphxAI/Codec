/**
 * Subtitle decoder
 * Parses SRT and VTT formats
 */

import type {
	SubtitleCue,
	SubtitleCueSettings,
	SubtitleFile,
	SubtitleFormat,
	SubtitleInfo,
	VttRegion,
	VttStyle,
} from './types'

/**
 * Check if data is SRT format
 */
export function isSrt(data: Uint8Array | string): boolean {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data.slice(0, 500))
	const trimmed = text.trim()

	// SRT starts with a number (cue index)
	if (!/^\d+\s*[\r\n]/.test(trimmed)) return false

	// Check for timestamp pattern
	return /\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(trimmed)
}

/**
 * Check if data is VTT format
 */
export function isVtt(data: Uint8Array | string): boolean {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data.slice(0, 100))
	return text.trimStart().startsWith('WEBVTT')
}

/**
 * Detect subtitle format
 */
export function detectSubtitleFormat(data: Uint8Array | string): SubtitleFormat | null {
	if (isVtt(data)) return 'vtt'
	if (isSrt(data)) return 'srt'
	return null
}

/**
 * Parse subtitle info without full decode
 */
export function parseSubtitleInfo(data: Uint8Array | string): SubtitleInfo {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
	const format = detectSubtitleFormat(text)

	if (!format) {
		throw new Error('Unknown subtitle format')
	}

	let cueCount = 0
	let maxTime = 0
	let hasStyles = false
	let hasRegions = false

	if (format === 'vtt') {
		// Count cues by timestamp lines
		const timeRegex = /(\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{2}:)?\d{2}:\d{2}\.\d{3}/g
		let match
		while ((match = timeRegex.exec(text)) !== null) {
			cueCount++
		}

		// Check for styles and regions
		hasStyles = text.includes('STYLE')
		hasRegions = text.includes('REGION')

		// Find max time
		const endTimeRegex = /-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/g
		while ((match = endTimeRegex.exec(text)) !== null) {
			const time = parseVttTimestamp(match[1]!)
			if (time > maxTime) maxTime = time
		}
	} else {
		// SRT format
		const timeRegex = /\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/g
		let match
		while ((match = timeRegex.exec(text)) !== null) {
			cueCount++
		}

		// Find max time
		const endTimeRegex = /-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/g
		while ((match = endTimeRegex.exec(text)) !== null) {
			const time = parseSrtTimestamp(match[1]!)
			if (time > maxTime) maxTime = time
		}
	}

	return {
		format,
		cueCount,
		duration: maxTime,
		hasStyles,
		hasRegions,
	}
}

/**
 * Decode SRT subtitle file
 */
export function decodeSrt(data: Uint8Array | string): SubtitleFile {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)

	// Remove BOM if present
	const cleanText = text.replace(/^\uFEFF/, '')

	const cues: SubtitleCue[] = []
	const blocks = cleanText.trim().split(/\r?\n\r?\n/)

	for (const block of blocks) {
		const lines = block.trim().split(/\r?\n/)
		if (lines.length < 2) continue

		// First line should be cue index
		const indexLine = lines[0]!.trim()
		const index = parseInt(indexLine, 10)
		if (isNaN(index)) continue

		// Second line should be timestamp
		const timeLine = lines[1]!.trim()
		const timeMatch = timeLine.match(
			/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/
		)
		if (!timeMatch) continue

		const startTime = parseSrtTimestamp(timeMatch[1]!)
		const endTime = parseSrtTimestamp(timeMatch[2]!)

		// Remaining lines are text
		const textLines = lines.slice(2)
		const text = textLines.join('\n')

		if (text.length > 0) {
			cues.push({
				index,
				startTime,
				endTime,
				text,
			})
		}
	}

	return {
		format: 'srt',
		cues,
	}
}

/**
 * Decode VTT subtitle file
 */
export function decodeVtt(data: Uint8Array | string): SubtitleFile {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)

	// Remove BOM if present
	const cleanText = text.replace(/^\uFEFF/, '')

	if (!cleanText.trimStart().startsWith('WEBVTT')) {
		throw new Error('Invalid VTT: missing WEBVTT header')
	}

	const cues: SubtitleCue[] = []
	const regions: VttRegion[] = []
	const styles: VttStyle[] = []
	let header: string | undefined

	// Split into blocks
	const blocks = cleanText.split(/\r?\n\r?\n/)

	// First block contains header
	const headerBlock = blocks[0]!
	const headerLines = headerBlock.split(/\r?\n/)
	const webvttLine = headerLines[0]!

	// Extract header text (after "WEBVTT")
	const headerMatch = webvttLine.match(/^WEBVTT(?:\s+(.*))?$/)
	if (headerMatch && headerMatch[1]) {
		header = headerMatch[1]
	}

	// Process remaining blocks
	for (let i = 1; i < blocks.length; i++) {
		const block = blocks[i]!.trim()
		if (!block) continue

		// Check for REGION
		if (block.startsWith('REGION')) {
			const region = parseVttRegion(block)
			if (region) regions.push(region)
			continue
		}

		// Check for STYLE
		if (block.startsWith('STYLE')) {
			const style = parseVttStyle(block)
			if (style) styles.push(style)
			continue
		}

		// Check for NOTE (comment)
		if (block.startsWith('NOTE')) {
			continue
		}

		// Try to parse as cue
		const cue = parseVttCue(block)
		if (cue) cues.push(cue)
	}

	return {
		format: 'vtt',
		cues,
		header,
		regions: regions.length > 0 ? regions : undefined,
		styles: styles.length > 0 ? styles : undefined,
	}
}

/**
 * Decode subtitle file (auto-detect format)
 */
export function decodeSubtitle(data: Uint8Array | string): SubtitleFile {
	const format = detectSubtitleFormat(data)

	if (format === 'vtt') {
		return decodeVtt(data)
	} else if (format === 'srt') {
		return decodeSrt(data)
	}

	throw new Error('Unknown subtitle format')
}

/**
 * Parse SRT timestamp (HH:MM:SS,mmm)
 */
function parseSrtTimestamp(str: string): number {
	const match = str.match(/(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})/)
	if (!match) return 0

	const hours = parseInt(match[1]!, 10)
	const minutes = parseInt(match[2]!, 10)
	const seconds = parseInt(match[3]!, 10)
	const ms = parseInt(match[4]!, 10)

	return hours * 3600 + minutes * 60 + seconds + ms / 1000
}

/**
 * Parse VTT timestamp (HH:MM:SS.mmm or MM:SS.mmm)
 */
function parseVttTimestamp(str: string): number {
	// Try HH:MM:SS.mmm format
	let match = str.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/)
	if (match) {
		const hours = parseInt(match[1]!, 10)
		const minutes = parseInt(match[2]!, 10)
		const seconds = parseInt(match[3]!, 10)
		const ms = parseInt(match[4]!, 10)
		return hours * 3600 + minutes * 60 + seconds + ms / 1000
	}

	// Try MM:SS.mmm format
	match = str.match(/(\d{2}):(\d{2})\.(\d{3})/)
	if (match) {
		const minutes = parseInt(match[1]!, 10)
		const seconds = parseInt(match[2]!, 10)
		const ms = parseInt(match[3]!, 10)
		return minutes * 60 + seconds + ms / 1000
	}

	return 0
}

/**
 * Parse VTT cue block
 */
function parseVttCue(block: string): SubtitleCue | null {
	const lines = block.split(/\r?\n/)
	let lineIndex = 0
	let id: string | undefined

	// Check if first line is cue identifier (no -->)
	if (lines[0] && !lines[0].includes('-->')) {
		id = lines[0].trim()
		lineIndex = 1
	}

	// Get timestamp line
	const timeLine = lines[lineIndex]
	if (!timeLine) return null

	const timeMatch = timeLine.match(
		/((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})(?:\s+(.*))?/
	)
	if (!timeMatch) return null

	const startTime = parseVttTimestamp(timeMatch[1]!)
	const endTime = parseVttTimestamp(timeMatch[2]!)
	const settingsStr = timeMatch[3]

	// Parse settings
	let settings: SubtitleCueSettings | undefined
	if (settingsStr) {
		settings = parseVttSettings(settingsStr)
	}

	// Remaining lines are text
	const textLines = lines.slice(lineIndex + 1)
	const text = textLines.join('\n')

	if (text.length === 0) return null

	return {
		id,
		startTime,
		endTime,
		text,
		settings,
	}
}

/**
 * Parse VTT cue settings
 */
function parseVttSettings(str: string): SubtitleCueSettings {
	const settings: SubtitleCueSettings = {}
	const pairs = str.split(/\s+/)

	for (const pair of pairs) {
		const [key, value] = pair.split(':')
		if (!key || !value) continue

		switch (key) {
			case 'vertical':
				settings.vertical = value as 'rl' | 'lr'
				break
			case 'line':
				settings.line = value.includes('%') ? value : parseInt(value, 10)
				break
			case 'position':
				settings.position = value
				break
			case 'size':
				settings.size = value
				break
			case 'align':
				settings.align = value as SubtitleCueSettings['align']
				break
			case 'region':
				settings.region = value
				break
		}
	}

	return Object.keys(settings).length > 0 ? settings : undefined as unknown as SubtitleCueSettings
}

/**
 * Parse VTT REGION block
 */
function parseVttRegion(block: string): VttRegion | null {
	const lines = block.split(/\r?\n/)
	const settingsLine = lines.slice(1).join(' ')

	const pairs = settingsLine.split(/\s+/)
	const region: Partial<VttRegion> = {}

	for (const pair of pairs) {
		const [key, value] = pair.split(':')
		if (!key || !value) continue

		switch (key) {
			case 'id':
				region.id = value
				break
			case 'width':
				region.width = value
				break
			case 'lines':
				region.lines = parseInt(value, 10)
				break
			case 'regionanchor':
				region.regionAnchor = value
				break
			case 'viewportanchor':
				region.viewportAnchor = value
				break
			case 'scroll':
				region.scroll = value as 'up'
				break
		}
	}

	return region.id ? (region as VttRegion) : null
}

/**
 * Parse VTT STYLE block
 */
function parseVttStyle(block: string): VttStyle | null {
	const lines = block.split(/\r?\n/)
	const cssLines = lines.slice(1)
	const css = cssLines.join('\n').trim()

	return css ? { css } : null
}
