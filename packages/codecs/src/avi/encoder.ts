/**
 * AVI (Audio Video Interleave) encoder
 * Creates AVI files with MJPEG or raw video
 */

import type { ImageData } from '@mconv/core'
import { encodeJpeg } from '../jpeg'
import {
	AVIH_MAGIC,
	AVI_MAGIC,
	AviStreamType,
	AviVideoCodec,
	HDRL_MAGIC,
	IDX1_MAGIC,
	LIST_MAGIC,
	MOVI_MAGIC,
	RIFF_MAGIC,
	STRF_MAGIC,
	STRH_MAGIC,
	STRL_MAGIC,
	type AviEncodeOptions,
} from './types'

/**
 * Encode frames to AVI
 */
export function encodeAvi(frames: ImageData[], options: AviEncodeOptions = {}): Uint8Array {
	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const { frameRate = 30, videoCodec = 'MJPG', jpegQuality = 85 } = options

	const firstFrame = frames[0]!
	const width = firstFrame.width
	const height = firstFrame.height

	// Encode video frames
	const encodedFrames: Uint8Array[] = []
	const isMjpeg = videoCodec === 'MJPG' || videoCodec === AviVideoCodec.MJPG

	for (const frame of frames) {
		if (isMjpeg) {
			encodedFrames.push(encodeJpeg(frame, { quality: jpegQuality }))
		} else {
			encodedFrames.push(encodeRawFrame(frame))
		}
	}

	// Build AVI structure
	const chunks: Uint8Array[] = []

	// Build hdrl LIST
	const hdrl = buildHdrl(width, height, frameRate, frames.length, isMjpeg)
	chunks.push(hdrl)

	// Build movi LIST
	const { movi, index } = buildMovi(encodedFrames)
	chunks.push(movi)

	// Build idx1 (index)
	chunks.push(buildIdx1(index))

	// Calculate total data size (excluding RIFF header)
	const dataSize = 4 + chunks.reduce((sum, chunk) => sum + chunk.length, 0) // 4 for 'AVI '

	// Build final RIFF container
	const output = new Uint8Array(8 + dataSize)
	writeU32LE(output, 0, RIFF_MAGIC)
	writeU32LE(output, 4, dataSize)
	writeU32LE(output, 8, AVI_MAGIC)

	let offset = 12
	for (const chunk of chunks) {
		output.set(chunk, offset)
		offset += chunk.length
	}

	return output
}

/**
 * Build hdrl LIST
 */
function buildHdrl(
	width: number,
	height: number,
	frameRate: number,
	totalFrames: number,
	isMjpeg: boolean
): Uint8Array {
	const microSecPerFrame = Math.round(1000000 / frameRate)

	// Build avih chunk
	const avih = new Uint8Array(8 + 56)
	writeU32LE(avih, 0, AVIH_MAGIC)
	writeU32LE(avih, 4, 56) // size
	writeU32LE(avih, 8, microSecPerFrame)
	writeU32LE(avih, 12, 0) // maxBytesPerSec
	writeU32LE(avih, 16, 0) // paddingGranularity
	writeU32LE(avih, 20, 0x10) // flags: AVIF_HASINDEX
	writeU32LE(avih, 24, totalFrames)
	writeU32LE(avih, 28, 0) // initialFrames
	writeU32LE(avih, 32, 1) // streams
	writeU32LE(avih, 36, 0) // suggestedBufferSize
	writeU32LE(avih, 40, width)
	writeU32LE(avih, 44, height)
	// Reserved (16 bytes)

	// Build strl LIST (video stream)
	const strh = buildStrh(frameRate, totalFrames, width, height)
	const strf = buildStrf(width, height, isMjpeg)

	const strlDataSize = 4 + strh.length + strf.length // 'strl' + chunks
	const strl = new Uint8Array(8 + strlDataSize)
	writeU32LE(strl, 0, LIST_MAGIC)
	writeU32LE(strl, 4, strlDataSize)
	writeU32LE(strl, 8, STRL_MAGIC)
	strl.set(strh, 12)
	strl.set(strf, 12 + strh.length)

	// Build hdrl LIST
	const hdrlDataSize = 4 + avih.length + strl.length // 'hdrl' + chunks
	const hdrl = new Uint8Array(8 + hdrlDataSize)
	writeU32LE(hdrl, 0, LIST_MAGIC)
	writeU32LE(hdrl, 4, hdrlDataSize)
	writeU32LE(hdrl, 8, HDRL_MAGIC)
	hdrl.set(avih, 12)
	hdrl.set(strl, 12 + avih.length)

	return hdrl
}

/**
 * Build strh (stream header) chunk
 */
