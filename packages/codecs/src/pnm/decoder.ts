import type { ImageData } from '@mconv/core'
import { PnmFormat, type PnmHeader, getChannels, isAsciiFormat } from './types'

/**
 * Decode PNM (PBM/PGM/PPM) to ImageData
 */
export function decodePnm(data: Uint8Array): ImageData {
	const { header, dataOffset } = parseHeader(data)
	const { width, height, maxVal, format } = header

	if (width === 0 || height === 0) {
		throw new Error('Invalid PNM dimensions')
	}

	const output = new Uint8Array(width * height * 4)
	const channels = getChannels(format)

	if (isAsciiFormat(format)) {
		decodeAscii(data, dataOffset, output, width, height, channels, maxVal, format)
	} else {
		decodeBinary(data, dataOffset, output, width, height, channels, maxVal, format)
	}

	return { width, height, data: output }
}

/**
 * Parse PNM header
 */
function parseHeader(data: Uint8Array): { header: PnmHeader; dataOffset: number } {
	const text = new TextDecoder('ascii').decode(data)

	// Find magic number
	const magicMatch = text.match(/^(P[1-7])/)
	if (!magicMatch) {
		throw new Error('Invalid PNM: missing magic number')
	}

	const format = magicMatch[1] as PnmFormat
	let pos = 2

	// Skip whitespace and comments
	const skipWhitespaceAndComments = () => {
		while (pos < text.length) {
			if (text[pos] === '#') {
				// Skip comment line
				while (pos < text.length && text[pos] !== '\n') pos++
				pos++ // Skip newline
			} else if (/\s/.test(text[pos]!)) {
				pos++
			} else {
				break
			}
		}
	}

	// Read a number
	const readNumber = (): number => {
		skipWhitespaceAndComments()
		let numStr = ''
		while (pos < text.length && /\d/.test(text[pos]!)) {
			numStr += text[pos]
			pos++
		}
		return Number.parseInt(numStr, 10)
	}

	const width = readNumber()
	const height = readNumber()

	// PBM doesn't have maxVal
	let maxVal = 1
	if (format !== PnmFormat.PBM_ASCII && format !== PnmFormat.PBM_BINARY) {
		maxVal = readNumber()
	}

	// For binary formats, skip exactly one whitespace character
	if (
		format === PnmFormat.PBM_BINARY ||
		format === PnmFormat.PGM_BINARY ||
		format === PnmFormat.PPM_BINARY
	) {
		pos++ // Skip single whitespace
	} else {
		skipWhitespaceAndComments()
	}

	return {
		header: { format, width, height, maxVal },
		dataOffset: pos,
	}
}

/**
 * Decode ASCII format
 */
function decodeAscii(
	data: Uint8Array,
	offset: number,
	output: Uint8Array,
	width: number,
	height: number,
	channels: number,
	maxVal: number,
	format: PnmFormat
): void {
	const text = new TextDecoder('ascii').decode(data.slice(offset))
	const values = text.match(/\d+/g)?.map(Number) ?? []

	let valIdx = 0
	let outIdx = 0

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (format === PnmFormat.PBM_ASCII) {
				// PBM: 1 = black, 0 = white
				const val = values[valIdx++] ?? 0
				const color = val === 0 ? 255 : 0
				output[outIdx++] = color
				output[outIdx++] = color
				output[outIdx++] = color
				output[outIdx++] = 255
			} else if (channels === 1) {
				// PGM: grayscale
				const val = values[valIdx++] ?? 0
				const gray = Math.round((val / maxVal) * 255)
				output[outIdx++] = gray
				output[outIdx++] = gray
				output[outIdx++] = gray
				output[outIdx++] = 255
			} else {
				// PPM: RGB
				const r = Math.round(((values[valIdx++] ?? 0) / maxVal) * 255)
				const g = Math.round(((values[valIdx++] ?? 0) / maxVal) * 255)
				const b = Math.round(((values[valIdx++] ?? 0) / maxVal) * 255)
				output[outIdx++] = r
				output[outIdx++] = g
				output[outIdx++] = b
				output[outIdx++] = 255
			}
		}
	}
}

/**
 * Decode binary format
 */
function decodeBinary(
	data: Uint8Array,
	offset: number,
	output: Uint8Array,
	width: number,
	height: number,
	channels: number,
	maxVal: number,
	format: PnmFormat
): void {
	let srcIdx = offset
	let outIdx = 0
	const bytesPerSample = maxVal > 255 ? 2 : 1

	if (format === PnmFormat.PBM_BINARY) {
		// PBM binary: packed bits, MSB first
		for (let y = 0; y < height; y++) {
			let bitPos = 0
			let currentByte = data[srcIdx++] ?? 0

			for (let x = 0; x < width; x++) {
				if (bitPos === 8) {
					currentByte = data[srcIdx++] ?? 0
					bitPos = 0
				}

				const bit = (currentByte >> (7 - bitPos)) & 1
				const color = bit === 0 ? 255 : 0 // 0 = white, 1 = black

				output[outIdx++] = color
				output[outIdx++] = color
				output[outIdx++] = color
				output[outIdx++] = 255

				bitPos++
			}
		}
	} else if (channels === 1) {
		// PGM binary
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let val: number
				if (bytesPerSample === 2) {
					val = (data[srcIdx]! << 8) | data[srcIdx + 1]!
					srcIdx += 2
				} else {
					val = data[srcIdx++]!
				}

				const gray = Math.round((val / maxVal) * 255)
				output[outIdx++] = gray
				output[outIdx++] = gray
				output[outIdx++] = gray
				output[outIdx++] = 255
			}
		}
	} else {
		// PPM binary
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				let r: number
				let g: number
				let b: number

				if (bytesPerSample === 2) {
					r = (data[srcIdx]! << 8) | data[srcIdx + 1]!
					srcIdx += 2
					g = (data[srcIdx]! << 8) | data[srcIdx + 1]!
					srcIdx += 2
					b = (data[srcIdx]! << 8) | data[srcIdx + 1]!
					srcIdx += 2
				} else {
					r = data[srcIdx++]!
					g = data[srcIdx++]!
					b = data[srcIdx++]!
				}

				output[outIdx++] = Math.round((r / maxVal) * 255)
				output[outIdx++] = Math.round((g / maxVal) * 255)
				output[outIdx++] = Math.round((b / maxVal) * 255)
				output[outIdx++] = 255
			}
		}
	}
}
