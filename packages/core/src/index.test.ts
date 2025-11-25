import { describe, expect, test } from 'bun:test'
import type { ImageData } from './index'

describe('core', () => {
	test('types export correctly', () => {
		const img: ImageData = { width: 1, height: 1, data: new Uint8Array(4) }
		expect(img.width).toBe(1)
	})
})
