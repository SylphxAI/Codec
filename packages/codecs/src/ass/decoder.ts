/**
 * ASS/SSA subtitle decoder
 * Parses Advanced SubStation Alpha files
 */

import {
	DEFAULT_STYLE,
	type AssComment,
	type AssDialogue,
	type AssFile,
	type AssFormat,
	type AssInfo,
	type AssScriptInfo,
	type AssStyle,
} from './types'

/**
 * Check if data is ASS/SSA format
 */
export function isAss(data: Uint8Array | string): boolean {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data.slice(0, 500))
	return text.includes('[Script Info]')
}

/**
 * Detect format (ASS vs SSA)
 */
export function detectAssFormat(data: Uint8Array | string): AssFormat {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data.slice(0, 1000))

	// Check ScriptType or file extension hints
	if (text.includes('ScriptType: v4.00+') || text.includes('v4+ Styles')) {
		return 'ass'
	}
	if (text.includes('ScriptType: v4.00') || text.includes('V4 Styles')) {
		return 'ssa'
	}

	// Default to ASS (more common)
	return 'ass'
}

/**
 * Parse ASS info without full decode
 */
export function parseAssInfo(data: Uint8Array | string): AssInfo {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)

	const format = detectAssFormat(text)
	let title: string | undefined
	let width: number | undefined
	let height: number | undefined
	let styleCount = 0
	let dialogueCount = 0
	let maxTime = 0

	const lines = text.split(/\r?\n/)

	for (const line of lines) {
		if (line.startsWith('Title:')) {
			title = line.slice(6).trim()
		} else if (line.startsWith('PlayResX:')) {
			width = parseInt(line.slice(9).trim(), 10)
		} else if (line.startsWith('PlayResY:')) {
			height = parseInt(line.slice(9).trim(), 10)
		} else if (line.startsWith('Style:')) {
			styleCount++
		} else if (line.startsWith('Dialogue:')) {
			dialogueCount++
			// Parse end time
			const parts = line.slice(9).split(',')
			if (parts.length >= 2) {
				const endTime = parseAssTime(parts[2]?.trim() || '')
				if (endTime > maxTime) maxTime = endTime
			}
		}
	}

	return {
		format,
		title,
		resolution: width && height ? { width, height } : undefined,
		styleCount,
		dialogueCount,
		duration: maxTime,
	}
}

/**
 * Decode ASS/SSA file
 */
export function decodeAss(data: Uint8Array | string): AssFile {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)

	if (!isAss(text)) {
		throw new Error('Invalid ASS/SSA file: missing [Script Info] section')
	}

	const format = detectAssFormat(text)
	const lines = text.split(/\r?\n/)

	let currentSection = ''
	const scriptInfo: AssScriptInfo = {}
	const styles: AssStyle[] = []
	const dialogues: AssDialogue[] = []
	const comments: AssComment[] = []
	const fonts: string[] = []
	const graphics: string[] = []

	let styleFormat: string[] = []
	let eventFormat: string[] = []

	for (const line of lines) {
		const trimmed = line.trim()

		// Section headers
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			currentSection = trimmed.slice(1, -1).toLowerCase()
			continue
		}

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith(';')) continue

		switch (currentSection) {
			case 'script info':
				parseScriptInfoLine(trimmed, scriptInfo)
				break

			case 'v4 styles':
			case 'v4+ styles':
				if (trimmed.startsWith('Format:')) {
					styleFormat = trimmed.slice(7).split(',').map(s => s.trim().toLowerCase())
				} else if (trimmed.startsWith('Style:')) {
					const style = parseStyleLine(trimmed.slice(6), styleFormat, format)
					if (style) styles.push(style)
				}
				break

			case 'events':
				if (trimmed.startsWith('Format:')) {
					eventFormat = trimmed.slice(7).split(',').map(s => s.trim().toLowerCase())
				} else if (trimmed.startsWith('Dialogue:')) {
					const dialogue = parseDialogueLine(trimmed.slice(9), eventFormat)
					if (dialogue) dialogues.push(dialogue)
				} else if (trimmed.startsWith('Comment:')) {
					const comment = parseCommentLine(trimmed.slice(8), eventFormat)
					if (comment) comments.push(comment)
				}
				break

			case 'fonts':
				fonts.push(trimmed)
				break

			case 'graphics':
				graphics.push(trimmed)
				break
		}
	}

	return {
		format,
		scriptInfo,
		styles,
		dialogues,
		comments,
		fonts: fonts.length > 0 ? fonts : undefined,
		graphics: graphics.length > 0 ? graphics : undefined,
	}
}

