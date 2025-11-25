/**
 * AVI (Audio Video Interleave) decoder
 * Parses RIFF AVI container and extracts streams
 */

import type { ImageData } from '@mconv/core'
import { decodeJpeg } from '../jpeg'
import {
	AVIH_MAGIC,
	AVI_MAGIC,
	AviStreamType,
	HDRL_MAGIC,
	IDX1_MAGIC,
	LIST_MAGIC,
	MOVI_MAGIC,
	RIFF_MAGIC,
	STRF_MAGIC,
	STRH_MAGIC,
	STRL_MAGIC,
	type AviBitmapInfo,
	type AviInfo,
	type AviMainHeader,
	type AviStream,
	type AviStreamHeader,
	type AviVideo,
	type AviWaveFormat,
} from './types'

/**
 * Check if data is an AVI file
 */
export function isAvi(data: Uint8Array): boolean {
	if (data.length < 12) return false
	const riff = readU32LE(data, 0)
	const avi = readU32LE(data, 8)
	return riff === RIFF_MAGIC && avi === AVI_MAGIC
}

/**
 * Parse AVI header info
 */
export function parseAviInfo(data: Uint8Array): AviInfo {
	if (!isAvi(data)) {
		throw new Error('Invalid AVI: bad magic number')
	}

	const mainHeader = parseMainHeader(data)
	const streams = parseStreams(data)

	// Find video stream
	const videoStream = streams.find((s) => s.isVideo)
	const audioStream = streams.find((s) => !s.isVideo)

	const width = videoStream ? (videoStream.format as AviBitmapInfo).width : mainHeader.width
	const height = videoStream
		? Math.abs((videoStream.format as AviBitmapInfo).height)
		: mainHeader.height
	const frameRate = videoStream ? videoStream.header.rate / videoStream.header.scale : 30

	return {
		mainHeader,
		streams,
		width,
		height,
		frameRate,
		totalFrames: mainHeader.totalFrames,
		duration: mainHeader.totalFrames / frameRate,
		hasAudio: audioStream !== undefined,
		audioSampleRate: audioStream ? (audioStream.format as AviWaveFormat).samplesPerSec : undefined,
		audioChannels: audioStream ? (audioStream.format as AviWaveFormat).channels : undefined,
	}
}

/**
 * Decode AVI file
 */
export function decodeAvi(data: Uint8Array): AviVideo {
	const info = parseAviInfo(data)
	const { videoFrames, audioData } = extractStreams(data, info)

	return { info, videoFrames, audioData }
}

/**
 * Decode AVI video frames to RGBA
 */
export function decodeAviFrames(data: Uint8Array): ImageData[] {
	const video = decodeAvi(data)
	const frames: ImageData[] = []

	// Find video stream to get codec
	const videoStream = video.info.streams.find((s) => s.isVideo)
	if (!videoStream) {
		throw new Error('No video stream found')
	}

	const compression = (videoStream.format as AviBitmapInfo).compression
	const isMjpeg =
		compression === 0x47504a4d || // 'MJPG'
		compression === 0x67706a6d // 'mjpg'

	for (const frameData of video.videoFrames) {
		if (frameData.length === 0) continue

		if (isMjpeg) {
			// Decode JPEG frame
			const frame = decodeJpeg(frameData)
			frames.push(frame)
		} else if (compression === 0) {
			// Uncompressed RGB
			const frame = decodeRawFrame(
				frameData,
				(videoStream.format as AviBitmapInfo).width,
				(videoStream.format as AviBitmapInfo).height,
				(videoStream.format as AviBitmapInfo).bitCount
			)
			frames.push(frame)
		}
	}

	return frames
}

/**
 * Get a specific frame as RGBA
 */
export function decodeAviFrame(data: Uint8Array, frameIndex: number): ImageData {
	const video = decodeAvi(data)

	if (frameIndex < 0 || frameIndex >= video.videoFrames.length) {
		throw new Error(`Invalid frame index: ${frameIndex}`)
	}

	const videoStream = video.info.streams.find((s) => s.isVideo)
	if (!videoStream) {
		throw new Error('No video stream found')
	}

	const frameData = video.videoFrames[frameIndex]!
	const compression = (videoStream.format as AviBitmapInfo).compression
	const isMjpeg = compression === 0x47504a4d || compression === 0x67706a6d

	if (isMjpeg) {
		return decodeJpeg(frameData)
	} else if (compression === 0) {
		return decodeRawFrame(
			frameData,
			(videoStream.format as AviBitmapInfo).width,
			(videoStream.format as AviBitmapInfo).height,
			(videoStream.format as AviBitmapInfo).bitCount
		)
	}

	throw new Error(`Unsupported codec: ${compression.toString(16)}`)
}

/**
 * Parse main header (avih chunk)
 */
