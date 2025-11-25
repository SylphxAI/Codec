---
"@sylphx/codec": minor
"@sylphx/codec-core": patch
---

Add 48 new codec implementations

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
