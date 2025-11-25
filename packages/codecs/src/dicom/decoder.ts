import type { ImageData } from '@sylphx/codec-core'
import {
	DICOM_MAGIC,
	DICOM_MAGIC_OFFSET,
	DicomTag,
	type DicomElement,
	type DicomImage,
	PhotometricInterpretation,
	type PixelInfo,
	TransferSyntax,
	VR_INFO,
} from './types'

/**
 * Binary reader with endianness support
 */
class DicomReader {
	private data: Uint8Array
	private view: DataView
	private pos = 0
	littleEndian = true

	constructor(data: Uint8Array, littleEndian = true) {
		this.data = data
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
		this.littleEndian = littleEndian
	}

	get position(): number {
		return this.pos
	}

	set position(pos: number) {
		this.pos = pos
	}

	get remaining(): number {
		return this.data.length - this.pos
	}

	readU8(): number {
		return this.data[this.pos++]!
	}

	readU16(): number {
		const val = this.view.getUint16(this.pos, this.littleEndian)
		this.pos += 2
		return val
	}

	readU32(): number {
		const val = this.view.getUint32(this.pos, this.littleEndian)
		this.pos += 4
		return val
	}

	readI16(): number {
		const val = this.view.getInt16(this.pos, this.littleEndian)
		this.pos += 2
		return val
	}

	readI32(): number {
		const val = this.view.getInt32(this.pos, this.littleEndian)
		this.pos += 4
		return val
	}

	readF32(): number {
		const val = this.view.getFloat32(this.pos, this.littleEndian)
		this.pos += 4
		return val
	}

	readF64(): number {
		const val = this.view.getFloat64(this.pos, this.littleEndian)
		this.pos += 8
		return val
	}

	readBytes(length: number): Uint8Array {
		const bytes = this.data.slice(this.pos, this.pos + length)
		this.pos += length
		return bytes
	}

	readString(length: number): string {
		const bytes = this.readBytes(length)
		const text = new TextDecoder().decode(bytes)
		// Trim null bytes and whitespace
		return text.replace(/\0/g, '').trim()
	}

	skip(bytes: number): void {
		this.pos += bytes
	}
}

/**
 * Decode DICOM to ImageData
 */
export function decodeDicom(data: Uint8Array): ImageData {
	const dicom = parseDicom(data)

	// Extract pixel information
	const pixelInfo = extractPixelInfo(dicom)

	// Get pixel data element
	const pixelDataElement = dicom.elements.get(DicomTag.PixelData)
	if (!pixelDataElement) {
		throw new Error('No pixel data found in DICOM')
	}

	const pixelData = pixelDataElement.value as Uint8Array

	// Convert to RGBA
	return convertToRGBA(pixelData, pixelInfo)
}

/**
 * Parse DICOM structure
 */
export function parseDicom(data: Uint8Array): DicomImage {
	const reader = new DicomReader(data)

	// Skip 128-byte preamble
	reader.position = DICOM_MAGIC_OFFSET

	// Check magic
	const magic = reader.readString(4)
	if (magic !== DICOM_MAGIC) {
		throw new Error(`Invalid DICOM magic: expected ${DICOM_MAGIC}, got ${magic}`)
	}

	// Start with explicit VR little endian (most common)
	let explicitVR = true
	let littleEndian = true

	const elements = new Map<number, DicomElement>()

	// Read file meta information group (always explicit VR little endian)
	while (reader.remaining > 8) {
		const element = readElement(reader, true, true)
		if (!element) break

		elements.set(element.tag, element)

		// Check for transfer syntax
		if (element.tag === DicomTag.TransferSyntaxUID) {
			const transferSyntax = (element.value as string).trim()

			if (transferSyntax === TransferSyntax.ImplicitVRLittleEndian) {
				explicitVR = false
				littleEndian = true
			} else if (transferSyntax === TransferSyntax.ExplicitVRBigEndian) {
				explicitVR = true
				littleEndian = false
				reader.littleEndian = false
			} else {
				explicitVR = true
				littleEndian = true
			}
		}

		// Exit meta info group (group 0002)
		if ((element.tag >> 16) !== 0x0002) {
			break
		}
	}

	// Read main dataset
	while (reader.remaining > 8) {
		const element = readElement(reader, explicitVR, littleEndian)
		if (!element) break
		elements.set(element.tag, element)
	}

	return { littleEndian, explicitVR, elements }
}

/**
 * Read a DICOM data element
 */
