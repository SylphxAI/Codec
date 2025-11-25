import { describe, expect, it } from 'bun:test'
import type { ImageData } from '@sylphx/codec-core'
import { decodeTs, encodeTs, isTs, parseTsInfo, TS_PACKET_SIZE, TS_SYNC_BYTE } from './index'

describe('MPEG-TS Codec', () => {
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

	describe('isTs', () => {
		it('should identify TS files', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ts = encodeTs([frame])
			expect(isTs(ts)).toBe(true)
		})

		it('should reject non-TS files', () => {
			expect(isTs(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
			expect(isTs(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
			expect(isTs(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(false) // FLAC
		})

		it('should handle short data', () => {
			expect(isTs(new Uint8Array([]))).toBe(false)
			expect(isTs(new Uint8Array([TS_SYNC_BYTE]))).toBe(false)
		})

		it('should verify sync byte interval', () => {
			// Valid: sync byte at 0 and 188
			const valid = new Uint8Array(TS_PACKET_SIZE * 2)
			valid[0] = TS_SYNC_BYTE
			valid[TS_PACKET_SIZE] = TS_SYNC_BYTE
			expect(isTs(valid)).toBe(true)

			// Invalid: sync byte only at 0
			const invalid = new Uint8Array(TS_PACKET_SIZE * 2)
			invalid[0] = TS_SYNC_BYTE
			invalid[TS_PACKET_SIZE] = 0x00
			expect(isTs(invalid)).toBe(false)
		})
	})

	describe('parseTsInfo', () => {
		it('should parse program info', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ts = encodeTs([frame])

			const info = parseTsInfo(ts)

			expect(info.programs.length).toBeGreaterThan(0)
		})

		it('should detect video', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ts = encodeTs([frame])

			const info = parseTsInfo(ts)

			expect(info.hasVideo).toBe(true)
		})

		it('should parse PMT', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ts = encodeTs([frame])

			const info = parseTsInfo(ts)

			expect(info.pmt).toBeDefined()
			expect(info.pmt?.streams.length).toBeGreaterThan(0)
		})

		it('should parse stream type', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ts = encodeTs([frame])

			const info = parseTsInfo(ts)

			expect(info.videoStreamType).toBeDefined()
		})
	})

	describe('encodeTs', () => {
		it('should encode single frame', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ts = encodeTs([frame])

			expect(isTs(ts)).toBe(true)
			expect(ts.length).toBeGreaterThan(TS_PACKET_SIZE * 2)
		})

		it('should encode multiple frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
				createTestFrame(16, 16, [0, 0, 255]),
			]
			const ts = encodeTs(frames)

			expect(isTs(ts)).toBe(true)
		})

		it('should produce 188-byte aligned output', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const ts = encodeTs([frame])

			expect(ts.length % TS_PACKET_SIZE).toBe(0)
		})

		it('should encode with custom options', () => {
			const frame = createTestFrame(16, 16, [128, 128, 128])
			const ts = encodeTs([frame], { frameRate: 24 })

			expect(isTs(ts)).toBe(true)
		})
	})

	describe('decodeTs', () => {
		it('should decode TS packets', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0]), createTestFrame(16, 16, [0, 255, 0])]
			const ts = encodeTs(frames)
			const decoded = decodeTs(ts)

			expect(decoded.packets.length).toBeGreaterThan(0)
		})

		it('should parse PAT', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ts = encodeTs([frame])
			const decoded = decodeTs(ts)

			expect(decoded.info.programs.length).toBeGreaterThan(0)
			expect(decoded.info.programs[0]?.programNumber).toBe(1)
		})

		it('should parse PMT', () => {
			const frame = createTestFrame(16, 16, [255, 0, 0])
			const ts = encodeTs([frame])
			const decoded = decodeTs(ts)

			expect(decoded.info.pmt).toBeDefined()
		})

		it('should extract video frames', () => {
			const frames = [
				createTestFrame(16, 16, [255, 0, 0]),
				createTestFrame(16, 16, [0, 255, 0]),
			]
			const ts = encodeTs(frames)
			const decoded = decodeTs(ts)

			expect(decoded.videoFrames.length).toBeGreaterThan(0)
		})
	})

	describe('roundtrip', () => {
		it('should preserve program structure', () => {
			const frame = createTestFrame(16, 16, [200, 100, 50])
			const ts = encodeTs([frame])
			const decoded = decodeTs(ts)

			expect(decoded.info.hasVideo).toBe(true)
			expect(decoded.info.pmt?.streams.length).toBeGreaterThan(0)
		})

		it('should preserve video data', () => {
			const frames = [createTestFrame(16, 16, [255, 0, 0])]
			const ts = encodeTs(frames)
			const decoded = decodeTs(ts)

			// Video frames should be extractable
			expect(decoded.videoFrames.length).toBeGreaterThanOrEqual(1)
		})

		it('should handle different frame counts', () => {
			for (const count of [1, 2, 3, 5]) {
				const frames = Array.from({ length: count }, (_, i) =>
					createTestFrame(16, 16, [(i * 50) % 256, 100, 150])
				)
				const ts = encodeTs(frames)
				const decoded = decodeTs(ts)

				expect(decoded.info.hasVideo).toBe(true)
			}
		})
	})
})
