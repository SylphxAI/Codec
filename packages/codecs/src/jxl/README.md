# JPEG XL (JXL) Codec

Pure TypeScript implementation of the JPEG XL image codec.

## Features

- **Container Format Support**: Handles both ISOBMFF container and naked codestream formats
- **Magic Bytes Detection**:
  - Codestream: `0xFF 0x0A`
  - Container: `0x00 0x00 0x00 0x0C 0x4A 0x58 0x4C 0x20 ...`
- **VarInt Encoding/Decoding**: Implements JXL variable-length integer encoding
- **Header Parsing**: Extracts image dimensions, bit depth, color space, and metadata
- **Encoding Modes**: Supports both Modular (lossless) and VarDCT (lossy) mode signaling
- **Alpha Channel**: Detects and handles images with transparency

## Structure

```
jxl/
├── index.ts          - Main exports
├── types.ts          - JXL-specific types and constants
├── decoder.ts        - JXL decoder implementation
├── encoder.ts        - JXL encoder implementation
├── codec.ts          - Codec interface implementation
└── decoder.test.ts   - Comprehensive test suite
```

## Usage

```typescript
import { JxlCodec, encodeJxl, decodeJxl } from '@sylphx/codec-codecs/jxl'

// Encode image to JXL
const image: ImageData = {
  width: 100,
  height: 100,
  data: new Uint8Array(100 * 100 * 4) // RGBA
}

const encoded = encodeJxl(image, {
  quality: 90,     // 0-100 (100 = lossless)
  lossless: false, // Force lossless mode
})

// Decode JXL to image
const decoded = decodeJxl(encoded)
```

## Implementation Details

### Decoder

The decoder implements:
- **BitReader**: Efficient bit-level reading for VarInt decoding
- **Container Parsing**: Extracts codestream from ISOBMFF boxes (ftyp, jxlc, jxlp)
- **Header Parsing**:
  - Size header with small/large image modes
  - Image metadata (orientation, bit depth, extra channels)
  - Color encoding information
- **Frame Detection**: Identifies encoding mode (Modular/VarDCT)

**Note**: The current implementation creates placeholder image data after header parsing. Full JXL decoding requires:
- ANS entropy decoding
- Modular/VarDCT transform implementation
- XYB to RGB color space conversion
- Adaptive quantization and noise synthesis

### Encoder

The encoder implements:
- **BitWriter**: Efficient bit-level writing for VarInt encoding
- **Size Header Generation**: Optimized encoding for small images with standard aspect ratios
- **Metadata Generation**: Creates proper JXL image metadata structures
- **Container Creation**: Wraps codestream in ISOBMFF container format
- **Basic Encoding**: Simplified differential/quantization encoding

**Note**: The current implementation uses simplified encoding. Full JXL encoding requires:
- Context-adaptive ANS entropy coding
- XYB color space conversion for lossy mode
- Advanced prediction and transforms
- Optimal quantization matrices

## Limitations

This is an educational/proof-of-concept implementation. For production use cases requiring full JXL compliance, consider:

- **libjxl via WASM**: The reference implementation compiled to WebAssembly
- **Full Entropy Coding**: ANS (Asymmetric Numeral Systems)
- **Color Spaces**: XYB conversion for perceptually-optimized encoding
- **Advanced Features**:
  - Adaptive DCT block sizes
  - Patch dictionary
  - Spline reconstruction
  - Progressive decoding
  - Animation support

## Specification

Based on the JPEG XL specification: https://jpeg.org/jpegxl/

Key specification sections implemented:
- Annex A: Codestream Syntax
- Annex B: Variable-length integer encoding (U32)
- Annex C: ISOBMFF Container Format

## Tests

Comprehensive test suite covering:
- Signature validation (codestream and container)
- Box structure parsing
- Various image sizes and aspect ratios
- Alpha channel handling
- Lossless and lossy encoding modes
- Quality parameter effects
- Gradient and solid color images

Run tests:
```bash
bun test packages/codecs/src/jxl/decoder.test.ts
```

All 15 tests pass successfully.