function parseMainHeader(data: Uint8Array): AviMainHeader {
	// Find hdrl LIST
	const hdrlOffset = findChunk(data, 12, LIST_MAGIC, HDRL_MAGIC)
	if (hdrlOffset < 0) {
		throw new Error('Invalid AVI: missing hdrl')
	}

	// Find avih in hdrl
	const avihOffset = findChunk(data, hdrlOffset + 12, AVIH_MAGIC)
	if (avihOffset < 0) {
		throw new Error('Invalid AVI: missing avih')
	}

	const offset = avihOffset + 8 // Skip chunk header

	return {
		microSecPerFrame: readU32LE(data, offset),
		maxBytesPerSec: readU32LE(data, offset + 4),
		paddingGranularity: readU32LE(data, offset + 8),
		flags: readU32LE(data, offset + 12),
		totalFrames: readU32LE(data, offset + 16),
		initialFrames: readU32LE(data, offset + 20),
		streams: readU32LE(data, offset + 24),
		suggestedBufferSize: readU32LE(data, offset + 28),
		width: readU32LE(data, offset + 32),
		height: readU32LE(data, offset + 36),
	}
}

/**
 * Parse stream headers
 */
function parseStreams(data: Uint8Array): AviStream[] {
	const streams: AviStream[] = []

	// Find hdrl LIST
	const hdrlOffset = findChunk(data, 12, LIST_MAGIC, HDRL_MAGIC)
	if (hdrlOffset < 0) return streams

	const hdrlSize = readU32LE(data, hdrlOffset + 4)
	const hdrlEnd = hdrlOffset + 8 + hdrlSize

	// Find all strl LISTs
	let offset = hdrlOffset + 12
	while (offset < hdrlEnd) {
		const chunkType = readU32LE(data, offset)
		const chunkSize = readU32LE(data, offset + 4)

		if (chunkType === LIST_MAGIC) {
			const listType = readU32LE(data, offset + 8)
			if (listType === STRL_MAGIC) {
				const stream = parseStreamList(data, offset)
				if (stream) streams.push(stream)
			}
		}

		offset += 8 + chunkSize
		if (chunkSize % 2 === 1) offset++ // Word alignment
	}

	return streams
}

/**
 * Parse a single stream list (strl)
 */
function parseStreamList(data: Uint8Array, listOffset: number): AviStream | null {
	const listSize = readU32LE(data, listOffset + 4)
	const listEnd = listOffset + 8 + listSize

	let header: AviStreamHeader | null = null
	let format: AviBitmapInfo | AviWaveFormat | null = null
	let isVideo = false

	let offset = listOffset + 12 // Skip LIST header + 'strl'
	while (offset < listEnd) {
		const chunkType = readU32LE(data, offset)
		const chunkSize = readU32LE(data, offset + 4)

		if (chunkType === STRH_MAGIC) {
			header = parseStreamHeader(data, offset + 8)
			isVideo = header.type === AviStreamType.VIDEO
		} else if (chunkType === STRF_MAGIC) {
			if (isVideo) {
				format = parseBitmapInfo(data, offset + 8)
			} else {
				format = parseWaveFormat(data, offset + 8)
			}
		}

		offset += 8 + chunkSize
		if (chunkSize % 2 === 1) offset++ // Word alignment
	}

	if (!header || !format) return null

	return { header, format, isVideo, chunks: [] }
}

/**
 * Parse stream header (strh)
 */
function parseStreamHeader(data: Uint8Array, offset: number): AviStreamHeader {
	return {
		type: String.fromCharCode(
			data[offset]!,
			data[offset + 1]!,
			data[offset + 2]!,
			data[offset + 3]!
		),
		handler: readU32LE(data, offset + 4),
		flags: readU32LE(data, offset + 8),
		priority: readU16LE(data, offset + 12),
		language: readU16LE(data, offset + 14),
		initialFrames: readU32LE(data, offset + 16),
		scale: readU32LE(data, offset + 20),
		rate: readU32LE(data, offset + 24),
		start: readU32LE(data, offset + 28),
		length: readU32LE(data, offset + 32),
		suggestedBufferSize: readU32LE(data, offset + 36),
		quality: readU32LE(data, offset + 40),
		sampleSize: readU32LE(data, offset + 44),
		frame: {
			left: readI16LE(data, offset + 48),
			top: readI16LE(data, offset + 50),
			right: readI16LE(data, offset + 52),
			bottom: readI16LE(data, offset + 54),
		},
	}
}

/**
 * Parse BITMAPINFOHEADER
 */
function parseBitmapInfo(data: Uint8Array, offset: number): AviBitmapInfo {
	return {
		size: readU32LE(data, offset),
		width: readI32LE(data, offset + 4),
		height: readI32LE(data, offset + 8),
		planes: readU16LE(data, offset + 12),
		bitCount: readU16LE(data, offset + 14),
		compression: readU32LE(data, offset + 16),
		sizeImage: readU32LE(data, offset + 20),
		xPelsPerMeter: readI32LE(data, offset + 24),
		yPelsPerMeter: readI32LE(data, offset + 28),
		clrUsed: readU32LE(data, offset + 32),
		clrImportant: readU32LE(data, offset + 36),
	}
}

