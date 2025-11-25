/**
 * Subtitle encoder
 * Generates SRT and VTT formats
 */

import type {
	SrtEncodeOptions,
	SubtitleCue,
	SubtitleCueSettings,
	SubtitleFile,
	VttEncodeOptions,
	VttRegion,
	VttStyle,
} from './types'

/**
 * Encode to SRT format
 */
export function encodeSrt(
	cues: SubtitleCue[],
	options: SrtEncodeOptions = {}
): string {
	const { msSeparator = ',' } = options

	const lines: string[] = []

	for (let i = 0; i < cues.length; i++) {
		const cue = cues[i]!
		const index = cue.index ?? i + 1

		// Cue index
		lines.push(String(index))

		// Timestamp line
		const startTs = formatSrtTimestamp(cue.startTime, msSeparator)
		const endTs = formatSrtTimestamp(cue.endTime, msSeparator)
		lines.push(`${startTs} --> ${endTs}`)

		// Text content
		lines.push(cue.text)

		// Blank line between cues
		lines.push('')
	}

	return lines.join('\n')
}

/**
 * Encode to VTT format
 */
export function encodeVtt(
	cues: SubtitleCue[],
	options: VttEncodeOptions = {}
): string {
	const { header, includeIds = true } = options

	const lines: string[] = []

	// Header
	if (header) {
		lines.push(`WEBVTT ${header}`)
	} else {
		lines.push('WEBVTT')
	}
	lines.push('')

	for (const cue of cues) {
		// Cue identifier
		if (includeIds && cue.id) {
			lines.push(cue.id)
		}

		// Timestamp line with settings
		const startTs = formatVttTimestamp(cue.startTime)
		const endTs = formatVttTimestamp(cue.endTime)
		let timeLine = `${startTs} --> ${endTs}`

		if (cue.settings) {
			const settingsStr = formatVttSettings(cue.settings)
			if (settingsStr) {
				timeLine += ` ${settingsStr}`
			}
		}

		lines.push(timeLine)

		// Text content
		lines.push(cue.text)

		// Blank line between cues
		lines.push('')
	}

	return lines.join('\n')
}

/**
 * Encode subtitle file (format-aware)
 */
export function encodeSubtitle(file: SubtitleFile): string {
	if (file.format === 'vtt') {
		return encodeVttFile(file)
	} else {
		return encodeSrt(file.cues)
	}
}

/**
 * Encode full VTT file with regions and styles
 */
export function encodeVttFile(file: SubtitleFile): string {
	const lines: string[] = []

	// Header
	if (file.header) {
		lines.push(`WEBVTT ${file.header}`)
	} else {
		lines.push('WEBVTT')
	}
	lines.push('')

	// Regions
	if (file.regions) {
		for (const region of file.regions) {
			lines.push(formatVttRegion(region))
			lines.push('')
		}
	}

	// Styles
	if (file.styles) {
		for (const style of file.styles) {
			lines.push('STYLE')
			lines.push(style.css)
			lines.push('')
		}
	}

	// Cues
	for (const cue of file.cues) {
		// Cue identifier
		if (cue.id) {
			lines.push(cue.id)
		}

		// Timestamp line with settings
		const startTs = formatVttTimestamp(cue.startTime)
		const endTs = formatVttTimestamp(cue.endTime)
		let timeLine = `${startTs} --> ${endTs}`

		if (cue.settings) {
			const settingsStr = formatVttSettings(cue.settings)
			if (settingsStr) {
				timeLine += ` ${settingsStr}`
			}
		}

		lines.push(timeLine)

		// Text content
		lines.push(cue.text)

		// Blank line between cues
		lines.push('')
	}

	return lines.join('\n')
}

/**
 * Convert SRT to VTT
 */
export function srtToVtt(srtContent: string, header?: string): string {
	// Import decoder to parse SRT
	const { decodeSrt } = require('./decoder')
	const srtFile = decodeSrt(srtContent)

	return encodeVtt(srtFile.cues, { header, includeIds: false })
}

/**
 * Convert VTT to SRT
 */
export function vttToSrt(vttContent: string): string {
	// Import decoder to parse VTT
	const { decodeVtt } = require('./decoder')
	const vttFile = decodeVtt(vttContent)

	// Re-index cues for SRT
	const cues = vttFile.cues.map((cue: SubtitleCue, i: number) => ({
		...cue,
		index: i + 1,
	}))

	return encodeSrt(cues)
}

/**
 * Format SRT timestamp (HH:MM:SS,mmm)
 */
function formatSrtTimestamp(seconds: number, msSeparator: string): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)
	const ms = Math.round((seconds % 1) * 1000)

	return (
		String(hours).padStart(2, '0') + ':' +
		String(minutes).padStart(2, '0') + ':' +
		String(secs).padStart(2, '0') + msSeparator +
		String(ms).padStart(3, '0')
	)
}

/**
 * Format VTT timestamp (HH:MM:SS.mmm)
 */
function formatVttTimestamp(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)
	const ms = Math.round((seconds % 1) * 1000)

	return (
		String(hours).padStart(2, '0') + ':' +
		String(minutes).padStart(2, '0') + ':' +
		String(secs).padStart(2, '0') + '.' +
		String(ms).padStart(3, '0')
	)
}

/**
 * Format VTT cue settings
 */
function formatVttSettings(settings: SubtitleCueSettings): string {
	const parts: string[] = []

	if (settings.vertical) {
		parts.push(`vertical:${settings.vertical}`)
	}
	if (settings.line !== undefined) {
		parts.push(`line:${settings.line}`)
	}
	if (settings.position !== undefined) {
		parts.push(`position:${settings.position}`)
	}
	if (settings.size !== undefined) {
		parts.push(`size:${settings.size}`)
	}
	if (settings.align) {
		parts.push(`align:${settings.align}`)
	}
	if (settings.region) {
		parts.push(`region:${settings.region}`)
	}

	return parts.join(' ')
}

/**
 * Format VTT REGION
 */
function formatVttRegion(region: VttRegion): string {
	const lines = ['REGION']
	const settings: string[] = [`id:${region.id}`]

	if (region.width) {
		settings.push(`width:${region.width}`)
	}
	if (region.lines !== undefined) {
		settings.push(`lines:${region.lines}`)
	}
	if (region.regionAnchor) {
		settings.push(`regionanchor:${region.regionAnchor}`)
	}
	if (region.viewportAnchor) {
		settings.push(`viewportanchor:${region.viewportAnchor}`)
	}
	if (region.scroll) {
		settings.push(`scroll:${region.scroll}`)
	}

	lines.push(settings.join(' '))

	return lines.join('\n')
}
