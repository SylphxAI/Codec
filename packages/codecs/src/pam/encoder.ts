/**
 * PAM (Portable Arbitrary Map) encoder
 * Always outputs RGB_ALPHA format
 */

import type { ImageData } from '@mconv/core'

/**
 * Encode image to PAM format
 */
export function encodePam(image: ImageData): Uint8Array {
	const { width, height, data } = image

	// Build header
	const header = `${[
		'P7',
		`WIDTH ${width}`,
		`HEIGHT ${height}`,
		'DEPTH 4',
		'MAXVAL 255',
		'TUPLTYPE RGB_ALPHA',
		'ENDHDR',
	].join('\n')}\n`

	const headerBytes = new TextEncoder().encode(header)

	// Build pixel data
	const pixelSize = width * height * 4
	const output = new Uint8Array(headerBytes.length + pixelSize)

	// Write header
	output.set(headerBytes, 0)

	// Write pixel data
	output.set(data, headerBytes.length)

	return output
}
