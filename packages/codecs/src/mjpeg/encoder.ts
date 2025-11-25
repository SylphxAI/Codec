/**
 * MJPEG (Motion JPEG) encoder
 * Encodes image sequence to raw MJPEG stream
 */

import type { ImageData } from '@sylphx/codec-core'
import { encodeJpeg } from '../jpeg'
import type { MjpegEncodeOptions, MjpegFrame, MjpegInfo, MjpegStream } from './types'

/**
 * Encode images to raw MJPEG stream
 */
export function encodeMjpeg(images: ImageData[], options: MjpegEncodeOptions = {}): Uint8Array {
	const { quality = 90, frameRate = 30 } = options

	if (images.length === 0) {
		return new Uint8Array(0)
	}

	// Encode each frame to JPEG
	const jpegFrames: Uint8Array[] = images.map((img) => encodeJpeg(img, { quality }))

	// Calculate total size
	let totalSize = 0
	for (const frame of jpegFrames) {
		totalSize += frame.length
	}

	// Concatenate all frames
	const result = new Uint8Array(totalSize)
	let offset = 0

	for (const frame of jpegFrames) {
		result.set(frame, offset)
		offset += frame.length
	}

	return result
}

/**
 * Encode MjpegStream to raw data
 */
export function encodeMjpegStream(stream: MjpegStream): Uint8Array {
	// Calculate total size
	let totalSize = 0
	for (const frame of stream.frames) {
		totalSize += frame.data.length
	}

	// Concatenate all frames
	const result = new Uint8Array(totalSize)
	let offset = 0

	for (const frame of stream.frames) {
		result.set(frame.data, offset)
		offset += frame.data.length
	}

	return result
}

/**
 * Create MJPEG stream from images
 */
export function createMjpegStream(
	images: ImageData[],
	options: MjpegEncodeOptions = {}
): MjpegStream {
	const { quality = 90, frameRate = 30 } = options

	if (images.length === 0) {
		return {
			info: {
				width: 0,
				height: 0,
				frameCount: 0,
				frameRate,
				duration: 0,
			},
			frames: [],
		}
	}

	const frames: MjpegFrame[] = []
	const width = images[0]!.width
	const height = images[0]!.height

	for (let i = 0; i < images.length; i++) {
		const jpegData = encodeJpeg(images[i]!, { quality })
		frames.push({
			index: i,
			timestamp: (i / frameRate) * 1000,
			data: jpegData,
			image: images[i],
		})
	}

	const info: MjpegInfo = {
		width,
		height,
		frameCount: images.length,
		frameRate,
		duration: (images.length / frameRate) * 1000,
	}

	return { info, frames }
}

/**
 * Add frame to existing stream
 */
export function addMjpegFrame(
	stream: MjpegStream,
	image: ImageData,
	options: { quality?: number } = {}
): MjpegStream {
	const { quality = 90 } = options
	const frameRate = stream.info.frameRate

	const jpegData = encodeJpeg(image, { quality })
	const newFrame: MjpegFrame = {
		index: stream.frames.length,
		timestamp: (stream.frames.length / frameRate) * 1000,
		data: jpegData,
		image,
	}

	const newFrames = [...stream.frames, newFrame]
	const newInfo: MjpegInfo = {
		...stream.info,
		frameCount: newFrames.length,
		duration: (newFrames.length / frameRate) * 1000,
	}

	return { info: newInfo, frames: newFrames }
}
