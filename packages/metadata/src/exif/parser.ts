/**
 * EXIF parser
 * Extracts EXIF metadata from JPEG/TIFF data
 */

import {
	type ExifData,
	type ExifEntry,
	type ExifOrientation,
	ExifTags,
	ExifType,
	GpsTags,
} from './types'

const EXIF_HEADER = 'Exif\x00\x00'

/**
 * Extract EXIF data from JPEG file
 */
export function parseExifFromJpeg(data: Uint8Array): ExifData | null {
	// Find APP1 marker (0xFFE1) containing EXIF
	let offset = 2 // Skip SOI marker

	while (offset < data.length - 4) {
		if (data[offset] !== 0xff) {
			offset++
			continue
		}

		const marker = data[offset + 1]!

		// APP1 marker
		if (marker === 0xe1) {
			const length = (data[offset + 2]! << 8) | data[offset + 3]!
			const segmentData = data.slice(offset + 4, offset + 2 + length)

			// Check for EXIF header
			const header = String.fromCharCode(...segmentData.slice(0, 6))
			if (header === EXIF_HEADER) {
				return parseExifData(segmentData.slice(6))
			}
		}

		// Skip to next marker
		if (marker === 0xd8 || marker === 0xd9) {
			offset += 2
		} else {
			const length = (data[offset + 2]! << 8) | data[offset + 3]!
			offset += 2 + length
		}
	}

	return null
}

/**
 * Extract EXIF data from raw TIFF/EXIF data
 */
export function parseExifData(data: Uint8Array): ExifData | null {
	if (data.length < 8) return null

	// Check byte order (II = little endian, MM = big endian)
	const byteOrder = String.fromCharCode(data[0]!, data[1]!)
	const littleEndian = byteOrder === 'II'

	if (byteOrder !== 'II' && byteOrder !== 'MM') {
		return null
	}

	// Check TIFF marker (0x002A)
	const tiffMarker = readU16(data, 2, littleEndian)
	if (tiffMarker !== 0x002a) {
		return null
	}

	// Get IFD0 offset
	const ifd0Offset = readU32(data, 4, littleEndian)

	const raw: Record<string, unknown> = {}
	let exifIfdOffset = 0
	let gpsIfdOffset = 0

	// Parse IFD0
	parseIfd(data, ifd0Offset, littleEndian, raw, ExifTags, (tag, value) => {
		if (tag === 0x8769) exifIfdOffset = value as number
		if (tag === 0x8825) gpsIfdOffset = value as number
	})

	// Parse EXIF IFD
	if (exifIfdOffset > 0) {
		parseIfd(data, exifIfdOffset, littleEndian, raw, ExifTags)
	}

	// Parse GPS IFD
	if (gpsIfdOffset > 0) {
		parseIfd(data, gpsIfdOffset, littleEndian, raw, GpsTags)
	}

	return buildExifData(raw)
}

/**
 * Check if data contains EXIF
 */
export function hasExif(data: Uint8Array): boolean {
	// JPEG check
	if (data[0] === 0xff && data[1] === 0xd8) {
		let offset = 2
		while (offset < data.length - 4) {
			if (data[offset] !== 0xff) {
				offset++
				continue
			}
			if (data[offset + 1] === 0xe1) {
				const header = String.fromCharCode(...data.slice(offset + 4, offset + 10))
				return header === EXIF_HEADER
			}
			const marker = data[offset + 1]!
			if (marker === 0xd8 || marker === 0xd9) {
				offset += 2
			} else {
				const length = (data[offset + 2]! << 8) | data[offset + 3]!
				offset += 2 + length
			}
		}
	}

	// TIFF check
	if ((data[0] === 0x49 && data[1] === 0x49) || (data[0] === 0x4d && data[1] === 0x4d)) {
		const littleEndian = data[0] === 0x49
		const marker = readU16(data, 2, littleEndian)
		return marker === 0x002a
	}

	return false
}

function parseIfd(
	data: Uint8Array,
	offset: number,
	littleEndian: boolean,
	result: Record<string, unknown>,
	tags: Record<number, string>,
	callback?: (tag: number, value: unknown) => void
): void {
	if (offset >= data.length - 2) return

	const entryCount = readU16(data, offset, littleEndian)
	let pos = offset + 2

	for (let i = 0; i < entryCount && pos + 12 <= data.length; i++) {
		const entry = parseEntry(data, pos, littleEndian)
		pos += 12

		const tagName = tags[entry.tag] || `Tag_0x${entry.tag.toString(16).padStart(4, '0')}`
		result[tagName] = entry.value

		if (callback) {
			callback(entry.tag, entry.value)
		}
	}
}

