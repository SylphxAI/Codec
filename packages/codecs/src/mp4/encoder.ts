/**
 * MP4/MOV (ISO Base Media File Format) encoder
 * Creates MP4 files with MJPEG video
 */

import type { ImageData } from '@mconv/core'
import { encodeJpeg } from '../jpeg'
import { Mp4BoxType, Mp4Brand, Mp4HandlerType, type Mp4EncodeOptions } from './types'

/**
 * Encode frames to MP4
 */
export function encodeMp4(frames: ImageData[], options: Mp4EncodeOptions = {}): Uint8Array {
	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const { frameRate = 30, timescale = 30000, quality = 85, brand = 'isom' } = options

	const firstFrame = frames[0]!
	const width = firstFrame.width
	const height = firstFrame.height

	// Encode frames to JPEG
	const jpegFrames = frames.map((frame) => encodeJpeg(frame, { quality }))

	// Calculate sample sizes and total mdat size
	const sampleSizes = jpegFrames.map((f) => f.length)
	const mdatDataSize = sampleSizes.reduce((sum, size) => sum + size, 0)

	// Build boxes
	const ftyp = buildFtyp(brand)
	const moov = buildMoov(width, height, frameRate, timescale, frames.length, sampleSizes)

	// Calculate mdat offset (after ftyp and moov)
	const mdatOffset = ftyp.length + moov.length + 8 // +8 for mdat header

	// Update chunk offsets in moov (stco box)
	updateChunkOffsets(moov, mdatOffset, sampleSizes)

	// Build mdat
	const mdat = buildMdat(jpegFrames)

	// Concatenate all boxes
	const totalSize = ftyp.length + moov.length + mdat.length
	const output = new Uint8Array(totalSize)

	let offset = 0
	output.set(ftyp, offset)
	offset += ftyp.length
	output.set(moov, offset)
	offset += moov.length
	output.set(mdat, offset)

	return output
}

/**
 * Build ftyp box
 */
function buildFtyp(brand: string): Uint8Array {
	const brands = [brand, 'iso2', 'mp41']
	const size = 8 + 4 + 4 + brands.length * 4

	const box = new Uint8Array(size)
	writeU32BE(box, 0, size)
	writeString(box, 4, 'ftyp')
	writeString(box, 8, brand.padEnd(4, ' '))
	writeU32BE(box, 12, 512) // minor version

	let offset = 16
	for (const b of brands) {
		writeString(box, offset, b.padEnd(4, ' '))
		offset += 4
	}

	return box
}

/**
 * Build moov box
 */
function buildMoov(
	width: number,
	height: number,
	frameRate: number,
	timescale: number,
	frameCount: number,
	sampleSizes: number[]
): Uint8Array {
	const duration = Math.round((frameCount / frameRate) * timescale)

	const mvhd = buildMvhd(timescale, duration)
	const trak = buildVideoTrack(width, height, frameRate, timescale, frameCount, sampleSizes)

	const moovDataSize = mvhd.length + trak.length
	const moov = new Uint8Array(8 + moovDataSize)

	writeU32BE(moov, 0, 8 + moovDataSize)
	writeString(moov, 4, 'moov')
	moov.set(mvhd, 8)
	moov.set(trak, 8 + mvhd.length)

	return moov
}

/**
 * Build mvhd box
 */
function buildMvhd(timescale: number, duration: number): Uint8Array {
	const size = 8 + 100 // Fixed size for version 0
	const box = new Uint8Array(size)

	writeU32BE(box, 0, size)
	writeString(box, 4, 'mvhd')

	let offset = 8
	box[offset] = 0 // version
	offset += 4 // version + flags

	writeU32BE(box, offset, 0) // creation_time
	offset += 4
	writeU32BE(box, offset, 0) // modification_time
	offset += 4
	writeU32BE(box, offset, timescale)
	offset += 4
	writeU32BE(box, offset, duration)
	offset += 4

	writeU32BE(box, offset, 0x00010000) // rate = 1.0
	offset += 4
	writeU16BE(box, offset, 0x0100) // volume = 1.0
	offset += 2

	offset += 10 // reserved

	// Matrix (identity)
	writeU32BE(box, offset, 0x00010000)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0x00010000)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0x40000000)
	offset += 4

	offset += 24 // pre_defined

	writeU32BE(box, offset, 2) // next_track_id

	return box
}

