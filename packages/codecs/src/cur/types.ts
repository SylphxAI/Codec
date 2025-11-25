/**
 * CUR (Windows Cursor) format types
 */

import type { ImageData } from '@sylphx/codec-core'

/** Cursor image with hotspot */
export interface CursorImage extends ImageData {
	/** Hotspot X coordinate */
	hotspotX: number
	/** Hotspot Y coordinate */
	hotspotY: number
}

/** Cursor file with multiple sizes */
export interface CursorFile {
	/** All cursor images */
	cursors: CursorImage[]
}

/** CUR encode options */
export interface CurEncodeOptions {
	/** Hotspot X coordinate (default: 0) */
	hotspotX?: number
	/** Hotspot Y coordinate (default: 0) */
	hotspotY?: number
	/** Use PNG compression for 32-bit images (default: true) */
	usePng?: boolean
}
