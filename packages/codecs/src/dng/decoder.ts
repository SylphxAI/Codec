import type { ImageData } from '@sylphx/codec-core'
import { parseTiff as parseTiffBase, decodeTiff as decodeTiffBase } from '../tiff/decoder'
import {
	DNGTag,
	type DNGImage,
	type DNGMetadata,
	type IFD,
	type IFDEntry,
	TIFF_BIG_ENDIAN,
	TIFF_LITTLE_ENDIAN,
	TIFF_MAGIC,
} from './types'

/**
 * Binary reader with endianness support
 */
class DNGReader {
	private data: Uint8Array
	private view: DataView
	littleEndian: boolean

	constructor(data: Uint8Array, littleEndian = true) {
		this.data = data
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
		this.littleEndian = littleEndian
	}

	readU8(offset: number): number {
		return this.data[offset]!
	}

	readU16(offset: number): number {
		return this.view.getUint16(offset, this.littleEndian)
	}

	readU32(offset: number): number {
		return this.view.getUint32(offset, this.littleEndian)
	}

	get length(): number {
		return this.data.length
	}
}

/**
 * Decode DNG to ImageData
 */
export function decodeDNG(data: Uint8Array): ImageData {
	// DNG is based on TIFF, so we can use the TIFF decoder
	// The main difference is in the metadata tags
	return decodeTiffBase(data)
}

/**
 * Parse DNG structure including DNG-specific metadata
 */
export function parseDNG(data: Uint8Array): DNGImage {
	const reader = new DNGReader(data)

	// Read byte order
	const byteOrder = reader.readU16(0)
	let littleEndian: boolean

	if (byteOrder === TIFF_LITTLE_ENDIAN) {
		littleEndian = true
	} else if (byteOrder === TIFF_BIG_ENDIAN) {
		littleEndian = false
	} else {
		throw new Error('Invalid DNG byte order')
	}

	reader.littleEndian = littleEndian

	// Check magic number
	const magic = reader.readU16(2)
	if (magic !== TIFF_MAGIC) {
		throw new Error(`Invalid DNG magic number: ${magic}`)
	}

	// Parse as TIFF first
	const tiff = parseTiffBase(data)

	// Extract DNG-specific metadata from first IFD
	let metadata: DNGMetadata | undefined
	if (tiff.ifds.length > 0) {
		metadata = extractDNGMetadata(tiff.ifds[0]!)
	}

	return {
		...tiff,
		metadata,
	}
}

/**
 * Get tag value from IFD
 */
function getTag(ifd: IFD, tag: DNGTag): number | undefined {
	const entry = ifd.entries.get(tag)
	if (!entry) return undefined
	return typeof entry.value === 'number' ? entry.value : (entry.value as number[])[0]
}

/**
 * Get tag string value from IFD
 */
function getTagString(ifd: IFD, tag: DNGTag): string | undefined {
	const entry = ifd.entries.get(tag)
	if (!entry) return undefined
	return typeof entry.value === 'string' ? entry.value : undefined
}

/**
 * Get tag values as array
 */
function getTagArray(ifd: IFD, tag: DNGTag): number[] | undefined {
	const entry = ifd.entries.get(tag)
	if (!entry) return undefined
	if (typeof entry.value === 'number') return [entry.value]
	if (Array.isArray(entry.value)) return entry.value
	return undefined
}

/**
 * Extract DNG-specific metadata from IFD
 */
