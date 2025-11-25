import { describe, expect, it } from 'bun:test'
import type { VideoData, VideoFrame } from '@sylphx/codec-core'
import { decodeGifAnimation, encodeGifAnimation } from './animation'
import { encodeGif } from './encoder'

describe('GIF Animation', () => {
	describe('decodeGifAnimation', () => {
		it('should decode single-frame GIF as video with one frame', () => {
			// Create a simple 2x2 GIF
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

			const gifData = encodeGif(image)
			const video = decodeGifAnimation(gifData)

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

			const gifData = encodeGif(image)
			const video = decodeGifAnimation(gifData)

			expect(video.frames[0]!.timestamp).toBe(0)
			expect(video.frames[0]!.duration).toBeGreaterThan(0)
		})

		it('should calculate total duration', () => {
			const image = {
				width: 2,
				height: 2,
				data: new Uint8Array(16).fill(128),
			}

			const gifData = encodeGif(image)
			const video = decodeGifAnimation(gifData)

			expect(video.duration).toBe(video.frames[0]!.duration)
		})

		it('should calculate fps', () => {
			const image = {
				width: 2,
				height: 2,
				data: new Uint8Array(16).fill(128),
			}

			const gifData = encodeGif(image)
			const video = decodeGifAnimation(gifData)

			expect(video.fps).toBeGreaterThan(0)
		})
	})

	describe('encodeGifAnimation', () => {
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

			const gifData = encodeGifAnimation(video)

			// Should start with GIF89a header
			expect(gifData[0]).toBe(0x47) // G
			expect(gifData[1]).toBe(0x49) // I
			expect(gifData[2]).toBe(0x46) // F
			expect(gifData[3]).toBe(0x38) // 8
			expect(gifData[4]).toBe(0x39) // 9
			expect(gifData[5]).toBe(0x61) // a

			// Should end with trailer
			expect(gifData[gifData.length - 1]).toBe(0x3b)
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

			const gifData = encodeGifAnimation(video)

			// Decode and verify
			const decoded = decodeGifAnimation(gifData)
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

			expect(() => encodeGifAnimation(video)).toThrow('No frames to encode')
		})

		it('should include NETSCAPE extension for looping', () => {
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

			const gifData = encodeGifAnimation(video)

			// Look for NETSCAPE2.0 in the output
			const netscape = [0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45]
			let found = false
			for (let i = 0; i < gifData.length - netscape.length; i++) {
				let match = true
				for (let j = 0; j < netscape.length; j++) {
					if (gifData[i + j] !== netscape[j]) {
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

		it('should preserve frame timing', () => {
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

			const gifData = encodeGifAnimation(video)
			const decoded = decodeGifAnimation(gifData)

			// Verify frame count preserved
			expect(decoded.frames.length).toBe(2)

			// Timing should be approximately preserved (centisecond rounding)
			expect(decoded.frames[0]!.duration).toBe(200)
			expect(decoded.frames[1]!.duration).toBe(300)
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

			const encoded = encodeGifAnimation(original)
			const decoded = decodeGifAnimation(encoded)

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

			const encoded = encodeGifAnimation(video)
			const decoded = decodeGifAnimation(encoded)

			expect(decoded.width).toBe(width)
			expect(decoded.height).toBe(height)
			expect(decoded.frames.length).toBe(2)
		})
	})
})
