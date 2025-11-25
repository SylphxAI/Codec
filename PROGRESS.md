# mconv Progress Tracker

> Universal media converter, editor, and modifier
> 100% TypeScript + optional WASM acceleration

Last Updated: 2024

## 📊 Overall Status

| Category | Done | In Progress | Planned | Total |
|----------|------|-------------|---------|-------|
| Image Codecs | 30 | 0 | 5 | 35 |
| Video Codecs | 8 | 0 | 3 | 11 |
| Animation Codecs | 5 | 0 | 0 | 5 |
| Audio Codecs | 5 | 0 | 1 | 6 |
| Processing Packages | 8 | 0 | 0 | 8 |

**Tests**: 797 passing

---

## 🖼️ Image Codecs

### ✅ Completed (Pure TypeScript)

| Format | Decode | Encode | WASM | Notes |
|--------|--------|--------|------|-------|
| ANI | ✅ | ✅ | ⬜ | Animated cursor, RIFF |
| BMP | ✅ | ✅ | ⬜ | 1/4/8/16/24/32-bit, RLE |
| CUR | ✅ | ✅ | ⬜ | Cursor with hotspot |
| DDS | ✅ | ⬜ | ⬜ | DXT1/DXT3/DXT5, BC1-BC5 |
| Farbfeld | ✅ | ✅ | ⬜ | 16-bit RGBA |
| GIF | ✅ | ✅ | ⬜ | Animation, LZW |
| HDR | ✅ | ✅ | ⬜ | Radiance RGBE |
| ICO | ✅ | ✅ | ⬜ | Multi-resolution |
| JPEG | ✅ | ✅ | ⬜ | Baseline DCT |
| KTX | ✅ | ⬜ | ⬜ | OpenGL texture container |
| PAM | ✅ | ✅ | ⬜ | Portable Arbitrary Map |
| PCX | ✅ | ✅ | ⬜ | RLE compression |
| PFM | ✅ | ✅ | ⬜ | 32-bit float HDR |
| PIX | ✅ | ✅ | ⬜ | Alias/Wavefront, RLE |
| PNG | ✅ | ✅ | ⬜ | All bit depths, interlacing |
| PNM | ✅ | ✅ | ⬜ | PBM/PGM/PPM |
| PVR | ✅ | ⬜ | ⬜ | PowerVR textures |
| QOI | ✅ | ✅ | ⬜ | Quite OK Image |
| SGI | ✅ | ✅ | ⬜ | RGB/RGBA, RLE |
| Sun Raster | ✅ | ✅ | ⬜ | RLE compression |
| TGA | ✅ | ✅ | ⬜ | RLE, color mapped |
| TIFF | ✅ | ✅ | ⬜ | LZW, basic tags |
| VTF | ✅ | ⬜ | ⬜ | Valve Source Engine |
| WBMP | ✅ | ✅ | ⬜ | Wireless Bitmap |
| WebP | ✅ | ✅ | ⬜ | Lossy/Lossless, Animation |
| XBM | ✅ | ✅ | ⬜ | X Bitmap (monochrome) |
| XPM | ✅ | ✅ | ⬜ | X PixMap |
| EXR | ✅ | ✅ | ⬜ | OpenEXR HDR, HALF/FLOAT pixels |
| PSD | ✅ | ⬜ | ⬜ | Photoshop flattened, 8/16-bit, RGB/Gray/CMYK |
| ILBM/IFF | ✅ | ✅ | ⬜ | Amiga interleaved bitplanes, HAM, ByteRun1 |

### 📋 Planned (Pure TypeScript)

| Format | Decode | Encode | WASM | Priority | Notes |
|--------|--------|--------|------|----------|-------|
| SVG | ⬜ | ⬜ | ⬜ | Medium | Rasterize only |
| HEIC | ⬜ | ⬜ | 🔶 | High | HEIF container (WASM decode) |
| AVIF | ⬜ | ⬜ | 🔶 | High | AV1 still image (WASM decode) |
| JPEG-XL | ⬜ | ⬜ | 🔶 | High | Next-gen (WASM decode) |
| WebP2 | ⬜ | ⬜ | 🔶 | Low | Experimental |

