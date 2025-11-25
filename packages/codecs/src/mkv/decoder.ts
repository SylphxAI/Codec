/**
 * MKV/WebM (Matroska) decoder
 * EBML-based container format parser
 */

import type { ImageData } from '@mconv/core'
import { decodeJpeg } from '../jpeg'
import {
	EbmlId,
	MkvTrackType,
	type EbmlElement,
	type MkvBlock,
	type MkvCluster,
	type MkvDecodeResult,
	type MkvInfo,
	type MkvTrack,
} from './types'

/**
 * Check if data is MKV/WebM
 */
export function isMkv(data: Uint8Array): boolean {
	if (data.length < 4) return false
	// EBML header starts with 0x1A 0x45 0xDF 0xA3
	return data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3
}

/**
 * Parse MKV info without full decode
 */
export function parseMkvInfo(data: Uint8Array): MkvInfo {
	const result = decodeMkv(data)
	return result.info
}

/**
 * Decode MKV file
 */
export function decodeMkv(data: Uint8Array): MkvDecodeResult {
	const reader = new EbmlReader(data)

	let docType = 'matroska'
	let docTypeVersion = 4
	let timestampScale = 1000000 // Default 1ms
	let duration: number | undefined
	let muxingApp: string | undefined
	let writingApp: string | undefined
	const tracks: MkvTrack[] = []
	const segments: EbmlElement[] = []
	const clusters: MkvCluster[] = []

	// Parse EBML header
	const ebmlHeader = reader.readElement()
	if (!ebmlHeader || ebmlHeader.id !== EbmlId.EBML) {
		throw new Error('Invalid MKV: missing EBML header')
	}

	// Parse EBML header children
	const headerChildren = reader.parseChildren(ebmlHeader)
	for (const child of headerChildren) {
		switch (child.id) {
			case EbmlId.DocType:
				docType = reader.readString(child)
				break
			case EbmlId.DocTypeVersion:
				docTypeVersion = reader.readUint(child)
				break
		}
	}

	// Move past EBML header to Segment
	reader.seek(ebmlHeader.dataOffset + ebmlHeader.size)

	// Parse Segment
	const segment = reader.readElement()
	if (!segment || segment.id !== EbmlId.Segment) {
		throw new Error('Invalid MKV: missing Segment')
	}
	segments.push(segment)

	// Parse segment children
	const segmentEnd = segment.dataOffset + segment.size
	reader.seek(segment.dataOffset)

	while (reader.position < segmentEnd && reader.position < data.length - 4) {
		const element = reader.readElement()
		if (!element) break

		switch (element.id) {
			case EbmlId.Info:
				parseInfo(reader, element, (ts) => (timestampScale = ts), (d) => (duration = d), (m) => (muxingApp = m), (w) => (writingApp = w))
				break

			case EbmlId.Tracks:
				parseTracks(reader, element, tracks)
				break

			case EbmlId.Cluster:
				parseCluster(reader, element, clusters, timestampScale)
				break
		}

		// Move past element after processing
		reader.seek(element.dataOffset + element.size)
	}

	// Find video track for dimensions
	let width = 0
	let height = 0
	let hasVideo = false
	let hasAudio = false

	for (const track of tracks) {
		if (track.type === MkvTrackType.VIDEO && track.video) {
			width = track.video.pixelWidth
			height = track.video.pixelHeight
			hasVideo = true
		}
		if (track.type === MkvTrackType.AUDIO) {
			hasAudio = true
		}
	}

	return {
		info: {
			docType,
			docTypeVersion,
			timestampScale,
			duration,
			muxingApp,
			writingApp,
			tracks,
			width,
			height,
			hasVideo,
			hasAudio,
		},
		segments,
		clusters,
	}
}

/**
 * Decode MKV to RGBA frames
 */
