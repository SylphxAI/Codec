import { describe, expect, it } from 'bun:test'
import {
	AssAlignment,
	AssTags,
	createAss,
	decodeAss,
	detectAssFormat,
	encodeAss,
	formatAssColor,
	formatAssTime,
	isAss,
	parseAssColor,
	parseAssInfo,
	parseAssTime,
	rgbaToAssColor,
	stripAssTags,
	type AssFile,
	type AssStyle,
} from './index'

describe('ASS/SSA Codec', () => {
	// Sample ASS content
	const sampleAss = `[Script Info]
Title: Test Subtitles
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello, world!
Dialogue: 0,0:00:05.00,0:00:08.50,Default,,0,0,0,,This is a test.
`

	// Sample SSA content
	const sampleSsa = `[Script Info]
Title: Test Subtitles
ScriptType: v4.00
PlayResX: 640
PlayResY: 480

[V4 Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding
Style: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,1,2,2,2,10,10,10,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello!
`

	describe('isAss', () => {
		it('should identify ASS files', () => {
			expect(isAss(sampleAss)).toBe(true)
		})

		it('should identify SSA files', () => {
			expect(isAss(sampleSsa)).toBe(true)
		})

		it('should reject non-ASS files', () => {
			expect(isAss('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello')).toBe(false)
			expect(isAss('1\n00:00:01,000 --> 00:00:02,000\nHello')).toBe(false)
		})

		it('should handle Uint8Array input', () => {
			const data = new TextEncoder().encode(sampleAss)
			expect(isAss(data)).toBe(true)
		})
	})

	describe('detectAssFormat', () => {
		it('should detect ASS format', () => {
			expect(detectAssFormat(sampleAss)).toBe('ass')
		})

		it('should detect SSA format', () => {
			expect(detectAssFormat(sampleSsa)).toBe('ssa')
		})
	})

	describe('parseAssTime / formatAssTime', () => {
		it('should parse ASS time format', () => {
			expect(parseAssTime('0:00:01.00')).toBe(1)
			expect(parseAssTime('0:01:30.50')).toBe(90.5)
			expect(parseAssTime('1:00:00.00')).toBe(3600)
		})

		it('should handle centiseconds', () => {
			expect(parseAssTime('0:00:00.50')).toBe(0.5)
			expect(parseAssTime('0:00:00.99')).toBe(0.99)
		})

		it('should format ASS time', () => {
			expect(formatAssTime(1)).toBe('0:00:01.00')
			expect(formatAssTime(90.5)).toBe('0:01:30.50')
			expect(formatAssTime(3600)).toBe('1:00:00.00')
		})

		it('should roundtrip time values', () => {
			const times = [0, 1, 30.5, 90.99, 3661.5]
			for (const time of times) {
				expect(parseAssTime(formatAssTime(time))).toBeCloseTo(time, 1)
			}
		})
	})

	describe('parseAssColor / formatAssColor', () => {
		it('should parse ASS color', () => {
			const white = parseAssColor('&H00FFFFFF')
			expect(white.red).toBe(255)
			expect(white.green).toBe(255)
			expect(white.blue).toBe(255)
			expect(white.alpha).toBe(0)
		})

		it('should parse color without alpha', () => {
			const red = parseAssColor('&H0000FF')
			expect(red.red).toBe(255)
			expect(red.green).toBe(0)
			expect(red.blue).toBe(0)
		})

		it('should format ASS color', () => {
			const color = formatAssColor({ alpha: 0, blue: 255, green: 0, red: 0 })
			expect(color).toBe('&H00FF0000')
		})

		it('should convert RGBA to ASS', () => {
			const color = rgbaToAssColor(255, 128, 64, 0)
			expect(color).toBe('&H004080FF') // ASS format: &HAABBGGRR
		})
	})

	describe('parseAssInfo', () => {
		it('should parse ASS info', () => {
			const info = parseAssInfo(sampleAss)

			expect(info.format).toBe('ass')
			expect(info.title).toBe('Test Subtitles')
			expect(info.resolution?.width).toBe(1920)
			expect(info.resolution?.height).toBe(1080)
			expect(info.styleCount).toBe(1)
			expect(info.dialogueCount).toBe(2)
		})

		it('should calculate duration', () => {
			const info = parseAssInfo(sampleAss)
			expect(info.duration).toBe(8.5)
		})
	})

	describe('decodeAss', () => {
		it('should decode ASS file', () => {
			const file = decodeAss(sampleAss)

			expect(file.format).toBe('ass')
			expect(file.scriptInfo.title).toBe('Test Subtitles')
			expect(file.styles.length).toBe(1)
			expect(file.dialogues.length).toBe(2)
		})

		it('should parse script info', () => {
			const file = decodeAss(sampleAss)

			expect(file.scriptInfo.playResX).toBe(1920)
			expect(file.scriptInfo.playResY).toBe(1080)
			expect(file.scriptInfo.wrapStyle).toBe(0)
			expect(file.scriptInfo.scaledBorderAndShadow).toBe(true)
		})

		it('should parse styles', () => {
			const file = decodeAss(sampleAss)
			const style = file.styles[0]!

			expect(style.name).toBe('Default')
			expect(style.fontName).toBe('Arial')
			expect(style.fontSize).toBe(48)
			expect(style.primaryColor).toBe('&H00FFFFFF')
			expect(style.bold).toBe(false)
			expect(style.alignment).toBe(2)
		})

		it('should parse dialogues', () => {
			const file = decodeAss(sampleAss)

			expect(file.dialogues[0]?.start).toBe('0:00:01.00')
			expect(file.dialogues[0]?.end).toBe('0:00:04.00')
			expect(file.dialogues[0]?.text).toBe('Hello, world!')
			expect(file.dialogues[0]?.startTime).toBe(1)
			expect(file.dialogues[0]?.endTime).toBe(4)
		})

		it('should decode SSA file', () => {
			const file = decodeAss(sampleSsa)

			expect(file.format).toBe('ssa')
			expect(file.styles.length).toBe(1)
			expect(file.dialogues.length).toBe(1)
		})

		it('should throw on invalid file', () => {
			expect(() => decodeAss('not an ASS file')).toThrow()
		})
	})

	describe('encodeAss', () => {
		it('should encode ASS file', () => {
			const file = decodeAss(sampleAss)
			const output = encodeAss(file)

			expect(output).toContain('[Script Info]')
			expect(output).toContain('[V4+ Styles]')
			expect(output).toContain('[Events]')
			expect(output).toContain('Title: Test Subtitles')
		})

		it('should encode styles', () => {
			const file = decodeAss(sampleAss)
			const output = encodeAss(file)

			expect(output).toContain('Style: Default,Arial,48')
		})

		it('should encode dialogues', () => {
			const file = decodeAss(sampleAss)
			const output = encodeAss(file)

			expect(output).toContain('Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello, world!')
		})
	})

	describe('createAss', () => {
		it('should create ASS from dialogues', () => {
			const dialogues = [
				{ start: 1, end: 4, text: 'Hello' },
				{ start: 5, end: 8, text: 'World' },
			]

			const output = createAss(dialogues, { title: 'My Subs' })

			expect(output).toContain('[Script Info]')
			expect(output).toContain('Title: My Subs')
			expect(output).toContain('Dialogue:')
		})

		it('should use custom resolution', () => {
			const output = createAss([], { resX: 1280, resY: 720 })

			expect(output).toContain('PlayResX: 1280')
			expect(output).toContain('PlayResY: 720')
		})

		it('should use custom styles', () => {
			const customStyle: AssStyle = {
				name: 'Custom',
				fontName: 'Comic Sans MS',
				fontSize: 36,
				primaryColor: '&H00FF0000',
				secondaryColor: '&H00000000',
				outlineColor: '&H00FFFFFF',
				backColor: '&H00000000',
				bold: true,
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

			const output = createAss([{ start: 0, end: 1, text: 'Test' }], { styles: [customStyle] })

			expect(output).toContain('Style: Custom,Comic Sans MS,36')
		})
	})

	describe('stripAssTags', () => {
		it('should remove override tags', () => {
			expect(stripAssTags('{\\b1}Bold{\\b0} text')).toBe('Bold text')
			expect(stripAssTags('{\\i1\\fs24}Styled')).toBe('Styled')
		})

		it('should preserve text without tags', () => {
			expect(stripAssTags('Plain text')).toBe('Plain text')
		})

		it('should handle multiple tags', () => {
			expect(stripAssTags('{\\an8}{\\pos(960,50)}Top center')).toBe('Top center')
		})
	})

	describe('AssTags', () => {
		it('should generate bold tag', () => {
			expect(AssTags.bold(true)).toBe('{\\b1}')
			expect(AssTags.bold(false)).toBe('{\\b0}')
		})

		it('should generate position tag', () => {
			expect(AssTags.position(100, 200)).toBe('{\\pos(100,200)}')
		})

		it('should generate fade tag', () => {
			expect(AssTags.fade(500, 500)).toBe('{\\fad(500,500)}')
		})

		it('should generate alignment tag', () => {
			expect(AssTags.alignment(AssAlignment.TOP_CENTER)).toBe('{\\an8}')
		})

		it('should generate color tag', () => {
			expect(AssTags.color('&H00FFFFFF')).toBe('{\\c&H00FFFFFF}')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip ASS file', () => {
			const original = decodeAss(sampleAss)
			const encoded = encodeAss(original)
			const decoded = decodeAss(encoded)

			expect(decoded.format).toBe(original.format)
			expect(decoded.scriptInfo.title).toBe(original.scriptInfo.title)
			expect(decoded.styles.length).toBe(original.styles.length)
			expect(decoded.dialogues.length).toBe(original.dialogues.length)
		})

		it('should preserve dialogue content', () => {
			const original = decodeAss(sampleAss)
			const encoded = encodeAss(original)
			const decoded = decodeAss(encoded)

			expect(decoded.dialogues[0]?.text).toBe(original.dialogues[0]?.text)
			expect(decoded.dialogues[0]?.start).toBe(original.dialogues[0]?.start)
		})

		it('should preserve style properties', () => {
			const original = decodeAss(sampleAss)
			const encoded = encodeAss(original)
			const decoded = decodeAss(encoded)

			const origStyle = original.styles[0]!
			const decStyle = decoded.styles[0]!

			expect(decStyle.name).toBe(origStyle.name)
			expect(decStyle.fontName).toBe(origStyle.fontName)
			expect(decStyle.fontSize).toBe(origStyle.fontSize)
			expect(decStyle.primaryColor).toBe(origStyle.primaryColor)
		})
	})

	describe('edge cases', () => {
		it('should handle text with commas', () => {
			const ass = `[Script Info]
Title: Test

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello, world, with, commas!
`
			const file = decodeAss(ass)
			expect(file.dialogues[0]?.text).toBe('Hello, world, with, commas!')
		})

		it('should handle override tags in text', () => {
			const ass = `[Script Info]
Title: Test

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{\\b1}Bold{\\b0} and {\\i1}italic{\\i0}
`
			const file = decodeAss(ass)
			expect(file.dialogues[0]?.text).toBe('{\\b1}Bold{\\b0} and {\\i1}italic{\\i0}')
		})

		it('should handle comments', () => {
			const ass = `[Script Info]
Title: Test

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Comment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,This is a comment
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Visible text
`
			const file = decodeAss(ass)
			expect(file.comments.length).toBe(1)
			expect(file.comments[0]?.text).toBe('This is a comment')
			expect(file.dialogues.length).toBe(1)
		})

		it('should handle line breaks', () => {
			const dialogues = [{ start: 0, end: 1, text: 'Line 1\\NLine 2' }]
			const output = createAss(dialogues)
			const decoded = decodeAss(output)

			expect(decoded.dialogues[0]?.text).toBe('Line 1\\NLine 2')
		})

		it('should handle empty dialogues', () => {
			const output = createAss([])
			const decoded = decodeAss(output)

			expect(decoded.dialogues.length).toBe(0)
		})
	})
})
