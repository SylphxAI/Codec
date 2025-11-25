import { describe, expect, it } from 'bun:test'
import type { VideoData, VideoFrame } from '@mconv/core'
import { decodeApngAnimation, encodeApngAnimation } from './animation'
import { encodePng } from './encoder'

describe('APNG Animation', () => {
	describe('decodeApngAnimation', () => {
		it('should decode single-frame PNG as video with one frame', () => {
			// Create a simple 2x2 PNG
			const image = {
				width: 2,
				height: 2,
				data: new Uint8Array([
					255,
					0,
					0,
					255, // Red
					0,
					255,
					0,
					255, // Green
					0,
					0,
					255,
					255, // Blue
					255,
					255,
					0,
					255, // Yellow
				]),
			}

			const pngData = encodePng(image)
			const video = decodeApngAnimation(pngData)

			expect(video.width).toBe(2)
			expect(video.height).toBe(2)
			expect(video.frames.length).toBe(1)
			expect(video.frames[0]!.image.width).toBe(2)
			expect(video.frames[0]!.image.height).toBe(2)
		})

		it('should decode frame timing correctly', () => {
			const image = {
				width: 2,
				height: 2,
				data: new Uint8Array(16).fill(128),
			}

			const pngData = encodePng(image)
			const video = decodeApngAnimation(pngData)

			expect(video.frames[0]!.timestamp).toBe(0)
			expect(video.frames[0]!.duration).toBeGreaterThan(0)
		})

		it('should calculate total duration', () => {
			const image = {
				width: 2,
				height: 2,
				data: new Uint8Array(16).fill(128),
			}

			const pngData = encodePng(image)
			const video = decodeApngAnimation(pngData)

			expect(video.duration).toBe(video.frames[0]!.duration)
		})

		it('should calculate fps', () => {
			const image = {
				width: 2,
				height: 2,
				data: new Uint8Array(16).fill(128),
			}

			const pngData = encodePng(image)
			const video = decodeApngAnimation(pngData)

			expect(video.fps).toBeGreaterThan(0)
		})
	})

	describe('encodeApngAnimation', () => {
		it('should encode video with single frame', () => {
			const video: VideoData = {
				width: 2,
				height: 2,
				frames: [
					{
						image: {
							width: 2,
							height: 2,
							data: new Uint8Array([
								255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
							]),
						},
						timestamp: 0,
						duration: 100,
					},
				],
				duration: 100,
				fps: 10,
			}

			const apngData = encodeApngAnimation(video)

			// Should start with PNG signature
			expect(apngData[0]).toBe(137) // 0x89
			expect(apngData[1]).toBe(80) // P
			expect(apngData[2]).toBe(78) // N
			expect(apngData[3]).toBe(71) // G
			expect(apngData[4]).toBe(13) // CR
			expect(apngData[5]).toBe(10) // LF
			expect(apngData[6]).toBe(26) // SUB
			expect(apngData[7]).toBe(10) // LF
		})

		it('should encode video with multiple frames', () => {
			const frames: VideoFrame[] = []
			for (let i = 0; i < 3; i++) {
				const data = new Uint8Array(16)
				data.fill(i * 80)
				frames.push({
					image: { width: 2, height: 2, data },
					timestamp: i * 100,
					duration: 100,
				})
			}

			const video: VideoData = {
				width: 2,
				height: 2,
				frames,
				duration: 300,
				fps: 10,
			}

			const apngData = encodeApngAnimation(video)

			// Decode and verify
			const decoded = decodeApngAnimation(apngData)
			expect(decoded.frames.length).toBe(3)
		})

		it('should throw error for empty frames', () => {
			const video: VideoData = {
				width: 2,
				height: 2,
				frames: [],
				duration: 0,
				fps: 0,
			}

			expect(() => encodeApngAnimation(video)).toThrow('No frames to encode')
		})

		it('should include acTL chunk', () => {
			const video: VideoData = {
				width: 2,
				height: 2,
				frames: [
					{
						image: {
							width: 2,
							height: 2,
							data: new Uint8Array(16).fill(128),
						},
						timestamp: 0,
						duration: 100,
					},
				],
				duration: 100,
				fps: 10,
			}

			const apngData = encodeApngAnimation(video)

			// Look for 'acTL' in the output
			const actl = [0x61, 0x63, 0x54, 0x4c] // 'acTL'
			let found = false
			for (let i = 0; i < apngData.length - actl.length; i++) {
				let match = true
				for (let j = 0; j < actl.length; j++) {
					if (apngData[i + j] !== actl[j]) {
						match = false
						break
					}
				}
				if (match) {
					found = true
					break
				}
			}
			expect(found).toBe(true)
		})

		it('should preserve frame timing approximately', () => {
			const video: VideoData = {
				width: 2,
				height: 2,
				frames: [
					{
						image: { width: 2, height: 2, data: new Uint8Array(16).fill(100) },
						timestamp: 0,
						duration: 200,
					},
					{
						image: { width: 2, height: 2, data: new Uint8Array(16).fill(200) },
						timestamp: 200,
						duration: 300,
					},
				],
				duration: 500,
				fps: 4,
			}

			const apngData = encodeApngAnimation(video)
			const decoded = decodeApngAnimation(apngData)

			// Verify frame count preserved
			expect(decoded.frames.length).toBe(2)

			// Timing should be approximately preserved
			expect(decoded.frames[0]!.duration).toBeCloseTo(200, -1)
			expect(decoded.frames[1]!.duration).toBeCloseTo(300, -1)
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip simple animation', () => {
			const frames: VideoFrame[] = []
			for (let i = 0; i < 4; i++) {
				const data = new Uint8Array(16)
				// Different grayscale values for each frame
				for (let j = 0; j < 16; j += 4) {
					data[j] = i * 60
					data[j + 1] = i * 60
					data[j + 2] = i * 60
					data[j + 3] = 255
				}
				frames.push({
					image: { width: 2, height: 2, data },
					timestamp: i * 100,
					duration: 100,
				})
			}

			const original: VideoData = {
				width: 2,
				height: 2,
				frames,
				duration: 400,
				fps: 10,
			}

			const encoded = encodeApngAnimation(original)
			const decoded = decodeApngAnimation(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)
			expect(decoded.frames.length).toBe(original.frames.length)
		})

		it('should handle larger frames', () => {
			const width = 16
			const height = 16
			const frames: VideoFrame[] = []

			for (let i = 0; i < 2; i++) {
				const data = new Uint8Array(width * height * 4)
				for (let p = 0; p < width * height; p++) {
					// Gradient pattern
					data[p * 4] = (p + i * 50) % 256
					data[p * 4 + 1] = (p * 2 + i * 50) % 256
					data[p * 4 + 2] = (p * 3 + i * 50) % 256
					data[p * 4 + 3] = 255
				}
				frames.push({
					image: { width, height, data },
					timestamp: i * 100,
					duration: 100,
				})
			}

			const video: VideoData = {
				width,
				height,
				frames,
				duration: 200,
				fps: 10,
			}

			const encoded = encodeApngAnimation(video)
			const decoded = decodeApngAnimation(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)
			expect(decoded.frames.length).toBe(2)
		})

		it('should preserve pixel data', () => {
			const data = new Uint8Array([
				255,
				0,
				0,
				255, // Red
				0,
				255,
				0,
				255, // Green
				0,
				0,
				255,
				255, // Blue
				255,
				255,
				0,
				255, // Yellow
			])

			const video: VideoData = {
				width: 2,
				height: 2,
				frames: [
					{
						image: { width: 2, height: 2, data: new Uint8Array(data) },
						timestamp: 0,
						duration: 100,
					},
				],
				duration: 100,
				fps: 10,
			}

			const encoded = encodeApngAnimation(video)
			const decoded = decodeApngAnimation(encoded)

			const decodedData = decoded.frames[0]!.image.data

			// Verify colors
			expect(decodedData[0]).toBe(255) // R
			expect(decodedData[1]).toBe(0) // G
			expect(decodedData[2]).toBe(0) // B
			expect(decodedData[3]).toBe(255) // A

			expect(decodedData[4]).toBe(0) // R
			expect(decodedData[5]).toBe(255) // G
			expect(decodedData[6]).toBe(0) // B
		})
	})
})
