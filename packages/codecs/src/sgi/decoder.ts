/**
 * SGI (Silicon Graphics Image) decoder
 * Supports uncompressed and RLE compressed formats
 */

import type { ImageData } from '@mconv/core'
import { SGI_MAGIC, SGI_RLE, SGI_VERBATIM } from './types'

/**
 * Decode SGI image to RGBA
 */
export function decodeSgi(data: Uint8Array): ImageData {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	// Read header (512 bytes)
	const magic = view.getUint16(0, false) // Big-endian
	if (magic !== SGI_MAGIC) {
		throw new Error('Invalid SGI file: wrong magic number')
	}

	const storage = data[2]! // 0 = verbatim, 1 = RLE
	const bpc = data[3]! // Bytes per channel (1 or 2)
	const dimension = view.getUint16(4, false)
	const width = view.getUint16(6, false)
	const height = view.getUint16(8, false)
	const channels = view.getUint16(10, false)

	if (bpc !== 1) {
		throw new Error(`Unsupported SGI bytes per channel: ${bpc}`)
	}

	if (width === 0 || height === 0) {
		throw new Error('Invalid SGI dimensions')
	}

	// Decode based on storage type
	let channelData: Uint8Array[]

	if (storage === SGI_VERBATIM) {
		channelData = decodeVerbatim(data, width, height, channels)
	} else if (storage === SGI_RLE) {
		channelData = decodeRLE(data, view, width, height, channels)
	} else {
		throw new Error(`Unsupported SGI storage type: ${storage}`)
	}

	// Convert to RGBA
	const pixels = new Uint8Array(width * height * 4)

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// SGI stores rows bottom-to-top
			const srcY = height - 1 - y
			const srcIdx = srcY * width + x
			const dstIdx = (y * width + x) * 4

			pixels[dstIdx] = channelData[0]?.[srcIdx] ?? 0 // R
			pixels[dstIdx + 1] =
				channels >= 2 ? (channelData[1]?.[srcIdx] ?? 0) : (channelData[0]?.[srcIdx] ?? 0) // G
			pixels[dstIdx + 2] =
				channels >= 3 ? (channelData[2]?.[srcIdx] ?? 0) : (channelData[0]?.[srcIdx] ?? 0) // B
			pixels[dstIdx + 3] = channels >= 4 ? (channelData[3]?.[srcIdx] ?? 255) : 255 // A
		}
	}

	return { width, height, data: pixels }
}

/**
 * Decode verbatim (uncompressed) SGI
 */
function decodeVerbatim(
	data: Uint8Array,
	width: number,
	height: number,
	channels: number
): Uint8Array[] {
	const channelData: Uint8Array[] = []
	const channelSize = width * height
	let pos = 512 // After header

	for (let c = 0; c < channels; c++) {
		const channel = new Uint8Array(channelSize)
		for (let i = 0; i < channelSize; i++) {
			channel[i] = data[pos++]!
		}
		channelData.push(channel)
	}

	return channelData
}

/**
 * Decode RLE compressed SGI
 */
function decodeRLE(
	data: Uint8Array,
	view: DataView,
	width: number,
	height: number,
	channels: number
): Uint8Array[] {
	// Read offset and length tables
	const tableEntries = height * channels
	const startTable: number[] = []
	const lengthTable: number[] = []

	let tablePos = 512
	for (let i = 0; i < tableEntries; i++) {
		startTable.push(view.getUint32(tablePos, false))
		tablePos += 4
	}
	for (let i = 0; i < tableEntries; i++) {
		lengthTable.push(view.getUint32(tablePos, false))
		tablePos += 4
	}

	// Decode each channel
	const channelData: Uint8Array[] = []

	for (let c = 0; c < channels; c++) {
		const channel = new Uint8Array(width * height)

		for (let y = 0; y < height; y++) {
			const tableIdx = c * height + y
			const offset = startTable[tableIdx]!
			const rowData = decodeScanline(data, offset, width)

			for (let x = 0; x < width; x++) {
				channel[y * width + x] = rowData[x]!
			}
		}

		channelData.push(channel)
	}

	return channelData
}

/**
 * Decode a single RLE scanline
 */
function decodeScanline(data: Uint8Array, offset: number, width: number): Uint8Array {
	const row = new Uint8Array(width)
	let pos = offset
	let x = 0

	while (x < width) {
		const byte = data[pos++]!
		let count = byte & 0x7f

		if (count === 0) break

		if (byte & 0x80) {
			// Literal run
			while (count-- > 0 && x < width) {
				row[x++] = data[pos++]!
			}
		} else {
			// Repeat run
			const value = data[pos++]!
			while (count-- > 0 && x < width) {
				row[x++] = value
			}
		}
	}

	return row
}
