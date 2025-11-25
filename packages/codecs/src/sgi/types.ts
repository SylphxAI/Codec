/**
 * SGI (Silicon Graphics Image) format types
 * Also known as RGB or IRIS format
 */

// SGI Magic number
export const SGI_MAGIC = 0x01da

// Storage types
export const SGI_VERBATIM = 0 // Uncompressed
export const SGI_RLE = 1 // RLE compressed

// Colormap types
export const SGI_NORMAL = 0 // Normal (no colormap)
export const SGI_DITHERED = 1 // Dithered (obsolete)
export const SGI_SCREEN = 2 // Screen (obsolete)
export const SGI_COLORMAP = 3 // Colormap (obsolete)

export interface SGIEncodeOptions {
	compress?: boolean // Use RLE compression (default: false)
}