export function decodeMkvFrames(data: Uint8Array): ImageData[] {
	const result = decodeMkv(data)
	const frames: ImageData[] = []

	// Find video track
	const videoTrack = result.info.tracks.find((t) => t.type === MkvTrackType.VIDEO)
	if (!videoTrack) return frames

	// Collect all video blocks
	for (const cluster of result.clusters) {
		for (const block of cluster.blocks) {
			if (block.trackNumber === videoTrack.number) {
				// Decode based on codec
				if (videoTrack.codecId === 'V_MJPEG') {
					try {
						const frame = decodeJpeg(block.data)
						frames.push(frame)
					} catch {
						// Skip invalid frames
					}
				}
			}
		}
	}

	return frames
}

/**
 * Parse Info element
 */
function parseInfo(
	reader: EbmlReader,
	element: EbmlElement,
	setTimestampScale: (v: number) => void,
	setDuration: (v: number) => void,
	setMuxingApp: (v: string) => void,
	setWritingApp: (v: string) => void
): void {
	const children = reader.parseChildren(element)

	for (const child of children) {
		switch (child.id) {
			case EbmlId.TimestampScale:
				setTimestampScale(reader.readUint(child))
				break
			case EbmlId.Duration:
				setDuration(reader.readFloat(child))
				break
			case EbmlId.MuxingApp:
				setMuxingApp(reader.readString(child))
				break
			case EbmlId.WritingApp:
				setWritingApp(reader.readString(child))
				break
		}
	}
}

/**
 * Parse Tracks element
 */
function parseTracks(reader: EbmlReader, element: EbmlElement, tracks: MkvTrack[]): void {
	const children = reader.parseChildren(element)

	for (const child of children) {
		if (child.id === EbmlId.TrackEntry) {
			const track = parseTrackEntry(reader, child)
			if (track) tracks.push(track)
		}
	}
}

/**
 * Parse TrackEntry element
 */
function parseTrackEntry(reader: EbmlReader, element: EbmlElement): MkvTrack | null {
	const track: Partial<MkvTrack> = {}
	const children = reader.parseChildren(element)

	for (const child of children) {
		switch (child.id) {
			case EbmlId.TrackNumber:
				track.number = reader.readUint(child)
				break
			case EbmlId.TrackUID:
				track.uid = reader.readUint(child)
				break
			case EbmlId.TrackType:
				track.type = reader.readUint(child)
				break
			case EbmlId.CodecID:
				track.codecId = reader.readString(child)
				break
			case EbmlId.CodecPrivate:
				track.codecPrivate = reader.readBinary(child)
				break
			case EbmlId.Name:
				track.name = reader.readString(child)
				break
			case EbmlId.Language:
				track.language = reader.readString(child)
				break
			case EbmlId.DefaultDuration:
				track.defaultDuration = reader.readUint(child)
				break
			case EbmlId.Video:
				track.video = parseVideoSettings(reader, child)
				break
			case EbmlId.Audio:
				track.audio = parseAudioSettings(reader, child)
				break
		}
	}

	if (track.number === undefined || track.type === undefined || !track.codecId) {
		return null
	}

	return track as MkvTrack
}

/**
 * Parse Video settings
 */
function parseVideoSettings(
	reader: EbmlReader,
	element: EbmlElement
): { pixelWidth: number; pixelHeight: number; displayWidth?: number; displayHeight?: number } {
	const video = { pixelWidth: 0, pixelHeight: 0 } as {
		pixelWidth: number
		pixelHeight: number
		displayWidth?: number
		displayHeight?: number
	}
	const children = reader.parseChildren(element)

	for (const child of children) {
		switch (child.id) {
			case EbmlId.PixelWidth:
				video.pixelWidth = reader.readUint(child)
				break
			case EbmlId.PixelHeight:
				video.pixelHeight = reader.readUint(child)
				break
			case EbmlId.DisplayWidth:
				video.displayWidth = reader.readUint(child)
				break
			case EbmlId.DisplayHeight:
				video.displayHeight = reader.readUint(child)
				break
		}
	}

	return video
}

/**
 * Parse Audio settings
 */
