/**
 * WMA (Windows Media Audio) decoder
 * Pure TypeScript implementation of WMA decoding
 * Supports basic WMA format within ASF container
 */

import {
	ASF_GUID,
	WMA_SYNC,
	type AsfAudioStreamProperties,
	type AsfContentDescription,
	type AsfExtendedDescriptor,
	type AsfFileProperties,
	type AsfObjectHeader,
	type WmaDecodeResult,
	type WmaInfo,
} from './types'

/**
 * Check if data is WMA (ASF format)
 */
export function isWma(data: Uint8Array): boolean {
	if (data.length < 16) return false

	// Check for ASF header GUID
	const guid = readGuid(data, 0)
	return guid === ASF_GUID.HEADER
}

/**
 * Parse WMA info without full decode
 */
export function parseWmaInfo(data: Uint8Array): WmaInfo {
	if (!isWma(data)) {
		throw new Error('Invalid WMA: missing ASF header')
	}

	const reader = new AsfReader(data)
	reader.skip(16) // Skip header GUID

	const headerSize = reader.readU64LE()
	const headerObjects = reader.readU32LE()
	reader.skip(2) // Reserved

	let fileProps: AsfFileProperties | undefined
	let audioStream: AsfAudioStreamProperties | undefined
	let contentDesc: AsfContentDescription | undefined
	let extendedDesc: AsfExtendedDescriptor[] | undefined

	const headerEnd = Number(headerSize)

	// Parse header objects
	while (reader.position < headerEnd) {
		const objHeader = readObjectHeader(reader)

		switch (objHeader.objectId) {
			case ASF_GUID.FILE_PROPERTIES:
				fileProps = parseFileProperties(reader, objHeader)
				break
			case ASF_GUID.STREAM_PROPERTIES:
				const stream = parseStreamProperties(reader, objHeader)
				if (stream.streamType === ASF_GUID.AUDIO_MEDIA && !audioStream) {
					audioStream = stream
				}
				break
			case ASF_GUID.CONTENT_DESCRIPTION:
				contentDesc = parseContentDescription(reader, objHeader)
				break
			case ASF_GUID.EXTENDED_CONTENT_DESCRIPTION:
				extendedDesc = parseExtendedContentDescription(reader, objHeader)
				break
			default:
				// Skip unknown objects
				reader.seek(objHeader.position + Number(objHeader.objectSize))
				break
		}
	}

	if (!fileProps) {
		throw new Error('Invalid WMA: missing file properties')
	}

	if (!audioStream) {
		throw new Error('Invalid WMA: no audio stream found')
	}

	// Duration in seconds
	// Play duration is in 100-nanosecond units, preroll is in milliseconds
	const duration = Math.max(0, Number(fileProps.playDuration) / 10000000 - Number(fileProps.preroll) / 1000)

	const bitrate = audioStream.avgBytesPerSec * 8

	return {
		duration,
		sampleRate: audioStream.samplesPerSec,
		channels: audioStream.channels,
		bitsPerSample: audioStream.bitsPerSample || 16,
		bitrate,
		formatTag: audioStream.formatTag,
		contentDescription: contentDesc,
		extendedDescriptors: extendedDesc,
	}
}

/**
 * Decode WMA to raw samples
 * Note: Full WMA decoding requires complex audio codec implementation
 * This is a placeholder that extracts metadata and basic structure
 */
export function decodeWma(data: Uint8Array): WmaDecodeResult {
	const info = parseWmaInfo(data)

	// WMA uses proprietary codec that requires complex decoding
	// For a full implementation, you would need:
	// 1. Huffman decoding
	// 2. Quantization and dequantization
	// 3. MDCT (Modified Discrete Cosine Transform)
	// 4. Bit stream parsing with dynamic codebooks

	// Return empty samples for now - full codec implementation would go here
	const totalSamples = Math.max(0, Math.floor(info.duration * info.sampleRate))
	const samples: Float32Array[] = []

	for (let i = 0; i < info.channels; i++) {
		samples.push(new Float32Array(totalSamples))
	}

	console.warn(
		'WMA decoding: Full audio decoding not implemented. This decoder extracts metadata only. ' +
			'For audio playback, consider using native browser APIs or a dedicated audio library.'
	)

	return { info, samples }
}

