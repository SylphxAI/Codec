import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import {
	decodeRm,
	decodeRmFrame,
	decodeRmFrames,
	encodeRm,
	isRm,
	parseRmInfo,
} from './index'

describe('RealMedia Codec', () => {
	// Create test frame with solid color
	function createTestFrame(width: number, height: number, color: number[]): ImageData {
		const data = new Uint8Array(width * height * 4)
		for (let i = 0; i < width * height; i++) {
			data[i * 4] = color[0]!
			data[i * 4 + 1] = color[1]!
			data[i * 4 + 2] = color[2]!
			data[i * 4 + 3] = 255
		}
		return { width, height, data }
	}

	// Create gradient frame
	function createGradientFrame(width: number, height: number): ImageData {
		const data = new Uint8Array(width * height * 4)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const i = (y * width + x) * 4
				data[i] = Math.round((x / width) * 255)
				data[i + 1] = Math.round((y / height) * 255)
				data[i + 2] = 128
				data[i + 3] = 255
			}
		}
		return { width, height, data }
	}

	describe('isRm', () => {
		it('should identify RealMedia files', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame])
			expect(isRm(rm)).toBe(true)
		})

		it('should reject non-RealMedia files', () => {
			expect(isRm(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isRm(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isRm(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF
		})

		it('should handle short data', () => {
			expect(isRm(new Uint8Array([]))).toBe(false)
			expect(isRm(new Uint8Array([0x2e, 0x52, 0x4d]))).toBe(false) // Just partial magic
		})
	})

	describe('parseRmInfo', () => {
		it('should parse RealMedia info', () => {
			const frames = [
				createTestFrame(32, 24, [255, 0, 0]),
				createTestFrame(32, 24, [0, 255, 0]),
				createTestFrame(32, 24, [0, 0, 255]),
			]
			const rm = encodeRm(frames)

			const info = parseRmInfo(rm)

			expect(info.width).toBe(32)
			expect(info.height).toBe(24)
			expect(info.frameRate).toBe(30)
			expect(info.duration).toBeCloseTo(0.1, 1) // 3 frames at 30fps
		})

		it('should parse custom frame rate', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame], { frameRate: 60 })

			const info = parseRmInfo(rm)

			expect(info.frameRate).toBe(60)
		})

		it('should parse metadata', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame], {
				title: 'Test Video',
				author: 'Test Author',
				copyright: '2025',
				comment: 'Test comment',
			})

			const info = parseRmInfo(rm)

			expect(info.contentDescription?.title).toBe('Test Video')
			expect(info.contentDescription?.author).toBe('Test Author')
			expect(info.contentDescription?.copyright).toBe('2025')
			expect(info.contentDescription?.comment).toBe('Test comment')
		})

		it('should handle missing metadata', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame])

			const info = parseRmInfo(rm)

			expect(info.contentDescription).toBeUndefined()
		})
	})

	describe('encodeRm', () => {
		it('should encode single frame', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame])

			expect(isRm(rm)).toBe(true)
			expect(rm.length).toBeGreaterThan(100)
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const rm = encodeRm(frames)

			expect(isRm(rm)).toBe(true)
			const info = parseRmInfo(rm)
			expect(info.streams.length).toBeGreaterThan(0)
		})

		it('should encode with custom options', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const rm = encodeRm([frame], {
				frameRate: 24,
				bitrate: 1000,
				videoCodec: 'RV30',
			})

			expect(isRm(rm)).toBe(true)
			const info = parseRmInfo(rm)
			expect(info.frameRate).toBe(24)
		})

		it('should encode with metadata', () => {
			const frame = createTestFrame(16, 16, [255, 255, 255])
			const rm = encodeRm([frame], {
				title: 'My Video',
				author: 'Creator',
			})

			expect(isRm(rm)).toBe(true)
			const info = parseRmInfo(rm)
			expect(info.contentDescription?.title).toBe('My Video')
			expect(info.contentDescription?.author).toBe('Creator')
		})

		it('should reject empty frame array', () => {
			expect(() => encodeRm([])).toThrow('No frames to encode')
		})
	})

	describe('decodeRm', () => {
		it('should decode RealMedia video', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
			]
			const rm = encodeRm(frames)
			const decoded = decodeRm(rm)

			expect(decoded.info.width).toBe(16)
			expect(decoded.info.height).toBe(16)
			expect(decoded.videoPackets.length).toBe(2)
		})

		it('should have non-empty packet data', () => {
			const frame = createTestFrame(8, 8, [255, 255, 255])
			const rm = encodeRm([frame])
			const decoded = decodeRm(rm)

			expect(decoded.videoPackets.length).toBe(1)
			expect(decoded.videoPackets[0]!.data.length).toBeGreaterThan(0)
		})

		it('should preserve timestamps', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const rm = encodeRm(frames, { frameRate: 30 })
			const decoded = decodeRm(rm)

			expect(decoded.videoPackets.length).toBe(3)
			expect(decoded.videoPackets[0]!.timestamp).toBe(0)
			expect(decoded.videoPackets[1]!.timestamp).toBeGreaterThan(0)
			expect(decoded.videoPackets[2]!.timestamp).toBeGreaterThan(decoded.videoPackets[1]!.timestamp)
		})
	})

	describe('decodeRmFrames', () => {
		it('should decode to RGBA frames', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])
			const rm = encodeRm([original])
			const decoded = decodeRmFrames(rm)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(16)
			expect(decoded[0]!.height).toBe(16)
			expect(decoded[0]!.data.length).toBe(16 * 16 * 4)
		})

		it('should decode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const rm = encodeRm(frames)
			const decoded = decodeRmFrames(rm)

			expect(decoded.length).toBe(3)
			for (const frame of decoded) {
				expect(frame.width).toBe(16)
				expect(frame.height).toBe(16)
			}
		})

		it('should create placeholder frames', () => {
			// Since RealVideo decoding is not implemented, frames should be placeholders
			const frame = createTestFrame(32, 32, [255, 0, 0])
			const rm = encodeRm([frame])
			const decoded = decodeRmFrames(rm)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(32)
			expect(decoded[0]!.height).toBe(32)

			// Placeholder frames are gray (128, 128, 128)
			expect(decoded[0]!.data[0]).toBe(128)
			expect(decoded[0]!.data[1]).toBe(128)
			expect(decoded[0]!.data[2]).toBe(128)
			expect(decoded[0]!.data[3]).toBe(255)
		})
	})

	describe('decodeRmFrame', () => {
		it('should decode specific frame', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const rm = encodeRm(frames)

			const frame1 = decodeRmFrame(rm, 1)
			expect(frame1.width).toBe(16)
			expect(frame1.height).toBe(16)
		})

		it('should throw for invalid frame index', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame])

			expect(() => decodeRmFrame(rm, 5)).toThrow('Invalid frame index')
			expect(() => decodeRmFrame(rm, -1)).toThrow('Invalid frame index')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip solid color frame', () => {
			const original = createTestFrame(16, 16, [200, 100, 50])

			const encoded = encodeRm([original])
			const decoded = decodeRmFrames(encoded)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(original.width)
			expect(decoded[0]!.height).toBe(original.height)
		})

		it('should roundtrip gradient frame', () => {
			const original = createGradientFrame(32, 32)

			const encoded = encodeRm([original])
			const decoded = decodeRmFrames(encoded)

			expect(decoded.length).toBe(1)
			expect(decoded[0]!.width).toBe(32)
			expect(decoded[0]!.height).toBe(32)
		})

		it('should roundtrip multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]

			const encoded = encodeRm(frames)
			const decoded = decodeRmFrames(encoded)

			expect(decoded.length).toBe(3)
			for (const frame of decoded) {
				expect(frame.width).toBe(16)
				expect(frame.height).toBe(16)
			}
		})

		it('should roundtrip with different sizes', () => {
			for (const size of [8, 16, 32, 64]) {
				const original = createTestFrame(size, size, [128, 64, 192])
				const encoded = encodeRm([original])
				const decoded = decodeRmFrames(encoded)

				expect(decoded.length).toBe(1)
				expect(decoded[0]!.width).toBe(size)
				expect(decoded[0]!.height).toBe(size)
			}
		})

		it('should roundtrip with custom frame rates', () => {
			for (const fps of [24, 30, 60]) {
				const frame = createTestFrame(16, 16, [255, 128, 64])
				const encoded = encodeRm([frame], { frameRate: fps })
				const info = parseRmInfo(encoded)

				expect(info.frameRate).toBe(fps)
			}
		})
	})

	describe('structure validation', () => {
		it('should have valid .RMF magic', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame])

			// Check .RMF magic
			expect(rm[0]).toBe(0x2e) // '.'
			expect(rm[1]).toBe(0x52) // 'R'
			expect(rm[2]).toBe(0x4d) // 'M'
			expect(rm[3]).toBe(0x46) // 'F'
		})

		it('should contain PROP chunk', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame])

			const info = parseRmInfo(rm)
			expect(info.properties).toBeDefined()
			expect(info.properties.numStreams).toBeGreaterThan(0)
		})

		it('should contain MDPR chunk', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame])

			const info = parseRmInfo(rm)
			expect(info.streams.length).toBeGreaterThan(0)
			expect(info.streams[0]!.properties).toBeDefined()
		})

		it('should contain DATA chunk', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame])

			const decoded = decodeRm(rm)
			expect(decoded.videoPackets.length).toBeGreaterThan(0)
		})

		it('should have correct stream properties', () => {
			const frame = createTestFrame(32, 24, [255, 0, 0])
			const rm = encodeRm([frame])

			const info = parseRmInfo(rm)
			const videoStream = info.streams.find((s) => s.isVideo)

			expect(videoStream).toBeDefined()
			expect(videoStream!.videoInfo).toBeDefined()
			expect(videoStream!.videoInfo!.width).toBe(32)
			expect(videoStream!.videoInfo!.height).toBe(24)
		})
	})

	describe('error handling', () => {
		it('should throw on invalid magic', () => {
			const invalid = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
			expect(() => parseRmInfo(invalid)).toThrow('Invalid RealMedia')
		})

		it('should throw on corrupted data', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const rm = encodeRm([frame])

			// Corrupt the magic number
			const corrupted = rm.slice()
			corrupted[0] = 0
			corrupted[1] = 0
			corrupted[2] = 0
			corrupted[3] = 0
			expect(() => parseRmInfo(corrupted)).toThrow('Invalid RealMedia')
		})
	})
})
