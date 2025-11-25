/**
 * Raw image data in RGBA format
 * Each pixel is 4 bytes: R, G, B, A (0-255)
 */
export interface ImageData {
	readonly width: number
	readonly height: number
	readonly data: Uint8Array // RGBA, length = width * height * 4
}

/**
 * Video frame with timing information
 */
export interface VideoFrame {
	readonly image: ImageData
	readonly timestamp: number // milliseconds
	readonly duration: number // milliseconds
}

/**
 * Video data with frames and metadata
 */
export interface VideoData {
	readonly width: number
	readonly height: number
	readonly frames: readonly VideoFrame[]
	readonly duration: number // total milliseconds
	readonly fps: number
}

/**
 * Supported image formats
 */
export type ImageFormat = 'bmp' | 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'tiff' | 'ico' | 'tga' | 'qoi'

/**
 * Supported video formats
 */
export type VideoFormat = 'mp4' | 'webm' | 'gif' | 'avi' | 'mov'

/**
 * Any supported format
 */
export type Format = ImageFormat | VideoFormat

/**
 * Codec interface for encoding/decoding
 */
export interface Codec<T> {
	readonly format: Format
	decode(data: Uint8Array): T
	encode(input: T, options?: EncodeOptions): Uint8Array
}

/**
 * Image codec
 */
export type ImageCodec = Codec<ImageData>

/**
 * Video codec
 */
export type VideoCodec = Codec<VideoData>

/**
 * Encode options
 */
export interface EncodeOptions {
	quality?: number // 0-100
}

/**
 * Resize options
 */
export interface ResizeOptions {
	width?: number
	height?: number
	fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside'
	kernel?: 'nearest' | 'bilinear' | 'bicubic' | 'lanczos'
}

/**
 * Crop options
 */
export interface CropOptions {
	x: number
	y: number
	width: number
	height: number
}

/**
 * Rotate options
 */
export interface RotateOptions {
	angle: 0 | 90 | 180 | 270
}

/**
 * Color adjustment options
 */
export interface ColorOptions {
	brightness?: number // -100 to 100
	contrast?: number // -100 to 100
	saturation?: number // -100 to 100
	hue?: number // 0 to 360
}

/**
 * Backend type
 */
export type Backend = 'wasm' | 'js'

/**
 * Processing context
 */
export interface Context {
	backend: Backend
}

/**
 * Create empty ImageData
 */
export function createImageData(width: number, height: number): ImageData {
	return {
		width,
		height,
		data: new Uint8Array(width * height * 4),
	}
}

/**
 * Clone ImageData
 */
export function cloneImageData(image: ImageData): ImageData {
	return {
		width: image.width,
		height: image.height,
		data: new Uint8Array(image.data),
	}
}

/**
 * Get pixel at (x, y)
 */
export function getPixel(image: ImageData, x: number, y: number): [number, number, number, number] {
	const idx = (y * image.width + x) * 4
	return [image.data[idx]!, image.data[idx + 1]!, image.data[idx + 2]!, image.data[idx + 3]!]
}

/**
 * Set pixel at (x, y)
 */
export function setPixel(
	image: ImageData,
	x: number,
	y: number,
	r: number,
	g: number,
	b: number,
	a: number
): void {
	const idx = (y * image.width + x) * 4
	image.data[idx] = r
	image.data[idx + 1] = g
	image.data[idx + 2] = b
	image.data[idx + 3] = a
}