function parseAudioSettings(
	reader: EbmlReader,
	element: EbmlElement
): { samplingFrequency: number; channels: number; bitDepth?: number } {
	const audio = { samplingFrequency: 8000, channels: 1 } as {
		samplingFrequency: number
		channels: number
		bitDepth?: number
	}
	const children = reader.parseChildren(element)

	for (const child of children) {
		switch (child.id) {
			case EbmlId.SamplingFrequency:
				audio.samplingFrequency = reader.readFloat(child)
				break
			case EbmlId.Channels:
				audio.channels = reader.readUint(child)
				break
			case EbmlId.BitDepth:
				audio.bitDepth = reader.readUint(child)
				break
		}
	}

	return audio
}

/**
 * Parse Cluster element
 */
function parseCluster(
	reader: EbmlReader,
	element: EbmlElement,
	clusters: MkvCluster[],
	timestampScale: number
): void {
	const cluster: MkvCluster = { timestamp: 0, blocks: [] }
	const clusterEnd = element.dataOffset + element.size

	reader.seek(element.dataOffset)

	while (reader.position < clusterEnd && reader.position < reader.data.length - 4) {
		const child = reader.readElement()
		if (!child) break

		switch (child.id) {
			case EbmlId.Timestamp:
				cluster.timestamp = reader.readUint(child)
				break
			case EbmlId.SimpleBlock:
				const block = parseSimpleBlock(reader, child, cluster.timestamp)
				if (block) cluster.blocks.push(block)
				break
			case EbmlId.BlockGroup:
				const blocks = parseBlockGroup(reader, child, cluster.timestamp)
				cluster.blocks.push(...blocks)
				break
		}

		// Always seek past the element
		reader.seek(child.dataOffset + child.size)
	}

	clusters.push(cluster)
}

/**
 * Parse SimpleBlock
 */
function parseSimpleBlock(reader: EbmlReader, element: EbmlElement, clusterTimestamp: number): MkvBlock | null {
	const blockData = reader.readBinary(element)
	if (blockData.length < 4) return null

	// Parse block header
	let pos = 0

	// Track number (VINT)
	const { value: trackNumber, length: trackLen } = readVint(blockData, pos)
	pos += trackLen

	// Timestamp (signed 16-bit, relative to cluster)
	const relativeTimestamp = (blockData[pos]! << 8) | blockData[pos + 1]!
	const timestamp = clusterTimestamp + (relativeTimestamp > 32767 ? relativeTimestamp - 65536 : relativeTimestamp)
	pos += 2

	// Flags
	const flags = blockData[pos]!
	pos += 1

	const keyframe = (flags & 0x80) !== 0

	// Frame data
	const data = blockData.slice(pos)

	return { trackNumber, timestamp, keyframe, data }
}

/**
 * Parse BlockGroup
 */
function parseBlockGroup(reader: EbmlReader, element: EbmlElement, clusterTimestamp: number): MkvBlock[] {
	const blocks: MkvBlock[] = []
	const children = reader.parseChildren(element)

	for (const child of children) {
		if (child.id === EbmlId.Block) {
			const blockData = reader.readBinary(child)
			if (blockData.length < 4) continue

			let pos = 0
			const { value: trackNumber, length: trackLen } = readVint(blockData, pos)
			pos += trackLen

			const relativeTimestamp = (blockData[pos]! << 8) | blockData[pos + 1]!
			const timestamp =
				clusterTimestamp + (relativeTimestamp > 32767 ? relativeTimestamp - 65536 : relativeTimestamp)
			pos += 2

			pos += 1 // Skip flags

			const data = blockData.slice(pos)
			blocks.push({ trackNumber, timestamp, keyframe: false, data })
		}
	}

	return blocks
}

/**
 * Read variable-length integer (VINT)
 */
function readVint(data: Uint8Array, offset: number): { value: number; length: number } {
	const first = data[offset]!

	// Determine length from leading bits
	let length = 1
	let mask = 0x80

	while ((first & mask) === 0 && length < 8) {
		length++
		mask >>= 1
	}

	// Read value
	let value = first & (mask - 1) // Remove length marker

	for (let i = 1; i < length; i++) {
		value = (value << 8) | data[offset + i]!
	}

	return { value, length }
}