### 🔶 WASM-Only (Complex Compression)

| Format | Decode | Encode | Notes |
|--------|--------|--------|-------|
| JPEG 2000 | ⬜ | ⬜ | Wavelet compression |
| JPEG-XR | ⬜ | ⬜ | Microsoft HD Photo |
| BPG | ⬜ | ⬜ | Better Portable Graphics |

---

## 🎬 Video Codecs

### ✅ Completed (Pure TypeScript)

| Format | Decode | Encode | WASM | Notes |
|--------|--------|--------|------|-------|
| MJPEG | ✅ | ✅ | ⬜ | Motion JPEG (frame sequence) |
| Raw YUV | ✅ | ✅ | ⬜ | I420/YV12/NV12/YUYV/YUV444 |
| Y4M | ✅ | ✅ | ⬜ | YUV4MPEG2 container, 4:2:0/4:2:2/4:4:4 |
| AVI | ✅ | ✅ | ⬜ | RIFF container, MJPEG video stream |
| FLV | ✅ | ✅ | ⬜ | Flash Video container, AMF0 metadata |
| MP4 | ✅ | ✅ | ⬜ | ISO Base Media File Format, MJPEG video |
| MKV | ✅ | ✅ | ⬜ | Matroska/WebM container, EBML format, MJPEG video |
| MPEG-TS | ✅ | ✅ | ⬜ | Transport Stream container, PAT/PMT/PES, MJPEG video |

### 🔶 WASM-Only (Inter-frame Compression)

| Format | Decode | Encode | Notes |
|--------|--------|--------|-------|
| H.264/AVC | ⬜ | ⬜ | Most common video codec |
| H.265/HEVC | ⬜ | ⬜ | High efficiency |
| AV1 | ⬜ | ⬜ | Open, royalty-free |
| VP8 | ⬜ | ⬜ | WebM legacy |
| VP9 | ⬜ | ⬜ | WebM current |

---

## 🎞️ Animation Codecs

### ✅ Completed (Pure TypeScript)

| Format | Decode | Encode | WASM | Notes |
|--------|--------|--------|------|-------|
| GIF | ✅ | ✅ | ⬜ | 256 colors, disposal |
| APNG | ✅ | ✅ | ⬜ | Animated PNG |
| WebP | ✅ | ✅ | ⬜ | Animated WebP |
| FLI/FLC | ✅ | ✅ | ⬜ | Autodesk Animator, delta compression |
| MNG | ✅ | ✅ | ⬜ | Multiple-image Network Graphics |

---

## 🔊 Audio Codecs

### ✅ Completed (Pure TypeScript)

| Format | Decode | Encode | WASM | Notes |
|--------|--------|--------|------|-------|
| WAV | ✅ | ✅ | ⬜ | PCM 8/16/24/32-bit, IEEE float |
| AIFF | ✅ | ✅ | ⬜ | Apple PCM, 80-bit extended float rate |
| AU | ✅ | ✅ | ⬜ | Sun/NeXT audio, μ-law/A-law decode |
| FLAC | ✅ | ✅ | ⬜ | Lossless compression, Rice coding, fixed prediction |
| OGG | ✅ | ✅ | ⬜ | Container format, OGG FLAC support |

### 🔶 WASM-Only

| Format | Decode | Encode | Notes |
|--------|--------|--------|-------|
| MP3 | ⬜ | ⬜ | MPEG Layer 3 |

---

## 🛠️ Processing Packages

### ✅ Completed

| Package | Tests | Features |
|---------|-------|----------|
| @mconv/transform | 19 | Resize (4 algorithms), crop, rotate, flip |
| @mconv/color | 17 | RGB↔HSL/HSV/CMYK/LAB, brightness, contrast, saturation, gamma, levels, effects |
| @mconv/filter | 20 | Gaussian/box blur, sharpen, Sobel/Prewitt/Laplacian edge detect, median/bilateral denoise, emboss |
| @mconv/composite | 22 | 24 blend modes, layers, masks, chroma key, alpha ops |
| @mconv/draw | 20 | Lines, shapes, polygons, gradients, flood fill |
| @mconv/histogram | 15 | Analysis, auto-levels, equalization, matching |
| @mconv/metadata | 16 | EXIF extraction, ICC profile parsing, GPS |
| @mconv/text | 22 | Text rendering, built-in 8x8 font, word wrap |

