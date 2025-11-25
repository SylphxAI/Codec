import type { ImageData } from '@mconv/core'
import { lzwDecompress } from './lzw'
import {
	APPLICATION_EXTENSION,
	type ColorTable,
	type DisposalMethod,
	EXTENSION_INTRODUCER,
	GIF87A,
	GIF89A,
	GRAPHIC_CONTROL_EXTENSION,
	type GifFrame,
	type GifImage,
	type GraphicControlExtension,
	IMAGE_SEPARATOR,
	type ImageDescriptor,
	type LogicalScreenDescriptor,
	TRAILER,
} from './types'

/**
 * Decode GIF to ImageData
 * Returns the first frame as RGBA pixels
 */
export function decodeGif(data: Uint8Array): ImageData {
	const gif = parseGif(data)
	return renderFirstFrame(gif)
}

/**
 * Parse complete GIF structure
 */
export function parseGif(data: Uint8Array): GifImage {
	let pos = 0

	// Read header (6 bytes)
	const header = String.fromCharCode(...data.slice(0, 6))
	if (header !== GIF87A && header !== GIF89A) {
		throw new Error('Invalid GIF signature')
	}
	pos = 6

	// Read Logical Screen Descriptor
	const screenDescriptor = readLogicalScreenDescriptor(data, pos)
	pos += 7

	// Read Global Color Table if present
	let globalColorTable: ColorTable | null = null
	if (screenDescriptor.hasGlobalColorTable) {
		const tableSize = 3 * (1 << (screenDescriptor.globalColorTableSize + 1))
		globalColorTable = data.slice(pos, pos + tableSize)
		pos += tableSize
	}

	// Read frames and extensions
	const frames: GifFrame[] = []
	let currentGraphicControl: GraphicControlExtension | null = null

	while (pos < data.length) {
		const introducer = data[pos++]!

		if (introducer === TRAILER) {
			break
		}

		if (introducer === EXTENSION_INTRODUCER) {
			const label = data[pos++]!

			if (label === GRAPHIC_CONTROL_EXTENSION) {
				currentGraphicControl = readGraphicControlExtension(data, pos)
				pos += 6 // Block size (4) + terminator (1) + 1 for block size byte
			} else if (label === APPLICATION_EXTENSION) {
				// Skip application extension (e.g., NETSCAPE for animation)
				pos = skipSubBlocks(data, pos + 1)
			} else {
				// Skip other extensions
				pos = skipSubBlocks(data, pos)
			}
		} else if (introducer === IMAGE_SEPARATOR) {
			const frame = readFrame(data, pos, currentGraphicControl)
			frames.push(frame)
			pos = frame.endPos
			currentGraphicControl = null
		} else {
			throw new Error(`Unknown GIF block type: 0x${introducer.toString(16)}`)
		}
	}

	return {
		version: header,
		screenDescriptor,
		globalColorTable,
		frames,
	}
}

/**
 * Read Logical Screen Descriptor
 */
function readLogicalScreenDescriptor(data: Uint8Array, pos: number): LogicalScreenDescriptor {
	const width = data[pos]! | (data[pos + 1]! << 8)
	const height = data[pos + 2]! | (data[pos + 3]! << 8)
	const packed = data[pos + 4]!

	return {
		width,
		height,
		hasGlobalColorTable: (packed & 0x80) !== 0,
		colorResolution: ((packed >> 4) & 0x07) + 1,
		sortFlag: (packed & 0x08) !== 0,
		globalColorTableSize: packed & 0x07,
		backgroundColorIndex: data[pos + 5]!,
		pixelAspectRatio: data[pos + 6]!,
	}
}

/**
 * Read Graphic Control Extension
 */
function readGraphicControlExtension(data: Uint8Array, pos: number): GraphicControlExtension {
	const blockSize = data[pos]! // Should be 4
	if (blockSize !== 4) {
		throw new Error(`Invalid graphic control block size: ${blockSize}`)
	}

	const packed = data[pos + 1]!
	const delayTime = data[pos + 2]! | (data[pos + 3]! << 8)
	const transparentColorIndex = data[pos + 4]!

	return {
		disposalMethod: ((packed >> 2) & 0x07) as DisposalMethod,
		userInputFlag: (packed & 0x02) !== 0,
		hasTransparency: (packed & 0x01) !== 0,
		delayTime: delayTime * 10, // Convert to milliseconds
		transparentColorIndex,
	}
}

/**
 * Skip sub-blocks until terminator
 */
function skipSubBlocks(data: Uint8Array, startPos: number): number {
	let pos = startPos
	while (pos < data.length) {
		const blockSize = data[pos++]!
		if (blockSize === 0) break
		pos += blockSize
	}
	return pos
}

/**
 * Read a frame's image data
 */
