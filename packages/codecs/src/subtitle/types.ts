/**
 * Subtitle codec types
 * Supports SRT (SubRip) and VTT (WebVTT)
 */

/**
 * Subtitle format
 */
export type SubtitleFormat = 'srt' | 'vtt'

/**
 * A single subtitle cue
 */
export interface SubtitleCue {
	/** Cue index (1-based for SRT) */
	index?: number
	/** Cue identifier (for VTT) */
	id?: string
	/** Start time in seconds */
	startTime: number
	/** End time in seconds */
	endTime: number
	/** Cue text content */
	text: string
	/** VTT-specific settings */
	settings?: SubtitleCueSettings
}

/**
 * VTT cue settings (positioning)
 */
export interface SubtitleCueSettings {
	vertical?: 'rl' | 'lr'
	line?: string | number
	position?: string | number
	size?: string | number
	align?: 'start' | 'center' | 'end' | 'left' | 'right'
	region?: string
}

/**
 * VTT region definition
 */
export interface VttRegion {
	id: string
	width?: string
	lines?: number
	regionAnchor?: string
	viewportAnchor?: string
	scroll?: 'up'
}

/**
 * VTT style block
 */
export interface VttStyle {
	css: string
}

/**
 * Parsed subtitle file
 */
export interface SubtitleFile {
	format: SubtitleFormat
	cues: SubtitleCue[]
	/** VTT header text (after WEBVTT) */
	header?: string
	/** VTT regions */
	regions?: VttRegion[]
	/** VTT styles */
	styles?: VttStyle[]
}

/**
 * Subtitle info (quick parse)
 */
export interface SubtitleInfo {
	format: SubtitleFormat
	cueCount: number
	duration: number
	hasStyles: boolean
	hasRegions: boolean
}

/**
 * SRT encode options
 */
export interface SrtEncodeOptions {
	/** Use milliseconds separator (',' for standard, '.' for some players) */
	msSeparator?: ',' | '.'
}

/**
 * VTT encode options
 */
export interface VttEncodeOptions {
	/** Header text after WEBVTT */
	header?: string
	/** Include cue IDs */
	includeIds?: boolean
}
