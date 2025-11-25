import { describe, expect, it } from 'bun:test'
import {
	decodeSrt,
	decodeSubtitle,
	decodeVtt,
	detectSubtitleFormat,
	encodeSrt,
	encodeSubtitle,
	encodeVtt,
	encodeVttFile,
	isSrt,
	isVtt,
	parseSubtitleInfo,
	type SubtitleCue,
	type SubtitleFile,
} from './index'

describe('Subtitle Codec', () => {
	// Sample SRT content
	const sampleSrt = `1
00:00:01,000 --> 00:00:04,000
Hello, world!

2
00:00:05,000 --> 00:00:08,500
This is a subtitle test.

3
00:00:10,000 --> 00:00:15,000
Multiple lines
are supported.
`

	// Sample VTT content
	const sampleVtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello, world!

00:00:05.000 --> 00:00:08.500
This is a subtitle test.

00:00:10.000 --> 00:00:15.000
Multiple lines
are supported.
`

	describe('isSrt', () => {
		it('should identify SRT files', () => {
			expect(isSrt(sampleSrt)).toBe(true)
		})

		it('should reject non-SRT files', () => {
			expect(isSrt('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello')).toBe(false)
			expect(isSrt('not a subtitle file')).toBe(false)
		})

		it('should handle Uint8Array input', () => {
			const data = new TextEncoder().encode(sampleSrt)
			expect(isSrt(data)).toBe(true)
		})
	})

	describe('isVtt', () => {
		it('should identify VTT files', () => {
			expect(isVtt(sampleVtt)).toBe(true)
		})

		it('should handle header text', () => {
			expect(isVtt('WEBVTT - This is a header\n\n')).toBe(true)
		})

		it('should reject non-VTT files', () => {
			expect(isVtt(sampleSrt)).toBe(false)
			expect(isVtt('not a subtitle file')).toBe(false)
		})

		it('should handle Uint8Array input', () => {
			const data = new TextEncoder().encode(sampleVtt)
			expect(isVtt(data)).toBe(true)
		})
	})

	describe('detectSubtitleFormat', () => {
		it('should detect SRT format', () => {
			expect(detectSubtitleFormat(sampleSrt)).toBe('srt')
		})

		it('should detect VTT format', () => {
			expect(detectSubtitleFormat(sampleVtt)).toBe('vtt')
		})

		it('should return null for unknown format', () => {
			expect(detectSubtitleFormat('unknown format')).toBe(null)
		})
	})

	describe('parseSubtitleInfo', () => {
		it('should parse SRT info', () => {
			const info = parseSubtitleInfo(sampleSrt)

			expect(info.format).toBe('srt')
			expect(info.cueCount).toBe(3)
			expect(info.duration).toBe(15)
			expect(info.hasStyles).toBe(false)
			expect(info.hasRegions).toBe(false)
		})

		it('should parse VTT info', () => {
			const info = parseSubtitleInfo(sampleVtt)

			expect(info.format).toBe('vtt')
			expect(info.cueCount).toBe(3)
			expect(info.duration).toBe(15)
		})

		it('should detect VTT styles and regions', () => {
			const vttWithStyles = `WEBVTT

STYLE
::cue { color: white; }

REGION
id:test width:50%

00:00:00.000 --> 00:00:01.000
Hello
`
			const info = parseSubtitleInfo(vttWithStyles)

			expect(info.hasStyles).toBe(true)
			expect(info.hasRegions).toBe(true)
		})
	})

	describe('decodeSrt', () => {
		it('should decode basic SRT', () => {
			const file = decodeSrt(sampleSrt)

			expect(file.format).toBe('srt')
			expect(file.cues.length).toBe(3)
		})

		it('should parse cue details', () => {
			const file = decodeSrt(sampleSrt)

			expect(file.cues[0]?.index).toBe(1)
			expect(file.cues[0]?.startTime).toBe(1)
			expect(file.cues[0]?.endTime).toBe(4)
			expect(file.cues[0]?.text).toBe('Hello, world!')
		})

		it('should handle multi-line text', () => {
			const file = decodeSrt(sampleSrt)

			expect(file.cues[2]?.text).toBe('Multiple lines\nare supported.')
		})

		it('should handle dot separator', () => {
			const srtWithDot = `1
00:00:01.000 --> 00:00:04.000
Hello
`
			const file = decodeSrt(srtWithDot)
			expect(file.cues[0]?.startTime).toBe(1)
		})

		it('should handle BOM', () => {
			const srtWithBom = '\uFEFF' + sampleSrt
			const file = decodeSrt(srtWithBom)
			expect(file.cues.length).toBe(3)
		})

		it('should handle Uint8Array input', () => {
			const data = new TextEncoder().encode(sampleSrt)
			const file = decodeSrt(data)
			expect(file.cues.length).toBe(3)
		})
	})

	describe('decodeVtt', () => {
		it('should decode basic VTT', () => {
			const file = decodeVtt(sampleVtt)

			expect(file.format).toBe('vtt')
			expect(file.cues.length).toBe(3)
		})

		it('should parse header text', () => {
			const vttWithHeader = `WEBVTT - My Subtitles

00:00:00.000 --> 00:00:01.000
Hello
`
			const file = decodeVtt(vttWithHeader)
			expect(file.header).toBe('- My Subtitles')
		})

		it('should parse cue identifiers', () => {
			const vttWithIds = `WEBVTT

intro
00:00:00.000 --> 00:00:01.000
Hello
`
			const file = decodeVtt(vttWithIds)
			expect(file.cues[0]?.id).toBe('intro')
		})

		it('should parse cue settings', () => {
			const vttWithSettings = `WEBVTT

00:00:00.000 --> 00:00:01.000 align:center position:50%
Hello
`
			const file = decodeVtt(vttWithSettings)
			expect(file.cues[0]?.settings?.align).toBe('center')
			expect(file.cues[0]?.settings?.position).toBe('50%')
		})

		it('should parse short timestamps (MM:SS.mmm)', () => {
			const vttShort = `WEBVTT

00:01.000 --> 00:05.000
Hello
`
			const file = decodeVtt(vttShort)
			expect(file.cues[0]?.startTime).toBe(1)
			expect(file.cues[0]?.endTime).toBe(5)
		})

		it('should parse REGION blocks', () => {
			const vttWithRegion = `WEBVTT

REGION
id:test width:50% lines:3

00:00:00.000 --> 00:00:01.000
Hello
`
			const file = decodeVtt(vttWithRegion)
			expect(file.regions?.length).toBe(1)
			expect(file.regions?.[0]?.id).toBe('test')
			expect(file.regions?.[0]?.width).toBe('50%')
			expect(file.regions?.[0]?.lines).toBe(3)
		})

		it('should parse STYLE blocks', () => {
			const vttWithStyle = `WEBVTT

STYLE
::cue { color: white; }

00:00:00.000 --> 00:00:01.000
Hello
`
			const file = decodeVtt(vttWithStyle)
			expect(file.styles?.length).toBe(1)
			expect(file.styles?.[0]?.css).toContain('color: white')
		})

		it('should skip NOTE blocks', () => {
			const vttWithNote = `WEBVTT

NOTE This is a comment

00:00:00.000 --> 00:00:01.000
Hello
`
			const file = decodeVtt(vttWithNote)
			expect(file.cues.length).toBe(1)
		})

		it('should throw on invalid VTT', () => {
			expect(() => decodeVtt('not a VTT file')).toThrow()
		})
	})

	describe('decodeSubtitle', () => {
		it('should auto-detect SRT', () => {
			const file = decodeSubtitle(sampleSrt)
			expect(file.format).toBe('srt')
		})

		it('should auto-detect VTT', () => {
			const file = decodeSubtitle(sampleVtt)
			expect(file.format).toBe('vtt')
		})

		it('should throw on unknown format', () => {
			expect(() => decodeSubtitle('unknown format')).toThrow()
		})
	})

	describe('encodeSrt', () => {
		it('should encode basic cues', () => {
			const cues: SubtitleCue[] = [
				{ startTime: 1, endTime: 4, text: 'Hello' },
				{ startTime: 5, endTime: 8, text: 'World' },
			]

			const output = encodeSrt(cues)

			expect(output).toContain('1\n')
			expect(output).toContain('00:00:01,000 --> 00:00:04,000')
			expect(output).toContain('Hello')
			expect(output).toContain('2\n')
		})

		it('should preserve cue index', () => {
			const cues: SubtitleCue[] = [
				{ index: 10, startTime: 1, endTime: 4, text: 'Hello' },
			]

			const output = encodeSrt(cues)
			expect(output).toContain('10\n')
		})

		it('should use custom ms separator', () => {
			const cues: SubtitleCue[] = [
				{ startTime: 1.5, endTime: 2.5, text: 'Hello' },
			]

			const output = encodeSrt(cues, { msSeparator: '.' })
			expect(output).toContain('00:00:01.500')
		})

		it('should handle multi-line text', () => {
			const cues: SubtitleCue[] = [
				{ startTime: 0, endTime: 1, text: 'Line 1\nLine 2' },
			]

			const output = encodeSrt(cues)
			expect(output).toContain('Line 1\nLine 2')
		})
	})

	describe('encodeVtt', () => {
		it('should encode basic cues', () => {
			const cues: SubtitleCue[] = [
				{ startTime: 1, endTime: 4, text: 'Hello' },
			]

			const output = encodeVtt(cues)

			expect(output).toContain('WEBVTT')
			expect(output).toContain('00:00:01.000 --> 00:00:04.000')
			expect(output).toContain('Hello')
		})

		it('should include header', () => {
			const output = encodeVtt([], { header: 'My Subtitles' })
			expect(output).toContain('WEBVTT My Subtitles')
		})

		it('should include cue IDs', () => {
			const cues: SubtitleCue[] = [
				{ id: 'intro', startTime: 0, endTime: 1, text: 'Hello' },
			]

			const output = encodeVtt(cues, { includeIds: true })
			expect(output).toContain('intro')
		})

		it('should encode cue settings', () => {
			const cues: SubtitleCue[] = [
				{
					startTime: 0,
					endTime: 1,
					text: 'Hello',
					settings: { align: 'center', position: '50%' },
				},
			]

			const output = encodeVtt(cues)
			expect(output).toContain('align:center')
			expect(output).toContain('position:50%')
		})
	})

	describe('encodeVttFile', () => {
		it('should encode full VTT file with regions and styles', () => {
			const file: SubtitleFile = {
				format: 'vtt',
				header: 'Test File',
				regions: [{ id: 'bottom', width: '100%' }],
				styles: [{ css: '::cue { color: white; }' }],
				cues: [{ startTime: 0, endTime: 1, text: 'Hello' }],
			}

			const output = encodeVttFile(file)

			expect(output).toContain('WEBVTT Test File')
			expect(output).toContain('REGION')
			expect(output).toContain('id:bottom')
			expect(output).toContain('STYLE')
			expect(output).toContain('::cue { color: white; }')
		})
	})

	describe('encodeSubtitle', () => {
		it('should encode SRT format', () => {
			const file: SubtitleFile = {
				format: 'srt',
				cues: [{ startTime: 0, endTime: 1, text: 'Hello' }],
			}

			const output = encodeSubtitle(file)
			expect(output).toContain('00:00:00,000 --> 00:00:01,000')
		})

		it('should encode VTT format', () => {
			const file: SubtitleFile = {
				format: 'vtt',
				cues: [{ startTime: 0, endTime: 1, text: 'Hello' }],
			}

			const output = encodeSubtitle(file)
			expect(output).toContain('WEBVTT')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip SRT', () => {
			const original = decodeSrt(sampleSrt)
			const encoded = encodeSrt(original.cues)
			const decoded = decodeSrt(encoded)

			expect(decoded.cues.length).toBe(original.cues.length)
			expect(decoded.cues[0]?.text).toBe(original.cues[0]?.text)
			expect(decoded.cues[0]?.startTime).toBe(original.cues[0]?.startTime)
		})

		it('should roundtrip VTT', () => {
			const original = decodeVtt(sampleVtt)
			const encoded = encodeVtt(original.cues)
			const decoded = decodeVtt(encoded)

			expect(decoded.cues.length).toBe(original.cues.length)
			expect(decoded.cues[0]?.text).toBe(original.cues[0]?.text)
		})

		it('should roundtrip VTT with settings', () => {
			const vttWithSettings = `WEBVTT

00:00:00.000 --> 00:00:01.000 align:center
Hello
`
			const original = decodeVtt(vttWithSettings)
			const encoded = encodeVttFile(original)
			const decoded = decodeVtt(encoded)

			expect(decoded.cues[0]?.settings?.align).toBe('center')
		})
	})

	describe('edge cases', () => {
		it('should handle empty cues list', () => {
			const srtOutput = encodeSrt([])
			expect(srtOutput).toBe('')

			const vttOutput = encodeVtt([])
			expect(vttOutput).toContain('WEBVTT')
		})

		it('should handle sub-second timestamps', () => {
			const cues: SubtitleCue[] = [
				{ startTime: 0.1, endTime: 0.5, text: 'Quick' },
			]

			const srt = encodeSrt(cues)
			expect(srt).toContain('00:00:00,100 --> 00:00:00,500')

			const vtt = encodeVtt(cues)
			expect(vtt).toContain('00:00:00.100 --> 00:00:00.500')
		})

		it('should handle large timestamps', () => {
			const cues: SubtitleCue[] = [
				{ startTime: 7200, endTime: 7260, text: 'Two hours in' },
			]

			const srt = encodeSrt(cues)
			expect(srt).toContain('02:00:00,000 --> 02:01:00,000')
		})

		it('should handle special characters in text', () => {
			const cues: SubtitleCue[] = [
				{ startTime: 0, endTime: 1, text: '<i>Italic</i> & "quotes"' },
			]

			const srt = encodeSrt(cues)
			const decoded = decodeSrt(srt)
			expect(decoded.cues[0]?.text).toBe('<i>Italic</i> & "quotes"')
		})

		it('should handle Windows line endings', () => {
			const srtWindows = sampleSrt.replace(/\n/g, '\r\n')
			const file = decodeSrt(srtWindows)
			expect(file.cues.length).toBe(3)
		})
	})
})
