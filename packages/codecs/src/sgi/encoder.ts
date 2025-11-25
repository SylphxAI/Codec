/**
 * SGI (Silicon Graphics Image) encoder
 * Supports uncompressed and RLE compressed formats
 */

import type { ImageData } from '@sylphx/codec-core'
import { type SGIEncodeOptions, SGI_MAGIC, SGI_NORMAL, SGI_RLE, SGI_VERBATIM } from './types'

/**
 * Encode image to SGI format
 */
export function encodeSgi(image: ImageData, options: SGIEncodeOptions = {}): Uint8Array {
	const { width, height, data } = image
	const compress = options.compress ?? false
	const channels = 4 // Always output RGBA

	// Convert to channel-separated format (bottom-to-top)
	const channelData: Uint8Array[] = []
	for (let c = 0; c < channels; c++) {
		const channel = new Uint8Array(width * height)
		for (let y = 0; y < height; y++) {
			const srcY = height - 1 - y // Flip vertically
			for (let x = 0; x < width; x++) {
				const srcIdx = (srcY * width + x) * 4 + c
				const dstIdx = y * width + x
				channel[dstIdx] = data[srcIdx]!
			}
		}
		channelData.push(channel)
	}

	if (compress) {
		return encodeRLE(width, height, channels, channelData)
	}
	return encodeVerbatim(width, height, channels, channelData)
}

/**
 * Encode uncompressed SGI
 */
function encodeVerbatim(
	width: number,
	height: number,
	channels: number,
	channelData: Uint8Array[]
): Uint8Array {
	const headerSize = 512
	const dataSize = width * height * channels
	const output = new Uint8Array(headerSize + dataSize)
	const view = new DataView(output.buffer)

	// Write header
	writeHeader(view, width, height, channels, SGI_VERBATIM)

	// Write channel data
	let pos = 512
	for (let c = 0; c < channels; c++) {
		const channel = channelData[c]!
		for (let i = 0; i < channel.length; i++) {
			output[pos++] = channel[i]!
		}
	}

	return output
}

/**
 * Encode RLE compressed SGI
 */
function encodeRLE(
	width: number,
	height: number,
	channels: number,
	channelData: Uint8Array[]
): Uint8Array {
	// Compress each scanline
	const compressedRows: Uint8Array[][] = []
	for (let c = 0; c < channels; c++) {
		const channelRows: Uint8Array[] = []
		for (let y = 0; y < height; y++) {
			const rowStart = y * width
			const rowData = channelData[c]!.subarray(rowStart, rowStart + width)
			channelRows.push(compressScanline(rowData))
		}
		compressedRows.push(channelRows)
	}

	// Calculate sizes
	const tableEntries = height * channels
	const headerSize = 512
	const tablesSize = tableEntries * 4 * 2 // Start and length tables

	let dataOffset = headerSize + tablesSize
	const startTable: number[] = []
	const lengthTable: number[] = []

	for (let c = 0; c < channels; c++) {
		for (let y = 0; y < height; y++) {
			const rowData = compressedRows[c]![y]!
			startTable.push(dataOffset)
			lengthTable.push(rowData.length)
			dataOffset += rowData.length
		}
	}

	// Write output
	const output = new Uint8Array(dataOffset)
	const view = new DataView(output.buffer)

	// Write header
	writeHeader(view, width, height, channels, SGI_RLE)

	// Write offset and length tables
	let tablePos = 512
	for (const offset of startTable) {
		view.setUint32(tablePos, offset, false)
		tablePos += 4
	}
	for (const length of lengthTable) {
		view.setUint32(tablePos, length, false)
		tablePos += 4
	}

	// Write compressed data
	let pos = headerSize + tablesSize
	for (let c = 0; c < channels; c++) {
		for (let y = 0; y < height; y++) {
			const rowData = compressedRows[c]![y]!
			output.set(rowData, pos)
			pos += rowData.length
		}
	}

	return output
}

/**
 * Write SGI header
 */
function writeHeader(
	view: DataView,
	width: number,
	height: number,
	channels: number,
	storage: number
): void {
	view.setUint16(0, SGI_MAGIC, false) // Magic
	view.setUint8(2, storage) // Storage type
	view.setUint8(3, 1) // Bytes per channel
	view.setUint16(4, channels > 1 ? 3 : 2, false) // Dimension
	view.setUint16(6, width, false) // Width
	view.setUint16(8, height, false) // Height
	view.setUint16(10, channels, false) // Channels
	view.setUint32(12, 0, false) // Min pixel value
	view.setUint32(16, 255, false) // Max pixel value
	// Bytes 20-83: dummy (zeros)
	// Bytes 84-103: image name (zeros)
	view.setUint32(104, SGI_NORMAL, false) // Colormap ID
	// Rest of header is zeros
}

/**
 * Compress a single scanline using RLE
 */
function compressScanline(row: Uint8Array): Uint8Array {
	const output: number[] = []
	let i = 0

	while (i < row.length) {
		// Look for repeat run
		let runLength = 1
		while (i + runLength < row.length && runLength < 127 && row[i + runLength] === row[i]) {
			runLength++
		}

		if (runLength >= 3) {
			// Repeat run
			output.push(runLength) // Count without high bit = repeat
			output.push(row[i]!)
			i += runLength
		} else {
			// Literal run
			let litLength = 1
			while (i + litLength < row.length && litLength < 127) {
				// Check if next 3 bytes are same (would be better as repeat)
				if (
					i + litLength + 2 < row.length &&
					row[i + litLength] === row[i + litLength + 1] &&
					row[i + litLength] === row[i + litLength + 2]
				) {
					break
				}
				litLength++
			}

			output.push(litLength | 0x80) // Count with high bit = literal
			for (let j = 0; j < litLength; j++) {
				output.push(row[i + j]!)
			}
			i += litLength
		}
	}

	output.push(0) // End marker

	return new Uint8Array(output)
}