/**
 * Build video track (trak box)
 */
function buildVideoTrack(
	width: number,
	height: number,
	frameRate: number,
	timescale: number,
	frameCount: number,
	sampleSizes: number[]
): Uint8Array {
	const duration = Math.round((frameCount / frameRate) * timescale)

	const tkhd = buildTkhd(1, duration, width, height)
	const mdia = buildMdia(width, height, frameRate, timescale, frameCount, sampleSizes)

	const trakDataSize = tkhd.length + mdia.length
	const trak = new Uint8Array(8 + trakDataSize)

	writeU32BE(trak, 0, 8 + trakDataSize)
	writeString(trak, 4, 'trak')
	trak.set(tkhd, 8)
	trak.set(mdia, 8 + tkhd.length)

	return trak
}

/**
 * Build tkhd box
 */
function buildTkhd(trackId: number, duration: number, width: number, height: number): Uint8Array {
	const size = 8 + 84 // Fixed size for version 0
	const box = new Uint8Array(size)

	writeU32BE(box, 0, size)
	writeString(box, 4, 'tkhd')

	let offset = 8
	box[offset] = 0 // version
	box[offset + 1] = 0
	box[offset + 2] = 0
	box[offset + 3] = 0x03 // flags: enabled + in_movie
	offset += 4

	writeU32BE(box, offset, 0) // creation_time
	offset += 4
	writeU32BE(box, offset, 0) // modification_time
	offset += 4
	writeU32BE(box, offset, trackId)
	offset += 4
	writeU32BE(box, offset, 0) // reserved
	offset += 4
	writeU32BE(box, offset, duration)
	offset += 4

	offset += 8 // reserved
	writeU16BE(box, offset, 0) // layer
	offset += 2
	writeU16BE(box, offset, 0) // alternate_group
	offset += 2
	writeU16BE(box, offset, 0) // volume (0 for video)
	offset += 2
	offset += 2 // reserved

	// Matrix (identity)
	writeU32BE(box, offset, 0x00010000)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0x00010000)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0)
	offset += 4
	writeU32BE(box, offset, 0x40000000)
	offset += 4

	writeU32BE(box, offset, width << 16) // width in 16.16 fixed point
	offset += 4
	writeU32BE(box, offset, height << 16) // height in 16.16 fixed point

	return box
}

/**
 * Build mdia box
 */
function buildMdia(
	width: number,
	height: number,
	frameRate: number,
	timescale: number,
	frameCount: number,
	sampleSizes: number[]
): Uint8Array {
	const duration = Math.round((frameCount / frameRate) * timescale)

	const mdhd = buildMdhd(timescale, duration)
	const hdlr = buildHdlr(Mp4HandlerType.VIDEO)
	const minf = buildMinf(width, height, frameRate, timescale, frameCount, sampleSizes)

	const mdiaDataSize = mdhd.length + hdlr.length + minf.length
	const mdia = new Uint8Array(8 + mdiaDataSize)

	writeU32BE(mdia, 0, 8 + mdiaDataSize)
	writeString(mdia, 4, 'mdia')
	mdia.set(mdhd, 8)
	mdia.set(hdlr, 8 + mdhd.length)
	mdia.set(minf, 8 + mdhd.length + hdlr.length)

	return mdia
}

/**
 * Build mdhd box
 */