---

## 🚀 WASM Backend Architecture

### Design Goals
- Optional WASM acceleration for CPU-intensive operations
- Fallback to pure TS when WASM unavailable
- Same API for both implementations

### ✅ Implemented

| Module | Status | Notes |
|--------|--------|-------|
| Loader | ✅ | Auto-detect, fallback, benchmarking |
| Resize | ✅ | Nearest, bilinear, bicubic, Lanczos |
| BMP | 🚧 | Decode/encode scaffolding |

### WASM Candidates

| Operation | Speedup | Priority |
|-----------|---------|----------|
| JPEG decode/encode | 5-10x | High |
| PNG decode (zlib) | 3-5x | High |
| Resize (Lanczos) | 5-8x | High |
| Blur (large radius) | 10-20x | Medium |
| Color conversion (batch) | 3-5x | Medium |
| H.264/H.265 decode | Required | High |
| AV1 decode | Required | High |

### Implementation Plan

1. **Phase 1**: Core infrastructure
   - WASM loader with fallback
   - Shared memory management
   - Performance benchmarking

2. **Phase 2**: Image acceleration
   - zlib (PNG, TIFF)
   - libjpeg-turbo
   - Resize kernels

3. **Phase 3**: Video codecs
   - FFmpeg subset (decode only)
   - H.264, H.265, AV1, VP9

---

## 📈 Changelog

### 2024-XX-XX (Current Session)
- ✅ Added @mconv/color package (17 tests)
- ✅ Added @mconv/filter package (20 tests)
- ✅ Added @mconv/composite package (22 tests)
- ✅ Added @mconv/draw package (20 tests)
- ✅ Added CUR cursor codec (8 tests)
- ✅ Added ANI animated cursor codec (9 tests)
- ✅ Added @mconv/histogram package (15 tests)
- ✅ Added EXR OpenEXR HDR codec (9 tests)
- ✅ Added PSD Photoshop decoder (11 tests)
- ✅ Added @mconv/metadata package (16 tests)
- ✅ Added MJPEG video codec (18 tests)
- ✅ Added FLI/FLC animation codec (18 tests)
- ✅ Added WAV audio codec (20 tests)
- ✅ Added AIFF audio codec (19 tests)
- ✅ Added AU audio codec (21 tests)
- ✅ Added MNG animation codec (18 tests)
- ✅ Added Raw YUV video codec (26 tests)
- ✅ Added @mconv/text package (22 tests)
- ✅ Added ILBM/IFF image codec (16 tests)
- ✅ Added Y4M video container (23 tests)
- ✅ Added AVI video container (18 tests)
- ✅ Added FLV video container (16 tests)
- ✅ Added MP4 video container (18 tests)
- ✅ Added MKV/WebM video container (22 tests)
- ✅ Added FLAC audio codec (23 tests)
- ✅ Added OGG audio container (20 tests)
- ✅ Added MPEG-TS video container (19 tests)
- ✅ Added WASM resize module (Rust)
- ✅ Added WASM TypeScript loader
- 📝 Created PROGRESS.md for tracking

### Previous Sessions
- ✅ Added PFM, PVR, KTX, PIX, VTF codecs
- ✅ Added Sun Raster, PAM, WBMP, SGI, XBM codecs
- ✅ Added DDS, Farbfeld, XPM codecs
- ✅ Added @mconv/transform package
- ✅ Core image codecs (PNG, JPEG, GIF, WebP, etc.)

---

## 🎯 Next Steps

1. [ ] Set up WASM build infrastructure
2. [ ] Add WASM backend for JPEG
3. [ ] Add H.264 WASM decoder
4. [ ] Add MP3 audio codec (WASM)
5. [ ] Add SVG rasterizer
6. [x] Add MPEG-TS container

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Completed |
| ⬜ | Not started |
| 🔶 | WASM required/recommended |
| 🚧 | In progress |
