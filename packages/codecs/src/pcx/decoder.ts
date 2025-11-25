import type { ImageData } from '@mconv/core'
import { PCX_SIGNATURE, PcxEncoding, type PcxHeader, getColorDepth, getDimensions } from './types'

/**
 * Decode PCX to ImageData
 */
export function decodePcx(data: Uint8Array): ImageData {
	const header = readHeader(data)
	const { width, height } = getDimensions(header)

	if (width <= 0 || height <= 0) {
		throw new Error('Invalid PCX dimensions')
	}

	const colorDepth = getColorDepth(header)
	const output = new Uint8Array(width * height * 4)

	// Decode image data (starts at byte 128)
	let srcPos = 128
	const scanlineSize = header.bytesPerLine * header.numPlanes
	const scanline = new Uint8Array(scanlineSize)

	for (let y = 0; y < height; y++) {
		// Decode one scanline
		srcPos = decodeScanline(data, srcPos, scanline, header)

		// Convert scanline to RGBA
		convertScanline(scanline, output, y, width, header, data)
	}

	return { width, height, data: output }
}

/**
 * Read PCX header
 */
function readHeader(data: Uint8Array): PcxHeader {
	if (data.length < 128) {
		throw new Error('Invalid PCX: too small')
	}

	if (data[0] !== PCX_SIGNATURE) {
		throw new Error('Invalid PCX: bad signature')
	}

	return {
		signature: data[0]!,
		version: data[1]!,
		encoding: data[2]!,
		bitsPerPixel: data[3]!,
		xMin: data[4]! | (data[5]! << 8),
		yMin: data[6]! | (data[7]! << 8),
		xMax: data[8]! | (data[9]! << 8),
		yMax: data[10]! | (data[11]! << 8),
		hDpi: data[12]! | (data[13]! << 8),
		vDpi: data[14]! | (data[15]! << 8),
		palette: data.slice(16, 64),
		reserved1: data[64]!,
		numPlanes: data[65]!,
		bytesPerLine: data[66]! | (data[67]! << 8),
		paletteType: data[68]! | (data[69]! << 8),
		hScreenSize: data[70]! | (data[71]! << 8),
		vScreenSize: data[72]! | (data[73]! << 8),
	}
}

/**
 * Decode RLE-compressed scanline
 */
function decodeScanline(
	data: Uint8Array,
	startPos: number,
	scanline: Uint8Array,
	header: PcxHeader
): number {
	let dstPos = 0
	let srcPos = startPos
	const targetSize = header.bytesPerLine * header.numPlanes

	if (header.encoding === PcxEncoding.RLE) {
		while (dstPos < targetSize && srcPos < data.length) {
			const byte = data[srcPos++]!

			if ((byte & 0xc0) === 0xc0) {
				// RLE run
				const count = byte & 0x3f
				const value = data[srcPos++]!
				for (let i = 0; i < count && dstPos < targetSize; i++) {
					scanline[dstPos++] = value
				}
			} else {
				// Single byte
				scanline[dstPos++] = byte
			}
		}
	} else {
		// No compression
		for (let i = 0; i < targetSize && srcPos < data.length; i++) {
			scanline[dstPos++] = data[srcPos++]!
		}
	}

	return srcPos
}

/**
 * Convert scanline to RGBA pixels
 */
function convertScanline(
	scanline: Uint8Array,
	output: Uint8Array,
	y: number,
	width: number,
	header: PcxHeader,
	fullData: Uint8Array
): void {
	const colorDepth = getColorDepth(header)
	const outOffset = y * width * 4

	if (colorDepth === 24) {
		// 24-bit true color (3 planes of 8 bits each)
		for (let x = 0; x < width; x++) {
			output[outOffset + x * 4] = scanline[x]! // R
			output[outOffset + x * 4 + 1] = scanline[header.bytesPerLine + x]! // G
			output[outOffset + x * 4 + 2] = scanline[header.bytesPerLine * 2 + x]! // B
			output[outOffset + x * 4 + 3] = 255
		}
	} else if (colorDepth === 32) {
		// 32-bit true color with alpha (4 planes of 8 bits each)
		for (let x = 0; x < width; x++) {
			output[outOffset + x * 4] = scanline[x]! // R
			output[outOffset + x * 4 + 1] = scanline[header.bytesPerLine + x]! // G
			output[outOffset + x * 4 + 2] = scanline[header.bytesPerLine * 2 + x]! // B
			output[outOffset + x * 4 + 3] = scanline[header.bytesPerLine * 3 + x]! // A
		}
	} else if (colorDepth === 8 && header.numPlanes === 1) {
		// 8-bit indexed color - check for 256-color palette at end
		const paletteOffset = fullData.length - 769

		if (paletteOffset > 128 && fullData[paletteOffset] === 0x0c) {
			// Use 256-color palette
			const palette = fullData.slice(paletteOffset + 1)

			for (let x = 0; x < width; x++) {
				const idx = scanline[x]!
				output[outOffset + x * 4] = palette[idx * 3]!
				output[outOffset + x * 4 + 1] = palette[idx * 3 + 1]!
				output[outOffset + x * 4 + 2] = palette[idx * 3 + 2]!
				output[outOffset + x * 4 + 3] = 255
			}
		} else {
			// Use header palette (16 colors)
			for (let x = 0; x < width; x++) {
				const idx = scanline[x]! & 0x0f
				output[outOffset + x * 4] = header.palette[idx * 3]!
				output[outOffset + x * 4 + 1] = header.palette[idx * 3 + 1]!
				output[outOffset + x * 4 + 2] = header.palette[idx * 3 + 2]!
				output[outOffset + x * 4 + 3] = 255
			}
		}
	} else if (colorDepth === 8 && header.numPlanes === 4) {
		// 8-bit grayscale or 4-plane indexed
		for (let x = 0; x < width; x++) {
			const gray = scanline[x]!
			output[outOffset + x * 4] = gray
			output[outOffset + x * 4 + 1] = gray
			output[outOffset + x * 4 + 2] = gray
			output[outOffset + x * 4 + 3] = 255
		}
	} else if (colorDepth === 4) {
		// 4-bit indexed (16 colors from header palette)
		for (let x = 0; x < width; x++) {
			const byteIdx = Math.floor(x / 2)
			const nibble = x % 2 === 0 ? (scanline[byteIdx]! >> 4) & 0x0f : scanline[byteIdx]! & 0x0f

			output[outOffset + x * 4] = header.palette[nibble * 3]!
			output[outOffset + x * 4 + 1] = header.palette[nibble * 3 + 1]!
			output[outOffset + x * 4 + 2] = header.palette[nibble * 3 + 2]!
			output[outOffset + x * 4 + 3] = 255
		}
	} else if (colorDepth === 1) {
		// 1-bit monochrome
		for (let x = 0; x < width; x++) {
			const byteIdx = Math.floor(x / 8)
			const bitIdx = 7 - (x % 8)
			const bit = (scanline[byteIdx]! >> bitIdx) & 1
			const color = bit ? 255 : 0

			output[outOffset + x * 4] = color
			output[outOffset + x * 4 + 1] = color
			output[outOffset + x * 4 + 2] = color
			output[outOffset + x * 4 + 3] = 255
		}
	} else {
		// Fallback: treat as grayscale
		for (let x = 0; x < width; x++) {
			const gray = scanline[x] ?? 0
			output[outOffset + x * 4] = gray
			output[outOffset + x * 4 + 1] = gray
			output[outOffset + x * 4 + 2] = gray
			output[outOffset + x * 4 + 3] = 255
		}
	}
}
