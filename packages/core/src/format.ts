import type { Format, ImageFormat, VideoFormat } from './types'

/**
 * Magic bytes for format detection
 */
const MAGIC_BYTES: Record<string, { bytes: number[]; mask?: number[]; offset?: number }> = {
	// Images
	bmp: { bytes: [0x42, 0x4d] }, // "BM"
	png: { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
	jpeg: { bytes: [0xff, 0xd8, 0xff] },
	gif: { bytes: [0x47, 0x49, 0x46, 0x38] }, // "GIF8"
	webp: { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // "RIFF" + "WEBP" at offset 8
	tiff_le: { bytes: [0x49, 0x49, 0x2a, 0x00] }, // Little endian
	tiff_be: { bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // Big endian
	ico: { bytes: [0x00, 0x00, 0x01, 0x00] },
	avif: { bytes: [0x00, 0x00, 0x00], offset: 4 }, // ftyp at offset 4

	// Videos
	mp4: { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // "ftyp"
	webm: { bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML header
	avi: { bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF" + "AVI " at offset 8
	mov: { bytes: [0x66, 0x74, 0x79, 0x70, 0x71, 0x74], offset: 4 }, // "ftypqt"
}

/**
 * Image formats set
 */
const IMAGE_FORMATS: Set<ImageFormat> = new Set([
	'bmp',
	'png',
	'jpeg',
	'gif',
	'webp',
	'avif',
	'tiff',
	'ico',
])

/**
 * Video formats set
 */
const VIDEO_FORMATS: Set<VideoFormat> = new Set(['mp4', 'webm', 'gif', 'avi', 'mov'])

/**
 * Check if bytes match magic signature
 */
function matchMagic(
	data: Uint8Array,
	magic: { bytes: number[]; mask?: number[]; offset?: number }
): boolean {
	const offset = magic.offset ?? 0
	if (data.length < offset + magic.bytes.length) return false

	for (let i = 0; i < magic.bytes.length; i++) {
		const byte = data[offset + i]!
		const expected = magic.bytes[i]!
		const mask = magic.mask?.[i] ?? 0xff
		if ((byte & mask) !== (expected & mask)) return false
	}
	return true
}

/**
 * Detect format from binary data
 */
export function detectFormat(data: Uint8Array): Format | null {
	// Check WebP (RIFF + WEBP)
	if (matchMagic(data, MAGIC_BYTES.webp!) && data.length >= 12) {
		const webp = [0x57, 0x45, 0x42, 0x50] // "WEBP"
		if (
			data[8] === webp[0] &&
			data[9] === webp[1] &&
			data[10] === webp[2] &&
			data[11] === webp[3]
		) {
			return 'webp'
		}
	}

	// Check AVI (RIFF + AVI)
	if (matchMagic(data, MAGIC_BYTES.avi!) && data.length >= 12) {
		const avi = [0x41, 0x56, 0x49, 0x20] // "AVI "
		if (data[8] === avi[0] && data[9] === avi[1] && data[10] === avi[2] && data[11] === avi[3]) {
			return 'avi'
		}
	}

	// Check AVIF/MP4/MOV (ISO Base Media)
	if (data.length >= 12 && matchMagic(data, { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 })) {
		// Read brand
		const brand = String.fromCharCode(data[8]!, data[9]!, data[10]!, data[11]!)
		if (brand === 'avif' || brand === 'avis') return 'avif'
		if (brand === 'qt  ' || brand.startsWith('qt')) return 'mov'
		// Default to mp4 for other ftyp
		return 'mp4'
	}

	// Check other formats
	if (matchMagic(data, MAGIC_BYTES.png!)) return 'png'
	if (matchMagic(data, MAGIC_BYTES.jpeg!)) return 'jpeg'
	if (matchMagic(data, MAGIC_BYTES.gif!)) return 'gif'
	if (matchMagic(data, MAGIC_BYTES.bmp!)) return 'bmp'
	if (matchMagic(data, MAGIC_BYTES.webm!)) return 'webm'
	if (matchMagic(data, MAGIC_BYTES.tiff_le!) || matchMagic(data, MAGIC_BYTES.tiff_be!))
		return 'tiff'
	if (matchMagic(data, MAGIC_BYTES.ico!)) return 'ico'

	return null
}

/**
 * Check if format is image
 */
export function isImageFormat(format: Format): format is ImageFormat {
	return IMAGE_FORMATS.has(format as ImageFormat)
}

/**
 * Check if format is video
 */
export function isVideoFormat(format: Format): format is VideoFormat {
	return VIDEO_FORMATS.has(format as VideoFormat)
}

/**
 * Get file extension for format
 */
export function getExtension(format: Format): string {
	if (format === 'jpeg') return 'jpg'
	return format
}

/**
 * Get MIME type for format
 */
export function getMimeType(format: Format): string {
	const prefix = isImageFormat(format) ? 'image' : 'video'
	const type = format === 'jpeg' ? 'jpeg' : format
	return `${prefix}/${type}`
}
