import { describe, expect, it } from 'bun:test'
import type { VideoData } from '@sylphx/codec-core'
import {
	VobStartCode,
	VobVersion,
	PictureCodingType,
	DvdAudioFormat,
	decodeVob,
	decodeVobToVideo,
	encodeVob,
	isVob,
	parseVobInfo,
} from './index'

describe('VOB (DVD Video) Codec', () => {
	// Create test video data with solid color frames
	function createTestVideo(width: number, height: number, frameCount: number): VideoData {
		const frames = []
		for (let i = 0; i < frameCount; i++) {
			const data = new Uint8Array(width * height * 4)
			const color = (i * 50) % 256
			for (let j = 0; j < width * height; j++) {
				data[j * 4] = color
				data[j * 4 + 1] = (color + 100) % 256
				data[j * 4 + 2] = (color + 200) % 256
				data[j * 4 + 3] = 255
			}
			frames.push({
				image: { width, height, data },
				timestamp: (i * 1000) / 29.97, // NTSC frame rate
				duration: 1000 / 29.97,
			})
		}
		return {
			width,
			height,
			frames,
			duration: (frameCount * 1000) / 29.97,
			fps: 29.97,
		}
	}

	describe('isVob', () => {
		it('should identify VOB files by MPEG-2 pack header', () => {
			const video = createTestVideo(720, 480, 1) // DVD NTSC resolution
			const vob = encodeVob(video)
			expect(isVob(vob)).toBe(true)
		})

		it('should identify MPEG-2 PS pack start code', () => {
			const vobWithPack = new Uint8Array([
				0x00,
				0x00,
				0x01,
				0xba, // Pack start
				0x44,
				0x00,
				0x04,
				0x00,
				0x04,
				0x01, // MPEG-2 SCR
				0x00,
				0x00,
				0x03,
				0xf8, // Mux rate and stuffing
			])
			expect(isVob(vobWithPack)).toBe(true)
		})

		it('should reject MPEG-1 PS files', () => {
			const mpeg1Pack = new Uint8Array([
				0x00,
				0x00,
				0x01,
				0xba, // Pack start
				0x21,
				0x00,
				0x01,
				0x00,
				0x01, // MPEG-1 SCR
				0x80,
				0x00,
				0x01, // Mux rate
			])
			expect(isVob(mpeg1Pack)).toBe(false)
		})

		it('should reject non-VOB files', () => {
			expect(isVob(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isVob(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isVob(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
			expect(isVob(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe(false) // GIF
		})

		it('should handle short data', () => {
			expect(isVob(new Uint8Array([]))).toBe(false)
			expect(isVob(new Uint8Array([0x00]))).toBe(false)
			expect(isVob(new Uint8Array([0x00, 0x00, 0x01]))).toBe(false)
		})
	})

	describe('parseVobInfo', () => {
		it('should parse basic VOB info', () => {
			const video = createTestVideo(720, 480, 5) // NTSC DVD
			const vob = encodeVob(video)
			const info = parseVobInfo(vob)

			expect(info.hasVideo).toBe(true)
			expect(info.width).toBe(720)
			expect(info.height).toBe(480)
		})

		it('should detect MPEG-2 PS version', () => {
			const video = createTestVideo(720, 576, 1) // PAL DVD
			const vob = encodeVob(video)
			const info = parseVobInfo(vob)
			expect(info.version).toBe(VobVersion.MPEG2_PS)
		})

		it('should detect frame rate', () => {
			const video = createTestVideo(720, 480, 3)
			video.fps = 29.97
			const vob = encodeVob(video, { frameRate: 29.97 })
			const info = parseVobInfo(vob)

			expect(info.fps).toBeGreaterThan(0)
		})

		it('should detect navigation packs', () => {
			const video = createTestVideo(720, 480, 20)
			const vob = encodeVob(video, { includeNavigation: true })
			const info = parseVobInfo(vob)

			expect(info.hasNavigation).toBe(true)
		})

		it('should parse video stream info', () => {
			const video = createTestVideo(720, 480, 2)
			const vob = encodeVob(video)
			const info = parseVobInfo(vob)

			expect(info.videoStreams.length).toBeGreaterThan(0)
			expect(info.videoStreams[0]).toBe(0xe0)
		})
	})

	describe('encodeVob', () => {
		it('should encode single frame', () => {
			const video = createTestVideo(352, 240, 1) // Half D1
			const vob = encodeVob(video)

			expect(isVob(vob)).toBe(true)
			expect(vob.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const video = createTestVideo(720, 480, 5)
			const vob = encodeVob(video)

			expect(isVob(vob)).toBe(true)
			expect(vob.length).toBeGreaterThan(200)
		})

		it('should include MPEG-2 pack header', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video)

			// Check for pack start code (0x000001BA) with MPEG-2 marker
			expect(vob[0]).toBe(0x00)
			expect(vob[1]).toBe(0x00)
			expect(vob[2]).toBe(0x01)
			expect(vob[3]).toBe(0xba)
			expect((vob[4]! & 0xc0)).toBe(0x40) // MPEG-2 marker bits
		})

		it('should include system header', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video)

			// Find system header start code (0x000001BB)
			let foundSystemHeader = false
			for (let i = 0; i < vob.length - 4; i++) {
				if (vob[i] === 0x00 && vob[i + 1] === 0x00 && vob[i + 2] === 0x01 && vob[i + 3] === 0xbb) {
					foundSystemHeader = true
					break
				}
			}
			expect(foundSystemHeader).toBe(true)
		})

		it('should include sequence header', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video)

			// Find sequence header start code (0x000001B3)
			let foundSequenceHeader = false
			for (let i = 0; i < vob.length - 4; i++) {
				if (vob[i] === 0x00 && vob[i + 1] === 0x00 && vob[i + 2] === 0x01 && vob[i + 3] === 0xb3) {
					foundSequenceHeader = true
					break
				}
			}
			expect(foundSequenceHeader).toBe(true)
		})

		it('should include GOP header for keyframes', () => {
			const video = createTestVideo(720, 480, 5)
			const vob = encodeVob(video, { gop: 3 })

			// Find GOP start code (0x000001B8)
			let foundGopHeader = false
			for (let i = 0; i < vob.length - 4; i++) {
				if (vob[i] === 0x00 && vob[i + 1] === 0x00 && vob[i + 2] === 0x01 && vob[i + 3] === 0xb8) {
					foundGopHeader = true
					break
				}
			}
			expect(foundGopHeader).toBe(true)
		})

		it('should include picture headers', () => {
			const video = createTestVideo(720, 480, 2)
			const vob = encodeVob(video)

			// Find picture start code (0x00000100)
			let foundPictureHeader = false
			for (let i = 0; i < vob.length - 4; i++) {
				if (vob[i] === 0x00 && vob[i + 1] === 0x00 && vob[i + 2] === 0x01 && vob[i + 3] === 0x00) {
					foundPictureHeader = true
					break
				}
			}
			expect(foundPictureHeader).toBe(true)
		})

		it('should include navigation packs when enabled', () => {
			const video = createTestVideo(720, 480, 20)
			const vob = encodeVob(video, { includeNavigation: true })

			// Find private stream 2 (navigation) start code (0x000001BF)
			let foundNavPack = false
			for (let i = 0; i < vob.length - 4; i++) {
				if (vob[i] === 0x00 && vob[i + 1] === 0x00 && vob[i + 2] === 0x01 && vob[i + 3] === 0xbf) {
					foundNavPack = true
					break
				}
			}
			expect(foundNavPack).toBe(true)
		})

		it('should not include navigation packs when disabled', () => {
			const video = createTestVideo(720, 480, 20)
			const vob = encodeVob(video, { includeNavigation: false })

			// Check for absence of private stream 2 (navigation)
			let foundNavPack = false
			for (let i = 0; i < vob.length - 4; i++) {
				if (vob[i] === 0x00 && vob[i + 1] === 0x00 && vob[i + 2] === 0x01 && vob[i + 3] === 0xbf) {
					foundNavPack = true
					break
				}
			}
			expect(foundNavPack).toBe(false)
		})

		it('should include program end code', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video)

			// Find program end code (0x000001B9) at the end
			const lastBytes = vob.slice(-4)
			expect(lastBytes[0]).toBe(0x00)
			expect(lastBytes[1]).toBe(0x00)
			expect(lastBytes[2]).toBe(0x01)
			expect(lastBytes[3]).toBe(0xb9)
		})

		it('should encode with NTSC frame rate (29.97)', () => {
			const video = createTestVideo(720, 480, 2)
			video.fps = 29.97
			const vob = encodeVob(video, { frameRate: 29.97 })

			expect(isVob(vob)).toBe(true)
		})

		it('should encode with PAL frame rate (25)', () => {
			const video = createTestVideo(720, 576, 2)
			video.fps = 25
			const vob = encodeVob(video, { frameRate: 25 })

			expect(isVob(vob)).toBe(true)
		})

		it('should encode with 4:3 aspect ratio', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video, { aspectRatio: 1.33 })

			expect(isVob(vob)).toBe(true)
		})

		it('should encode with 16:9 aspect ratio', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video, { aspectRatio: 1.77 })

			expect(isVob(vob)).toBe(true)
		})

		it('should encode with custom bit rate', () => {
			const video = createTestVideo(720, 480, 2)
			const vob = encodeVob(video, { bitRate: 4000000 }) // 4 Mbps

			expect(isVob(vob)).toBe(true)
		})

		it('should encode with custom GOP size', () => {
			const video = createTestVideo(720, 480, 10)
			const vob = encodeVob(video, { gop: 5 })

			expect(isVob(vob)).toBe(true)
		})

		it('should throw on empty video', () => {
			const emptyVideo: VideoData = {
				width: 720,
				height: 480,
				frames: [],
				duration: 0,
				fps: 29.97,
			}

			expect(() => encodeVob(emptyVideo)).toThrow('No frames to encode')
		})
	})

	describe('decodeVob', () => {
		it('should decode VOB structure', () => {
			const video = createTestVideo(720, 480, 3)
			const vob = encodeVob(video)
			const decoded = decodeVob(vob)

			expect(decoded.info.hasVideo).toBe(true)
			expect(decoded.info.width).toBe(720)
			expect(decoded.info.height).toBe(480)
		})

		it('should extract video frames', () => {
			const video = createTestVideo(720, 480, 5)
			const vob = encodeVob(video)
			const decoded = decodeVob(vob)

			expect(decoded.videoFrames.length).toBeGreaterThan(0)
		})

		it('should parse frame types', () => {
			const video = createTestVideo(720, 480, 10)
			const vob = encodeVob(video, { gop: 5 })
			const decoded = decodeVob(vob)

			// Should have I and P frames
			const iFrames = decoded.videoFrames.filter(f => f.type === PictureCodingType.I_FRAME)
			const pFrames = decoded.videoFrames.filter(f => f.type === PictureCodingType.P_FRAME)

			expect(iFrames.length).toBeGreaterThan(0)
		})

		it('should parse PTS timestamps', () => {
			const video = createTestVideo(720, 480, 3)
			const vob = encodeVob(video)
			const decoded = decodeVob(vob)

			expect(decoded.videoFrames[0]?.pts).toBeGreaterThanOrEqual(0)
		})

		it('should detect navigation packs', () => {
			const video = createTestVideo(720, 480, 20)
			const vob = encodeVob(video, { includeNavigation: true })
			const decoded = decodeVob(vob)

			expect(decoded.info.hasNavigation).toBe(true)
			expect(decoded.navigationPacks.length).toBeGreaterThan(0)
		})

		it('should extract navigation pack data', () => {
			const video = createTestVideo(720, 480, 20)
			const vob = encodeVob(video, { includeNavigation: true })
			const decoded = decodeVob(vob)

			if (decoded.navigationPacks.length > 0) {
				const navPack = decoded.navigationPacks[0]!
				expect(navPack.pci).toBeDefined()
				expect(navPack.dsi).toBeDefined()
				expect(navPack.pci.nv_pck_lbn).toBeGreaterThanOrEqual(0)
				expect(navPack.dsi.dsi_gi.nv_pck_lbn).toBeGreaterThanOrEqual(0)
			}
		})

		it('should detect MPEG-2 PS version', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video)
			const decoded = decodeVob(vob)
			expect(decoded.info.version).toBe(VobVersion.MPEG2_PS)
		})

		it('should throw on invalid VOB', () => {
			const notVob = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			expect(() => decodeVob(notVob)).toThrow('Invalid VOB')
		})
	})

	describe('decodeVobToVideo', () => {
		it('should decode to VideoData structure', () => {
			const video = createTestVideo(720, 480, 3)
			const vob = encodeVob(video)
			const decoded = decodeVobToVideo(vob)

			expect(decoded.width).toBe(720)
			expect(decoded.height).toBe(480)
			expect(decoded.frames.length).toBeGreaterThan(0)
		})

		it('should have correct frame dimensions', () => {
			const video = createTestVideo(720, 480, 2)
			const vob = encodeVob(video)
			const decoded = decodeVobToVideo(vob)

			expect(decoded.frames[0]?.image.width).toBe(720)
			expect(decoded.frames[0]?.image.height).toBe(480)
		})

		it('should throw on VOB without video stream', () => {
			// Create minimal VOB with no video stream (just pack header)
			const noVideo = new Uint8Array([
				0x00, 0x00, 0x01, 0xba, // Pack start
				0x44, 0x00, 0x04, 0x00, 0x04, 0x01, 0x00, 0x00, 0x03, 0xf8, // Pack header
				0x00, 0x00, 0x01, 0xb9, // Program end
			])

			expect(() => decodeVobToVideo(noVideo)).toThrow('no video stream')
		})
	})

	describe('roundtrip', () => {
		it('should preserve DVD NTSC dimensions (720x480)', () => {
			const video = createTestVideo(720, 480, 2)
			const vob = encodeVob(video)
			const decoded = decodeVob(vob)

			expect(decoded.info.width).toBe(720)
			expect(decoded.info.height).toBe(480)
		})

		it('should preserve DVD PAL dimensions (720x576)', () => {
			const video = createTestVideo(720, 576, 2)
			const vob = encodeVob(video)
			const decoded = decodeVob(vob)

			expect(decoded.info.width).toBe(720)
			expect(decoded.info.height).toBe(576)
		})

		it('should preserve frame count', () => {
			const video = createTestVideo(720, 480, 7)
			const vob = encodeVob(video)
			const decoded = decodeVob(vob)

			expect(decoded.videoFrames.length).toBeGreaterThan(0)
		})

		it('should handle different DVD resolutions', () => {
			for (const [width, height] of [
				[352, 240], // Half D1 NTSC
				[352, 288], // Half D1 PAL
				[720, 480], // Full D1 NTSC
				[720, 576], // Full D1 PAL
			]) {
				const video = createTestVideo(width, height, 2)
				const vob = encodeVob(video)
				const decoded = decodeVob(vob)

				expect(decoded.info.width).toBe(width)
				expect(decoded.info.height).toBe(height)
			}
		})

		it('should handle different frame counts', () => {
			for (const frameCount of [1, 2, 5, 10, 20]) {
				const video = createTestVideo(720, 480, frameCount)
				const vob = encodeVob(video)
				const decoded = decodeVob(vob)

				expect(decoded.videoFrames.length).toBeGreaterThan(0)
			}
		})
	})

	describe('start codes', () => {
		it('should recognize all VOB start codes', () => {
			expect(VobStartCode.PACK).toBe(0x000001ba)
			expect(VobStartCode.SYSTEM).toBe(0x000001bb)
			expect(VobStartCode.PROGRAM_END).toBe(0x000001b9)
			expect(VobStartCode.PRIVATE_STREAM_1).toBe(0x000001bd)
			expect(VobStartCode.PRIVATE_STREAM_2).toBe(0x000001bf)
			expect(VobStartCode.SEQUENCE).toBe(0x000001b3)
			expect(VobStartCode.GOP).toBe(0x000001b8)
			expect(VobStartCode.PICTURE).toBe(0x00000100)
		})

		it('should recognize video stream range', () => {
			expect(VobStartCode.VIDEO_MIN).toBe(0x000001e0)
			expect(VobStartCode.VIDEO_MAX).toBe(0x000001ef)
		})

		it('should recognize audio stream ranges', () => {
			expect(VobStartCode.AUDIO_MIN).toBe(0x000001c0)
			expect(VobStartCode.AUDIO_MAX).toBe(0x000001df)
			expect(VobStartCode.AC3_MIN).toBe(0x000001bd)
		})
	})

	describe('picture types', () => {
		it('should define picture coding types', () => {
			expect(PictureCodingType.I_FRAME).toBe(1)
			expect(PictureCodingType.P_FRAME).toBe(2)
			expect(PictureCodingType.B_FRAME).toBe(3)
		})
	})

	describe('DVD audio formats', () => {
		it('should define DVD audio format codes', () => {
			expect(DvdAudioFormat.AC3).toBe(0x80)
			expect(DvdAudioFormat.DTS).toBe(0x88)
			expect(DvdAudioFormat.LPCM).toBe(0xa0)
			expect(DvdAudioFormat.MPEG).toBe(0xc0)
		})
	})

	describe('DVD specifications', () => {
		it('should support NTSC resolution (720x480)', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video, { frameRate: 29.97 })

			expect(isVob(vob)).toBe(true)
		})

		it('should support PAL resolution (720x576)', () => {
			const video = createTestVideo(720, 576, 1)
			const vob = encodeVob(video, { frameRate: 25 })

			expect(isVob(vob)).toBe(true)
		})

		it('should support Half D1 NTSC (352x240)', () => {
			const video = createTestVideo(352, 240, 1)
			const vob = encodeVob(video, { frameRate: 29.97 })

			expect(isVob(vob)).toBe(true)
		})

		it('should support Half D1 PAL (352x288)', () => {
			const video = createTestVideo(352, 288, 1)
			const vob = encodeVob(video, { frameRate: 25 })

			expect(isVob(vob)).toBe(true)
		})

		it('should support 4:3 aspect ratio', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video, { aspectRatio: 1.33 })
			const decoded = decodeVob(vob)

			expect(decoded.info.hasVideo).toBe(true)
		})

		it('should support 16:9 aspect ratio', () => {
			const video = createTestVideo(720, 480, 1)
			const vob = encodeVob(video, { aspectRatio: 1.77 })
			const decoded = decodeVob(vob)

			expect(decoded.info.hasVideo).toBe(true)
		})

		it('should support DVD bitrate range (1-9.8 Mbps)', () => {
			const video = createTestVideo(720, 480, 1)

			// Test low bitrate
			const vobLow = encodeVob(video, { bitRate: 1000000 })
			expect(isVob(vobLow)).toBe(true)

			// Test medium bitrate
			const vobMid = encodeVob(video, { bitRate: 6000000 })
			expect(isVob(vobMid)).toBe(true)

			// Test high bitrate
			const vobHigh = encodeVob(video, { bitRate: 9800000 })
			expect(isVob(vobHigh)).toBe(true)
		})
	})
})