function readElement(
	reader: DicomReader,
	explicitVR: boolean,
	littleEndian: boolean
): DicomElement | null {
	if (reader.remaining < 8) return null

	const group = reader.readU16()
	const element = reader.readU16()
	const tag = (group << 16) | element

	let vr = ''
	let length = 0

	if (explicitVR) {
		// Read VR (2 bytes)
		vr = String.fromCharCode(reader.readU8(), reader.readU8())

		const vrInfo = VR_INFO[vr]
		if (!vrInfo) {
			// Unknown VR, treat as UN
			vr = 'UN'
		}

		// Check if VR uses 32-bit length
		if (vr === 'OB' || vr === 'OD' || vr === 'OF' || vr === 'OL' || vr === 'OW' || vr === 'SQ' || vr === 'UC' || vr === 'UN' || vr === 'UR' || vr === 'UT') {
			reader.skip(2) // Reserved bytes
			length = reader.readU32()
		} else {
			// 16-bit length
			length = reader.readU16()
		}
	} else {
		// Implicit VR - use tag dictionary to determine VR
		vr = getImplicitVR(tag)
		length = reader.readU32()
	}

	// Handle undefined length
	if (length === 0xffffffff) {
		// Skip sequences with undefined length for now
		vr = 'SQ'
		length = 0
	}

	// Read value
	const value = readValue(reader, vr, length, explicitVR, littleEndian)

	return { tag, vr, length, value }
}

/**
 * Get VR for implicit VR encoding based on tag
 */
function getImplicitVR(tag: number): string {
	// Common tags - simplified dictionary
	switch (tag) {
		case DicomTag.Rows:
		case DicomTag.Columns:
		case DicomTag.BitsAllocated:
		case DicomTag.BitsStored:
		case DicomTag.HighBit:
		case DicomTag.PixelRepresentation:
		case DicomTag.SamplesPerPixel:
		case DicomTag.PlanarConfiguration:
			return 'US'
		case DicomTag.PhotometricInterpretation:
		case DicomTag.Modality:
			return 'CS'
		case DicomTag.PatientName:
			return 'PN'
		case DicomTag.PatientID:
		case DicomTag.StudyID:
			return 'LO'
		case DicomTag.TransferSyntaxUID:
		case DicomTag.StudyInstanceUID:
			return 'UI'
		case DicomTag.WindowCenter:
		case DicomTag.WindowWidth:
		case DicomTag.RescaleIntercept:
		case DicomTag.RescaleSlope:
			return 'DS'
		case DicomTag.PixelData:
			return 'OW'
		default:
			return 'UN'
	}
}

/**
 * Read value based on VR
 */
function readValue(
	reader: DicomReader,
	vr: string,
	length: number,
	explicitVR: boolean,
	littleEndian: boolean
): any {
	if (length === 0) return null

	switch (vr) {
		case 'US': // Unsigned Short
			if (length === 2) return reader.readU16()
			return readNumberArray(reader, length, 'US')

		case 'SS': // Signed Short
			if (length === 2) return reader.readI16()
			return readNumberArray(reader, length, 'SS')

		case 'UL': // Unsigned Long
			if (length === 4) return reader.readU32()
			return readNumberArray(reader, length, 'UL')

		case 'SL': // Signed Long
			if (length === 4) return reader.readI32()
			return readNumberArray(reader, length, 'SL')

		case 'FL': // Float
			if (length === 4) return reader.readF32()
			return readNumberArray(reader, length, 'FL')

		case 'FD': // Double
			if (length === 8) return reader.readF64()
			return readNumberArray(reader, length, 'FD')

		case 'AT': // Attribute Tag
			return reader.readU32()

		case 'OW': // Other Word (pixel data)
		case 'OB': // Other Byte
			return reader.readBytes(length)

		case 'DS': // Decimal String
		case 'IS': { // Integer String
			const str = reader.readString(length)
			const nums = str.split('\\').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
			return nums.length === 1 ? nums[0] : nums
		}

		case 'SQ': // Sequence - skip for now
			reader.skip(length)
			return null

		default: // String types
			return reader.readString(length)
	}
}

/**
 * Read array of numbers
 */
function readNumberArray(reader: DicomReader, length: number, vr: string): number[] {
	const values: number[] = []
	const elementSize = vr === 'US' || vr === 'SS' ? 2 : vr === 'UL' || vr === 'SL' || vr === 'FL' ? 4 : 8
	const count = length / elementSize

	for (let i = 0; i < count; i++) {
		switch (vr) {
			case 'US':
				values.push(reader.readU16())
				break
			case 'SS':
				values.push(reader.readI16())
				break
			case 'UL':
				values.push(reader.readU32())
				break
			case 'SL':
				values.push(reader.readI32())
				break
			case 'FL':
				values.push(reader.readF32())
				break
			case 'FD':
				values.push(reader.readF64())
				break
		}
	}

	return values
}

/**
 * Extract pixel information from DICOM
 */
