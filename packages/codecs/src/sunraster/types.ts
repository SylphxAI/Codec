/**
 * Sun Raster format types
 * Image format used in SunOS/Solaris
 */

// Magic number
export const RAS_MAGIC = 0x59a66a95

// Raster types
export const RT_STANDARD = 1 // Uncompressed
export const RT_BYTE_ENCODED = 2 // RLE compressed
export const RT_FORMAT_RGB = 3 // RGB (vs BGR)

// Color map types
export const RMT_NONE = 0 // No colormap
export const RMT_EQUAL_RGB = 1 // RGB colormap
export const RMT_RAW = 2 // Raw colormap

export interface SunRasterEncodeOptions {
	compress?: boolean // Use RLE compression (default: false)
}
