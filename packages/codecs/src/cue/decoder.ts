/**
 * CUE sheet decoder
 * Parses CD track listing files
 */

import {
	cueTimeToSeconds,
	parseCueTime,
	type CueFile,
	type CueFileType,
	type CueIndex,
	type CueInfo,
	type CueSheet,
	type CueTrack,
	type CueTrackFlag,
	type CueTrackType,
} from './types'

/**
 * Check if data is a CUE sheet
 */
export function isCue(data: Uint8Array | string): boolean {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data.slice(0, 500))
	const upper = text.toUpperCase()

	// Look for common CUE commands
	return (
		upper.includes('FILE ') ||
		upper.includes('TRACK ') ||
		upper.includes('INDEX ')
	)
}

/**
 * Parse CUE info without full decode
 */
export function parseCueInfo(data: Uint8Array | string): CueInfo {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
	const lines = text.split(/\r?\n/)

	let title: string | undefined
	let performer: string | undefined
	let trackCount = 0
	let fileCount = 0
	let maxTime = 0

	for (const line of lines) {
		const trimmed = line.trim().toUpperCase()

		if (trimmed.startsWith('TITLE ') && !title) {
			title = extractQuoted(line.trim().slice(6))
		} else if (trimmed.startsWith('PERFORMER ') && !performer) {
			performer = extractQuoted(line.trim().slice(10))
		} else if (trimmed.startsWith('TRACK ')) {
			trackCount++
		} else if (trimmed.startsWith('FILE ')) {
			fileCount++
		} else if (trimmed.startsWith('INDEX ')) {
			const timeMatch = line.match(/INDEX\s+\d+\s+(\d+:\d{2}:\d{2})/i)
			if (timeMatch) {
				const time = parseCueTime(timeMatch[1]!)
				const seconds = cueTimeToSeconds(time)
				if (seconds > maxTime) maxTime = seconds
			}
		}
	}

	return {
		title,
		performer,
		trackCount,
		fileCount,
		totalDuration: maxTime,
	}
}

/**
 * Decode CUE sheet
 */