function extractPixelInfo(dicom: DicomImage): PixelInfo {
	const get = (tag: DicomTag, defaultValue: any = 0) => {
		const element = dicom.elements.get(tag)
		return element ? element.value : defaultValue
	}

	const getOptional = (tag: DicomTag) => {
		const element = dicom.elements.get(tag)
		return element ? element.value : undefined
	}

	return {
		rows: get(DicomTag.Rows) as number,
		columns: get(DicomTag.Columns) as number,
		bitsAllocated: get(DicomTag.BitsAllocated, 8) as number,
		bitsStored: get(DicomTag.BitsStored, 8) as number,
		highBit: get(DicomTag.HighBit, 7) as number,
		pixelRepresentation: get(DicomTag.PixelRepresentation, 0) as number,
		samplesPerPixel: get(DicomTag.SamplesPerPixel, 1) as number,
		photometricInterpretation: get(DicomTag.PhotometricInterpretation, 'MONOCHROME2') as string,
		planarConfiguration: get(DicomTag.PlanarConfiguration, 0) as number,
		windowCenter: getOptional(DicomTag.WindowCenter) as number | undefined,
		windowWidth: getOptional(DicomTag.WindowWidth) as number | undefined,
		rescaleIntercept: get(DicomTag.RescaleIntercept, 0) as number,
		rescaleSlope: get(DicomTag.RescaleSlope, 1) as number,
	}
}

/**
 * Convert pixel data to RGBA
 */
function convertToRGBA(pixelData: Uint8Array, info: PixelInfo): ImageData {
	const { rows, columns, bitsAllocated, samplesPerPixel, photometricInterpretation, pixelRepresentation } = info

	const output = new Uint8Array(columns * rows * 4)

	// Create view based on bits allocated
	let pixelView: Uint8Array | Uint16Array | Int16Array
	if (bitsAllocated === 8) {
		pixelView = pixelData
	} else if (bitsAllocated === 16) {
		if (pixelRepresentation === 0) {
			pixelView = new Uint16Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength / 2)
		} else {
			pixelView = new Int16Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength / 2)
		}
	} else {
		throw new Error(`Unsupported bits allocated: ${bitsAllocated}`)
	}

	// Determine grayscale range for normalization
	let minVal = 0
	let maxVal = 255
	let shouldNormalize = false

	if (samplesPerPixel === 1) {
		// For 8-bit images without windowing, preserve values
		if (bitsAllocated === 8 && info.windowCenter === undefined && info.windowWidth === undefined) {
			shouldNormalize = false
			minVal = 0
			maxVal = 255
		} else {
			shouldNormalize = true
			minVal = Infinity
			maxVal = -Infinity

			// Find min/max for grayscale
			for (let i = 0; i < pixelView.length; i++) {
				const val = pixelView[i]!
				if (val < minVal) minVal = val
				if (val > maxVal) maxVal = val
			}

			// Apply rescale if available
			minVal = minVal * info.rescaleSlope + info.rescaleIntercept
			maxVal = maxVal * info.rescaleSlope + info.rescaleIntercept

			// Use window center/width if available
			if (info.windowCenter !== undefined && info.windowWidth !== undefined) {
				const wc = Array.isArray(info.windowCenter) ? info.windowCenter[0]! : info.windowCenter
				const ww = Array.isArray(info.windowWidth) ? info.windowWidth[0]! : info.windowWidth
				minVal = wc - ww / 2
				maxVal = wc + ww / 2
			}
		}
	}

	const range = maxVal - minVal || 1

	// Convert pixels
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < columns; x++) {
			const outIdx = (y * columns + x) * 4
			let r = 0
			let g = 0
			let b = 0
			const a = 255

			if (samplesPerPixel === 1) {
				// Grayscale
				const inIdx = y * columns + x
				let gray = pixelView[inIdx]!

				let normalized: number
				if (shouldNormalize) {
					// Apply rescale
					gray = gray * info.rescaleSlope + info.rescaleIntercept

					// Normalize to 0-255
					normalized = Math.round(((gray - minVal) / range) * 255)
					normalized = Math.max(0, Math.min(255, normalized))
				} else {
					// For 8-bit images, use value as-is
					normalized = gray
				}

				// Handle MONOCHROME1 (inverted)
				if (photometricInterpretation === PhotometricInterpretation.Monochrome1) {
					normalized = 255 - normalized
				}

				r = g = b = normalized
			} else if (samplesPerPixel === 3) {
				// RGB
				const inIdx = (y * columns + x) * 3
				r = pixelView[inIdx]!
				g = pixelView[inIdx + 1]!
				b = pixelView[inIdx + 2]!

				// Normalize if 16-bit
				if (bitsAllocated === 16) {
					r = Math.round((r / 65535) * 255)
					g = Math.round((g / 65535) * 255)
					b = Math.round((b / 65535) * 255)
				}
			}

			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = a
		}
	}

	return { width: columns, height: rows, data: output }
}