/**
 * Read ASF object header
 */
function readObjectHeader(reader: AsfReader): AsfObjectHeader {
	const position = reader.position
	const objectId = reader.readGuid()
	const objectSize = reader.readU64LE()

	return { objectId, objectSize, position }
}

/**
 * Parse file properties object
 */
function parseFileProperties(reader: AsfReader, header: AsfObjectHeader): AsfFileProperties {
	const fileId = reader.readGuid()
	const fileSize = reader.readU64LE()
	const creationDate = reader.readU64LE()
	const dataPacketsCount = reader.readU64LE()
	const playDuration = reader.readU64LE()
	const sendDuration = reader.readU64LE()
	const preroll = reader.readU64LE()
	const flags = reader.readU32LE()
	const minPacketSize = reader.readU32LE()
	const maxPacketSize = reader.readU32LE()
	const maxBitrate = reader.readU32LE()

	// Seek to end of object
	reader.seek(header.position + Number(header.objectSize))

	return {
		fileId,
		fileSize,
		creationDate,
		dataPacketsCount,
		playDuration,
		sendDuration,
		preroll,
		flags,
		minPacketSize,
		maxPacketSize,
		maxBitrate,
	}
}

/**
 * Parse stream properties object
 */
function parseStreamProperties(reader: AsfReader, header: AsfObjectHeader): AsfAudioStreamProperties {
	const streamType = reader.readGuid()
	const errorCorrectionType = reader.readGuid()
	const timeOffset = reader.readU64LE()
	const typeSpecificDataLength = reader.readU32LE()
	const errorCorrectionDataLength = reader.readU32LE()
	const flags = reader.readU16LE()
	const reserved = reader.readU32LE()

	// Parse audio-specific data (WAVEFORMATEX-like structure)
	const formatTag = reader.readU16LE()
	const channels = reader.readU16LE()
	const samplesPerSec = reader.readU32LE()
	const avgBytesPerSec = reader.readU32LE()
	const blockAlign = reader.readU16LE()
	const bitsPerSample = reader.readU16LE()
	const codecDataSize = reader.readU16LE()

	const codecData = reader.readBytes(codecDataSize)

	// Skip error correction data if present
	if (errorCorrectionDataLength > 0) {
		reader.skip(errorCorrectionDataLength)
	}

	// Seek to end of object
	reader.seek(header.position + Number(header.objectSize))

	const streamNumber = flags & 0x7f

	return {
		streamNumber,
		streamType,
		errorCorrectionType,
		timeOffset,
		typeSpecificDataLength,
		errorCorrectionDataLength,
		flags,
		reserved,
		formatTag,
		channels,
		samplesPerSec,
		avgBytesPerSec,
		blockAlign,
		bitsPerSample,
		codecDataSize,
		codecData,
	}
}

/**
 * Parse content description object
 */
function parseContentDescription(reader: AsfReader, header: AsfObjectHeader): AsfContentDescription {
	const titleLen = reader.readU16LE()
	const authorLen = reader.readU16LE()
	const copyrightLen = reader.readU16LE()
	const descriptionLen = reader.readU16LE()
	const ratingLen = reader.readU16LE()

	const title = titleLen > 0 ? reader.readUtf16String(titleLen) : undefined
	const author = authorLen > 0 ? reader.readUtf16String(authorLen) : undefined
	const copyright = copyrightLen > 0 ? reader.readUtf16String(copyrightLen) : undefined
	const description = descriptionLen > 0 ? reader.readUtf16String(descriptionLen) : undefined
	const rating = ratingLen > 0 ? reader.readUtf16String(ratingLen) : undefined

	// Seek to end of object
	reader.seek(header.position + Number(header.objectSize))

	return { title, author, copyright, description, rating }
}

