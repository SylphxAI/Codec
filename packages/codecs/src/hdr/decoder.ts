import type { ImageData } from '@sylphx/codec-core'
import { HDR_MAGIC, HDR_MAGIC_ALT, type HdrHeader, rgbeToRgb, toneMap } from './types'

/**
 * Decode HDR (Radiance RGBE) to ImageData
 */
export function decodeHdr(data: Uint8Array): ImageData {
	const header = parseHeader(data)
	const { width, height } = header

	if (width <= 0 || height <= 0) {
		throw new Error('Invalid HDR dimensions')
	}

	const output = new Uint8Array(width * height * 4)

	// Find start of pixel data (after header)
	let offset = findPixelDataStart(data)

	// Decode scanlines
	for (let y = 0; y < height; y++) {
		const scanline = decodeScanline(data, offset, width)
		offset = scanline.nextOffset

		// Convert RGBE to tone-mapped RGB
		for (let x = 0; x < width; x++) {
			const rgbe = {
				r: scanline.data[x * 4]!,
				g: scanline.data[x * 4 + 1]!,
				b: scanline.data[x * 4 + 2]!,
				e: scanline.data[x * 4 + 3]!,
			}

			const rgb = rgbeToRgb(rgbe)
			const outIdx = (y * width + x) * 4

			output[outIdx] = toneMap(rgb.r)
			output[outIdx + 1] = toneMap(rgb.g)
			output[outIdx + 2] = toneMap(rgb.b)
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

/**
 * Parse HDR header
 */
function parseHeader(data: Uint8Array): HdrHeader {
	const text = new TextDecoder('ascii').decode(data.slice(0, Math.min(4096, data.length)))
	const lines = text.split(/\r?\n/)

	// Check magic
	if (!lines[0]?.startsWith(HDR_MAGIC) && !lines[0]?.startsWith(HDR_MAGIC_ALT)) {
		throw new Error('Invalid HDR: bad magic')
	}

	const header: HdrHeader = {
		format: '',
		exposure: 1,
		gamma: 1,
		width: 0,
		height: 0,
	}

	// Parse header fields
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]!

		if (line === '') {
			// Empty line indicates end of header
			continue
		}

		if (line.startsWith('FORMAT=')) {
			header.format = line.substring(7)
		} else if (line.startsWith('EXPOSURE=')) {
			header.exposure = Number.parseFloat(line.substring(9))
		} else if (line.startsWith('GAMMA=')) {
			header.gamma = Number.parseFloat(line.substring(6))
		} else if (line.startsWith('-Y') || line.startsWith('+Y')) {
			// Resolution string: "-Y height +X width" or similar
			const match = line.match(/([+-][YX])\s+(\d+)\s+([+-][YX])\s+(\d+)/)
			if (match) {
				if (match[1] === '-Y' || match[1] === '+Y') {
					header.height = Number.parseInt(match[2]!, 10)
					header.width = Number.parseInt(match[4]!, 10)
				} else {
					header.width = Number.parseInt(match[2]!, 10)
					header.height = Number.parseInt(match[4]!, 10)
				}
			}
			break
		}
	}

	return header
}

/**
 * Find where pixel data starts
 */
function findPixelDataStart(data: Uint8Array): number {
	// Look for resolution string followed by newline
	let pos = 0
	let newlineCount = 0

	while (pos < data.length - 1) {
		if (data[pos] === 0x0a) {
			newlineCount++
			// Check if next line starts with +/- (resolution string)
			if (pos + 1 < data.length && (data[pos + 1] === 0x2b || data[pos + 1] === 0x2d)) {
				// Find end of resolution string
				pos++
				while (pos < data.length && data[pos] !== 0x0a) {
					pos++
				}
				return pos + 1
			}
		}
		pos++
	}

	throw new Error('Invalid HDR: cannot find pixel data')
}

/**
 * Decode a single scanline
 */
function decodeScanline(
	data: Uint8Array,
	offset: number,
	width: number
): { data: Uint8Array; nextOffset: number } {
	const scanline = new Uint8Array(width * 4)

	// Check for new RLE format (starts with 0x02 0x02 width_high width_low)
	if (
		data[offset] === 0x02 &&
		data[offset + 1] === 0x02 &&
		data[offset + 2] === ((width >> 8) & 0xff) &&
		data[offset + 3] === (width & 0xff)
	) {
		// New RLE format - each channel is run-length encoded separately
		let pos = offset + 4

		for (let channel = 0; channel < 4; channel++) {
			let x = 0
			while (x < width && pos < data.length) {
				const byte = data[pos++]!

				if (byte > 128) {
					// RLE run
					const count = byte - 128
					const value = data[pos++]!
					for (let i = 0; i < count && x < width; i++) {
						scanline[x * 4 + channel] = value
						x++
					}
				} else if (byte > 0) {
					// Raw data (count must be > 0)
					const count = byte
					for (let i = 0; i < count && x < width; i++) {
						scanline[x * 4 + channel] = data[pos++]!
						x++
					}
				}
				// Skip byte === 0 (invalid, but prevent infinite loop)
			}
		}

		return { data: scanline, nextOffset: pos }
	}

	// Old format or uncompressed - read 4 bytes per pixel
	let pos = offset
	for (let x = 0; x < width; x++) {
		scanline[x * 4] = data[pos++]!
		scanline[x * 4 + 1] = data[pos++]!
		scanline[x * 4 + 2] = data[pos++]!
		scanline[x * 4 + 3] = data[pos++]!
	}

	return { data: scanline, nextOffset: pos }
}
