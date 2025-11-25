/**
 * WMV (Windows Media Video) encoder
 * Creates ASF container with WMV video
 */

import type { VideoData, ImageData } from '@sylphx/codec-core'
import { encodeJpeg } from '../jpeg'
import {
	ASF_GUID,
	ASF_STREAM_TYPE,
	WmvVideoCodec,
	type GUID,
	type WmvEncodeOptions,
} from './types'

/**
 * Encode VideoData to WMV
 */
export function encodeWmvVideo(video: VideoData, options: WmvEncodeOptions = {}): Uint8Array {
	if (video.frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const { frameRate = video.fps || 30, bitrate = 1000000 } = options

	// Extract frames as ImageData
	const frames: ImageData[] = video.frames.map((f) => f.image)

	return encodeWmv(frames, { ...options, frameRate, bitrate })
}

/**
 * Encode frames to WMV
 */
export function encodeWmv(frames: ImageData[], options: WmvEncodeOptions = {}): Uint8Array {
	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const { frameRate = 30, videoCodec = 'WMV3', bitrate = 1000000 } = options

	const firstFrame = frames[0]!
	const width = firstFrame.width
	const height = firstFrame.height

	// Encode video frames as MJPEG (placeholder for actual WMV encoding)
	// Real WMV encoding requires WMV codec implementation
	const encodedFrames: Uint8Array[] = []
	for (const frame of frames) {
		encodedFrames.push(encodeJpeg(frame, { quality: 85 }))
	}

	// Build ASF structure
	const fileId = generateGuid()
	const durationIn100ns = BigInt(Math.round((frames.length / frameRate) * 10000000))

	// Build header
	const header = buildHeader(width, height, frameRate, frames.length, durationIn100ns, fileId, bitrate)

	// Build data object
	const dataObj = buildDataObject(encodedFrames, fileId)

	// Combine all parts
	const totalSize = header.length + dataObj.length
	const output = new Uint8Array(totalSize)
	output.set(header, 0)
	output.set(dataObj, header.length)

	return output
}

/**
 * Build ASF Header Object
 */
function buildHeader(
	width: number,
	height: number,
	frameRate: number,
	frameCount: number,
	duration: bigint,
	fileId: GUID,
	bitrate: number
): Uint8Array {
	// Build sub-objects
	const fileProps = buildFileProperties(frameCount, duration, fileId, bitrate)
	const streamProps = buildStreamProperties(width, height)

	// Calculate header size
	const headerDataSize = 6 + fileProps.length + streamProps.length // 6 = numObjects(4) + reserved(2)
	const headerSize = 16 + 8 + headerDataSize // GUID + size + data

	const header = new Uint8Array(headerSize)
	let offset = 0

	// Write Header Object GUID
	header.set(ASF_GUID.HEADER, offset)
	offset += 16

	// Write header size
	writeU64LE(header, offset, BigInt(headerSize))
	offset += 8

	// Write number of header objects
	writeU32LE(header, offset, 2) // File Properties + Stream Properties
	offset += 4

	// Write reserved bytes
	header[offset++] = 1
	header[offset++] = 2

	// Write sub-objects
	header.set(fileProps, offset)
	offset += fileProps.length

	header.set(streamProps, offset)

	return header
}

/**
 * Build File Properties Object
 */
function buildFileProperties(
	frameCount: number,
	duration: bigint,
	fileId: GUID,
	bitrate: number
): Uint8Array {
	const size = 16 + 8 + 80 // GUID + size + data
	const obj = new Uint8Array(size)
	let offset = 0

	// GUID
	obj.set(ASF_GUID.FILE_PROPERTIES, offset)
	offset += 16

	// Size
	writeU64LE(obj, offset, BigInt(size))
	offset += 8

	// File ID
	obj.set(fileId, offset)
	offset += 16

	// File size (placeholder - will be incorrect)
	writeU64LE(obj, offset, 0n)
	offset += 8

	// Creation date (Windows FILETIME - January 1, 2024)
	writeU64LE(obj, offset, 133480032000000000n)
	offset += 8

	// Data packets count
	writeU64LE(obj, offset, BigInt(frameCount))
	offset += 8

	// Play duration (100-nanosecond units)
	writeU64LE(obj, offset, duration)
	offset += 8

	// Send duration
	writeU64LE(obj, offset, duration)
	offset += 8

	// Preroll (milliseconds)
	writeU64LE(obj, offset, 0n)
	offset += 8

	// Flags (broadcast: 0x01, seekable: 0x02)
	writeU32LE(obj, offset, 0x02)
	offset += 4

	// Min/max data packet size
	const packetSize = 8192
	writeU32LE(obj, offset, packetSize)
	offset += 4
	writeU32LE(obj, offset, packetSize)
	offset += 4

	// Max bitrate
	writeU32LE(obj, offset, bitrate)

	return obj
}

/**
 * Build Stream Properties Object
 */
function buildStreamProperties(width: number, height: number): Uint8Array {
	// Build BITMAPINFOHEADER
	const bitmapInfo = buildBitmapInfo(width, height)

	const dataSize = 16 + 16 + 8 + 4 + 4 + 2 + 4 + bitmapInfo.length // stream type + error correction + time offset + lengths + flags + reserved + bitmap
	const size = 16 + 8 + dataSize
	const obj = new Uint8Array(size)
	let offset = 0

	// GUID
	obj.set(ASF_GUID.STREAM_PROPERTIES, offset)
	offset += 16

	// Size
	writeU64LE(obj, offset, BigInt(size))
	offset += 8

	// Stream type (Video)
	obj.set(ASF_STREAM_TYPE.VIDEO, offset)
	offset += 16

	// Error correction type (no error correction)
	const noErrorCorrection = new Uint8Array(16)
	obj.set(noErrorCorrection, offset)
	offset += 16

	// Time offset
	writeU64LE(obj, offset, 0n)
	offset += 8

	// Type-specific data length
	writeU32LE(obj, offset, bitmapInfo.length)
	offset += 4

	// Error correction data length
	writeU32LE(obj, offset, 0)
	offset += 4

	// Flags (stream number = 1, encrypted = false)
	writeU16LE(obj, offset, 0x0001)
	offset += 2

	// Reserved
	writeU32LE(obj, offset, 0)
	offset += 4

	// Type-specific data (BITMAPINFOHEADER)
	obj.set(bitmapInfo, offset)

	return obj
}

/**
 * Build BITMAPINFOHEADER
 */
function buildBitmapInfo(width: number, height: number): Uint8Array {
	const size = 40
	const info = new Uint8Array(size)
	let offset = 0

	// biSize
	writeU32LE(info, offset, size)
	offset += 4

	// biWidth
	writeI32LE(info, offset, width)
	offset += 4

	// biHeight
	writeI32LE(info, offset, height)
	offset += 4

	// biPlanes
	writeU16LE(info, offset, 1)
	offset += 2

	// biBitCount
	writeU16LE(info, offset, 24)
	offset += 2

	// biCompression (MJPG as placeholder - should be WMV3)
	writeU32LE(info, offset, 0x47504a4d) // 'MJPG'
	offset += 4

	// biSizeImage
	writeU32LE(info, offset, width * height * 3)
	offset += 4

	// biXPelsPerMeter
	writeI32LE(info, offset, 0)
	offset += 4

	// biYPelsPerMeter
	writeI32LE(info, offset, 0)
	offset += 4

	// biClrUsed
	writeU32LE(info, offset, 0)
	offset += 4

	// biClrImportant
	writeU32LE(info, offset, 0)

	return info
}

/**
 * Build ASF Data Object
 */
function buildDataObject(frames: Uint8Array[], fileId: GUID): Uint8Array {
	// Calculate total data size
	let dataSize = 16 + 8 + 26 // GUID + size (always 0 for data object) + file ID + total packets + reserved
	for (const frame of frames) {
		// Simplified packet: error correction (1 byte) + payload flags (1 byte) + frame data
		dataSize += 2 + frame.length
	}

	const obj = new Uint8Array(dataSize)
	let offset = 0

	// Data Object GUID
	obj.set(ASF_GUID.DATA, offset)
	offset += 16

	// Size (always 0 for Data Object, actual size determined by end of file)
	writeU64LE(obj, offset, 0n)
	offset += 8

	// File ID
	obj.set(fileId, offset)
	offset += 16

	// Total data packets
	writeU64LE(obj, offset, BigInt(frames.length))
	offset += 8

	// Reserved
	writeU16LE(obj, offset, 0x0101)
	offset += 2

	// Write packets (simplified)
	for (const frame of frames) {
		// Error correction flags (no error correction)
		obj[offset++] = 0x00

		// Payload parsing flags (single payload, no padding)
		obj[offset++] = 0x00

		// Frame data
		obj.set(frame, offset)
		offset += frame.length
	}

	return obj
}

/**
 * Generate a random GUID
 */
function generateGuid(): GUID {
	const guid = new Uint8Array(16)
	for (let i = 0; i < 16; i++) {
		guid[i] = Math.floor(Math.random() * 256)
	}
	return guid
}

// Binary writing helpers (little-endian)
function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
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

function writeU64LE(data: Uint8Array, offset: number, value: bigint): void {
	const low = Number(value & 0xffffffffn)
	const high = Number(value >> 32n)
	writeU32LE(data, offset, low)
	writeU32LE(data, offset + 4, high)
}
