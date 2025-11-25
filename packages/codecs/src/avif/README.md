# AVIF Image Codec

Pure TypeScript implementation of the AVIF (AV1 Image File Format) codec.

## Overview

AVIF is a modern image format that uses AV1 intra-frame compression within a HEIF/ISOBMFF container. It offers excellent compression efficiency and supports features like HDR, wide color gamut, and transparency.

## Container Structure

AVIF uses the ISO Base Media File Format (ISOBMFF), similar to MP4 and HEIC:

```
AVIF File Structure:
├── ftyp (File Type Box) - Brand: 'avif' or 'avis'
├── meta (Metadata Box)
│   ├── hdlr (Handler) - Type: 'pict'
│   ├── pitm (Primary Item) - Item ID reference
│   ├── iloc (Item Location) - Offset/length of compressed data
│   ├── iinf (Item Info) - Item type: 'av01'
│   └── iprp (Item Properties)
│       ├── ipco (Property Container)
│       │   ├── ispe (Image Spatial Extents) - Width/Height
│       │   ├── pixi (Pixel Information) - Bit depth, channels
│       │   ├── av1C (AV1 Configuration)
│       │   └── colr (Color Information)
│       └── ipma (Property Association)
└── mdat (Media Data) - AV1 compressed bitstream
```

## Features

### Implemented

- ✅ ISOBMFF box parsing and writing
- ✅ Brand validation (avif, avis)
- ✅ Image metadata extraction (dimensions, bit depth, channels)
- ✅ Item location and reference handling
- ✅ Property container parsing (ispe, pixi, av1C, colr)
- ✅ Primary item identification
- ✅ Round-trip encoding/decoding structure

### Limitations

- ⚠️ **AV1 codec is placeholder**: Full AV1 intra-frame decoding/encoding is not implemented
- ⚠️ The decoder currently returns a test pattern instead of actual decoded pixels
- ⚠️ The encoder creates a minimal valid AV1 bitstream structure

## Why AV1 Codec is Not Fully Implemented

Full AV1 video codec implementation is extremely complex:

1. **Specification Size**: AV1 spec is 500+ pages with intricate algorithms
2. **Compression Complexity**: Involves prediction, transforms, entropy coding, loop filters
3. **Performance Requirements**: Needs SIMD optimization for acceptable speed
4. **Size vs Scope**: Would add 50,000+ lines of code

## Production Usage

For production AVIF support, consider these approaches:

### Option 1: WebAssembly Decoders

```typescript
// Using dav1d (decoder)
import dav1d from 'dav1d-wasm'

function decodeAV1WithDav1d(bitstream: Uint8Array, width: number, height: number) {
  const decoder = new dav1d.Decoder()
  const frame = decoder.decode(bitstream)
  return frame.pixels // YUV -> RGB conversion needed
}
```

### Option 2: Native Browser APIs

```typescript
// Modern browsers support native AVIF decoding
async function decodeWithImageDecoder(data: Uint8Array): Promise<ImageData> {
  const decoder = new ImageDecoder({ data, type: 'image/avif' })
  const result = await decoder.decode()
  return result.image
}
```

### Option 3: Server-Side Processing

```bash
# Using libavif CLI tools
avifenc input.png output.avif --speed 6 --quality 80
avifdec input.avif output.png
```

## Implementation Details

### Decoder

The decoder (`decoder.ts`) implements:

1. **Box Parser**: Recursive ISOBMFF box parsing with extended size support
2. **Brand Validation**: Checks ftyp box for AVIF/AVIS brands
3. **Metadata Extraction**: Parses ispe, pixi, and other property boxes
4. **Item Location**: Resolves iloc references to find compressed data in mdat
5. **Placeholder Decoder**: Returns gradient test pattern (placeholder for AV1 decoder)

### Encoder

The encoder (`encoder.ts`) implements:

1. **Box Writer**: Creates valid ISOBMFF box structure
2. **Metadata Generation**: Writes hdlr, pitm, iloc, iinf boxes
3. **Property Container**: Creates ispe, pixi, av1C, colr properties
4. **Item Association**: Links properties to primary item
5. **Placeholder Encoder**: Creates minimal AV1 OBU structure (temporal delimiter, sequence header, frame header)

## Testing

Comprehensive test suite in `decoder.test.ts`:

```bash
bun test packages/codecs/src/avif/decoder.test.ts
```

Tests cover:
- Format validation (brand checking)
- Box parsing (structure, multiple boxes, nesting)
- Image dimensions (small, large, various sizes)
- Output format (ImageData structure, RGBA layout)
- Round-trip encoding/decoding
- Error handling (empty, truncated, missing boxes)

## Example Usage

```typescript
import { AVIFCodec, decodeAVIF, encodeAVIF } from '@sylphx/codecs'

// Decode AVIF
const avifData = await Bun.file('image.avif').arrayBuffer()
const image = decodeAVIF(new Uint8Array(avifData))
console.log(`Decoded: ${image.width}x${image.height}`)

// Encode to AVIF
const imageData = {
  width: 100,
  height: 100,
  data: new Uint8Array(100 * 100 * 4), // RGBA pixels
}
const encoded = encodeAVIF(imageData, { quality: 80 })
await Bun.write('output.avif', encoded)

// Use codec interface
const decoded = AVIFCodec.decode(encoded)
const reencoded = AVIFCodec.encode(decoded)
```

## File Format Details

### Magic Bytes

AVIF files start with:
- Bytes 0-3: Box size (big-endian u32)
- Bytes 4-7: `ftyp` (0x66747970)
- Bytes 8-11: Major brand: `avif` (0x61766966) or `avis` (0x61766973)

### Compatible Brands

- `avif`: Standard AVIF image
- `avis`: AVIF image sequence (animated)
- `ma1b`: MIAF AV1 baseline profile
- `ma1a`: MIAF AV1 advanced profile
- `mif1`: Multi-image file format
- `miaf`: Multi-image application format

### AV1 Configuration (av1C)

The av1C property box contains AV1 codec configuration:

```
Byte 0: marker(1) | version(7)
Byte 1: seq_profile(3) | seq_level_idx_0(5)
Byte 2: seq_tier_0(1) | high_bitdepth(1) | twelve_bit(1) | monochrome(1) | ...
Byte 3+: Additional configuration
```

Profiles:
- 0: Main (8/10-bit, 4:2:0)
- 1: High (8/10-bit, 4:4:4)
- 2: Professional (8/10/12-bit, 4:2:2/4:4:4)

## References

- [AVIF Specification](https://aomediacodec.github.io/av1-avif/)
- [AV1 Bitstream Specification](https://aomediacodec.github.io/av1-spec/)
- [ISO Base Media File Format (ISO/IEC 14496-12)](https://www.iso.org/standard/68960.html)
- [HEIF Specification (ISO/IEC 23008-12)](https://www.iso.org/standard/66067.html)

## Related Formats

- **HEIC**: Uses HEVC (H.265) instead of AV1
- **WebP**: Uses VP8/VP8L, different container format
- **JPEG XL**: Uses its own codec and container
- **AVIF Sequence (AVIS)**: Animated AVIF images

## Contributing

To add full AV1 support:

1. Integrate a WebAssembly AV1 decoder/encoder (recommended: dav1d, libaom)
2. Replace placeholder functions in `decoder.ts` and `encoder.ts`
3. Add color space conversion (YUV ↔ RGB)
4. Handle chroma subsampling (4:2:0, 4:2:2, 4:4:4)
5. Support HDR and wide color gamuts
6. Implement animation support (AVIS brand)

## License

Part of the mconv codec library.
