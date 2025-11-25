/**
 * ASS/SSA (Advanced SubStation Alpha) subtitle types
 * Rich text subtitle format with styling
 */

/**
 * ASS file format version
 */
export type AssFormat = 'ssa' | 'ass'

/**
 * Script info metadata
 */
export interface AssScriptInfo {
	title?: string
	originalScript?: string
	originalTranslation?: string
	originalEditing?: string
	originalTiming?: string
	scriptUpdatedBy?: string
	updateDetails?: string
	scriptType?: string
	collisions?: 'Normal' | 'Reverse'
	playResX?: number
	playResY?: number
	playDepth?: number
	timer?: number
	wrapStyle?: 0 | 1 | 2 | 3
	scaledBorderAndShadow?: boolean
	[key: string]: string | number | boolean | undefined
}

/**
 * Style definition
 */
export interface AssStyle {
	name: string
	fontName: string
	fontSize: number
	primaryColor: string
	secondaryColor: string
	outlineColor: string
	backColor: string
	bold: boolean
	italic: boolean
	underline: boolean
	strikeOut: boolean
	scaleX: number
	scaleY: number
	spacing: number
	angle: number
	borderStyle: 1 | 3
	outline: number
	shadow: number
	alignment: number
	marginL: number
	marginR: number
	marginV: number
	encoding: number
}

/**
 * Dialogue event
 */
export interface AssDialogue {
	layer: number
	start: string // Time in h:mm:ss.cc format
	end: string
	style: string
	name: string
	marginL: number
	marginR: number
	marginV: number
	effect: string
	text: string
	// Parsed time values
	startTime?: number // seconds
	endTime?: number
}

/**
 * Comment event
 */
export interface AssComment {
	layer: number
	start: string
	end: string
	style: string
	name: string
	marginL: number
	marginR: number
	marginV: number
	effect: string
	text: string
}

/**
 * Parsed ASS file
 */
export interface AssFile {
	format: AssFormat
	scriptInfo: AssScriptInfo
	styles: AssStyle[]
	dialogues: AssDialogue[]
	comments: AssComment[]
	// Raw sections for preservation
	fonts?: string[]
	graphics?: string[]
}

/**
 * ASS file info (quick parse)
 */
export interface AssInfo {
	format: AssFormat
	title?: string
	resolution?: { width: number; height: number }
	styleCount: number
	dialogueCount: number
	duration: number
}

/**
 * Default style values
 */
export const DEFAULT_STYLE: AssStyle = {
	name: 'Default',
	fontName: 'Arial',
	fontSize: 20,
	primaryColor: '&H00FFFFFF',
	secondaryColor: '&H000000FF',
	outlineColor: '&H00000000',
	backColor: '&H00000000',
	bold: false,
	italic: false,
	underline: false,
	strikeOut: false,
	scaleX: 100,
	scaleY: 100,
	spacing: 0,
	angle: 0,
	borderStyle: 1,
	outline: 2,
	shadow: 2,
	alignment: 2,
	marginL: 10,
	marginR: 10,
	marginV: 10,
	encoding: 1,
}

/**
 * ASS color format (AABBGGRR)
 */
export interface AssColor {
	alpha: number
	blue: number
	green: number
	red: number
}

/**
 * Parse ASS color string
 */
export function parseAssColor(color: string): AssColor {
	// Format: &HAABBGGRR or &HBBGGRR
	const hex = color.replace(/^&H/i, '').replace(/^H/i, '')
	const value = parseInt(hex, 16)

	if (hex.length <= 6) {
		return {
			alpha: 0,
			blue: (value >> 16) & 0xff,
			green: (value >> 8) & 0xff,
			red: value & 0xff,
		}
	}

	return {
		alpha: (value >> 24) & 0xff,
		blue: (value >> 16) & 0xff,
		green: (value >> 8) & 0xff,
		red: value & 0xff,
	}
}

/**
 * Format ASS color string
 */
export function formatAssColor(color: AssColor): string {
	const value =
		((color.alpha & 0xff) << 24) |
		((color.blue & 0xff) << 16) |
		((color.green & 0xff) << 8) |
		(color.red & 0xff)

	return `&H${value.toString(16).toUpperCase().padStart(8, '0')}`
}

/**
 * Convert RGBA to ASS color
 */
export function rgbaToAssColor(r: number, g: number, b: number, a: number = 0): string {
	return formatAssColor({ alpha: a, blue: b, green: g, red: r })
}

/**
 * ASS alignment values (numpad style)
 * 7 8 9  (top)
 * 4 5 6  (middle)
 * 1 2 3  (bottom)
 */
export const AssAlignment = {
	BOTTOM_LEFT: 1,
	BOTTOM_CENTER: 2,
	BOTTOM_RIGHT: 3,
	MIDDLE_LEFT: 4,
	MIDDLE_CENTER: 5,
	MIDDLE_RIGHT: 6,
	TOP_LEFT: 7,
	TOP_CENTER: 8,
	TOP_RIGHT: 9,
} as const