/**
 * EBML Reader class
 */
class EbmlReader {
	data: Uint8Array
	position: number = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	seek(pos: number): void {
		this.position = pos
	}

	/**
	 * Read EBML element header
	 */
	readElement(): EbmlElement | null {
		if (this.position >= this.data.length - 1) return null

		const startPos = this.position

		// Read element ID
		const { value: id, length: idLen } = this.readVint()
		if (idLen === 0) return null

		// Read element size
		const { value: size, length: sizeLen } = this.readVintSize()
		if (sizeLen === 0) return null

		const dataOffset = this.position

		return { id, size, dataOffset }
	}

	/**
	 * Parse children of a master element
	 */
	parseChildren(parent: EbmlElement): EbmlElement[] {
		const children: EbmlElement[] = []
		const endOffset = parent.dataOffset + parent.size

		this.seek(parent.dataOffset)

		while (this.position < endOffset && this.position < this.data.length - 1) {
			const child = this.readElement()
			if (!child) break

			children.push(child)

			// Move to next element
			this.seek(child.dataOffset + child.size)
		}

		return children
	}

	/**
	 * Read unsigned integer
	 */
	readUint(element: EbmlElement): number {
		let value = 0
		for (let i = 0; i < element.size; i++) {
			value = (value << 8) | this.data[element.dataOffset + i]!
		}
		return value
	}

	/**
	 * Read float (32 or 64 bit)
	 */
	readFloat(element: EbmlElement): number {
		const view = new DataView(this.data.buffer, this.data.byteOffset + element.dataOffset, element.size)
		if (element.size === 4) {
			return view.getFloat32(0, false)
		} else if (element.size === 8) {
			return view.getFloat64(0, false)
		}
		return 0
	}

	/**
	 * Read string
	 */
	readString(element: EbmlElement): string {
		let str = ''
		for (let i = 0; i < element.size; i++) {
			const byte = this.data[element.dataOffset + i]!
			if (byte === 0) break // Null terminator
			str += String.fromCharCode(byte)
		}
		return str
	}

	/**
	 * Read binary data
	 */
	readBinary(element: EbmlElement): Uint8Array {
		return this.data.slice(element.dataOffset, element.dataOffset + element.size)
	}

	/**
	 * Read VINT (variable-length integer) for element ID
	 */
	private readVint(): { value: number; length: number } {
		if (this.position >= this.data.length) return { value: 0, length: 0 }

		const first = this.data[this.position]!

		let length = 1
		let mask = 0x80

		while ((first & mask) === 0 && length < 8) {
			length++
			mask >>= 1
		}

		if (this.position + length > this.data.length) return { value: 0, length: 0 }

		// For element IDs, keep the VINT marker bit
		let value = first

		for (let i = 1; i < length; i++) {
			value = (value << 8) | this.data[this.position + i]!
		}

		this.position += length
		return { value, length }
	}

	/**
	 * Read VINT for element size (remove marker bit)
	 */
	private readVintSize(): { value: number; length: number } {
		if (this.position >= this.data.length) return { value: 0, length: 0 }

		const first = this.data[this.position]!

		let length = 1
		let mask = 0x80

		while ((first & mask) === 0 && length < 8) {
			length++
			mask >>= 1
		}

		if (this.position + length > this.data.length) return { value: 0, length: 0 }

		// Remove VINT marker for size
		let value = first & (mask - 1)

		for (let i = 1; i < length; i++) {
			value = (value << 8) | this.data[this.position + i]!
		}

		this.position += length

		// Check for unknown size (all 1s)
		const maxValue = (1 << (7 * length)) - 1
		if (value === maxValue) {
			// Unknown size - return max safe integer
			return { value: Number.MAX_SAFE_INTEGER, length }
		}

		return { value, length }
	}
}
