/**
 * GIMP XCF encoder
 * Currently not implemented - XCF encoding is complex and rarely needed
 */

import type { ImageData } from '@sylphx/codec-core'

/**
 * Encode ImageData to XCF format
 * @throws Error - XCF encoding not implemented
 */
export function encodeXcf(imageData: ImageData): Uint8Array {
	throw new Error('XCF encoding not implemented')
}
