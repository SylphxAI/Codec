import { describe, expect, test } from 'bun:test'
import type { VideoData } from '@sylphx/codec-core'
import { decodeApng } from './decoder'
import { encodeApng } from './encoder'
import { BlendOp, DisposeOp, PNG_SIGNATURE } from './types'

describe('APNG Codec', () => {
	test('encode and decode roundtrip - single frame', () => {
		// Create a simple 2x2 single-frame video
		const original: VideoData = {
			width: 2,
			height: 2,
			frames: [
				{
					image: {
						width: 2,
						height: 2,
						data: new Uint8Array([
							// Row 0
							255, 0, 0, 255, // Red
							0, 255, 0, 255, // Green
							// Row 1
							0, 0, 255, 255, // Blue
							255, 255, 255, 255, // White
						]),
					},
					timestamp: 0,
					duration: 100,
				},
			],
			duration: 100,
			fps: 10,
		}

		// Encode to APNG
		const encoded = encodeApng(original)

		// Check PNG signature
		expect(encoded[0]).toBe(137)
		expect(encoded[1]).toBe(80) // 'P'
		expect(encoded[2]).toBe(78) // 'N'
		expect(encoded[3]).toBe(71) // 'G'

		// Decode back
		const decoded = decodeApng(encoded)

		// Verify dimensions
		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Verify frame count
		expect(decoded.frames.length).toBe(1)

		// Verify first frame
		const frame = decoded.frames[0]!
		expect(frame.image.width).toBe(2)
		expect(frame.image.height).toBe(2)
		expect(frame.image.data).toEqual(original.frames[0]!.image.data)
	})

	test('encode and decode roundtrip - multiple frames', () => {
		// Create a 3-frame animation
		const original: VideoData = {
			width: 2,
			height: 2,
			frames: [
				{
					image: {
						width: 2,
						height: 2,
						data: new Uint8Array([
							255, 0, 0, 255, // Red
							255, 0, 0, 255, // Red
							255, 0, 0, 255, // Red
							255, 0, 0, 255, // Red
						]),
					},
					timestamp: 0,
					duration: 100,
				},
				{
					image: {
						width: 2,
						height: 2,
						data: new Uint8Array([
							0, 255, 0, 255, // Green
							0, 255, 0, 255, // Green
							0, 255, 0, 255, // Green
							0, 255, 0, 255, // Green
						]),
					},
					timestamp: 100,
					duration: 100,
				},
				{
					image: {
						width: 2,
						height: 2,
						data: new Uint8Array([
							0, 0, 255, 255, // Blue
							0, 0, 255, 255, // Blue
							0, 0, 255, 255, // Blue
							0, 0, 255, 255, // Blue
						]),
					},
					timestamp: 200,
					duration: 100,
				},
			],
			duration: 300,
			fps: 10,
		}

		// Encode to APNG
		const encoded = encodeApng(original)

		// Decode back
		const decoded = decodeApng(encoded)

		// Verify dimensions
		expect(decoded.width).toBe(original.width)
		expect(decoded.height).toBe(original.height)

		// Verify frame count
		expect(decoded.frames.length).toBe(3)

		// Verify each frame
		for (let i = 0; i < 3; i++) {
			const decodedFrame = decoded.frames[i]!
			const originalFrame = original.frames[i]!

			expect(decodedFrame.image.width).toBe(originalFrame.image.width)
			expect(decodedFrame.image.height).toBe(originalFrame.image.height)
			expect(decodedFrame.image.data).toEqual(originalFrame.image.data)
		}
	})

	test('decode throws on invalid signature', () => {
		const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
		expect(() => decodeApng(invalid)).toThrow('Invalid PNG signature')
	})

	test('decode throws on missing acTL chunk', () => {
		// This is a valid PNG but not an APNG (missing acTL)
		// We'll create a minimal PNG
		const { encodePng } = require('../png/encoder')
		const png = encodePng({
			width: 1,
			height: 1,
			data: new Uint8Array([255, 255, 255, 255]),
		})

		expect(() => decodeApng(png)).toThrow('Missing acTL chunk')
	})

	test('handles various frame counts', () => {
		const frameCounts = [1, 2, 5, 10]

		for (const count of frameCounts) {
			const frames = []
			for (let i = 0; i < count; i++) {
				frames.push({
					image: {
						width: 2,
						height: 2,
						data: new Uint8Array(2 * 2 * 4).fill(i * 25),
					},
					timestamp: i * 100,
					duration: 100,
				})
			}

			const video: VideoData = {
				width: 2,
				height: 2,
				frames,
				duration: count * 100,
				fps: 10,
			}

			const encoded = encodeApng(video)
			const decoded = decodeApng(encoded)

			expect(decoded.frames.length).toBe(count)
		}
	})

	test('preserves frame timing', () => {
		const original: VideoData = {
			width: 1,
			height: 1,
			frames: [
				{
					image: { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) },
					timestamp: 0,
					duration: 50, // 50ms
				},
				{
					image: { width: 1, height: 1, data: new Uint8Array([0, 255, 0, 255]) },
					timestamp: 50,
					duration: 150, // 150ms
				},
				{
					image: { width: 1, height: 1, data: new Uint8Array([0, 0, 255, 255]) },
					timestamp: 200,
					duration: 200, // 200ms
				},
			],
			duration: 400,
			fps: 7.5,
		}

		const encoded = encodeApng(original)
		const decoded = decodeApng(encoded)

		// Verify frame durations are preserved (allowing for rounding due to fraction simplification)
		expect(decoded.frames[0]!.duration).toBeCloseTo(50, 0)
		expect(decoded.frames[1]!.duration).toBeCloseTo(150, 0)
		expect(decoded.frames[2]!.duration).toBeCloseTo(200, 0)
	})

	test('preserves alpha channel in animation', () => {
		const original: VideoData = {
			width: 1,
			height: 1,
			frames: [
				{
					image: { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) }, // Opaque red
					timestamp: 0,
					duration: 100,
				},
				{
					image: { width: 1, height: 1, data: new Uint8Array([0, 255, 0, 128]) }, // Semi-transparent green
					timestamp: 100,
					duration: 100,
				},
				{
					image: { width: 1, height: 1, data: new Uint8Array([0, 0, 255, 0]) }, // Fully transparent blue
					timestamp: 200,
					duration: 100,
				},
			],
			duration: 300,
			fps: 10,
		}

		const encoded = encodeApng(original)
		const decoded = decodeApng(encoded)

		expect(decoded.frames[0]!.image.data[3]).toBe(255) // Opaque
		expect(decoded.frames[1]!.image.data[3]).toBe(128) // Semi-transparent
		expect(decoded.frames[2]!.image.data[3]).toBe(0) // Fully transparent
	})

	test('handles different video sizes', () => {
		const sizes = [
			[1, 1],
			[4, 4],
			[8, 6],
			[16, 16],
		]

		for (const [w, h] of sizes) {
			const video: VideoData = {
				width: w!,
				height: h!,
				frames: [
					{
						image: {
							width: w!,
							height: h!,
							data: new Uint8Array(w! * h! * 4).fill(128),
						},
						timestamp: 0,
						duration: 100,
					},
				],
				duration: 100,
				fps: 10,
			}

			const encoded = encodeApng(video)
			const decoded = decodeApng(encoded)

			expect(decoded.width).toBe(w)
			expect(decoded.height).toBe(h)
			expect(decoded.frames[0]!.image.data.length).toBe(w! * h! * 4)
		}
	})

	test('throws on mismatched frame dimensions', () => {
		const video: VideoData = {
			width: 2,
			height: 2,
			frames: [
				{
					image: {
						width: 3, // Mismatched!
						height: 3,
						data: new Uint8Array(3 * 3 * 4),
					},
					timestamp: 0,
					duration: 100,
				},
			],
			duration: 100,
			fps: 10,
		}

		expect(() => encodeApng(video)).toThrow("don't match video dimensions")
	})

	test('throws on empty video', () => {
		const video: VideoData = {
			width: 2,
			height: 2,
			frames: [],
			duration: 0,
			fps: 0,
		}

		expect(() => encodeApng(video)).toThrow('No frames to encode')
	})

	test('creates valid APNG structure', () => {
		const video: VideoData = {
			width: 2,
			height: 2,
			frames: [
				{
					image: {
						width: 2,
						height: 2,
						data: new Uint8Array(2 * 2 * 4).fill(255),
					},
					timestamp: 0,
					duration: 100,
				},
				{
					image: {
						width: 2,
						height: 2,
						data: new Uint8Array(2 * 2 * 4).fill(128),
					},
					timestamp: 100,
					duration: 100,
				},
			],
			duration: 200,
			fps: 10,
		}

		const encoded = encodeApng(video)

		// Verify PNG signature
		for (let i = 0; i < 8; i++) {
			expect(encoded[i]).toBe(PNG_SIGNATURE[i])
		}

		// Verify we have IHDR chunk (after signature at offset 8)
		const ihdrType =
			(encoded[12]! << 24) | (encoded[13]! << 16) | (encoded[14]! << 8) | encoded[15]!
		expect(ihdrType).toBe(0x49484452) // 'IHDR'

		// Look for acTL chunk
		let hasActL = false
		let offset = 8
		while (offset < encoded.length - 12) {
			const length =
				(encoded[offset]! << 24) |
				(encoded[offset + 1]! << 16) |
				(encoded[offset + 2]! << 8) |
				encoded[offset + 3]!
			const type =
				(encoded[offset + 4]! << 24) |
				(encoded[offset + 5]! << 16) |
				(encoded[offset + 6]! << 8) |
				encoded[offset + 7]!

			if (type === 0x6163544c) {
				// 'acTL'
				hasActL = true
				// Verify num_frames
				const numFrames =
					(encoded[offset + 8]! << 24) |
					(encoded[offset + 9]! << 16) |
					(encoded[offset + 10]! << 8) |
					encoded[offset + 11]!
				expect(numFrames).toBe(2)
			}

			offset += 12 + length
		}

		expect(hasActL).toBe(true)
	})
})