function extractDNGMetadata(ifd: IFD): DNGMetadata {
	const metadata: DNGMetadata = {}

	// Version information
	const dngVersion = getTagArray(ifd, DNGTag.DNGVersion)
	if (dngVersion) {
		metadata.dngVersion = dngVersion
	}

	const dngBackwardVersion = getTagArray(ifd, DNGTag.DNGBackwardVersion)
	if (dngBackwardVersion) {
		metadata.dngBackwardVersion = dngBackwardVersion
	}

	// Camera information
	const uniqueCameraModel = getTagString(ifd, DNGTag.UniqueCameraModel)
	if (uniqueCameraModel) {
		metadata.uniqueCameraModel = uniqueCameraModel
	}

	const localizedCameraModel = getTagString(ifd, DNGTag.LocalizedCameraModel)
	if (localizedCameraModel) {
		metadata.localizedCameraModel = localizedCameraModel
	}

	const cameraSerialNumber = getTagString(ifd, DNGTag.CameraSerialNumber)
	if (cameraSerialNumber) {
		metadata.cameraSerialNumber = cameraSerialNumber
	}

	// Lens information
	const lensInfo = getTagArray(ifd, DNGTag.LensInfo)
	if (lensInfo) {
		metadata.lensInfo = lensInfo
	}

	// Image levels
	const whiteLevel = getTagArray(ifd, DNGTag.WhiteLevel)
	if (whiteLevel) {
		metadata.whiteLevel = whiteLevel
	}

	const blackLevel = getTagArray(ifd, DNGTag.BlackLevel)
	if (blackLevel) {
		metadata.blackLevel = blackLevel
	}

	// Color matrices
	const colorMatrix1 = getTagArray(ifd, DNGTag.ColorMatrix1)
	if (colorMatrix1) {
		metadata.colorMatrix1 = colorMatrix1
	}

	const colorMatrix2 = getTagArray(ifd, DNGTag.ColorMatrix2)
	if (colorMatrix2) {
		metadata.colorMatrix2 = colorMatrix2
	}

	// Calibration
	const calibrationIlluminant1 = getTag(ifd, DNGTag.CalibrationIlluminant1)
	if (calibrationIlluminant1 !== undefined) {
		metadata.calibrationIlluminant1 = calibrationIlluminant1
	}

	const calibrationIlluminant2 = getTag(ifd, DNGTag.CalibrationIlluminant2)
	if (calibrationIlluminant2 !== undefined) {
		metadata.calibrationIlluminant2 = calibrationIlluminant2
	}

	// White balance
	const asShotNeutral = getTagArray(ifd, DNGTag.AsShotNeutral)
	if (asShotNeutral) {
		metadata.asShotNeutral = asShotNeutral
	}

	// Baseline adjustments
	const baselineExposure = getTag(ifd, DNGTag.BaselineExposure)
	if (baselineExposure !== undefined) {
		metadata.baselineExposure = baselineExposure
	}

	const baselineNoise = getTag(ifd, DNGTag.BaselineNoise)
	if (baselineNoise !== undefined) {
		metadata.baselineNoise = baselineNoise
	}

	const baselineSharpness = getTag(ifd, DNGTag.BaselineSharpness)
	if (baselineSharpness !== undefined) {
		metadata.baselineSharpness = baselineSharpness
	}

	// Profile information
	const profileName = getTagString(ifd, DNGTag.ProfileName)
	if (profileName) {
		metadata.profileName = profileName
	}

	const profileCopyright = getTagString(ifd, DNGTag.ProfileCopyright)
	if (profileCopyright) {
		metadata.profileCopyright = profileCopyright
	}

	return metadata
}

/**
 * Check if data is a valid DNG file
 */
export function isDNG(data: Uint8Array): boolean {
	if (data.length < 8) return false

	const reader = new DNGReader(data)

	// Check byte order
	const byteOrder = reader.readU16(0)
	if (byteOrder !== TIFF_LITTLE_ENDIAN && byteOrder !== TIFF_BIG_ENDIAN) {
		return false
	}

	reader.littleEndian = byteOrder === TIFF_LITTLE_ENDIAN

	// Check magic number
	const magic = reader.readU16(2)
	if (magic !== TIFF_MAGIC) {
		return false
	}

	// To be a valid DNG, it should have DNGVersion tag
	// We parse the structure minimally to check for this
	try {
		const tiff = parseTiffBase(data)
		if (tiff.ifds.length === 0) return false

		// Check for DNGVersion tag
		const firstIFD = tiff.ifds[0]!
		return firstIFD.entries.has(DNGTag.DNGVersion)
	} catch {
		return false
	}
}
