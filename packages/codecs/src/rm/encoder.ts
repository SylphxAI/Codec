/**
 * RealMedia (RM/RMVB) encoder
 * Creates RealMedia files with RealVideo streams
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	CONT_MAGIC,
	DATA_MAGIC,
	MDPR_MAGIC,
	PROP_MAGIC,
	RealVideoCodec,
	RM_MAGIC,
	RmStreamType,
	type RmEncodeOptions,
} from './types'

/**
 * Encode frames to RealMedia
 * Note: This is a simplified encoder that creates valid RM container structure
 * but uses placeholder video data (actual RealVideo encoding is proprietary)
 */
export function encodeRm(frames: ImageData[], options: RmEncodeOptions = {}): Uint8Array {
	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const {
		frameRate = 30,
		videoCodec = 'RV40',
		bitrate = 500,
		title,
		author,
		copyright,
		comment,
	} = options

	const firstFrame = frames[0]!
	const width = firstFrame.width
	const height = firstFrame.height

	// Calculate durations
	const duration = Math.round((frames.length / frameRate) * 1000) // milliseconds
	const preroll = 0

	// Encode video packets (placeholder - real RealVideo encoding is proprietary)
	const videoPackets: Array<{ timestamp: number; data: Uint8Array }> = []
	for (let i = 0; i < frames.length; i++) {
		const timestamp = Math.round((i / frameRate) * 1000)
		// In real implementation, frames would be compressed using RealVideo codec
		// For now, use placeholder data
		const packetData = encodeFramePlaceholder(frames[i]!, videoCodec)
		videoPackets.push({ timestamp, data: packetData })
	}

	// Calculate bitrates
	const totalDataSize = videoPackets.reduce((sum, p) => sum + p.data.length, 0)
	const avgBitRate = Math.round((totalDataSize * 8) / (duration / 1000))
	const maxBitRate = Math.round(avgBitRate * 1.5)

	// Build chunks
	const chunks: Uint8Array[] = []

	// .RMF header
	chunks.push(buildFileHeader(4)) // 4 chunks: PROP, MDPR, CONT, DATA

	// PROP chunk
	chunks.push(
		buildProperties({
			maxBitRate,
			avgBitRate,
			maxPacketSize: Math.max(...videoPackets.map((p) => p.data.length)),
			avgPacketSize: Math.round(totalDataSize / videoPackets.length),
			numPackets: videoPackets.length,
			duration,
			preroll,
			numStreams: 1,
		})
	)

	// MDPR chunk (video stream)
	chunks.push(
		buildMediaProperties({
			streamNumber: 0,
			maxBitRate,
			avgBitRate,
			maxPacketSize: Math.max(...videoPackets.map((p) => p.data.length)),
			avgPacketSize: Math.round(totalDataSize / videoPackets.length),
			startTime: 0,
			preroll,
			duration,
			streamName: 'Video Stream',
			mimeType: 'video/x-pn-realvideo',
			width,
			height,
			frameRate: frameRate << 16, // Fixed-point
			codec: typeof videoCodec === 'string' ? RealVideoCodec[videoCodec] : videoCodec,
		})
	)

	// CONT chunk (optional metadata)
	if (title || author || copyright || comment) {
		chunks.push(
			buildContentDescription({
				title: title ?? '',
				author: author ?? '',
				copyright: copyright ?? '',
				comment: comment ?? '',
			})
		)
	}

	// DATA chunk
	chunks.push(buildData(videoPackets))

	// Combine all chunks
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
	const output = new Uint8Array(totalSize)

	let offset = 0
	for (const chunk of chunks) {
		output.set(chunk, offset)
		offset += chunk.length
	}

	return output
}

/**
 * Build .RMF file header
 */
function buildFileHeader(numHeaders: number): Uint8Array {
	const header = new Uint8Array(18)
	writeU32BE(header, 0, RM_MAGIC)
	writeU32BE(header, 4, 10) // size (size of data after this field)
	writeU16BE(header, 8, 0) // version
	writeU32BE(header, 10, 0) // file version
	writeU32BE(header, 14, numHeaders)
	return header
}

