/**
 * CUE sheet encoder
 * Generates CD track listing files
 */

import {
	formatCueTime,
	secondsToCueTime,
	type CueEncodeOptions,
	type CueFile,
	type CueSheet,
	type CueTrack,
	type CueTime,
} from './types'

/**
 * Encode CUE sheet
 */
export function encodeCue(sheet: CueSheet, options: CueEncodeOptions = {}): string {
	const { includeComments = true } = options
	const lines: string[] = []

	// REM comments
	if (includeComments && sheet.comments.length > 0) {
		for (const comment of sheet.comments) {
			lines.push(`REM ${comment}`)
		}
	}

	// Global metadata
	if (sheet.catalog) {
		lines.push(`CATALOG ${sheet.catalog}`)
	}
	if (sheet.cdTextFile) {
		lines.push(`CDTEXTFILE "${sheet.cdTextFile}"`)
	}
	if (sheet.performer) {
		lines.push(`PERFORMER "${sheet.performer}"`)
	}
	if (sheet.songwriter) {
		lines.push(`SONGWRITER "${sheet.songwriter}"`)
	}
	if (sheet.title) {
		lines.push(`TITLE "${sheet.title}"`)
	}

	// Files and tracks
	for (const file of sheet.files) {
		lines.push(`FILE "${file.filename}" ${file.type}`)

		for (const track of file.tracks) {
			encodeTrack(track, lines)
		}
	}

	return lines.join('\n') + '\n'
}

/**
 * Encode a single track
 */
function encodeTrack(track: CueTrack, lines: string[]): void {
	lines.push(`  TRACK ${String(track.number).padStart(2, '0')} ${track.type}`)

	if (track.title) {
		lines.push(`    TITLE "${track.title}"`)
	}
	if (track.performer) {
		lines.push(`    PERFORMER "${track.performer}"`)
	}
	if (track.songwriter) {
		lines.push(`    SONGWRITER "${track.songwriter}"`)
	}
	if (track.isrc) {
		lines.push(`    ISRC ${track.isrc}`)
	}
	if (track.flags && track.flags.length > 0) {
		lines.push(`    FLAGS ${track.flags.join(' ')}`)
	}
	if (track.pregap) {
		lines.push(`    PREGAP ${formatCueTime(track.pregap)}`)
	}

	for (const index of track.indexes) {
		lines.push(`    INDEX ${String(index.number).padStart(2, '0')} ${formatCueTime(index.time)}`)
	}

	if (track.postgap) {
		lines.push(`    POSTGAP ${formatCueTime(track.postgap)}`)
	}
}

/**
 * Create a simple CUE sheet from track list
 */
export function createCue(
	tracks: Array<{
		title?: string
		performer?: string
		startTime: number // in seconds
	}>,
	options: {
		filename: string
		fileType?: 'WAVE' | 'MP3' | 'AIFF' | 'BINARY'
		albumTitle?: string
		albumPerformer?: string
	}
): string {
	const file: CueFile = {
		filename: options.filename,
		type: options.fileType || 'WAVE',
		tracks: tracks.map((t, i) => ({
			number: i + 1,
			type: 'AUDIO',
			title: t.title,
			performer: t.performer,
			indexes: [{
				number: 1,
				time: secondsToCueTime(t.startTime),
			}],
		})),
	}

	const sheet: CueSheet = {
		title: options.albumTitle,
		performer: options.albumPerformer,
		files: [file],
		comments: [],
	}

	return encodeCue(sheet)
}

/**
 * Create CUE sheet from chapter markers
 */
export function createCueFromChapters(
	chapters: Array<{
		title: string
		startTime: number // in seconds
	}>,
	filename: string,
	albumTitle?: string
): string {
	return createCue(
		chapters.map(c => ({
			title: c.title,
			startTime: c.startTime,
		})),
		{
			filename,
			albumTitle,
		}
	)
}

/**
 * Split audio file times into CUE sheet
 * Useful for splitting large audio files
 */
export function createCueFromSplitPoints(
	splitPoints: number[], // in seconds
	filename: string,
	options: {
		albumTitle?: string
		trackTitles?: string[]
	} = {}
): string {
	const tracks: Array<{ title?: string; startTime: number }> = []

	// Add first track at 0:00
	tracks.push({
		title: options.trackTitles?.[0] || `Track 01`,
		startTime: 0,
	})

	// Add tracks at each split point
	for (let i = 0; i < splitPoints.length; i++) {
		tracks.push({
			title: options.trackTitles?.[i + 1] || `Track ${String(i + 2).padStart(2, '0')}`,
			startTime: splitPoints[i]!,
		})
	}

	return createCue(tracks, {
		filename,
		albumTitle: options.albumTitle,
	})
}

/**
 * Merge multiple CUE sheets
 */
export function mergeCueSheets(sheets: CueSheet[]): CueSheet {
	const merged: CueSheet = {
		title: sheets[0]?.title,
		performer: sheets[0]?.performer,
		files: [],
		comments: [],
	}

	let trackNumber = 1

	for (const sheet of sheets) {
		for (const file of sheet.files) {
			const newFile: CueFile = {
				filename: file.filename,
				type: file.type,
				tracks: file.tracks.map(track => ({
					...track,
					number: trackNumber++,
				})),
			}
			merged.files.push(newFile)
		}

		merged.comments.push(...sheet.comments)
	}

	return merged
}

/**
 * Offset all times in a CUE sheet
 */
export function offsetCueTimes(sheet: CueSheet, offsetSeconds: number): CueSheet {
	const offset = secondsToCueTime(Math.abs(offsetSeconds))
	const isNegative = offsetSeconds < 0

	const offsetTime = (time: CueTime): CueTime => {
		const totalFrames =
			time.minutes * 60 * 75 +
			time.seconds * 75 +
			time.frames

		const offsetFrames =
			offset.minutes * 60 * 75 +
			offset.seconds * 75 +
			offset.frames

		const newFrames = isNegative
			? Math.max(0, totalFrames - offsetFrames)
			: totalFrames + offsetFrames

		return secondsToCueTime(newFrames / 75)
	}

	return {
		...sheet,
		files: sheet.files.map(file => ({
			...file,
			tracks: file.tracks.map(track => ({
				...track,
				pregap: track.pregap ? offsetTime(track.pregap) : undefined,
				postgap: track.postgap ? offsetTime(track.postgap) : undefined,
				indexes: track.indexes.map(index => ({
					...index,
					time: offsetTime(index.time),
				})),
			})),
		})),
	}
}