function buildMdhd(timescale: number, duration: number): Uint8Array {
	const size = 8 + 24 // Fixed size for version 0
	const box = new Uint8Array(size)

	writeU32BE(box, 0, size)
	writeString(box, 4, 'mdhd')

	let offset = 8
	box[offset] = 0 // version
	offset += 4 // version + flags

	writeU32BE(box, offset, 0) // creation_time
	offset += 4
	writeU32BE(box, offset, 0) // modification_time
	offset += 4
	writeU32BE(box, offset, timescale)
	offset += 4
	writeU32BE(box, offset, duration)
	offset += 4

	// Language (undetermined = 'und')
	const lang = (('u'.charCodeAt(0) - 0x60) << 10) | (('n'.charCodeAt(0) - 0x60) << 5) | ('d'.charCodeAt(0) - 0x60)
	writeU16BE(box, offset, lang)
	offset += 2

	writeU16BE(box, offset, 0) // pre_defined

	return box
}

/**
 * Build hdlr box
 */
function buildHdlr(handlerType: string): Uint8Array {
	const name = 'VideoHandler'
	const size = 8 + 24 + name.length + 1

	const box = new Uint8Array(size)

	writeU32BE(box, 0, size)
	writeString(box, 4, 'hdlr')

	let offset = 8
	box[offset] = 0 // version
	offset += 4 // version + flags

	writeU32BE(box, offset, 0) // pre_defined
	offset += 4
	writeString(box, offset, handlerType)
	offset += 4

	offset += 12 // reserved

	// Name (null-terminated)
	for (let i = 0; i < name.length; i++) {
		box[offset + i] = name.charCodeAt(i)
	}
	box[offset + name.length] = 0

	return box
}

/**
 * Build minf box
 */
function buildMinf(
	width: number,
	height: number,
	frameRate: number,
	timescale: number,
	frameCount: number,
	sampleSizes: number[]
): Uint8Array {
	const vmhd = buildVmhd()
	const dinf = buildDinf()
	const stbl = buildStbl(width, height, frameRate, timescale, frameCount, sampleSizes)

	const minfDataSize = vmhd.length + dinf.length + stbl.length
	const minf = new Uint8Array(8 + minfDataSize)

	writeU32BE(minf, 0, 8 + minfDataSize)
	writeString(minf, 4, 'minf')
	minf.set(vmhd, 8)
	minf.set(dinf, 8 + vmhd.length)
	minf.set(stbl, 8 + vmhd.length + dinf.length)

	return minf
}

/**
 * Build vmhd box
 */
function buildVmhd(): Uint8Array {
	const size = 8 + 12
	const box = new Uint8Array(size)

	writeU32BE(box, 0, size)
	writeString(box, 4, 'vmhd')

	let offset = 8
	box[offset] = 0 // version
	box[offset + 1] = 0
	box[offset + 2] = 0
	box[offset + 3] = 0x01 // flags: no lean ahead
	offset += 4

	writeU16BE(box, offset, 0) // graphics mode
	offset += 2
	// opcolor (6 bytes)

	return box
}

/**
 * Build dinf box
 */
function buildDinf(): Uint8Array {
	// dinf contains: dref which contains url entry
	// url entry: 12 bytes (size=12, type='url ', version/flags=0x01)
	// dref: 8 (header) + 4 (version/flags) + 4 (entry_count) + 12 (url) = 28 bytes
	// dinf: 8 (header) + 28 (dref) = 36 bytes

	const dinf = new Uint8Array(36)

	// dinf header
	writeU32BE(dinf, 0, 36)
	writeString(dinf, 4, 'dinf')

	// dref header
	writeU32BE(dinf, 8, 28)
	writeString(dinf, 12, 'dref')

	// dref version/flags
	dinf[16] = 0 // version
	dinf[17] = 0
	dinf[18] = 0
	dinf[19] = 0 // flags

	// dref entry_count
	writeU32BE(dinf, 20, 1)

	// url entry
	writeU32BE(dinf, 24, 12) // size
	writeString(dinf, 28, 'url ')
	dinf[32] = 0 // version
	dinf[33] = 0
	dinf[34] = 0
	dinf[35] = 0x01 // flags: self-contained

	return dinf
}

/**
 * Build stbl box
 */