/**
 * Build PROP chunk
 */
function buildProperties(props: {
	maxBitRate: number
	avgBitRate: number
	maxPacketSize: number
	avgPacketSize: number
	numPackets: number
	duration: number
	preroll: number
	numStreams: number
}): Uint8Array {
	const chunk = new Uint8Array(8 + 50)
	writeU32BE(chunk, 0, PROP_MAGIC)
	writeU32BE(chunk, 4, 50) // size

	writeU32BE(chunk, 8, props.maxBitRate)
	writeU32BE(chunk, 12, props.avgBitRate)
	writeU32BE(chunk, 16, props.maxPacketSize)
	writeU32BE(chunk, 20, props.avgPacketSize)
	writeU32BE(chunk, 24, props.numPackets)
	writeU32BE(chunk, 28, props.duration)
	writeU32BE(chunk, 32, props.preroll)
	writeU32BE(chunk, 36, 0) // index offset (no index)
	writeU32BE(chunk, 40, 0) // data offset (calculated later)
	writeU16BE(chunk, 44, props.numStreams)
	writeU16BE(chunk, 46, 0x02) // flags: save enabled

	return chunk
}

/**
 * Build MDPR chunk (media properties)
 */
function buildMediaProperties(props: {
	streamNumber: number
	maxBitRate: number
	avgBitRate: number
	maxPacketSize: number
	avgPacketSize: number
	startTime: number
	preroll: number
	duration: number
	streamName: string
	mimeType: string
	width: number
	height: number
	frameRate: number
	codec: number
}): Uint8Array {
	// Build type-specific data (video)
	const typeSpecific = buildVideoSpecific({
		codec: props.codec,
		width: props.width,
		height: props.height,
		frameRate: props.frameRate,
		bitsPerPixel: 24,
	})

	const streamNameBytes = new TextEncoder().encode(props.streamName)
	const mimeTypeBytes = new TextEncoder().encode(props.mimeType)

	const dataSize =
		30 + // fixed fields
		1 +
		streamNameBytes.length +
		1 +
		mimeTypeBytes.length +
		4 +
		typeSpecific.length

	const chunk = new Uint8Array(8 + dataSize)
	writeU32BE(chunk, 0, MDPR_MAGIC)
	writeU32BE(chunk, 4, dataSize)

	let offset = 8
	writeU16BE(chunk, offset, props.streamNumber)
	offset += 2
	writeU32BE(chunk, offset, props.maxBitRate)
	offset += 4
	writeU32BE(chunk, offset, props.avgBitRate)
	offset += 4
	writeU32BE(chunk, offset, props.maxPacketSize)
	offset += 4
	writeU32BE(chunk, offset, props.avgPacketSize)
	offset += 4
	writeU32BE(chunk, offset, props.startTime)
	offset += 4
	writeU32BE(chunk, offset, props.preroll)
	offset += 4
	writeU32BE(chunk, offset, props.duration)
	offset += 4

	chunk[offset] = streamNameBytes.length
	offset += 1
	chunk.set(streamNameBytes, offset)
	offset += streamNameBytes.length

	chunk[offset] = mimeTypeBytes.length
	offset += 1
	chunk.set(mimeTypeBytes, offset)
	offset += mimeTypeBytes.length

	writeU32BE(chunk, offset, typeSpecific.length)
	offset += 4
	chunk.set(typeSpecific, offset)

	return chunk
}

/**
 * Build video-specific data
 */
function buildVideoSpecific(props: {
	codec: number
	width: number
	height: number
	frameRate: number
	bitsPerPixel: number
}): Uint8Array {
	const data = new Uint8Array(26)

	writeU32BE(data, 0, 26) // size
	writeU32BE(data, 4, props.codec)
	writeU16BE(data, 8, props.width)
	writeU16BE(data, 10, props.height)
	writeU16BE(data, 12, props.bitsPerPixel)
	writeU16BE(data, 14, 0) // padding
	writeU32BE(data, 16, props.frameRate)

	return data
}

