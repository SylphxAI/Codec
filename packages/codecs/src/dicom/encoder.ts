import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import { DICOM_MAGIC, DICOM_MAGIC_OFFSET, DicomTag, PhotometricInterpretation, TransferSyntax } from './types'

/**
 * Binary writer with little-endian support
 */
class DicomWriter {
	private buffer: number[] = []

	writeU8(value: number): void {
		this.buffer.push(value & 0xff)
	}

	writeU16(value: number): void {
		this.buffer.push(value & 0xff)
		this.buffer.push((value >> 8) & 0xff)
	}

	writeU32(value: number): void {
		this.buffer.push(value & 0xff)
		this.buffer.push((value >> 8) & 0xff)
		this.buffer.push((value >> 16) & 0xff)
		this.buffer.push((value >> 24) & 0xff)
	}

	writeBytes(data: Uint8Array): void {
		for (const byte of data) {
			this.buffer.push(byte)
		}
	}

	writeString(str: string, length: number): void {
		const bytes = new TextEncoder().encode(str)
		for (let i = 0; i < length; i++) {
			this.buffer.push(i < bytes.length ? bytes[i]! : 0x20) // Pad with spaces
		}
	}

	get position(): number {
		return this.buffer.length
	}

	setU32(offset: number, value: number): void {
		this.buffer[offset] = value & 0xff
		this.buffer[offset + 1] = (value >> 8) & 0xff
		this.buffer[offset + 2] = (value >> 16) & 0xff
		this.buffer[offset + 3] = (value >> 24) & 0xff
	}

	getData(): Uint8Array {
		return new Uint8Array(this.buffer)
	}
}

interface DicomElement {
	tag: number
	vr: string
	value: string | number | Uint8Array
}

/**
 * Encode ImageData to DICOM
 */
export function encodeDicom(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	const writer = new DicomWriter()

	// Write 128-byte preamble (zeros)
	for (let i = 0; i < DICOM_MAGIC_OFFSET; i++) {
		writer.writeU8(0)
	}

	// Write DICM magic
	writer.writeString(DICOM_MAGIC, 4)

	// Generate UIDs (simplified)
	const sopInstanceUID = generateUID()
	const transferSyntaxUID = TransferSyntax.ExplicitVRLittleEndian

	// File Meta Information (Group 0002)
	const metaElements: DicomElement[] = [
		{ tag: 0x00020001, vr: 'OB', value: new Uint8Array([0x00, 0x01]) }, // Version
		{ tag: 0x00020002, vr: 'UI', value: '1.2.840.10008.5.1.4.1.1.7' }, // Secondary Capture SOP Class
		{ tag: 0x00020003, vr: 'UI', value: sopInstanceUID },
		{ tag: 0x00020010, vr: 'UI', value: transferSyntaxUID },
		{ tag: 0x00020012, vr: 'UI', value: '1.2.840.10008.1' }, // Implementation Class UID
		{ tag: 0x00020013, vr: 'SH', value: 'MCONV_1_0' }, // Implementation Version
	]

	// Calculate meta information group length
	const metaLengthPos = writer.position
	writeElement(writer, { tag: 0x00020000, vr: 'UL', value: 0 }) // Placeholder

	const metaStart = writer.position
	for (const element of metaElements) {
		writeElement(writer, element)
	}
	const metaLength = writer.position - metaStart

	// Update meta information group length
	writer.setU32(metaLengthPos + 8, metaLength)

	// Detect if image has meaningful alpha
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 255) {
			hasAlpha = true
			break
		}
	}

	// Check if image is grayscale
	let isGrayscale = true
	for (let i = 0; i < data.length; i += 4) {
		if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) {
			isGrayscale = false
			break
		}
	}

	// Prepare pixel data
	let pixelData: Uint8Array
	let samplesPerPixel: number
	let photometricInterpretation: string

	if (isGrayscale) {
		// Extract grayscale values
		samplesPerPixel = 1
		photometricInterpretation = PhotometricInterpretation.Monochrome2
		pixelData = new Uint8Array(width * height)

		for (let i = 0; i < width * height; i++) {
			pixelData[i] = data[i * 4]!
		}
	} else {
		// Use RGB
		samplesPerPixel = 3
		photometricInterpretation = PhotometricInterpretation.RGB
		pixelData = new Uint8Array(width * height * 3)

		for (let i = 0; i < width * height; i++) {
			pixelData[i * 3] = data[i * 4]!
			pixelData[i * 3 + 1] = data[i * 4 + 1]!
			pixelData[i * 3 + 2] = data[i * 4 + 2]!
		}
	}

	// Main dataset
	const elements: DicomElement[] = [
		// Patient module (minimal)
		{ tag: DicomTag.PatientName, vr: 'PN', value: 'ANONYMOUS' },
		{ tag: DicomTag.PatientID, vr: 'LO', value: '000000' },

		// Study module (minimal)
		{ tag: DicomTag.StudyDate, vr: 'DA', value: getDateString() },
		{ tag: DicomTag.StudyTime, vr: 'TM', value: getTimeString() },
		{ tag: DicomTag.StudyInstanceUID, vr: 'UI', value: generateUID() },

		// Image module
		{ tag: DicomTag.Rows, vr: 'US', value: height },
		{ tag: DicomTag.Columns, vr: 'US', value: width },
		{ tag: DicomTag.BitsAllocated, vr: 'US', value: 8 },
		{ tag: DicomTag.BitsStored, vr: 'US', value: 8 },
		{ tag: DicomTag.HighBit, vr: 'US', value: 7 },
		{ tag: DicomTag.PixelRepresentation, vr: 'US', value: 0 }, // Unsigned
		{ tag: DicomTag.SamplesPerPixel, vr: 'US', value: samplesPerPixel },
		{ tag: DicomTag.PhotometricInterpretation, vr: 'CS', value: photometricInterpretation },
		{ tag: DicomTag.PlanarConfiguration, vr: 'US', value: 0 },
		{ tag: DicomTag.Modality, vr: 'CS', value: 'OT' }, // Other

		// Pixel data - use OB for 8-bit, OW for 16-bit
		{ tag: DicomTag.PixelData, vr: 'OB', value: pixelData },
	]

	// Write dataset elements
	for (const element of elements) {
		writeElement(writer, element)
	}

	return writer.getData()
}

