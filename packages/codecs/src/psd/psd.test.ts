import { describe, expect, it } from 'bun:test'
import { decodePsd, isPsd, parsePsd } from './index'
import { PsdColorMode, PsdCompression } from './types'

describe('PSD Codec', () => {
	// Create a minimal valid PSD file
	function createTestPsd(
		width: number,
		height: number,
		options: {
			colorMode?: PsdColorMode
			depth?: number
			compression?: PsdCompression
			channels?: number
		} = {}
	): Uint8Array {
		const {
			colorMode = PsdColorMode.RGB,
			depth = 8,
			compression = PsdCompression.RAW,
			channels = 3,
		} = options

		const parts: Uint8Array[] = []

		// File Header (26 bytes)
		const header = new Uint8Array(26)
		// Signature '8BPS'
		header[0] = 0x38 // '8'
		header[1] = 0x42 // 'B'
		header[2] = 0x50 // 'P'
		header[3] = 0x53 // 'S'
		// Version
		header[4] = 0
		header[5] = 1
		// Reserved (6 bytes)
		// Channels
		header[12] = (channels >> 8) & 0xff
		header[13] = channels & 0xff
		// Height
		header[14] = (height >> 24) & 0xff
		header[15] = (height >> 16) & 0xff
		header[16] = (height >> 8) & 0xff
		header[17] = height & 0xff
		// Width
		header[18] = (width >> 24) & 0xff
		header[19] = (width >> 16) & 0xff
		header[20] = (width >> 8) & 0xff
		header[21] = width & 0xff
		// Depth
		header[22] = (depth >> 8) & 0xff
		header[23] = depth & 0xff
		// Color Mode
		header[24] = (colorMode >> 8) & 0xff
		header[25] = colorMode & 0xff
		parts.push(header)

		// Color Mode Data (4 bytes - length only)
		parts.push(new Uint8Array([0, 0, 0, 0]))

		// Image Resources (4 bytes - length only)
		parts.push(new Uint8Array([0, 0, 0, 0]))

		// Layer and Mask Info (4 bytes - length only)
		parts.push(new Uint8Array([0, 0, 0, 0]))

		// Image Data Section
		// Compression type (2 bytes)
		parts.push(new Uint8Array([0, compression]))

		// Create image data based on compression
		const bytesPerPixel = depth === 16 ? 2 : 1
		const bytesPerRow = width * bytesPerPixel

		if (compression === PsdCompression.RAW) {
			// Raw data: channel-by-channel
			for (let ch = 0; ch < channels; ch++) {
				const channelData = new Uint8Array(bytesPerRow * height)
				for (let y = 0; y < height; y++) {
					for (let x = 0; x < width; x++) {
						const idx = y * width + x
						if (depth === 16) {
							// 16-bit: scale 0-255 gradient to 0-65535
							const value = Math.round((((ch * 64 + x) % 256) / 255) * 65535)
							channelData[idx * 2] = (value >> 8) & 0xff
							channelData[idx * 2 + 1] = value & 0xff
						} else {
							// 8-bit: simple gradient
							channelData[idx] = (ch * 64 + x) % 256
						}
					}
				}
				parts.push(channelData)
			}
		} else if (compression === PsdCompression.RLE) {
			// RLE: row byte counts first, then compressed rows
			const rowCounts: number[][] = []
			const compressedRows: Uint8Array[][] = []

			for (let ch = 0; ch < channels; ch++) {
				const chCounts: number[] = []
				const chRows: Uint8Array[] = []

				for (let y = 0; y < height; y++) {
					// Create simple row data
					const rowData = new Uint8Array(bytesPerRow)
					for (let x = 0; x < width; x++) {
						if (depth === 16) {
							const value = Math.round((((ch * 64 + x) % 256) / 255) * 65535)
							rowData[x * 2] = (value >> 8) & 0xff
							rowData[x * 2 + 1] = value & 0xff
						} else {
							rowData[x] = (ch * 64 + x) % 256
						}
					}

					// Simple RLE encoding (just use literal runs)
					const compressed = encodeRleRow(rowData)
					chCounts.push(compressed.length)
					chRows.push(compressed)
				}

				rowCounts.push(chCounts)
				compressedRows.push(chRows)
			}

			// Write row byte counts (big endian 16-bit)
			for (let ch = 0; ch < channels; ch++) {
				for (let y = 0; y < height; y++) {
					const count = rowCounts[ch]![y]!
					parts.push(new Uint8Array([(count >> 8) & 0xff, count & 0xff]))
				}
			}

			// Write compressed rows
			for (let ch = 0; ch < channels; ch++) {
				for (let y = 0; y < height; y++) {
					parts.push(compressedRows[ch]![y]!)
				}
			}
		}

		// Concatenate all parts
		let totalLen = 0
		for (const p of parts) totalLen += p.length
		const result = new Uint8Array(totalLen)
		let offset = 0
		for (const p of parts) {
			result.set(p, offset)
			offset += p.length
		}

		return result
	}

	// Simple RLE encoder for testing
	function encodeRleRow(data: Uint8Array): Uint8Array {
		const result: number[] = []
		let i = 0

		while (i < data.length) {
			// Check for run of same values
			let runLen = 1
			while (i + runLen < data.length && runLen < 128 && data[i + runLen] === data[i]) {
				runLen++
			}

			if (runLen >= 3) {
				// RLE run: count = 257 - runLen (count > 128)
				result.push(257 - runLen)
				result.push(data[i]!)
				i += runLen
			} else {
				// Literal run
				let litLen = 0
				const litStart = i
				while (i < data.length && litLen < 128) {
					// Check if next bytes would benefit from RLE
					let nextRun = 1
					while (i + nextRun < data.length && nextRun < 3 && data[i + nextRun] === data[i]) {
						nextRun++
					}
					if (nextRun >= 3) break

					litLen++
					i++
				}

				// count = litLen - 1 (count < 128)
				result.push(litLen - 1)
				for (let j = 0; j < litLen; j++) {
					result.push(data[litStart + j]!)
				}
			}
		}

		return new Uint8Array(result)
	}

	describe('isPsd', () => {
		it('should identify PSD files', () => {
			const psd = createTestPsd(4, 4)
			expect(isPsd(psd)).toBe(true)
		})

		it('should reject non-PSD files', () => {
			expect(isPsd(new Uint8Array([0, 0, 0, 0]))).toBe(false)
			expect(isPsd(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false) // PNG
		})

		it('should handle short data', () => {
			expect(isPsd(new Uint8Array([]))).toBe(false)
			expect(isPsd(new Uint8Array([0x38]))).toBe(false)
		})
	})

	describe('parsePsd', () => {
		it('should parse PSD header', () => {
			const psd = createTestPsd(16, 8)
			const info = parsePsd(psd)

			expect(info.header.signature).toBe('8BPS')
			expect(info.header.version).toBe(1)
			expect(info.header.width).toBe(16)
			expect(info.header.height).toBe(8)
			expect(info.header.depth).toBe(8)
			expect(info.header.colorMode).toBe(PsdColorMode.RGB)
			expect(info.header.channels).toBe(3)
		})

		it('should detect alpha channel', () => {
			const psdNoAlpha = createTestPsd(4, 4, { channels: 3 })
			const psdWithAlpha = createTestPsd(4, 4, { channels: 4 })

			expect(parsePsd(psdNoAlpha).hasAlpha).toBe(false)
			expect(parsePsd(psdWithAlpha).hasAlpha).toBe(true)
		})
	})

	describe('decodePsd', () => {
		it('should decode RAW RGB PSD', () => {
			const psd = createTestPsd(8, 8, { compression: PsdCompression.RAW })
			const img = decodePsd(psd)

			expect(img.width).toBe(8)
			expect(img.height).toBe(8)
			expect(img.data.length).toBe(8 * 8 * 4)

			// Check that pixels are in valid range
			for (let i = 0; i < img.data.length; i++) {
				expect(img.data[i]).toBeGreaterThanOrEqual(0)
				expect(img.data[i]).toBeLessThanOrEqual(255)
			}
		})

		it('should decode RLE RGB PSD', () => {
			const psd = createTestPsd(8, 8, { compression: PsdCompression.RLE })
			const img = decodePsd(psd)

			expect(img.width).toBe(8)
			expect(img.height).toBe(8)
			expect(img.data.length).toBe(8 * 8 * 4)
		})

		it('should decode Grayscale PSD', () => {
			const psd = createTestPsd(8, 8, {
				colorMode: PsdColorMode.GRAYSCALE,
				channels: 1,
			})
			const img = decodePsd(psd)

			expect(img.width).toBe(8)
			expect(img.height).toBe(8)

			// Check grayscale conversion (R = G = B)
			for (let i = 0; i < 8 * 8; i++) {
				const r = img.data[i * 4]!
				const g = img.data[i * 4 + 1]!
				const b = img.data[i * 4 + 2]!
				expect(r).toBe(g)
				expect(g).toBe(b)
			}
		})

		it('should handle various image sizes', () => {
			const sizes = [
				[1, 1],
				[4, 4],
				[16, 8],
				[7, 13],
			]

			for (const [w, h] of sizes) {
				const psd = createTestPsd(w!, h!)
				const img = decodePsd(psd)

				expect(img.width).toBe(w)
				expect(img.height).toBe(h)
			}
		})

		it('should decode 16-bit PSD', () => {
			const psd = createTestPsd(4, 4, { depth: 16 })
			const img = decodePsd(psd)

			expect(img.width).toBe(4)
			expect(img.height).toBe(4)

			// Output should be 8-bit
			for (let i = 0; i < img.data.length; i++) {
				expect(img.data[i]).toBeGreaterThanOrEqual(0)
				expect(img.data[i]).toBeLessThanOrEqual(255)
			}
		})

		it('should decode PSD with alpha', () => {
			const psd = createTestPsd(4, 4, { channels: 4 })
			const img = decodePsd(psd)

			expect(img.width).toBe(4)
			expect(img.height).toBe(4)

			// Alpha channel should have values
			for (let i = 0; i < 4 * 4; i++) {
				expect(img.data[i * 4 + 3]).toBeGreaterThanOrEqual(0)
				expect(img.data[i * 4 + 3]).toBeLessThanOrEqual(255)
			}
		})
	})
})