function buildStbl(
	width: number,
	height: number,
	frameRate: number,
	timescale: number,
	frameCount: number,
	sampleSizes: number[]
): Uint8Array {
	const frameDuration = Math.round(timescale / frameRate)

	const stsd = buildStsd(width, height)
	const stts = buildStts(frameCount, frameDuration)
	const stsc = buildStsc(frameCount)
	const stsz = buildStsz(sampleSizes)
	const stco = buildStco(frameCount) // Placeholder, will be updated

	const stblDataSize = stsd.length + stts.length + stsc.length + stsz.length + stco.length
	const stbl = new Uint8Array(8 + stblDataSize)

	writeU32BE(stbl, 0, 8 + stblDataSize)
	writeString(stbl, 4, 'stbl')

	let offset = 8
	stbl.set(stsd, offset)
	offset += stsd.length
	stbl.set(stts, offset)
	offset += stts.length
	stbl.set(stsc, offset)
	offset += stsc.length
	stbl.set(stsz, offset)
	offset += stsz.length
	stbl.set(stco, offset)

	return stbl
}

/**
 * Build stsd box (MJPEG sample description)
 */
function buildStsd(width: number, height: number): Uint8Array {
	// JPEG sample entry
	const sampleEntrySize = 86 // Standard video sample entry size
	const stsdSize = 8 + 8 + sampleEntrySize

	const box = new Uint8Array(stsdSize)

	writeU32BE(box, 0, stsdSize)
	writeString(box, 4, 'stsd')

	let offset = 8
	box[offset] = 0 // version
	offset += 4 // version + flags
	writeU32BE(box, offset, 1) // entry_count
	offset += 4

	// Sample entry
	writeU32BE(box, offset, sampleEntrySize)
	writeString(box, offset + 4, 'jpeg') // format
	offset += 8

	offset += 6 // reserved
	writeU16BE(box, offset, 1) // data_reference_index
	offset += 2

	offset += 16 // pre_defined + reserved

	writeU16BE(box, offset, width)
	offset += 2
	writeU16BE(box, offset, height)
	offset += 2

	writeU32BE(box, offset, 0x00480000) // horiz_resolution (72 dpi)
	offset += 4
	writeU32BE(box, offset, 0x00480000) // vert_resolution (72 dpi)
	offset += 4

	writeU32BE(box, offset, 0) // reserved
	offset += 4

	writeU16BE(box, offset, 1) // frame_count
	offset += 2

	// Compressor name (32 bytes, first byte is length)
	box[offset] = 4
	box[offset + 1] = 'J'.charCodeAt(0)
	box[offset + 2] = 'P'.charCodeAt(0)
	box[offset + 3] = 'E'.charCodeAt(0)
	box[offset + 4] = 'G'.charCodeAt(0)
	offset += 32

	writeU16BE(box, offset, 0x0018) // depth (24-bit)
	offset += 2

	writeI16BE(box, offset, -1) // pre_defined

	return box
}

/**
 * Build stts box
 */
function buildStts(sampleCount: number, sampleDelta: number): Uint8Array {
	const size = 8 + 8 + 8 // header + version/flags/count + one entry
	const box = new Uint8Array(size)

	writeU32BE(box, 0, size)
	writeString(box, 4, 'stts')

	let offset = 8
	box[offset] = 0 // version
	offset += 4

	writeU32BE(box, offset, 1) // entry_count
	offset += 4

	writeU32BE(box, offset, sampleCount)
	offset += 4
	writeU32BE(box, offset, sampleDelta)

	return box
}

/**
 * Build stsc box
 */
function buildStsc(sampleCount: number): Uint8Array {
	// One sample per chunk
	const size = 8 + 8 + 12
	const box = new Uint8Array(size)

	writeU32BE(box, 0, size)
	writeString(box, 4, 'stsc')

	let offset = 8
	box[offset] = 0 // version
	offset += 4

	writeU32BE(box, offset, 1) // entry_count
	offset += 4

	writeU32BE(box, offset, 1) // first_chunk
	offset += 4
	writeU32BE(box, offset, 1) // samples_per_chunk
	offset += 4
	writeU32BE(box, offset, 1) // sample_description_index

	return box
}

