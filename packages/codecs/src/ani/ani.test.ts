import { describe, expect, it } from 'bun:test'
import type { CursorImage } from '../cur/types'
import { decodeAni, decodeAnimatedCursor, encodeAni, encodeAnimatedCursor, isAni } from './index'

describe('ANI Codec', () => {
	// Create test cursor frames
	function createTestFrames(count: number): CursorImage[] {
		const frames: CursorImage[] = []

		for (let f = 0; f < count; f++) {
			const data = new Uint8Array(4 * 4 * 4)
			// Different color for each frame
			for (let i = 0; i < 4 * 4; i++) {
				data[i * 4] = (f * 50) % 256 // R
				data[i * 4 + 1] = ((f + 1) * 50) % 256 // G
				data[i * 4 + 2] = ((f + 2) * 50) % 256 // B
				data[i * 4 + 3] = 255 // A
			}
			frames.push({
				width: 4,
				height: 4,
				data,
				hotspotX: 2,
				hotspotY: 2,
			})
		}

		return frames
	}

	describe('encode/decode roundtrip', () => {
		it('should encode and decode single frame', () => {
			const frames = createTestFrames(1)
			const encoded = encodeAni(frames)

			expect(isAni(encoded)).toBe(true)

			const ani = decodeAnimatedCursor(encoded)
			expect(ani.frames.length).toBe(1)
			expect(ani.header.nFrames).toBe(1)
		})

		it('should encode and decode multiple frames', () => {
			const frames = createTestFrames(4)
			const encoded = encodeAni(frames)

			const ani = decodeAnimatedCursor(encoded)
			expect(ani.frames.length).toBe(4)
			expect(ani.header.nFrames).toBe(4)
		})

		it('should preserve frame rate', () => {
			const frames = createTestFrames(2)
			const encoded = encodeAni(frames, { defaultRate: 20 })

			const ani = decodeAnimatedCursor(encoded)
			expect(ani.header.jifRate).toBe(20)
			expect(ani.rates).toBeDefined()
			expect(ani.rates![0]).toBe(20)
		})

		it('should preserve metadata', () => {
			const frames = createTestFrames(2)
			const encoded = encodeAni(frames, {
				title: 'Test Cursor',
				author: 'Test Author',
			})

			const ani = decodeAnimatedCursor(encoded)
			expect(ani.title).toBe('Test Cursor')
			expect(ani.author).toBe('Test Author')
		})
	})

	describe('decodeAni', () => {
		it('should return first frame as ImageData', () => {
			const frames = createTestFrames(3)
			const encoded = encodeAni(frames)

			const image = decodeAni(encoded)
			expect(image.width).toBe(4)
			expect(image.height).toBe(4)
			expect(image.data.length).toBe(4 * 4 * 4)
		})
	})

	describe('isAni', () => {
		it('should identify ANI files', () => {
			const frames = createTestFrames(1)
			const encoded = encodeAni(frames)

			expect(isAni(encoded)).toBe(true)
		})

		it('should reject non-ANI data', () => {
			expect(isAni(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isAni(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false) // RIFF only
		})

		it('should handle short data', () => {
			expect(isAni(new Uint8Array([]))).toBe(false)
			expect(isAni(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(false)
		})
	})

	describe('encodeAnimatedCursor', () => {
		it('should encode from AnimatedCursor structure', () => {
			const frames = createTestFrames(2)
			const ani = {
				header: {
					cbSize: 36,
					nFrames: 2,
					nSteps: 2,
					cx: 0,
					cy: 0,
					bpp: 32,
					nPlanes: 1,
					jifRate: 15,
					flags: 1,
				},
				frames,
				title: 'My Cursor',
			}

			const encoded = encodeAnimatedCursor(ani)
			const decoded = decodeAnimatedCursor(encoded)

			expect(decoded.frames.length).toBe(2)
			expect(decoded.title).toBe('My Cursor')
		})
	})
})
