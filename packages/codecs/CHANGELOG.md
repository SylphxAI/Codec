# @sylphx/codec

## 1.1.0

### Minor Changes

- d2120de: Add 48 new codec implementations

  **Image formats:**

  - AVIF, HEIC, JXL, BPG, FLIF (modern image formats)
  - DICOM (medical imaging)
  - CR2, NEF, ARW, DNG, ORF, RW2, RAF, PEF (RAW camera formats)
  - JP2/J2K (JPEG 2000)
  - XCF (GIMP)

  **Video formats:**

  - WebM, MOV, MPEG, 3GP, F4V, RM/RMVB, SWF, VOB, APNG, OGV

  **Audio formats:**

  - MP3, AAC, OPUS, AC3, DTS (common lossy)
  - WMA, APE, ALAC, TTA, TAK, WV, MPC (lossless/proprietary)
  - AMR, SPX (speech codecs)
  - M4A, MKA, CAF (containers)
  - DSF (DSD audio)
  - MOD, S3M, XM, IT (tracker formats)

  Total: 101 codecs, 2328 tests, 97M+ assertions

### Patch Changes

- Updated dependencies [d2120de]
  - @sylphx/codec-core@1.0.1