/**
 * Build stsz box
 */
function buildStsz(sampleSizes: number[]): Uint8Array {
	const size = 8 + 12 + sampleSizes.length * 4
	const box = new Uint8Array(size)

	writeU32BE(box, 0, size)
	writeString(box, 4, 'stsz')

	let offset = 8
	box[offset] = 0 // version
	offset += 4

	writeU32BE(box, offset, 0) // sample_size (0 = variable)
	offset += 4
	writeU32BE(box, offset, sampleSizes.length)
	offset += 4

	for (const s of sampleSizes) {
		writeU32BE(box, offset, s)
		offset += 4
	}

	return box
}

/**
 * Build stco box (placeholder - will be updated)
 */
function buildStco(chunkCount: number): Uint8Array {
	const size = 8 + 8 + chunkCount * 4
	const box = new Uint8Array(size)

	writeU32BE(box, 0, size)
	writeString(box, 4, 'stco')

	let offset = 8
	box[offset] = 0 // version
	offset += 4

	writeU32BE(box, offset, chunkCount)
	offset += 4

	// Chunk offsets will be filled in later

	return box
}

/**
 * Update chunk offsets in moov
 */
function updateChunkOffsets(moov: Uint8Array, mdatOffset: number, sampleSizes: number[]): void {
	// Find stco box in moov - need to search recursively
	let stcoOffset = findBoxOffset(moov, 'stco', 8)
	if (stcoOffset < 0) return

	// stco layout: size(4) + 'stco'(4) + version/flags(4) + entry_count(4) + entries...
	const entryCount = readU32BE(moov, stcoOffset + 12)
	let entryOffset = stcoOffset + 16
	let sampleOffset = mdatOffset

	// For one sample per chunk, update each chunk offset
	for (let i = 0; i < entryCount && i < sampleSizes.length; i++) {
		writeU32BE(moov, entryOffset, sampleOffset)
		sampleOffset += sampleSizes[i]!
		entryOffset += 4
	}
}

/**
 * Find a box offset within moov
 */
function findBoxOffset(data: Uint8Array, targetType: string, startOffset: number): number {
	let offset = startOffset

	while (offset < data.length - 8) {
		const boxSize = readU32BE(data, offset)
		const boxType = readString(data, offset + 4, 4)

		if (boxSize < 8) return -1

		if (boxType === targetType) {
			return offset
		}

		// Recurse into container boxes
		if (boxType === 'trak' || boxType === 'mdia' || boxType === 'minf' || boxType === 'stbl') {
			const found = findBoxOffset(data, targetType, offset + 8)
			if (found >= 0) return found
		}

		offset += boxSize
	}

	return -1
}

/**
 * Build mdat box
 */
function buildMdat(frames: Uint8Array[]): Uint8Array {
	const dataSize = frames.reduce((sum, f) => sum + f.length, 0)
	const mdat = new Uint8Array(8 + dataSize)

	writeU32BE(mdat, 0, 8 + dataSize)
	writeString(mdat, 4, 'mdat')

	let offset = 8
	for (const frame of frames) {
		mdat.set(frame, offset)
		offset += frame.length
	}

	return mdat
}

// Binary helpers
function writeU16BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 8) & 0xff
	data[offset + 1] = value & 0xff
}

function writeI16BE(data: Uint8Array, offset: number, value: number): void {
	writeU16BE(data, offset, value < 0 ? value + 0x10000 : value)
}

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
}

function writeString(data: Uint8Array, offset: number, str: string): void {
	for (let i = 0; i < str.length; i++) {
		data[offset + i] = str.charCodeAt(i)
	}
}

function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) >>> 0) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

function readString(data: Uint8Array, offset: number, length: number): string {
	let str = ''
	for (let i = 0; i < length; i++) {
		str += String.fromCharCode(data[offset + i]!)
	}
	return str
}
