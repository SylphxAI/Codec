import { describe, expect, it } from 'bun:test'
import { decodeCur, decodeCursorFile, encodeCur, encodeCursorFile, isCur } from './index'
import type { CursorImage } from './types'

describe('CUR Codec', () => {
	// Create a simple 4x4 test cursor
	function createTestCursor(hotspotX = 0, hotspotY = 0): CursorImage {
		const data = new Uint8Array(4 * 4 * 4)
		// Red pixel at hotspot, rest transparent
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const i = (y * 4 + x) * 4
				if (x === hotspotX && y === hotspotY) {
					data[i] = 255 // R
					data[i + 1] = 0 // G
					data[i + 2] = 0 // B
					data[i + 3] = 255 // A
				} else {
					data[i] = 0
					data[i + 1] = 0
					data[i + 2] = 0
					data[i + 3] = 0
				}
			}
		}
		return { width: 4, height: 4, data, hotspotX, hotspotY }
	}

	describe('encode/decode roundtrip', () => {
		it('should encode and decode cursor with PNG', () => {
			const cursor = createTestCursor(1, 2)
			const encoded = encodeCur(cursor, { hotspotX: 1, hotspotY: 2, usePng: true })

			expect(isCur(encoded)).toBe(true)

			const cursorFile = decodeCursorFile(encoded)
			expect(cursorFile.cursors.length).toBe(1)

			const decoded = cursorFile.cursors[0]!
			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(4)
			expect(decoded.hotspotX).toBe(1)
			expect(decoded.hotspotY).toBe(2)
		})

		it('should encode and decode cursor with BMP', () => {
			const cursor = createTestCursor(2, 1)
			const encoded = encodeCur(cursor, { hotspotX: 2, hotspotY: 1, usePng: false })

			expect(isCur(encoded)).toBe(true)

			const cursorFile = decodeCursorFile(encoded)
			expect(cursorFile.cursors.length).toBe(1)

			const decoded = cursorFile.cursors[0]!
			expect(decoded.hotspotX).toBe(2)
			expect(decoded.hotspotY).toBe(1)
		})

		it('should decode to ImageData', () => {
			const cursor = createTestCursor(0, 0)
			const encoded = encodeCur(cursor, { hotspotX: 0, hotspotY: 0 })

			const decoded = decodeCur(encoded)
			expect(decoded.width).toBe(4)
			expect(decoded.height).toBe(4)
			expect(decoded.data.length).toBe(4 * 4 * 4)
		})
	})

	describe('multi-cursor support', () => {
		it('should encode multiple cursors', () => {
			const cursors: CursorImage[] = [
				createTestCursor(0, 0),
				{ ...createTestCursor(4, 4), width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) },
			]
			cursors[1]!.hotspotX = 4
			cursors[1]!.hotspotY = 4

			const encoded = encodeCursorFile(cursors)
			const decoded = decodeCursorFile(encoded)

			expect(decoded.cursors.length).toBe(2)
			expect(decoded.cursors[0]!.width).toBe(4)
			expect(decoded.cursors[1]!.width).toBe(8)
		})
	})

	describe('isCur', () => {
		it('should identify CUR files', () => {
			const cursor = createTestCursor()
			const encoded = encodeCur(cursor)

			expect(isCur(encoded)).toBe(true)
		})

		it('should reject non-CUR data', () => {
			expect(isCur(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isCur(new Uint8Array([0, 0, 1, 0]))).toBe(false) // ICO, not CUR
			expect(isCur(new Uint8Array([1, 0, 2, 0]))).toBe(false) // Bad reserved
		})

		it('should handle short data', () => {
			expect(isCur(new Uint8Array([0, 0]))).toBe(false)
			expect(isCur(new Uint8Array([]))).toBe(false)
		})
	})

	describe('hotspot handling', () => {
		it('should preserve hotspot coordinates', () => {
			const testCases = [
				{ x: 0, y: 0 },
				{ x: 15, y: 15 },
				{ x: 7, y: 3 },
				{ x: 100, y: 200 },
			]

			for (const { x, y } of testCases) {
				const cursor = createTestCursor()
				const encoded = encodeCur(cursor, { hotspotX: x, hotspotY: y })
				const decoded = decodeCursorFile(encoded)

				expect(decoded.cursors[0]!.hotspotX).toBe(x)
				expect(decoded.cursors[0]!.hotspotY).toBe(y)
			}
		})
	})
})