/**
 * Parse WAVEFORMATEX
 */
function parseWaveFormat(data: Uint8Array, offset: number): AviWaveFormat {
	return {
		formatTag: readU16LE(data, offset),
		channels: readU16LE(data, offset + 2),
		samplesPerSec: readU32LE(data, offset + 4),
		avgBytesPerSec: readU32LE(data, offset + 8),
		blockAlign: readU16LE(data, offset + 12),
		bitsPerSample: readU16LE(data, offset + 14),
	}
}

/**
 * Extract video and audio data from movi chunk
 */
function extractStreams(
	data: Uint8Array,
	info: AviInfo
): { videoFrames: Uint8Array[]; audioData?: Uint8Array } {
	const videoFrames: Uint8Array[] = []
	const audioChunks: Uint8Array[] = []

	// Find movi LIST
	const moviOffset = findChunk(data, 12, LIST_MAGIC, MOVI_MAGIC)
	if (moviOffset < 0) {
		return { videoFrames }
	}

	const moviSize = readU32LE(data, moviOffset + 4)
	const moviEnd = moviOffset + 8 + moviSize

	let offset = moviOffset + 12 // Skip LIST header + 'movi'
	while (offset < moviEnd) {
		const chunkType = readU32LE(data, offset)
		const chunkSize = readU32LE(data, offset + 4)

		// Chunk types are like '00dc' (video), '00db' (video uncompressed), '01wb' (audio)
		const typeStr = String.fromCharCode(
			chunkType & 0xff,
			(chunkType >> 8) & 0xff,
			(chunkType >> 16) & 0xff,
			(chunkType >> 24) & 0xff
		)

		if (typeStr.endsWith('dc') || typeStr.endsWith('db')) {
			// Video chunk
			videoFrames.push(data.slice(offset + 8, offset + 8 + chunkSize))
		} else if (typeStr.endsWith('wb')) {
			// Audio chunk
			audioChunks.push(data.slice(offset + 8, offset + 8 + chunkSize))
		}

		offset += 8 + chunkSize
		if (chunkSize % 2 === 1) offset++ // Word alignment
	}

	// Combine audio chunks
	let audioData: Uint8Array | undefined
	if (audioChunks.length > 0) {
		const totalAudioSize = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
		audioData = new Uint8Array(totalAudioSize)
		let audioOffset = 0
		for (const chunk of audioChunks) {
			audioData.set(chunk, audioOffset)
			audioOffset += chunk.length
		}
	}

	return { videoFrames, audioData }
}

/**
 * Find a RIFF chunk
 */
function findChunk(
	data: Uint8Array,
	startOffset: number,
	chunkType: number,
	listType?: number
): number {
	let offset = startOffset

	while (offset < data.length - 8) {
		const type = readU32LE(data, offset)
		const size = readU32LE(data, offset + 4)

		if (type === chunkType) {
			if (listType !== undefined) {
				if (readU32LE(data, offset + 8) === listType) {
					return offset
				}
			} else {
				return offset
			}
		}

		offset += 8 + size
		if (size % 2 === 1) offset++ // Word alignment
	}

	return -1
}

/**
 * Decode raw RGB frame
 */
function decodeRawFrame(
	data: Uint8Array,
	width: number,
	height: number,
	bitCount: number
): ImageData {
	const output = new Uint8Array(width * height * 4)
	const absHeight = Math.abs(height)
	const bottomUp = height > 0

	for (let y = 0; y < absHeight; y++) {
		const srcY = bottomUp ? absHeight - 1 - y : y

		for (let x = 0; x < width; x++) {
			const dstIdx = (y * width + x) * 4
			let r: number, g: number, b: number

			if (bitCount === 24) {
				const srcIdx = (srcY * width + x) * 3
				b = data[srcIdx]!
				g = data[srcIdx + 1]!
				r = data[srcIdx + 2]!
			} else if (bitCount === 32) {
				const srcIdx = (srcY * width + x) * 4
				b = data[srcIdx]!
				g = data[srcIdx + 1]!
				r = data[srcIdx + 2]!
			} else {
				r = g = b = 0
			}

			output[dstIdx] = r
			output[dstIdx + 1] = g
			output[dstIdx + 2] = b
			output[dstIdx + 3] = 255
		}
	}

	return { width, height: absHeight, data: output }
}

// Binary reading helpers (little-endian)
function readU16LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

function readI16LE(data: Uint8Array, offset: number): number {
	const u = readU16LE(data, offset)
	return u > 0x7fff ? u - 0x10000 : u
}

function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	) >>> 0
}

function readI32LE(data: Uint8Array, offset: number): number {
	const u = readU32LE(data, offset)
	return u > 0x7fffffff ? u - 0x100000000 : u
}
