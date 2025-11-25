/**
 * KTX (Khronos Texture) format types
 * OpenGL/Vulkan texture container format
 */

// KTX1 magic number (12 bytes)
export const KTX1_MAGIC = new Uint8Array([
	0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]) // «KTX 11»\r\n\x1a\n

// OpenGL format constants
export const GL_RGBA = 0x1908
export const GL_RGB = 0x1907
export const GL_LUMINANCE = 0x1909
export const GL_LUMINANCE_ALPHA = 0x190a
export const GL_ALPHA = 0x1906

export const GL_UNSIGNED_BYTE = 0x1401
export const GL_UNSIGNED_SHORT = 0x1403
export const GL_FLOAT = 0x1406

export const GL_RGBA8 = 0x8058
export const GL_RGB8 = 0x8051
export const GL_R8 = 0x8229
export const GL_RG8 = 0x822b

// Compressed formats
export const GL_COMPRESSED_RGB_S3TC_DXT1 = 0x83f0
export const GL_COMPRESSED_RGBA_S3TC_DXT1 = 0x83f1
export const GL_COMPRESSED_RGBA_S3TC_DXT3 = 0x83f2
export const GL_COMPRESSED_RGBA_S3TC_DXT5 = 0x83f3
export const GL_ETC1_RGB8 = 0x8d64

export type KTXEncodeOptions = Record<string, never>