function buildStrh(
	frameRate: number,
	totalFrames: number,
	width: number,
	height: number
): Uint8Array {
	const strh = new Uint8Array(8 + 56)
	writeU32LE(strh, 0, STRH_MAGIC)
	writeU32LE(strh, 4, 56) // size

	// Type 'vids'
	strh[8] = 0x76 // v
	strh[9] = 0x69 // i
	strh[10] = 0x64 // d
	strh[11] = 0x73 // s

	// Handler 'MJPG'
	strh[12] = 0x4d // M
	strh[13] = 0x4a // J
	strh[14] = 0x50 // P
	strh[15] = 0x47 // G

	writeU32LE(strh, 16, 0) // flags
	writeU16LE(strh, 20, 0) // priority
	writeU16LE(strh, 22, 0) // language
	writeU32LE(strh, 24, 0) // initialFrames
	writeU32LE(strh, 28, 1) // scale
	writeU32LE(strh, 32, frameRate) // rate
	writeU32LE(strh, 36, 0) // start
	writeU32LE(strh, 40, totalFrames) // length
	writeU32LE(strh, 44, 0) // suggestedBufferSize
	writeU32LE(strh, 48, 10000) // quality
	writeU32LE(strh, 52, 0) // sampleSize
	writeI16LE(strh, 56, 0) // frame.left
	writeI16LE(strh, 58, 0) // frame.top
	writeI16LE(strh, 60, width) // frame.right
	writeI16LE(strh, 62, height) // frame.bottom

	return strh
}

/**
 * Build strf (stream format) chunk - BITMAPINFOHEADER
 */
function buildStrf(width: number, height: number, isMjpeg: boolean): Uint8Array {
	const strf = new Uint8Array(8 + 40)
	writeU32LE(strf, 0, STRF_MAGIC)
	writeU32LE(strf, 4, 40) // size

	writeU32LE(strf, 8, 40) // biSize
	writeI32LE(strf, 12, width) // biWidth
	writeI32LE(strf, 16, height) // biHeight
	writeU16LE(strf, 20, 1) // biPlanes
	writeU16LE(strf, 22, 24) // biBitCount
	if (isMjpeg) {
		// 'MJPG' little-endian
		strf[24] = 0x4d
		strf[25] = 0x4a
		strf[26] = 0x50
		strf[27] = 0x47
	} else {
		writeU32LE(strf, 24, 0) // biCompression (uncompressed)
	}
	writeU32LE(strf, 28, width * height * 3) // biSizeImage
	writeI32LE(strf, 32, 0) // biXPelsPerMeter
	writeI32LE(strf, 36, 0) // biYPelsPerMeter
	writeU32LE(strf, 40, 0) // biClrUsed
	writeU32LE(strf, 44, 0) // biClrImportant

	return strf
}

/**
 * Build movi LIST
 */
function buildMovi(frames: Uint8Array[]): { movi: Uint8Array; index: Array<{ offset: number; size: number }> } {
	const index: Array<{ offset: number; size: number }> = []

	// Calculate total size
	let moviDataSize = 4 // 'movi'
	for (const frame of frames) {
		moviDataSize += 8 + frame.length // chunk header + data
		if (frame.length % 2 === 1) moviDataSize++ // padding
	}

	const movi = new Uint8Array(8 + moviDataSize)
	writeU32LE(movi, 0, LIST_MAGIC)
	writeU32LE(movi, 4, moviDataSize)
	writeU32LE(movi, 8, MOVI_MAGIC)

	let offset = 12
	let moviRelOffset = 4 // Offset relative to 'movi' (for index)

	for (const frame of frames) {
		// Write chunk type '00dc' (video compressed)
		movi[offset] = 0x30 // '0'
		movi[offset + 1] = 0x30 // '0'
		movi[offset + 2] = 0x64 // 'd'
		movi[offset + 3] = 0x63 // 'c'
		writeU32LE(movi, offset + 4, frame.length)
		movi.set(frame, offset + 8)

		index.push({ offset: moviRelOffset, size: frame.length })

		offset += 8 + frame.length
		moviRelOffset += 8 + frame.length
		if (frame.length % 2 === 1) {
			offset++
			moviRelOffset++
		}
	}

	return { movi, index }
}

/**
 * Build idx1 (index) chunk
 */
function buildIdx1(index: Array<{ offset: number; size: number }>): Uint8Array {
	const idx1 = new Uint8Array(8 + index.length * 16)
	writeU32LE(idx1, 0, IDX1_MAGIC)
	writeU32LE(idx1, 4, index.length * 16)

	let offset = 8
	for (const entry of index) {
		// Chunk ID '00dc'
		idx1[offset] = 0x30
		idx1[offset + 1] = 0x30
		idx1[offset + 2] = 0x64
		idx1[offset + 3] = 0x63
		writeU32LE(idx1, offset + 4, 0x10) // flags: AVIIF_KEYFRAME
		writeU32LE(idx1, offset + 8, entry.offset)
		writeU32LE(idx1, offset + 12, entry.size)
		offset += 16
	}

	return idx1
}

/**
 * Encode raw BGR frame
 */
function encodeRawFrame(image: ImageData): Uint8Array {
	const { width, height, data } = image
	const output = new Uint8Array(width * height * 3)

	// Convert RGBA to BGR, bottom-up
	for (let y = 0; y < height; y++) {
		const srcY = height - 1 - y
		for (let x = 0; x < width; x++) {
			const srcIdx = (srcY * width + x) * 4
			const dstIdx = (y * width + x) * 3

			output[dstIdx] = data[srcIdx + 2]! // B
			output[dstIdx + 1] = data[srcIdx + 1]! // G
			output[dstIdx + 2] = data[srcIdx]! // R
		}
	}

	return output
}

// Binary writing helpers (little-endian)
function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

function writeI16LE(data: Uint8Array, offset: number, value: number): void {
	writeU16LE(data, offset, value < 0 ? value + 0x10000 : value)
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

function writeI32LE(data: Uint8Array, offset: number, value: number): void {
	writeU32LE(data, offset, value < 0 ? value + 0x100000000 : value)
}