/**
 * Build CONT chunk (content description)
 */
function buildContentDescription(desc: {
	title: string
	author: string
	copyright: string
	comment: string
}): Uint8Array {
	const titleBytes = new TextEncoder().encode(desc.title)
	const authorBytes = new TextEncoder().encode(desc.author)
	const copyrightBytes = new TextEncoder().encode(desc.copyright)
	const commentBytes = new TextEncoder().encode(desc.comment)

	const dataSize = 2 + titleBytes.length + 2 + authorBytes.length + 2 + copyrightBytes.length + 2 + commentBytes.length

	const chunk = new Uint8Array(8 + dataSize)
	writeU32BE(chunk, 0, CONT_MAGIC)
	writeU32BE(chunk, 4, dataSize)

	let offset = 8

	writeU16BE(chunk, offset, titleBytes.length)
	offset += 2
	chunk.set(titleBytes, offset)
	offset += titleBytes.length

	writeU16BE(chunk, offset, authorBytes.length)
	offset += 2
	chunk.set(authorBytes, offset)
	offset += authorBytes.length

	writeU16BE(chunk, offset, copyrightBytes.length)
	offset += 2
	chunk.set(copyrightBytes, offset)
	offset += copyrightBytes.length

	writeU16BE(chunk, offset, commentBytes.length)
	offset += 2
	chunk.set(commentBytes, offset)

	return chunk
}

/**
 * Build DATA chunk
 */
function buildData(packets: Array<{ timestamp: number; data: Uint8Array }>): Uint8Array {
	// Calculate total size
	let dataSize = 8 // num_packets + next_data_header
	for (const packet of packets) {
		dataSize += 12 + packet.data.length // packet header + data
	}

	const chunk = new Uint8Array(8 + dataSize)
	writeU32BE(chunk, 0, DATA_MAGIC)
	writeU32BE(chunk, 4, dataSize)

	let offset = 8
	writeU32BE(chunk, offset, packets.length)
	offset += 4
	writeU32BE(chunk, offset, 0) // next data header
	offset += 4

	for (let i = 0; i < packets.length; i++) {
		const packet = packets[i]!

		writeU16BE(chunk, offset, 0) // version
		offset += 2
		writeU16BE(chunk, offset, packet.data.length)
		offset += 2
		writeU16BE(chunk, offset, 0) // stream number
		offset += 2
		writeU32BE(chunk, offset, packet.timestamp)
		offset += 4
		chunk[offset] = 0 // reserved
		offset += 1
		chunk[offset] = i === 0 ? 0x02 : 0x00 // flags (keyframe for first)
		offset += 1

		chunk.set(packet.data, offset)
		offset += packet.data.length
	}

	return chunk
}

/**
 * Encode frame to placeholder data
 * Real RealVideo encoding is proprietary and not implemented here
 */
function encodeFramePlaceholder(frame: ImageData, codec: string | number): Uint8Array {
	// This is a placeholder that creates minimal valid packet data
	// Real RealVideo encoding would:
	// 1. Convert RGBA to YUV
	// 2. Apply codec-specific compression (RV30/RV40)
	// 3. Create proper packet structure

	const { width, height, data } = frame

	// Create simple placeholder (uncompressed downsampled data)
	// In reality, this would be heavily compressed
	const packetSize = Math.min(1024, Math.floor((width * height) / 16))
	const packet = new Uint8Array(packetSize)

	// Fill with some frame data to make it non-empty
	for (let i = 0; i < packetSize; i++) {
		packet[i] = data[i * 4] ?? 0
	}

	return packet
}

// Binary writing helpers (big-endian)
function writeU16BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 8) & 0xff
	data[offset + 1] = value & 0xff
}

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
}