export function decodeCue(data: Uint8Array | string): CueSheet {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
	const lines = text.split(/\r?\n/)

	const sheet: CueSheet = {
		files: [],
		comments: [],
	}

	let currentFile: CueFile | null = null
	let currentTrack: CueTrack | null = null

	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed) continue

		const command = trimmed.split(/\s+/)[0]!.toUpperCase()

		switch (command) {
			case 'REM':
				sheet.comments.push(trimmed.slice(4).trim())
				break

			case 'TITLE':
				if (currentTrack) {
					currentTrack.title = extractQuoted(trimmed.slice(5))
				} else {
					sheet.title = extractQuoted(trimmed.slice(5))
				}
				break

			case 'PERFORMER':
				if (currentTrack) {
					currentTrack.performer = extractQuoted(trimmed.slice(9))
				} else {
					sheet.performer = extractQuoted(trimmed.slice(9))
				}
				break

			case 'SONGWRITER':
				if (currentTrack) {
					currentTrack.songwriter = extractQuoted(trimmed.slice(10))
				} else {
					sheet.songwriter = extractQuoted(trimmed.slice(10))
				}
				break

			case 'CATALOG':
				sheet.catalog = trimmed.slice(7).trim()
				break

			case 'CDTEXTFILE':
				sheet.cdTextFile = extractQuoted(trimmed.slice(10))
				break

			case 'FILE': {
				// Save previous file
				if (currentFile) {
					if (currentTrack) {
						currentFile.tracks.push(currentTrack)
						currentTrack = null
					}
					sheet.files.push(currentFile)
				}

				const fileMatch = trimmed.match(/FILE\s+(?:"([^"]+)"|(\S+))\s+(\S+)/i)
				if (fileMatch) {
					currentFile = {
						filename: fileMatch[1] || fileMatch[2]!,
						type: (fileMatch[3]?.toUpperCase() || 'BINARY') as CueFileType,
						tracks: [],
					}
				}
				break
			}

			case 'TRACK': {
				// Save previous track
				if (currentTrack && currentFile) {
					currentFile.tracks.push(currentTrack)
				}

				const trackMatch = trimmed.match(/TRACK\s+(\d+)\s+(\S+)/i)
				if (trackMatch) {
					currentTrack = {
						number: parseInt(trackMatch[1]!, 10),
						type: trackMatch[2]!.toUpperCase() as CueTrackType,
						indexes: [],
					}
				}
				break
			}

			case 'INDEX': {
				if (!currentTrack) break

				const indexMatch = trimmed.match(/INDEX\s+(\d+)\s+(\d+:\d{2}:\d{2})/i)
				if (indexMatch) {
					const index: CueIndex = {
						number: parseInt(indexMatch[1]!, 10),
						time: parseCueTime(indexMatch[2]!),
					}
					currentTrack.indexes.push(index)
				}
				break
			}

			case 'PREGAP': {
				if (!currentTrack) break

				const timeMatch = trimmed.match(/PREGAP\s+(\d+:\d{2}:\d{2})/i)
				if (timeMatch) {
					currentTrack.pregap = parseCueTime(timeMatch[1]!)
				}
				break
			}

			case 'POSTGAP': {
				if (!currentTrack) break

				const timeMatch = trimmed.match(/POSTGAP\s+(\d+:\d{2}:\d{2})/i)
				if (timeMatch) {
					currentTrack.postgap = parseCueTime(timeMatch[1]!)
				}
				break
			}

			case 'ISRC': {
				if (!currentTrack) break
				currentTrack.isrc = trimmed.slice(4).trim()
				break
			}

			case 'FLAGS': {
				if (!currentTrack) break

				const flags = trimmed.slice(5).trim().split(/\s+/)
				currentTrack.flags = flags.map(f => f.toUpperCase() as CueTrackFlag)
				break
			}
		}
	}

	// Save last track and file
	if (currentTrack && currentFile) {
		currentFile.tracks.push(currentTrack)
	}
	if (currentFile) {
		sheet.files.push(currentFile)
	}

	return sheet
}

/**
 * Extract quoted string or unquoted value
 */
function extractQuoted(str: string): string {
	const trimmed = str.trim()
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
		return trimmed.slice(1, -1)
	}
	return trimmed
}

/**
 * Get all tracks from a CUE sheet
 */
export function getCueTracks(sheet: CueSheet): Array<CueTrack & { filename: string; fileType: CueFileType }> {
	const tracks: Array<CueTrack & { filename: string; fileType: CueFileType }> = []

	for (const file of sheet.files) {
		for (const track of file.tracks) {
			tracks.push({
				...track,
				filename: file.filename,
				fileType: file.type,
			})
		}
	}

	return tracks
}

/**
 * Get track start time in seconds
 */
export function getTrackStartTime(track: CueTrack): number {
	// INDEX 01 is the track start (INDEX 00 is pregap)
	const index01 = track.indexes.find(i => i.number === 1)
	if (index01) {
		return cueTimeToSeconds(index01.time)
	}

	// Fall back to first index
	if (track.indexes.length > 0) {
		return cueTimeToSeconds(track.indexes[0]!.time)
	}

	return 0
}

/**
 * Calculate track durations (requires knowing total file duration)
 */
export function calculateTrackDurations(
	tracks: CueTrack[],
	totalDuration: number
): Array<{ track: CueTrack; startTime: number; duration: number }> {
	const result: Array<{ track: CueTrack; startTime: number; duration: number }> = []

	for (let i = 0; i < tracks.length; i++) {
		const track = tracks[i]!
		const startTime = getTrackStartTime(track)

		let endTime: number
		if (i < tracks.length - 1) {
			endTime = getTrackStartTime(tracks[i + 1]!)
		} else {
			endTime = totalDuration
		}

		result.push({
			track,
			startTime,
			duration: endTime - startTime,
		})
	}

	return result
}
