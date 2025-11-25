/**
 * CUE sheet types
 * CD track listing format
 */

/**
 * Track data type
 */
export type CueTrackType =
	| 'AUDIO'      // Audio/Music (2352 bytes/sector)
	| 'CDG'        // Karaoke CD+G
	| 'MODE1/2048' // CD-ROM Mode 1 data
	| 'MODE1/2352' // CD-ROM Mode 1 data (raw)
	| 'MODE2/2336' // CD-ROM XA Mode 2 data
	| 'MODE2/2352' // CD-ROM XA Mode 2 data (raw)
	| 'CDI/2336'   // CD-I Mode 2 data
	| 'CDI/2352'   // CD-I Mode 2 data (raw)

/**
 * File type
 */
export type CueFileType =
	| 'BINARY'     // Binary file (little-endian)
	| 'MOTOROLA'   // Binary file (big-endian)
	| 'AIFF'       // AIFF audio file
	| 'WAVE'       // WAV audio file
	| 'MP3'        // MP3 audio file

/**
 * Index entry
 */
export interface CueIndex {
	number: number
	time: CueTime
}

/**
 * CUE time format (MM:SS:FF - minutes:seconds:frames)
 * 75 frames per second
 */
export interface CueTime {
	minutes: number
	seconds: number
	frames: number
}

/**
 * Track entry
 */
export interface CueTrack {
	number: number
	type: CueTrackType
	title?: string
	performer?: string
	songwriter?: string
	isrc?: string
	pregap?: CueTime
	postgap?: CueTime
	indexes: CueIndex[]
	flags?: CueTrackFlag[]
}

/**
 * Track flags
 */
export type CueTrackFlag =
	| 'DCP'  // Digital copy permitted
	| '4CH'  // Four channel audio
	| 'PRE'  // Pre-emphasis enabled
	| 'SCMS' // Serial copy management system

/**
 * File reference
 */
export interface CueFile {
	filename: string
	type: CueFileType
	tracks: CueTrack[]
}

/**
 * Complete CUE sheet
 */
export interface CueSheet {
	/** Album/disc title */
	title?: string
	/** Performer/artist */
	performer?: string
	/** Songwriter */
	songwriter?: string
	/** Catalog number (MCN/UPC) */
	catalog?: string
	/** CD-TEXT file */
	cdTextFile?: string
	/** Files with tracks */
	files: CueFile[]
	/** REM comments */
	comments: string[]
}

/**
 * CUE sheet info (quick parse)
 */
export interface CueInfo {
	title?: string
	performer?: string
	trackCount: number
	fileCount: number
	totalDuration: number // in seconds
}

/**
 * Encode options
 */
export interface CueEncodeOptions {
	/** Include REM comments */
	includeComments?: boolean
}

/**
 * Frames per second in CD audio
 */
export const CUE_FRAMES_PER_SECOND = 75

/**
 * Parse CUE time string to CueTime object
 */
export function parseCueTime(time: string): CueTime {
	const match = time.match(/(\d+):(\d{2}):(\d{2})/)
	if (!match) {
		return { minutes: 0, seconds: 0, frames: 0 }
	}
	return {
		minutes: parseInt(match[1]!, 10),
		seconds: parseInt(match[2]!, 10),
		frames: parseInt(match[3]!, 10),
	}
}

/**
 * Format CueTime to string
 */
export function formatCueTime(time: CueTime): string {
	return (
		String(time.minutes).padStart(2, '0') + ':' +
		String(time.seconds).padStart(2, '0') + ':' +
		String(time.frames).padStart(2, '0')
	)
}

/**
 * Convert CueTime to seconds
 */
export function cueTimeToSeconds(time: CueTime): number {
	return time.minutes * 60 + time.seconds + time.frames / CUE_FRAMES_PER_SECOND
}

/**
 * Convert seconds to CueTime
 */
export function secondsToCueTime(seconds: number): CueTime {
	const totalFrames = Math.round(seconds * CUE_FRAMES_PER_SECOND)
	const frames = totalFrames % CUE_FRAMES_PER_SECOND
	const totalSeconds = Math.floor(totalFrames / CUE_FRAMES_PER_SECOND)
	const secs = totalSeconds % 60
	const minutes = Math.floor(totalSeconds / 60)

	return { minutes, seconds: secs, frames }
}
