import { describe, expect, it } from 'bun:test'
import type { VideoData, VideoFrame } from '@sylphx/codec-core'
import { decodeWebPAnimation, encodeWebPAnimation } from './animation'
import { encodeWebP } from './encoder'

describe('WebP Animation', () => {
	describe('decodeWebPAnimation', () => {
		it('should decode single-frame WebP as video with one frame', () => {
			// Create a simple 2x2 WebP
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

			const webpData = encodeWebP(image)
			const video = decodeWebPAnimation(webpData)

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

			const webpData = encodeWebP(image)
			const video = decodeWebPAnimation(webpData)

			expect(video.frames[0]!.timestamp).toBe(0)
			expect(video.frames[0]!.duration).toBeGreaterThan(0)
		})

		it('should calculate total duration', () => {
			const image = {
				width: 2,
				height: 2,
				data: new Uint8Array(16).fill(128),
			}

			const webpData = encodeWebP(image)
			const video = decodeWebPAnimation(webpData)

			expect(video.duration).toBe(video.frames[0]!.duration)
		})

		it('should calculate fps', () => {
			const image = {
				width: 2,
				height: 2,
				data: new Uint8Array(16).fill(128),
			}

			const webpData = encodeWebP(image)
			const video = decodeWebPAnimation(webpData)

			expect(video.fps).toBeGreaterThan(0)
		})
	})

	describe('encodeWebPAnimation', () => {
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

			const webpData = encodeWebPAnimation(video)

			// Should start with RIFF header
			expect(webpData[0]).toBe(0x52) // R
			expect(webpData[1]).toBe(0x49) // I
			expect(webpData[2]).toBe(0x46) // F
			expect(webpData[3]).toBe(0x46) // F

			// Should have WEBP signature
			expect(webpData[8]).toBe(0x57) // W
			expect(webpData[9]).toBe(0x45) // E
			expect(webpData[10]).toBe(0x42) // B
			expect(webpData[11]).toBe(0x50) // P
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

			const webpData = encodeWebPAnimation(video)

			// Decode and verify
			const decoded = decodeWebPAnimation(webpData)
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

			expect(() => encodeWebPAnimation(video)).toThrow('No frames to encode')
		})

		it('should include VP8X chunk for animation', () => {
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

			const webpData = encodeWebPAnimation(video)

			// Look for 'VP8X' in the output
			const vp8x = [0x56, 0x50, 0x38, 0x58] // 'VP8X'
			let found = false
			for (let i = 0; i < webpData.length - vp8x.length; i++) {
				let match = true
				for (let j = 0; j < vp8x.length; j++) {
					if (webpData[i + j] !== vp8x[j]) {
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

		it('should include ANIM chunk', () => {
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

			const webpData = encodeWebPAnimation(video)

			// Look for 'ANIM' in the output
			const anim = [0x41, 0x4e, 0x49, 0x4d] // 'ANIM'
			let found = false
			for (let i = 0; i < webpData.length - anim.length; i++) {
				let match = true
				for (let j = 0; j < anim.length; j++) {
					if (webpData[i + j] !== anim[j]) {
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
	})

	describe('roundtrip', () => {
		it('should roundtrip simple animation', () => {
			const frames: VideoFrame[] = []
			for (let i = 0; i < 4; i++) {
				const data = new Uint8Array(16)
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

			const encoded = encodeWebPAnimation(original)
			const decoded = decodeWebPAnimation(encoded)

			expect(decoded.width).toBe(original.width)
			expect(decoded.height).toBe(original.height)
			expect(decoded.frames.length).toBe(original.frames.length)
		})

		it('should handle 8x8 frames', () => {
			const width = 8
			const height = 8
			const frames: VideoFrame[] = []

			for (let i = 0; i < 2; i++) {
				const data = new Uint8Array(width * height * 4)
				for (let p = 0; p < width * height; p++) {
					// Use limited color palette for better Huffman encoding
					data[p * 4] = (i * 100) % 256
					data[p * 4 + 1] = (i * 100 + 50) % 256
					data[p * 4 + 2] = (i * 100 + 100) % 256
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

			const encoded = encodeWebPAnimation(video)
			const decoded = decodeWebPAnimation(encoded)

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

			const encoded = encodeWebPAnimation(video)
			const decoded = decodeWebPAnimation(encoded)

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
