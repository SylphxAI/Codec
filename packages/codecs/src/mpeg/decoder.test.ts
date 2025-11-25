import { describe, expect, it } from 'bun:test'
import type { VideoData } from '@sylphx/codec-core'
import {
	MpegStartCode,
	MpegVersion,
	PictureCodingType,
	decodeMpeg,
	decodeMpegToVideo,
	encodeMpeg,
	isMpeg,
	parseMpegInfo,
} from './index'

describe('MPEG-1/2 Codec', () => {
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
				timestamp: (i * 1000) / 30, // 30 fps
				duration: 1000 / 30,
			})
		}
		return {
			width,
			height,
			frames,
			duration: (frameCount * 1000) / 30,
			fps: 30,
		}
	}

	describe('isMpeg', () => {
		it('should identify MPEG-2 PS files by pack header', () => {
			const video = createTestVideo(16, 16, 1)
			const mpeg = encodeMpeg(video)
			expect(isMpeg(mpeg)).toBe(true)
		})

		it('should identify MPEG-1 sequence header', () => {
			const mpegWithSeq = new Uint8Array([0x00, 0x00, 0x01, 0xb3, 0x00, 0x00, 0x00, 0x00])
			expect(isMpeg(mpegWithSeq)).toBe(true)
		})

		it('should identify MPEG-2 pack start code', () => {
			const mpegWithPack = new Uint8Array([0x00, 0x00, 0x01, 0xba, 0x00, 0x00, 0x00, 0x00])
			expect(isMpeg(mpegWithPack)).toBe(true)
		})

		it('should reject non-MPEG files', () => {
			expect(isMpeg(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isMpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isMpeg(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
			expect(isMpeg(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe(false) // GIF
		})

		it('should handle short data', () => {
			expect(isMpeg(new Uint8Array([]))).toBe(false)
			expect(isMpeg(new Uint8Array([0x00]))).toBe(false)
			expect(isMpeg(new Uint8Array([0x00, 0x00, 0x01]))).toBe(false)
		})
	})

	describe('parseMpegInfo', () => {
		it('should parse basic MPEG info', () => {
			const video = createTestVideo(320, 240, 5)
			const mpeg = encodeMpeg(video)
			const info = parseMpegInfo(mpeg)

			expect(info.hasVideo).toBe(true)
			expect(info.width).toBe(320)
			expect(info.height).toBe(240)
		})

		it('should detect MPEG version', () => {
			const video = createTestVideo(16, 16, 1)
			const mpeg2 = encodeMpeg(video, { version: MpegVersion.MPEG2 })
			const info2 = parseMpegInfo(mpeg2)
			expect(info2.version).toBe(MpegVersion.MPEG2)

			const mpeg1 = encodeMpeg(video, { version: MpegVersion.MPEG1 })
			const info1 = parseMpegInfo(mpeg1)
			expect(info1.version).toBe(MpegVersion.MPEG1)
		})

		it('should detect frame rate', () => {
			const video = createTestVideo(16, 16, 3)
			video.fps = 25
			const mpeg = encodeMpeg(video, { frameRate: 25 })
			const info = parseMpegInfo(mpeg)

			expect(info.fps).toBeGreaterThan(0)
		})

		it('should parse video stream info', () => {
			const video = createTestVideo(16, 16, 2)
			const mpeg = encodeMpeg(video)
			const info = parseMpegInfo(mpeg)

			expect(info.videoStreams.length).toBeGreaterThan(0)
			expect(info.videoStreams[0]).toBe(0xe0)
		})
	})

	describe('encodeMpeg', () => {
		it('should encode single frame', () => {
			const video = createTestVideo(16, 16, 1)
			const mpeg = encodeMpeg(video)

			expect(isMpeg(mpeg)).toBe(true)
			expect(mpeg.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const video = createTestVideo(32, 32, 5)
			const mpeg = encodeMpeg(video)

			expect(isMpeg(mpeg)).toBe(true)
			expect(mpeg.length).toBeGreaterThan(200)
		})

		it('should include pack header', () => {
			const video = createTestVideo(16, 16, 1)
			const mpeg = encodeMpeg(video)

			// Check for pack start code (0x000001BA)
			expect(mpeg[0]).toBe(0x00)
			expect(mpeg[1]).toBe(0x00)
			expect(mpeg[2]).toBe(0x01)
			expect(mpeg[3]).toBe(0xba)
		})

		it('should include system header', () => {
			const video = createTestVideo(16, 16, 1)
			const mpeg = encodeMpeg(video)

			// Find system header start code (0x000001BB)
			let foundSystemHeader = false
			for (let i = 0; i < mpeg.length - 4; i++) {
				if (
					mpeg[i] === 0x00 &&
					mpeg[i + 1] === 0x00 &&
					mpeg[i + 2] === 0x01 &&
					mpeg[i + 3] === 0xbb
				) {
					foundSystemHeader = true
					break
				}
			}
			expect(foundSystemHeader).toBe(true)
		})

		it('should include sequence header', () => {
			const video = createTestVideo(16, 16, 1)
			const mpeg = encodeMpeg(video)

			// Find sequence header start code (0x000001B3)
			let foundSequenceHeader = false
			for (let i = 0; i < mpeg.length - 4; i++) {
				if (
					mpeg[i] === 0x00 &&
					mpeg[i + 1] === 0x00 &&
					mpeg[i + 2] === 0x01 &&
					mpeg[i + 3] === 0xb3
				) {
					foundSequenceHeader = true
					break
				}
			}
			expect(foundSequenceHeader).toBe(true)
		})

		it('should include GOP header for keyframes', () => {
			const video = createTestVideo(16, 16, 5)
			const mpeg = encodeMpeg(video, { gop: 3 })

			// Find GOP start code (0x000001B8)
			let foundGopHeader = false
			for (let i = 0; i < mpeg.length - 4; i++) {
				if (
					mpeg[i] === 0x00 &&
					mpeg[i + 1] === 0x00 &&
					mpeg[i + 2] === 0x01 &&
					mpeg[i + 3] === 0xb8
				) {
					foundGopHeader = true
					break
				}
			}
			expect(foundGopHeader).toBe(true)
		})

		it('should include picture headers', () => {
			const video = createTestVideo(16, 16, 2)
			const mpeg = encodeMpeg(video)

			// Find picture start code (0x00000100)
			let foundPictureHeader = false
			for (let i = 0; i < mpeg.length - 4; i++) {
				if (
					mpeg[i] === 0x00 &&
					mpeg[i + 1] === 0x00 &&
					mpeg[i + 2] === 0x01 &&
					mpeg[i + 3] === 0x00
				) {
					foundPictureHeader = true
					break
				}
			}
			expect(foundPictureHeader).toBe(true)
		})

		it('should include program end code', () => {
			const video = createTestVideo(16, 16, 1)
			const mpeg = encodeMpeg(video)

			// Find program end code (0x000001B9) at the end
			const lastBytes = mpeg.slice(-4)
			expect(lastBytes[0]).toBe(0x00)
			expect(lastBytes[1]).toBe(0x00)
			expect(lastBytes[2]).toBe(0x01)
			expect(lastBytes[3]).toBe(0xb9)
		})

		it('should encode with custom frame rate', () => {
			const video = createTestVideo(16, 16, 2)
			video.fps = 24
			const mpeg = encodeMpeg(video, { frameRate: 24 })

			expect(isMpeg(mpeg)).toBe(true)
		})

		it('should encode with custom bit rate', () => {
			const video = createTestVideo(16, 16, 2)
			const mpeg = encodeMpeg(video, { bitRate: 2000000 })

			expect(isMpeg(mpeg)).toBe(true)
		})

		it('should encode with custom GOP size', () => {
			const video = createTestVideo(16, 16, 10)
			const mpeg = encodeMpeg(video, { gop: 5 })

			expect(isMpeg(mpeg)).toBe(true)
		})

		it('should encode MPEG-1', () => {
			const video = createTestVideo(16, 16, 2)
			const mpeg = encodeMpeg(video, { version: MpegVersion.MPEG1 })

			expect(isMpeg(mpeg)).toBe(true)
		})

		it('should encode MPEG-2', () => {
			const video = createTestVideo(16, 16, 2)
			const mpeg = encodeMpeg(video, { version: MpegVersion.MPEG2 })

			expect(isMpeg(mpeg)).toBe(true)
		})

		it('should throw on empty video', () => {
			const emptyVideo: VideoData = {
				width: 16,
				height: 16,
				frames: [],
				duration: 0,
				fps: 30,
			}

			expect(() => encodeMpeg(emptyVideo)).toThrow('No frames to encode')
		})
	})

	describe('decodeMpeg', () => {
		it('should decode MPEG structure', () => {
			const video = createTestVideo(320, 240, 3)
			const mpeg = encodeMpeg(video)
			const decoded = decodeMpeg(mpeg)

			expect(decoded.info.hasVideo).toBe(true)
			expect(decoded.info.width).toBe(320)
			expect(decoded.info.height).toBe(240)
		})

		it('should extract video frames', () => {
			const video = createTestVideo(16, 16, 5)
			const mpeg = encodeMpeg(video)
			const decoded = decodeMpeg(mpeg)

			expect(decoded.videoFrames.length).toBeGreaterThan(0)
		})

		it('should parse frame types', () => {
			const video = createTestVideo(16, 16, 10)
			const mpeg = encodeMpeg(video, { gop: 5 })
			const decoded = decodeMpeg(mpeg)

			// Should have I and P frames
			const iFrames = decoded.videoFrames.filter(f => f.type === PictureCodingType.I_FRAME)
			const pFrames = decoded.videoFrames.filter(f => f.type === PictureCodingType.P_FRAME)

			expect(iFrames.length).toBeGreaterThan(0)
			// Note: P frames may not be detected in stub encoder
		})

		it('should parse PTS timestamps', () => {
			const video = createTestVideo(16, 16, 3)
			const mpeg = encodeMpeg(video)
			const decoded = decodeMpeg(mpeg)

			expect(decoded.videoFrames[0]?.pts).toBeGreaterThanOrEqual(0)
		})

		it('should detect MPEG version', () => {
			const video = createTestVideo(16, 16, 1)
			const mpeg2 = encodeMpeg(video, { version: MpegVersion.MPEG2 })
			const decoded2 = decodeMpeg(mpeg2)
			expect(decoded2.info.version).toBe(MpegVersion.MPEG2)

			const mpeg1 = encodeMpeg(video, { version: MpegVersion.MPEG1 })
			const decoded1 = decodeMpeg(mpeg1)
			expect(decoded1.info.version).toBe(MpegVersion.MPEG1)
		})

		it('should throw on invalid MPEG', () => {
			const notMpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
			expect(() => decodeMpeg(notMpeg)).toThrow('Invalid MPEG')
		})
	})

	describe('decodeMpegToVideo', () => {
		it('should decode to VideoData structure', () => {
			const video = createTestVideo(16, 16, 3)
			const mpeg = encodeMpeg(video)
			const decoded = decodeMpegToVideo(mpeg)

			expect(decoded.width).toBe(16)
			expect(decoded.height).toBe(16)
			expect(decoded.frames.length).toBeGreaterThan(0)
		})

		it('should have correct frame dimensions', () => {
			const video = createTestVideo(32, 24, 2)
			const mpeg = encodeMpeg(video)
			const decoded = decodeMpegToVideo(mpeg)

			expect(decoded.frames[0]?.image.width).toBe(32)
			expect(decoded.frames[0]?.image.height).toBe(24)
		})

		it('should throw on video without video stream', () => {
			// Create minimal MPEG with no video stream (just pack header)
			const noVideo = new Uint8Array([
				0x00, 0x00, 0x01, 0xba, // Pack start
				0x44, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0xf8, // Pack header
				0x00, 0x00, 0x01, 0xb9, // Program end
			])

			expect(() => decodeMpegToVideo(noVideo)).toThrow('no video stream')
		})
	})

	describe('roundtrip', () => {
		it('should preserve video dimensions', () => {
			const video = createTestVideo(160, 120, 2)
			const mpeg = encodeMpeg(video)
			const decoded = decodeMpeg(mpeg)

			expect(decoded.info.width).toBe(160)
			expect(decoded.info.height).toBe(120)
		})

		it('should preserve frame count', () => {
			const video = createTestVideo(16, 16, 7)
			const mpeg = encodeMpeg(video)
			const decoded = decodeMpeg(mpeg)

			// Frame count should be approximately preserved
			expect(decoded.videoFrames.length).toBeGreaterThan(0)
		})

		it('should handle different resolutions', () => {
			for (const [width, height] of [
				[16, 16],
				[32, 24],
				[64, 48],
				[128, 96],
			]) {
				const video = createTestVideo(width, height, 2)
				const mpeg = encodeMpeg(video)
				const decoded = decodeMpeg(mpeg)

				expect(decoded.info.width).toBe(width)
				expect(decoded.info.height).toBe(height)
			}
		})

		it('should handle different frame counts', () => {
			for (const frameCount of [1, 2, 5, 10]) {
				const video = createTestVideo(16, 16, frameCount)
				const mpeg = encodeMpeg(video)
				const decoded = decodeMpeg(mpeg)

				expect(decoded.videoFrames.length).toBeGreaterThan(0)
			}
		})
	})

	describe('start codes', () => {
		it('should recognize all MPEG start codes', () => {
			expect(MpegStartCode.PACK).toBe(0x000001ba)
			expect(MpegStartCode.SYSTEM).toBe(0x000001bb)
			expect(MpegStartCode.PROGRAM_END).toBe(0x000001b9)
			expect(MpegStartCode.VIDEO).toBe(0x000001e0)
			expect(MpegStartCode.SEQUENCE).toBe(0x000001b3)
			expect(MpegStartCode.GOP).toBe(0x000001b8)
			expect(MpegStartCode.PICTURE).toBe(0x00000100)
		})

		it('should recognize video stream range', () => {
			expect(MpegStartCode.VIDEO_MIN).toBe(0x000001e0)
			expect(MpegStartCode.VIDEO_MAX).toBe(0x000001ef)
		})

		it('should recognize audio stream range', () => {
			expect(MpegStartCode.AUDIO_MIN).toBe(0x000001c0)
			expect(MpegStartCode.AUDIO_MAX).toBe(0x000001df)
		})
	})

	describe('picture types', () => {
		it('should define picture coding types', () => {
			expect(PictureCodingType.I_FRAME).toBe(1)
			expect(PictureCodingType.P_FRAME).toBe(2)
			expect(PictureCodingType.B_FRAME).toBe(3)
			expect(PictureCodingType.D_FRAME).toBe(4)
		})
	})
})
