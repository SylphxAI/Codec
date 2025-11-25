/**
 * ANI (Animated Cursor) format types
 */

import type { CursorImage } from '../cur/types'

/** ANI animation header */
export interface AniHeader {
	/** Header size (36 bytes) */
	cbSize: number
	/** Number of frames */
	nFrames: number
	/** Number of steps in sequence */
	nSteps: number
	/** Width (0 = use frame size) */
	cx: number
	/** Height (0 = use frame size) */
	cy: number
	/** Bits per pixel */
	bpp: number
	/** Number of planes */
	nPlanes: number
	/** Default frame display rate (jiffies, 1/60th sec) */
	jifRate: number
	/** Flags */
	flags: number
}

/** ANI flags */
export const ANI_FLAG_ICON = 0x01 // Frames are icons/cursors (not raw)
export const ANI_FLAG_SEQUENCE = 0x02 // Has custom sequence

/** Animated cursor */
export interface AnimatedCursor {
	/** Animation header */
	header: AniHeader
	/** Frame images */
	frames: CursorImage[]
	/** Frame durations (jiffies) */
	rates?: number[]
	/** Frame sequence (indices) */
	sequence?: number[]
	/** Title (optional) */
	title?: string
	/** Author (optional) */
	author?: string
}

/** ANI encode options */
export interface AniEncodeOptions {
	/** Default frame rate in jiffies (1/60th sec, default: 10) */
	defaultRate?: number
	/** Title metadata */
	title?: string
	/** Author metadata */
	author?: string
}