/**
 * Write a DICOM element
 */
function writeElement(writer: DicomWriter, element: DicomElement): void {
	const group = (element.tag >> 16) & 0xffff
	const elem = element.tag & 0xffff

	writer.writeU16(group)
	writer.writeU16(elem)

	// Write VR (2 bytes)
	writer.writeString(element.vr, 2)

	const { value, vr } = element

	// Determine if we need 32-bit length
	const uses32BitLength =
		vr === 'OB' ||
		vr === 'OD' ||
		vr === 'OF' ||
		vr === 'OL' ||
		vr === 'OW' ||
		vr === 'SQ' ||
		vr === 'UC' ||
		vr === 'UN' ||
		vr === 'UR' ||
		vr === 'UT'

	if (uses32BitLength) {
		writer.writeU16(0) // Reserved
	}

	// Write value
	if (typeof value === 'string') {
		let strValue = value
		// Pad to even length
		if (strValue.length % 2) {
			strValue += ' '
		}

		const length = strValue.length
		if (uses32BitLength) {
			writer.writeU32(length)
		} else {
			writer.writeU16(length)
		}
		writer.writeString(strValue, length)
	} else if (typeof value === 'number') {
		let length: number
		switch (vr) {
			case 'US':
			case 'SS':
				length = 2
				break
			case 'UL':
			case 'SL':
			case 'FL':
				length = 4
				break
			case 'FD':
				length = 8
				break
			default:
				length = 2
		}

		if (uses32BitLength) {
			writer.writeU32(length)
		} else {
			writer.writeU16(length)
		}

		switch (vr) {
			case 'US':
			case 'SS':
				writer.writeU16(value)
				break
			case 'UL':
			case 'SL':
				writer.writeU32(value)
				break
			default:
				writer.writeU16(value)
		}
	} else if (value instanceof Uint8Array) {
		let length = value.length
		// Pad to even length
		const needsPadding = length % 2
		if (needsPadding) length++

		if (uses32BitLength) {
			writer.writeU32(length)
		} else {
			writer.writeU16(length)
		}
		writer.writeBytes(value)
		if (needsPadding) {
			writer.writeU8(0)
		}
	}
}

/**
 * Generate a simple UID
 */
function generateUID(): string {
	const timestamp = Date.now()
	const random = Math.floor(Math.random() * 1000000)
	return `1.2.840.10008.${timestamp}.${random}`
}

/**
 * Get date string in DICOM format (YYYYMMDD)
 */
function getDateString(): string {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return `${year}${month}${day}`
}

/**
 * Get time string in DICOM format (HHMMSS)
 */
function getTimeString(): string {
	const now = new Date()
	const hours = String(now.getHours()).padStart(2, '0')
	const minutes = String(now.getMinutes()).padStart(2, '0')
	const seconds = String(now.getSeconds()).padStart(2, '0')
	return `${hours}${minutes}${seconds}`
}