function parseEntry(data: Uint8Array, offset: number, littleEndian: boolean): ExifEntry {
	const tag = readU16(data, offset, littleEndian)
	const type = readU16(data, offset + 2, littleEndian) as ExifType
	const count = readU32(data, offset + 4, littleEndian)

	const typeSize = getTypeSize(type)
	const valueSize = typeSize * count

	let valueOffset: number
	if (valueSize <= 4) {
		valueOffset = offset + 8
	} else {
		valueOffset = readU32(data, offset + 8, littleEndian)
	}

	const value = readValue(data, valueOffset, type, count, littleEndian)

	return { tag, type, count, value }
}

function readValue(
	data: Uint8Array,
	offset: number,
	type: ExifType,
	count: number,
	littleEndian: boolean
): unknown {
	if (offset >= data.length) return null

	switch (type) {
		case ExifType.BYTE:
		case ExifType.UNDEFINED:
			if (count === 1) return data[offset]
			return data.slice(offset, offset + count)

		case ExifType.ASCII: {
			let str = ''
			for (let i = 0; i < count - 1 && offset + i < data.length; i++) {
				const char = data[offset + i]!
				if (char === 0) break
				str += String.fromCharCode(char)
			}
			return str.trim()
		}

		case ExifType.SHORT: {
			if (count === 1) return readU16(data, offset, littleEndian)
			const shorts: number[] = []
			for (let i = 0; i < count; i++) {
				shorts.push(readU16(data, offset + i * 2, littleEndian))
			}
			return shorts
		}

		case ExifType.LONG: {
			if (count === 1) return readU32(data, offset, littleEndian)
			const longs: number[] = []
			for (let i = 0; i < count; i++) {
				longs.push(readU32(data, offset + i * 4, littleEndian))
			}
			return longs
		}

		case ExifType.RATIONAL: {
			if (count === 1) {
				const num = readU32(data, offset, littleEndian)
				const den = readU32(data, offset + 4, littleEndian)
				return den === 0 ? 0 : num / den
			}
			const rationals: number[] = []
			for (let i = 0; i < count; i++) {
				const num = readU32(data, offset + i * 8, littleEndian)
				const den = readU32(data, offset + i * 8 + 4, littleEndian)
				rationals.push(den === 0 ? 0 : num / den)
			}
			return rationals
		}

		case ExifType.SBYTE: {
			if (count === 1) {
				const val = data[offset]!
				return val > 127 ? val - 256 : val
			}
			const sbytes: number[] = []
			for (let i = 0; i < count; i++) {
				const val = data[offset + i]!
				sbytes.push(val > 127 ? val - 256 : val)
			}
			return sbytes
		}

		case ExifType.SSHORT: {
			if (count === 1) return readI16(data, offset, littleEndian)
			const sshorts: number[] = []
			for (let i = 0; i < count; i++) {
				sshorts.push(readI16(data, offset + i * 2, littleEndian))
			}
			return sshorts
		}

		case ExifType.SLONG: {
			if (count === 1) return readI32(data, offset, littleEndian)
			const slongs: number[] = []
			for (let i = 0; i < count; i++) {
				slongs.push(readI32(data, offset + i * 4, littleEndian))
			}
			return slongs
		}

		case ExifType.SRATIONAL: {
			if (count === 1) {
				const num = readI32(data, offset, littleEndian)
				const den = readI32(data, offset + 4, littleEndian)
				return den === 0 ? 0 : num / den
			}
			const srationals: number[] = []
			for (let i = 0; i < count; i++) {
				const num = readI32(data, offset + i * 8, littleEndian)
				const den = readI32(data, offset + i * 8 + 4, littleEndian)
				srationals.push(den === 0 ? 0 : num / den)
			}
			return srationals
		}

		default:
			return null
	}
}

function getTypeSize(type: ExifType): number {
	switch (type) {
		case ExifType.BYTE:
		case ExifType.ASCII:
		case ExifType.SBYTE:
		case ExifType.UNDEFINED:
			return 1
		case ExifType.SHORT:
		case ExifType.SSHORT:
			return 2
		case ExifType.LONG:
		case ExifType.SLONG:
		case ExifType.FLOAT:
			return 4
		case ExifType.RATIONAL:
		case ExifType.SRATIONAL:
		case ExifType.DOUBLE:
			return 8
		default:
			return 1
	}
}