/**
 * Parse Script Info line
 */
function parseScriptInfoLine(line: string, info: AssScriptInfo): void {
	const colonIndex = line.indexOf(':')
	if (colonIndex === -1) return

	const key = line.slice(0, colonIndex).trim()
	const value = line.slice(colonIndex + 1).trim()

	switch (key.toLowerCase()) {
		case 'title':
			info.title = value
			break
		case 'original script':
			info.originalScript = value
			break
		case 'original translation':
			info.originalTranslation = value
			break
		case 'original editing':
			info.originalEditing = value
			break
		case 'original timing':
			info.originalTiming = value
			break
		case 'script updated by':
			info.scriptUpdatedBy = value
			break
		case 'update details':
			info.updateDetails = value
			break
		case 'scripttype':
			info.scriptType = value
			break
		case 'collisions':
			info.collisions = value as 'Normal' | 'Reverse'
			break
		case 'playresx':
			info.playResX = parseInt(value, 10)
			break
		case 'playresy':
			info.playResY = parseInt(value, 10)
			break
		case 'playdepth':
			info.playDepth = parseInt(value, 10)
			break
		case 'timer':
			info.timer = parseFloat(value)
			break
		case 'wrapstyle':
			info.wrapStyle = parseInt(value, 10) as 0 | 1 | 2 | 3
			break
		case 'scaledborderandshadow':
			info.scaledBorderAndShadow = value.toLowerCase() === 'yes'
			break
		default:
			info[key] = value
	}
}

/**
 * Parse Style line
 */
function parseStyleLine(line: string, format: string[], assFormat: AssFormat): AssStyle | null {
	const parts = splitAssLine(line, format.length)
	if (parts.length < format.length) return null

	const style: AssStyle = { ...DEFAULT_STYLE }

	for (let i = 0; i < format.length; i++) {
		const key = format[i]!
		const value = parts[i]!.trim()

		switch (key) {
			case 'name':
				style.name = value
				break
			case 'fontname':
				style.fontName = value
				break
			case 'fontsize':
				style.fontSize = parseFloat(value)
				break
			case 'primarycolour':
				style.primaryColor = value
				break
			case 'secondarycolour':
				style.secondaryColor = value
				break
			case 'outlinecolour':
			case 'tertiarycolour':
				style.outlineColor = value
				break
			case 'backcolour':
				style.backColor = value
				break
			case 'bold':
				style.bold = value === '-1' || value === '1'
				break
			case 'italic':
				style.italic = value === '-1' || value === '1'
				break
			case 'underline':
				style.underline = value === '-1' || value === '1'
				break
			case 'strikeout':
				style.strikeOut = value === '-1' || value === '1'
				break
			case 'scalex':
				style.scaleX = parseFloat(value)
				break
			case 'scaley':
				style.scaleY = parseFloat(value)
				break
			case 'spacing':
				style.spacing = parseFloat(value)
				break
			case 'angle':
				style.angle = parseFloat(value)
				break
			case 'borderstyle':
				style.borderStyle = parseInt(value, 10) as 1 | 3
				break
			case 'outline':
				style.outline = parseFloat(value)
				break
			case 'shadow':
				style.shadow = parseFloat(value)
				break
			case 'alignment':
				style.alignment = parseInt(value, 10)
				break
			case 'marginl':
				style.marginL = parseInt(value, 10)
				break
			case 'marginr':
				style.marginR = parseInt(value, 10)
				break
			case 'marginv':
				style.marginV = parseInt(value, 10)
				break
			case 'encoding':
				style.encoding = parseInt(value, 10)
				break
		}
	}

	return style
}