/**
 * Parse extended content description object
 */
function parseExtendedContentDescription(reader: AsfReader, header: AsfObjectHeader): AsfExtendedDescriptor[] {
	const count = reader.readU16LE()
	const descriptors: AsfExtendedDescriptor[] = []

	for (let i = 0; i < count; i++) {
		const nameLen = reader.readU16LE()
		const name = reader.readUtf16String(nameLen)
		const valueType = reader.readU16LE()
		const valueLen = reader.readU16LE()

		let value: string | Uint8Array | boolean | number | bigint

		switch (valueType) {
			case 0: // Unicode string
				value = reader.readUtf16String(valueLen)
				break
			case 1: // Byte array
				value = reader.readBytes(valueLen)
				break
			case 2: // Boolean
				value = reader.readU32LE() !== 0
				break
			case 3: // DWORD
				value = reader.readU32LE()
				break
			case 4: // QWORD
				value = reader.readU64LE()
				break
			case 5: // WORD
				value = reader.readU16LE()
				break
			default:
				value = reader.readBytes(valueLen)
		}

		descriptors.push({ name, valueType, value })
	}

	// Seek to end of object
	reader.seek(header.position + Number(header.objectSize))

	return descriptors
}

/**
 * Read GUID from buffer
 */
function readGuid(data: Uint8Array, offset: number): string {
	const bytes = data.slice(offset, offset + 16)
	let guid = ''

	// Data1 (4 bytes, little-endian)
	for (let i = 3; i >= 0; i--) {
		guid += bytes[i]!.toString(16).padStart(2, '0')
	}

	// Data2 (2 bytes, little-endian)
	for (let i = 5; i >= 4; i--) {
		guid += bytes[i]!.toString(16).padStart(2, '0')
	}

	// Data3 (2 bytes, little-endian)
	for (let i = 7; i >= 6; i--) {
		guid += bytes[i]!.toString(16).padStart(2, '0')
	}

	// Data4 (8 bytes, big-endian)
	for (let i = 8; i < 16; i++) {
		guid += bytes[i]!.toString(16).padStart(2, '0')
	}

	return guid
}

/**
 * ASF/WMA byte reader helper
 */
class AsfReader {
	private data: Uint8Array
	position: number = 0

	constructor(data: Uint8Array) {
		this.data = data
	}

	eof(): boolean {
		return this.position >= this.data.length
	}

	skip(n: number): void {
		this.position += n
	}

	seek(pos: number): void {
		this.position = pos
	}

	readU8(): number {
		return this.data[this.position++]!
	}

	readU16LE(): number {
		const v = this.data[this.position]! | (this.data[this.position + 1]! << 8)
		this.position += 2
		return v
	}

	readU32LE(): number {
		const v =
			this.data[this.position]! |
			(this.data[this.position + 1]! << 8) |
			(this.data[this.position + 2]! << 16) |
			(this.data[this.position + 3]! << 24)
		this.position += 4
		return v >>> 0
	}

	readU64LE(): bigint {
		const low = BigInt(this.readU32LE())
		const high = BigInt(this.readU32LE())
		return (high << 32n) | low
	}

	readBytes(n: number): Uint8Array {
		const bytes = this.data.slice(this.position, this.position + n)
		this.position += n
		return bytes
	}

	readGuid(): string {
		const guid = readGuid(this.data, this.position)
		this.position += 16
		return guid
	}

	readUtf16String(byteLength: number): string {
		let str = ''
		const charCount = byteLength / 2

		for (let i = 0; i < charCount; i++) {
			const charCode = this.readU16LE()
			if (charCode === 0) {
				// Null terminator
				this.skip((charCount - i - 1) * 2)
				break
			}
			str += String.fromCharCode(charCode)
		}

		return str
	}
}