function buildExifData(raw: Record<string, unknown>): ExifData {
	const exif: ExifData = { raw }

	// Basic info
	if (raw.Make) exif.make = String(raw.Make)
	if (raw.Model) exif.model = String(raw.Model)
	if (raw.Software) exif.software = String(raw.Software)
	if (raw.DateTime) exif.dateTime = String(raw.DateTime)
	if (raw.DateTimeOriginal) exif.dateTimeOriginal = String(raw.DateTimeOriginal)
	if (raw.Orientation) exif.orientation = raw.Orientation as ExifOrientation

	// Dimensions
	if (raw.ImageWidth) exif.imageWidth = Number(raw.ImageWidth)
	if (raw.ImageHeight) exif.imageHeight = Number(raw.ImageHeight)
	if (raw.PixelXDimension) exif.pixelXDimension = Number(raw.PixelXDimension)
	if (raw.PixelYDimension) exif.pixelYDimension = Number(raw.PixelYDimension)

	// Camera settings
	if (raw.ExposureTime) exif.exposureTime = Number(raw.ExposureTime)
	if (raw.FNumber) exif.fNumber = Number(raw.FNumber)
	if (raw.ISOSpeedRatings) exif.iso = Number(raw.ISOSpeedRatings)
	if (raw.FocalLength) exif.focalLength = Number(raw.FocalLength)
	if (raw.FocalLengthIn35mmFilm) exif.focalLengthIn35mm = Number(raw.FocalLengthIn35mmFilm)
	if (raw.ApertureValue) exif.aperture = Number(raw.ApertureValue)
	if (raw.ShutterSpeedValue) exif.shutterSpeed = Number(raw.ShutterSpeedValue)

	// Flash
	if (raw.Flash !== undefined) {
		exif.flash = Number(raw.Flash)
		exif.flashFired = (exif.flash & 1) === 1
	}

	// GPS
	if (raw.GPSLatitude || raw.GPSLongitude) {
		exif.gps = {}

		if (raw.GPSLatitude) {
			const lat = raw.GPSLatitude as number[]
			if (Array.isArray(lat) && lat.length >= 3) {
				exif.gps.latitude = lat[0]! + lat[1]! / 60 + lat[2]! / 3600
				if (raw.GPSLatitudeRef === 'S') exif.gps.latitude = -exif.gps.latitude
			}
			exif.gps.latitudeRef = String(raw.GPSLatitudeRef || 'N')
		}

		if (raw.GPSLongitude) {
			const lon = raw.GPSLongitude as number[]
			if (Array.isArray(lon) && lon.length >= 3) {
				exif.gps.longitude = lon[0]! + lon[1]! / 60 + lon[2]! / 3600
				if (raw.GPSLongitudeRef === 'W') exif.gps.longitude = -exif.gps.longitude
			}
			exif.gps.longitudeRef = String(raw.GPSLongitudeRef || 'E')
		}

		if (raw.GPSAltitude !== undefined) {
			exif.gps.altitude = Number(raw.GPSAltitude)
			if (raw.GPSAltitudeRef === 1) exif.gps.altitude = -exif.gps.altitude
			exif.gps.altitudeRef = Number(raw.GPSAltitudeRef || 0)
		}
	}

	return exif
}

// Binary reading helpers
function readU16(data: Uint8Array, offset: number, littleEndian: boolean): number {
	if (littleEndian) {
		return data[offset]! | (data[offset + 1]! << 8)
	}
	return (data[offset]! << 8) | data[offset + 1]!
}

function readI16(data: Uint8Array, offset: number, littleEndian: boolean): number {
	const u = readU16(data, offset, littleEndian)
	return u > 0x7fff ? u - 0x10000 : u
}

function readU32(data: Uint8Array, offset: number, littleEndian: boolean): number {
	if (littleEndian) {
		return (
			data[offset]! |
			(data[offset + 1]! << 8) |
			(data[offset + 2]! << 16) |
			((data[offset + 3]! << 24) >>> 0)
		)
	}
	return (
		((data[offset]! << 24) |
			(data[offset + 1]! << 16) |
			(data[offset + 2]! << 8) |
			data[offset + 3]!) >>>
		0
	)
}

function readI32(data: Uint8Array, offset: number, littleEndian: boolean): number {
	const u = readU32(data, offset, littleEndian)
	return u > 0x7fffffff ? u - 0x100000000 : u
}
