import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@mconv/core'
import { decodePs, encodePs, isPs, parsePsInfo } from './index'

describe('MPEG-PS Codec', () => {
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

	describe('isPs', () => {
		it('should identify PS files', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ps = encodePs([frame])
			expect(isPs(ps)).toBe(true)
		})

		it('should reject non-PS files', () => {
			expect(isPs(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isPs(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isPs(new Uint8Array([0x47, 0x00, 0x00, 0x00]))).toBe(false) // TS
		})

		it('should handle short data', () => {
			expect(isPs(new Uint8Array([]))).toBe(false)
			expect(isPs(new Uint8Array([0x00, 0x00, 0x01, 0xba]))).toBe(false) // Too short
		})

		it('should verify pack header marker bits', () => {
			// Valid MPEG-2 pack header
			const valid = new Uint8Array(14)
			valid[0] = 0x00
			valid[1] = 0x00
			valid[2] = 0x01
			valid[3] = 0xba
			valid[4] = 0x44 // MPEG-2 marker (01xxxxxx)
			expect(isPs(valid)).toBe(true)

			// Invalid marker bits
			const invalid = new Uint8Array(14)
			invalid[0] = 0x00
			invalid[1] = 0x00
			invalid[2] = 0x01
			invalid[3] = 0xba
			invalid[4] = 0x00 // Invalid marker
			expect(isPs(invalid)).toBe(false)
		})
	})

	describe('parsePsInfo', () => {
		it('should parse stream info', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ps = encodePs([frame])

			const info = parsePsInfo(ps)

			expect(info.hasVideo).toBe(true)
			expect(info.streams.length).toBeGreaterThan(0)
		})

		it('should detect video streams', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ps = encodePs([frame])

			const info = parsePsInfo(ps)

			const videoStream = info.streams.find(s => s.isVideo)
			expect(videoStream).toBeDefined()
		})

		it('should report mux rate', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ps = encodePs([frame], { muxRate: 5000000 })

			const info = parsePsInfo(ps)

			expect(info.muxRate).toBeGreaterThan(0)
		})

		it('should detect MPEG-2 format', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ps = encodePs([frame])

			const info = parsePsInfo(ps)

			expect(info.isMpeg2).toBe(true)
		})
	})

	describe('encodePs', () => {
		it('should encode single frame', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ps = encodePs([frame])

			expect(isPs(ps)).toBe(true)
			expect(ps.length).toBeGreaterThan(20)
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const ps = encodePs(frames)

			expect(isPs(ps)).toBe(true)
		})

		it('should include program end code', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const ps = encodePs([frame])

			// Check for end code at end (0x000001B9)
			const endIdx = ps.length - 4
			expect(ps[endIdx]).toBe(0x00)
			expect(ps[endIdx + 1]).toBe(0x00)
			expect(ps[endIdx + 2]).toBe(0x01)
			expect(ps[endIdx + 3]).toBe(0xb9)
		})

		it('should encode with custom options', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const ps = encodePs([frame], { frameRate: 24, muxRate: 8000000 })

			expect(isPs(ps)).toBe(true)
		})
	})

	describe('decodePs', () => {
		it('should decode PS packs', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0]), createTestFrame(16, 16, [0, 255, 0])]
			const ps = encodePs(frames)
			const decoded = decodePs(ps)

			expect(decoded.packs.length).toBeGreaterThan(0)
		})

		it('should parse pack headers', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ps = encodePs([frame])
			const decoded = decodePs(ps)

			expect(decoded.packs[0]?.header).toBeDefined()
			expect(decoded.packs[0]?.header.muxRate).toBeGreaterThan(0)
		})

		it('should parse system header', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ps = encodePs([frame])
			const decoded = decodePs(ps)

			// First pack should have system header
			expect(decoded.packs[0]?.systemHeader).toBeDefined()
		})

		it('should extract video frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
			]
			const ps = encodePs(frames)
			const decoded = decodePs(ps)

			expect(decoded.videoFrames.length).toBeGreaterThan(0)
		})

		it('should parse PES packets', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ps = encodePs([frame])
			const decoded = decodePs(ps)

			const pesCount = decoded.packs.reduce((sum, p) => sum + p.pesPackets.length, 0)
			expect(pesCount).toBeGreaterThan(0)
		})
	})

	describe('roundtrip', () => {
		it('should preserve stream structure', () => {
			const frame = createTestFrame(16, 16, [200, 100, 50])
			const ps = encodePs([frame])
			const decoded = decodePs(ps)

			expect(decoded.info.hasVideo).toBe(true)
			expect(decoded.packs.length).toBeGreaterThan(0)
		})

		it('should preserve video data', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0])]
			const ps = encodePs(frames)
			const decoded = decodePs(ps)

			// Video frames should be extractable
			expect(decoded.videoFrames.length).toBeGreaterThanOrEqual(1)
		})

		it('should handle different frame counts', () => {
			for (const count of [1, 2, 3, 5]) {
				const frames = Array.from({ length: count }, (_, i) =>
					createTestFrame(16, 16, [(i * 50) % 256, 100, 150])
				)
				const ps = encodePs(frames)
				const decoded = decodePs(ps)

				expect(decoded.info.hasVideo).toBe(true)
			}
		})
	})
})