function readFrame(
	data: Uint8Array,
	startPos: number,
	graphicControl: GraphicControlExtension | null
): GifFrame & { endPos: number } {
	let pos = startPos

	// Read Image Descriptor
	const imageDescriptor = readImageDescriptor(data, pos)
	pos += 9

	// Read Local Color Table if present
	let localColorTable: ColorTable | null = null
	if (imageDescriptor.hasLocalColorTable) {
		const tableSize = 3 * (1 << (imageDescriptor.localColorTableSize + 1))
		localColorTable = data.slice(pos, pos + tableSize)
		pos += tableSize
	}

	// Read LZW minimum code size
	const minCodeSize = data[pos++]!

	// Read sub-blocks of compressed data
	const compressedData: number[] = []
	while (pos < data.length) {
		const blockSize = data[pos++]!
		if (blockSize === 0) break
		for (let i = 0; i < blockSize; i++) {
			compressedData.push(data[pos++]!)
		}
	}

	// Decompress image data
	const imageData = lzwDecompress(new Uint8Array(compressedData), minCodeSize)

	return {
		imageDescriptor,
		localColorTable,
		graphicControl,
		imageData,
		endPos: pos,
	}
}

/**
 * Read Image Descriptor
 */
function readImageDescriptor(data: Uint8Array, pos: number): ImageDescriptor {
	const left = data[pos]! | (data[pos + 1]! << 8)
	const top = data[pos + 2]! | (data[pos + 3]! << 8)
	const width = data[pos + 4]! | (data[pos + 5]! << 8)
	const height = data[pos + 6]! | (data[pos + 7]! << 8)
	const packed = data[pos + 8]!

	return {
		left,
		top,
		width,
		height,
		hasLocalColorTable: (packed & 0x80) !== 0,
		interlaced: (packed & 0x40) !== 0,
		sortFlag: (packed & 0x20) !== 0,
		localColorTableSize: packed & 0x07,
	}
}

/**
 * Render first frame to RGBA ImageData
 */
function renderFirstFrame(gif: GifImage): ImageData {
	const { width, height } = gif.screenDescriptor
	const output = new Uint8Array(width * height * 4)

	// Fill with background color
	const bgIndex = gif.screenDescriptor.backgroundColorIndex
	const colorTable = gif.globalColorTable
	if (colorTable && bgIndex * 3 + 2 < colorTable.length) {
		const r = colorTable[bgIndex * 3]!
		const g = colorTable[bgIndex * 3 + 1]!
		const b = colorTable[bgIndex * 3 + 2]!
		for (let i = 0; i < output.length; i += 4) {
			output[i] = r
			output[i + 1] = g
			output[i + 2] = b
			output[i + 3] = 255
		}
	}

	if (gif.frames.length === 0) {
		return { width, height, data: output }
	}

	const frame = gif.frames[0]!
	const { imageDescriptor, localColorTable, graphicControl, imageData } = frame
	const palette = localColorTable ?? gif.globalColorTable

	if (!palette) {
		throw new Error('No color table available')
	}

	const transparentIndex = graphicControl?.hasTransparency
		? graphicControl.transparentColorIndex
		: -1

	// Handle interlacing
	const passStarts = [0, 4, 2, 1]
	const passIncrements = [8, 8, 4, 2]

	let srcIdx = 0
	if (imageDescriptor.interlaced) {
		// Interlaced rendering
		for (let pass = 0; pass < 4; pass++) {
			for (let y = passStarts[pass]!; y < imageDescriptor.height; y += passIncrements[pass]!) {
				for (let x = 0; x < imageDescriptor.width; x++) {
					if (srcIdx >= imageData.length) break
					const colorIdx = imageData[srcIdx++]!
					const destX = imageDescriptor.left + x
					const destY = imageDescriptor.top + y

					if (destX < width && destY < height && colorIdx !== transparentIndex) {
						const destIdx = (destY * width + destX) * 4
						output[destIdx] = palette[colorIdx * 3]!
						output[destIdx + 1] = palette[colorIdx * 3 + 1]!
						output[destIdx + 2] = palette[colorIdx * 3 + 2]!
						output[destIdx + 3] = 255
					}
				}
			}
		}
	} else {
		// Non-interlaced rendering
		for (let y = 0; y < imageDescriptor.height; y++) {
			for (let x = 0; x < imageDescriptor.width; x++) {
				if (srcIdx >= imageData.length) break
				const colorIdx = imageData[srcIdx++]!
				const destX = imageDescriptor.left + x
				const destY = imageDescriptor.top + y

				if (destX < width && destY < height && colorIdx !== transparentIndex) {
					const destIdx = (destY * width + destX) * 4
					output[destIdx] = palette[colorIdx * 3]!
					output[destIdx + 1] = palette[colorIdx * 3 + 1]!
					output[destIdx + 2] = palette[colorIdx * 3 + 2]!
					output[destIdx + 3] = 255
				}
			}
		}
	}

	return { width, height, data: output }
}