/**
 * Parse Dialogue line
 */
function parseDialogueLine(line: string, format: string[]): AssDialogue | null {
	const parts = splitAssLine(line, format.length)
	if (parts.length < format.length) return null

	const dialogue: AssDialogue = {
		layer: 0,
		start: '0:00:00.00',
		end: '0:00:00.00',
		style: 'Default',
		name: '',
		marginL: 0,
		marginR: 0,
		marginV: 0,
		effect: '',
		text: '',
	}

	for (let i = 0; i < format.length; i++) {
		const key = format[i]!
		const value = parts[i]!

		switch (key) {
			case 'layer':
			case 'marked':
				dialogue.layer = parseInt(value, 10)
				break
			case 'start':
				dialogue.start = value
				dialogue.startTime = parseAssTime(value)
				break
			case 'end':
				dialogue.end = value
				dialogue.endTime = parseAssTime(value)
				break
			case 'style':
				dialogue.style = value
				break
			case 'name':
			case 'actor':
				dialogue.name = value
				break
			case 'marginl':
				dialogue.marginL = parseInt(value, 10)
				break
			case 'marginr':
				dialogue.marginR = parseInt(value, 10)
				break
			case 'marginv':
				dialogue.marginV = parseInt(value, 10)
				break
			case 'effect':
				dialogue.effect = value
				break
			case 'text':
				dialogue.text = value
				break
		}
	}

	return dialogue
}

/**
 * Parse Comment line
 */
function parseCommentLine(line: string, format: string[]): AssComment | null {
	const dialogue = parseDialogueLine(line, format)
	if (!dialogue) return null

	return {
		layer: dialogue.layer,
		start: dialogue.start,
		end: dialogue.end,
		style: dialogue.style,
		name: dialogue.name,
		marginL: dialogue.marginL,
		marginR: dialogue.marginR,
		marginV: dialogue.marginV,
		effect: dialogue.effect,
		text: dialogue.text,
	}
}

/**
 * Split ASS line (text field can contain commas)
 */
function splitAssLine(line: string, fieldCount: number): string[] {
	const parts: string[] = []
	let current = ''
	let commaCount = 0

	for (let i = 0; i < line.length; i++) {
		const char = line[i]!

		if (char === ',' && commaCount < fieldCount - 1) {
			parts.push(current)
			current = ''
			commaCount++
		} else {
			current += char
		}
	}

	parts.push(current)
	return parts
}

/**
 * Parse ASS time (h:mm:ss.cc)
 */
export function parseAssTime(time: string): number {
	const match = time.match(/(\d+):(\d{2}):(\d{2})\.(\d{2,3})/)
	if (!match) return 0

	const hours = parseInt(match[1]!, 10)
	const minutes = parseInt(match[2]!, 10)
	const seconds = parseInt(match[3]!, 10)
	let centiseconds = parseInt(match[4]!, 10)

	// Handle both centiseconds (2 digits) and milliseconds (3 digits)
	if (match[4]!.length === 3) {
		centiseconds = Math.round(centiseconds / 10)
	}

	return hours * 3600 + minutes * 60 + seconds + centiseconds / 100
}

/**
 * Format ASS time (h:mm:ss.cc)
 */
export function formatAssTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = Math.floor(seconds % 60)
	const centis = Math.round((seconds % 1) * 100)

	return (
		String(hours) + ':' +
		String(minutes).padStart(2, '0') + ':' +
		String(secs).padStart(2, '0') + '.' +
		String(centis).padStart(2, '0')
	)
}
