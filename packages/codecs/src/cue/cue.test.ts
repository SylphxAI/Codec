import { describe, expect, it } from 'bun:test'
import {
	calculateTrackDurations,
	createCue,
	createCueFromChapters,
	createCueFromSplitPoints,
	cueTimeToSeconds,
	decodeCue,
	encodeCue,
	formatCueTime,
	getCueTracks,
	getTrackStartTime,
	isCue,
	mergeCueSheets,
	offsetCueTimes,
	parseCueInfo,
	parseCueTime,
	secondsToCueTime,
	CUE_FRAMES_PER_SECOND,
	type CueSheet,
} from './index'

describe('CUE Sheet Codec', () => {
	// Sample CUE content
	const sampleCue = `REM GENRE Rock
REM DATE 2024
PERFORMER "Test Artist"
TITLE "Test Album"
FILE "album.wav" WAVE
  TRACK 01 AUDIO
    TITLE "First Song"
    PERFORMER "Test Artist"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "Second Song"
    PERFORMER "Test Artist"
    INDEX 01 03:45:00
  TRACK 03 AUDIO
    TITLE "Third Song"
    PERFORMER "Test Artist"
    INDEX 00 07:30:00
    INDEX 01 07:32:00
`

	describe('isCue', () => {
		it('should identify CUE files', () => {
			expect(isCue(sampleCue)).toBe(true)
		})

		it('should reject non-CUE files', () => {
			expect(isCue('not a cue file')).toBe(false)
			expect(isCue('[Script Info]')).toBe(false)
		})

		it('should handle Uint8Array input', () => {
			const data = new TextEncoder().encode(sampleCue)
			expect(isCue(data)).toBe(true)
		})
	})

	describe('parseCueTime / formatCueTime', () => {
		it('should parse CUE time format', () => {
			const time = parseCueTime('03:45:30')
			expect(time.minutes).toBe(3)
			expect(time.seconds).toBe(45)
			expect(time.frames).toBe(30)
		})

		it('should format CUE time', () => {
			expect(formatCueTime({ minutes: 3, seconds: 45, frames: 30 })).toBe('03:45:30')
			expect(formatCueTime({ minutes: 0, seconds: 0, frames: 0 })).toBe('00:00:00')
		})

		it('should roundtrip time values', () => {
			const times = ['00:00:00', '03:45:30', '59:59:74', '123:00:00']
			for (const time of times) {
				expect(formatCueTime(parseCueTime(time))).toBe(time)
			}
		})
	})

	describe('cueTimeToSeconds / secondsToCueTime', () => {
		it('should convert CUE time to seconds', () => {
			expect(cueTimeToSeconds({ minutes: 0, seconds: 0, frames: 0 })).toBe(0)
			expect(cueTimeToSeconds({ minutes: 1, seconds: 0, frames: 0 })).toBe(60)
			expect(cueTimeToSeconds({ minutes: 0, seconds: 1, frames: 0 })).toBe(1)
			expect(cueTimeToSeconds({ minutes: 0, seconds: 0, frames: 75 })).toBe(1)
		})

		it('should convert seconds to CUE time', () => {
			const time = secondsToCueTime(225.5) // 3:45.5
			expect(time.minutes).toBe(3)
			expect(time.seconds).toBe(45)
			expect(time.frames).toBeCloseTo(38, 0) // 0.5 * 75 = 37.5 → 38
		})

		it('should roundtrip conversion', () => {
			const times = [0, 60, 225, 3600]
			for (const seconds of times) {
				const result = cueTimeToSeconds(secondsToCueTime(seconds))
				expect(result).toBeCloseTo(seconds, 1)
			}
		})
	})

	describe('parseCueInfo', () => {
		it('should parse CUE info', () => {
			const info = parseCueInfo(sampleCue)

			expect(info.title).toBe('Test Album')
			expect(info.performer).toBe('Test Artist')
			expect(info.trackCount).toBe(3)
			expect(info.fileCount).toBe(1)
		})
	})

	describe('decodeCue', () => {
		it('should decode CUE sheet', () => {
			const sheet = decodeCue(sampleCue)

			expect(sheet.title).toBe('Test Album')
			expect(sheet.performer).toBe('Test Artist')
			expect(sheet.files.length).toBe(1)
			expect(sheet.comments.length).toBe(2)
		})

		it('should parse file info', () => {
			const sheet = decodeCue(sampleCue)
			const file = sheet.files[0]!

			expect(file.filename).toBe('album.wav')
			expect(file.type).toBe('WAVE')
			expect(file.tracks.length).toBe(3)
		})

		it('should parse track info', () => {
			const sheet = decodeCue(sampleCue)
			const track = sheet.files[0]!.tracks[0]!

			expect(track.number).toBe(1)
			expect(track.type).toBe('AUDIO')
			expect(track.title).toBe('First Song')
			expect(track.performer).toBe('Test Artist')
		})

		it('should parse indexes', () => {
			const sheet = decodeCue(sampleCue)

			// Track 1: single index
			expect(sheet.files[0]!.tracks[0]!.indexes.length).toBe(1)
			expect(sheet.files[0]!.tracks[0]!.indexes[0]!.number).toBe(1)

			// Track 3: two indexes (00 and 01)
			expect(sheet.files[0]!.tracks[2]!.indexes.length).toBe(2)
			expect(sheet.files[0]!.tracks[2]!.indexes[0]!.number).toBe(0)
			expect(sheet.files[0]!.tracks[2]!.indexes[1]!.number).toBe(1)
		})

		it('should parse REM comments', () => {
			const sheet = decodeCue(sampleCue)

			expect(sheet.comments).toContain('GENRE Rock')
			expect(sheet.comments).toContain('DATE 2024')
		})

		it('should handle multiple files', () => {
			const multiFile = `FILE "disc1.wav" WAVE
  TRACK 01 AUDIO
    INDEX 01 00:00:00
FILE "disc2.wav" WAVE
  TRACK 02 AUDIO
    INDEX 01 00:00:00
`
			const sheet = decodeCue(multiFile)
			expect(sheet.files.length).toBe(2)
		})

		it('should parse track flags', () => {
			const withFlags = `FILE "test.wav" WAVE
  TRACK 01 AUDIO
    FLAGS DCP PRE
    INDEX 01 00:00:00
`
			const sheet = decodeCue(withFlags)
			expect(sheet.files[0]!.tracks[0]!.flags).toContain('DCP')
			expect(sheet.files[0]!.tracks[0]!.flags).toContain('PRE')
		})

		it('should parse ISRC', () => {
			const withIsrc = `FILE "test.wav" WAVE
  TRACK 01 AUDIO
    ISRC USRC17607839
    INDEX 01 00:00:00
`
			const sheet = decodeCue(withIsrc)
			expect(sheet.files[0]!.tracks[0]!.isrc).toBe('USRC17607839')
		})

		it('should parse PREGAP and POSTGAP', () => {
			const withGaps = `FILE "test.wav" WAVE
  TRACK 01 AUDIO
    PREGAP 00:02:00
    INDEX 01 00:00:00
    POSTGAP 00:01:00
`
			const sheet = decodeCue(withGaps)
			const track = sheet.files[0]!.tracks[0]!

			expect(track.pregap).toBeDefined()
			expect(track.pregap!.seconds).toBe(2)
			expect(track.postgap).toBeDefined()
			expect(track.postgap!.seconds).toBe(1)
		})
	})

	describe('encodeCue', () => {
		it('should encode CUE sheet', () => {
			const sheet = decodeCue(sampleCue)
			const output = encodeCue(sheet)

			expect(output).toContain('PERFORMER "Test Artist"')
			expect(output).toContain('TITLE "Test Album"')
			expect(output).toContain('FILE "album.wav" WAVE')
			expect(output).toContain('TRACK 01 AUDIO')
		})

		it('should include comments', () => {
			const sheet = decodeCue(sampleCue)
			const output = encodeCue(sheet)

			expect(output).toContain('REM GENRE Rock')
			expect(output).toContain('REM DATE 2024')
		})

		it('should exclude comments when disabled', () => {
			const sheet = decodeCue(sampleCue)
			const output = encodeCue(sheet, { includeComments: false })

			expect(output).not.toContain('REM GENRE')
		})

		it('should format track numbers', () => {
			const sheet = decodeCue(sampleCue)
			const output = encodeCue(sheet)

			expect(output).toContain('TRACK 01')
			expect(output).toContain('TRACK 02')
		})
	})

	describe('createCue', () => {
		it('should create CUE from track list', () => {
			const tracks = [
				{ title: 'Track 1', startTime: 0 },
				{ title: 'Track 2', startTime: 180 },
				{ title: 'Track 3', startTime: 360 },
			]

			const output = createCue(tracks, {
				filename: 'album.wav',
				albumTitle: 'My Album',
				albumPerformer: 'My Artist',
			})

			expect(output).toContain('TITLE "My Album"')
			expect(output).toContain('PERFORMER "My Artist"')
			expect(output).toContain('FILE "album.wav" WAVE')
			expect(output).toContain('TITLE "Track 1"')
			expect(output).toContain('INDEX 01 00:00:00')
			expect(output).toContain('INDEX 01 03:00:00')
		})

		it('should use custom file type', () => {
			const output = createCue([{ startTime: 0 }], {
				filename: 'album.mp3',
				fileType: 'MP3',
			})

			expect(output).toContain('FILE "album.mp3" MP3')
		})
	})

	describe('createCueFromChapters', () => {
		it('should create CUE from chapter markers', () => {
			const chapters = [
				{ title: 'Chapter 1', startTime: 0 },
				{ title: 'Chapter 2', startTime: 300 },
				{ title: 'Chapter 3', startTime: 600 },
			]

			const output = createCueFromChapters(chapters, 'audiobook.wav', 'My Audiobook')

			expect(output).toContain('TITLE "My Audiobook"')
			expect(output).toContain('TITLE "Chapter 1"')
			expect(output).toContain('TITLE "Chapter 2"')
		})
	})

	describe('createCueFromSplitPoints', () => {
		it('should create CUE from split points', () => {
			const splitPoints = [180, 360, 540] // 3, 6, 9 minutes

			const output = createCueFromSplitPoints(splitPoints, 'album.wav', {
				albumTitle: 'Split Album',
			})

			const sheet = decodeCue(output)
			expect(sheet.files[0]!.tracks.length).toBe(4) // 4 tracks from 3 split points
		})

		it('should use custom track titles', () => {
			const output = createCueFromSplitPoints([180], 'album.wav', {
				trackTitles: ['First Half', 'Second Half'],
			})

			expect(output).toContain('TITLE "First Half"')
			expect(output).toContain('TITLE "Second Half"')
		})
	})

	describe('getCueTracks', () => {
		it('should get all tracks with file info', () => {
			const sheet = decodeCue(sampleCue)
			const tracks = getCueTracks(sheet)

			expect(tracks.length).toBe(3)
			expect(tracks[0]!.filename).toBe('album.wav')
			expect(tracks[0]!.fileType).toBe('WAVE')
		})
	})

	describe('getTrackStartTime', () => {
		it('should get track start time', () => {
			const sheet = decodeCue(sampleCue)

			expect(getTrackStartTime(sheet.files[0]!.tracks[0]!)).toBe(0)
			expect(getTrackStartTime(sheet.files[0]!.tracks[1]!)).toBe(225) // 3:45
		})

		it('should use INDEX 01 over INDEX 00', () => {
			const sheet = decodeCue(sampleCue)
			const track3 = sheet.files[0]!.tracks[2]!

			// Track 3 has INDEX 00 at 7:30 and INDEX 01 at 7:32
			expect(getTrackStartTime(track3)).toBe(452) // 7:32
		})
	})

	describe('calculateTrackDurations', () => {
		it('should calculate track durations', () => {
			const sheet = decodeCue(sampleCue)
			const tracks = sheet.files[0]!.tracks

			const durations = calculateTrackDurations(tracks, 600) // 10 minutes total

			expect(durations.length).toBe(3)
			expect(durations[0]!.startTime).toBe(0)
			expect(durations[0]!.duration).toBe(225) // 3:45
			expect(durations[1]!.startTime).toBe(225)
		})
	})

	describe('mergeCueSheets', () => {
		it('should merge multiple CUE sheets', () => {
			const sheet1 = decodeCue(`FILE "disc1.wav" WAVE
  TRACK 01 AUDIO
    TITLE "Song 1"
    INDEX 01 00:00:00
`)
			const sheet2 = decodeCue(`FILE "disc2.wav" WAVE
  TRACK 01 AUDIO
    TITLE "Song 2"
    INDEX 01 00:00:00
`)

			const merged = mergeCueSheets([sheet1, sheet2])

			expect(merged.files.length).toBe(2)
			expect(merged.files[0]!.tracks[0]!.number).toBe(1)
			expect(merged.files[1]!.tracks[0]!.number).toBe(2)
		})
	})

	describe('offsetCueTimes', () => {
		it('should offset times forward', () => {
			const sheet = decodeCue(`FILE "test.wav" WAVE
  TRACK 01 AUDIO
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    INDEX 01 01:00:00
`)

			const offset = offsetCueTimes(sheet, 30) // +30 seconds
			const track2 = offset.files[0]!.tracks[1]!

			expect(track2.indexes[0]!.time.minutes).toBe(1)
			expect(track2.indexes[0]!.time.seconds).toBe(30)
		})

		it('should offset times backward', () => {
			const sheet = decodeCue(`FILE "test.wav" WAVE
  TRACK 01 AUDIO
    INDEX 01 01:00:00
`)

			const offset = offsetCueTimes(sheet, -30) // -30 seconds
			const track1 = offset.files[0]!.tracks[0]!

			expect(track1.indexes[0]!.time.seconds).toBe(30)
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip CUE sheet', () => {
			const original = decodeCue(sampleCue)
			const encoded = encodeCue(original)
			const decoded = decodeCue(encoded)

			expect(decoded.title).toBe(original.title)
			expect(decoded.performer).toBe(original.performer)
			expect(decoded.files.length).toBe(original.files.length)
			expect(decoded.files[0]!.tracks.length).toBe(original.files[0]!.tracks.length)
		})

		it('should preserve track details', () => {
			const original = decodeCue(sampleCue)
			const encoded = encodeCue(original)
			const decoded = decodeCue(encoded)

			const origTrack = original.files[0]!.tracks[0]!
			const decTrack = decoded.files[0]!.tracks[0]!

			expect(decTrack.title).toBe(origTrack.title)
			expect(decTrack.performer).toBe(origTrack.performer)
			expect(formatCueTime(decTrack.indexes[0]!.time))
				.toBe(formatCueTime(origTrack.indexes[0]!.time))
		})
	})

	describe('edge cases', () => {
		it('should handle unquoted filenames', () => {
			const cue = `FILE album.wav WAVE
  TRACK 01 AUDIO
    INDEX 01 00:00:00
`
			const sheet = decodeCue(cue)
			expect(sheet.files[0]!.filename).toBe('album.wav')
		})

		it('should handle empty CUE', () => {
			const cue = `FILE "empty.wav" WAVE
`
			const sheet = decodeCue(cue)
			expect(sheet.files.length).toBe(1)
			expect(sheet.files[0]!.tracks.length).toBe(0)
		})

		it('should handle Windows line endings', () => {
			const cue = sampleCue.replace(/\n/g, '\r\n')
			const sheet = decodeCue(cue)
			expect(sheet.files[0]!.tracks.length).toBe(3)
		})

		it('should handle catalog number', () => {
			const cue = `CATALOG 1234567890123
FILE "test.wav" WAVE
  TRACK 01 AUDIO
    INDEX 01 00:00:00
`
			const sheet = decodeCue(cue)
			expect(sheet.catalog).toBe('1234567890123')
		})
	})
})
