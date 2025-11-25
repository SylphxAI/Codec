/**
 * MKA (Matroska Audio) decoder
 * EBML-based audio container format parser
 */

import type { AudioData } from '@sylphx/codec-core'
import {
	EbmlId,
	MkaTrackType,
	type EbmlElement,
	type MkaBlock,
	type MkaCluster,
	type MkaDecodeResult,
	type MkaInfo,
	type MkaTrack,
} from './types'

/**
 * Check if data is MKA
 */
export function isMka(data: Uint8Array): boolean {
	if (data.length < 4) return false
	// EBML header starts with 0x1A 0x45 0xDF 0xA3 (same as MKV)
	return data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3
}

/**
 * Parse MKA info without full decode
 */
export function parseMkaInfo(data: Uint8Array): MkaInfo {
	const result = decodeMka(data)
	return result.info
}

/**
 * Decode MKA file
 */
export function decodeMka(data: Uint8Array): MkaDecodeResult {
	const reader = new EbmlReader(data)

	let docType = 'matroska'
	let docTypeVersion = 4
	let timestampScale = 1000000 // Default 1ms
	let duration: number | undefined
	let muxingApp: string | undefined
	let writingApp: string | undefined
	const tracks: MkaTrack[] = []
	const segments: EbmlElement[] = []
	const clusters: MkaCluster[] = []

	// Parse EBML header
	const ebmlHeader = reader.readElement()
	if (!ebmlHeader || ebmlHeader.id !== EbmlId.EBML) {
		throw new Error('Invalid MKA: missing EBML header')
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
		throw new Error('Invalid MKA: missing Segment')
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

	// Find audio track for properties
	let sampleRate = 44100
	let channels = 2
	let bitDepth: number | undefined

	const audioTrack = tracks.find((t) => t.type === MkaTrackType.AUDIO)
	if (audioTrack?.audio) {
		sampleRate = audioTrack.audio.samplingFrequency
		channels = audioTrack.audio.channels
		bitDepth = audioTrack.audio.bitDepth
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
			sampleRate,
			channels,
			bitDepth,
		},
		segments,
		clusters,
	}
}

/**
 * Decode MKA to AudioData
 */
export function decodeMkaAudio(data: Uint8Array): AudioData | null {
	const result = decodeMka(data)

	// Find audio track
	const audioTrack = result.info.tracks.find((t) => t.type === MkaTrackType.AUDIO)
	if (!audioTrack) return null

	// For PCM codecs, we can decode the audio
	const isPcm = audioTrack.codecId.startsWith('A_PCM/')

	if (!isPcm) {
		// For compressed codecs, we would need specific decoders
		// Return metadata only
		return {
			sampleRate: audioTrack.audio.samplingFrequency,
			channels: audioTrack.audio.channels,
			data: new Float32Array(0), // Empty data - would need codec-specific decoder
		}
	}

	// Collect all audio blocks
	const blocks: Uint8Array[] = []
	for (const cluster of result.clusters) {
		for (const block of cluster.blocks) {
			if (block.trackNumber === audioTrack.number) {
				blocks.push(block.data)
			}
		}
	}

	// Concatenate blocks
	const totalLength = blocks.reduce((sum, b) => sum + b.length, 0)
	const concatenated = new Uint8Array(totalLength)
	let offset = 0
	for (const block of blocks) {
		concatenated.set(block, offset)
		offset += block.length
	}

	// Decode PCM based on codec
	const audioData = decodePcm(concatenated, audioTrack)

	return audioData
}

/**
 * Decode PCM audio data
 */
function decodePcm(data: Uint8Array, track: MkaTrack): AudioData {
	const { samplingFrequency, channels, bitDepth = 16 } = track.audio
	const isLittleEndian = track.codecId === 'A_PCM/INT/LIT'
	const isFloat = track.codecId === 'A_PCM/FLOAT/IEEE'

	const bytesPerSample = bitDepth / 8
	const sampleCount = Math.floor(data.length / bytesPerSample / channels)
	const output = new Float32Array(sampleCount * channels)

	const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

	for (let i = 0; i < sampleCount * channels; i++) {
		const byteOffset = i * bytesPerSample

		if (isFloat) {
			// Float PCM
			if (bitDepth === 32) {
				output[i] = view.getFloat32(byteOffset, isLittleEndian)
			} else if (bitDepth === 64) {
				output[i] = view.getFloat64(byteOffset, isLittleEndian)
			}
		} else {
			// Integer PCM - normalize to [-1, 1]
			let sample = 0
			if (bitDepth === 8) {
				sample = (data[byteOffset]! - 128) / 128
			} else if (bitDepth === 16) {
				sample = view.getInt16(byteOffset, isLittleEndian) / 32768
			} else if (bitDepth === 24) {
				// 24-bit handling
				let value = 0
				if (isLittleEndian) {
					value = data[byteOffset]! | (data[byteOffset + 1]! << 8) | (data[byteOffset + 2]! << 16)
				} else {
					value = (data[byteOffset]! << 16) | (data[byteOffset + 1]! << 8) | data[byteOffset + 2]!
				}
				// Sign extend
				if (value & 0x800000) value |= 0xff000000
				sample = value / 8388608
			} else if (bitDepth === 32) {
				sample = view.getInt32(byteOffset, isLittleEndian) / 2147483648
			}
			output[i] = sample
		}
	}

	return {
		sampleRate: samplingFrequency,
		channels,
		data: output,
	}
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
function parseTracks(reader: EbmlReader, element: EbmlElement, tracks: MkaTrack[]): void {
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
function parseTrackEntry(reader: EbmlReader, element: EbmlElement): MkaTrack | null {
	const track: Partial<MkaTrack> = {}
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
			case EbmlId.Audio:
				track.audio = parseAudioSettings(reader, child)
				break
		}
	}

	// MKA files must have audio track
	if (track.number === undefined || track.type !== MkaTrackType.AUDIO || !track.codecId || !track.audio) {
		return null
	}

	return track as MkaTrack
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
	clusters: MkaCluster[],
	timestampScale: number
): void {
	const cluster: MkaCluster = { timestamp: 0, blocks: [] }
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
function parseSimpleBlock(reader: EbmlReader, element: EbmlElement, clusterTimestamp: number): MkaBlock | null {
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
function parseBlockGroup(reader: EbmlReader, element: EbmlElement, clusterTimestamp: number): MkaBlock[] {
	const blocks: MkaBlock[] = []
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
