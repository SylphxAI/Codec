import { describe, expect, it } from 'bun:test'
import {
	decodeM3u8,
	encodeM3u8,
	encodeM3u8Master,
	encodeM3u8Media,
	isM3u8,
	M3U8_HEADER,
	parseM3u8Info,
	type M3u8MasterPlaylist,
	type M3u8MediaPlaylist,
	type M3u8Segment,
	type M3u8Variant,
} from './index'

describe('M3U8/HLS Codec', () => {
	// Sample media playlist
	const sampleMediaPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:9.009,
segment0.ts
#EXTINF:9.009,
segment1.ts
#EXTINF:3.003,
segment2.ts
#EXT-X-ENDLIST
`

	// Sample master playlist
	const sampleMasterPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,URI="audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d001f,mp4a.40.2",AUDIO="audio"
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720,CODECS="avc1.4d001f,mp4a.40.2",AUDIO="audio"
720p.m3u8
`

	describe('isM3u8', () => {
		it('should identify M3U8 playlists from string', () => {
			expect(isM3u8(sampleMediaPlaylist)).toBe(true)
			expect(isM3u8(sampleMasterPlaylist)).toBe(true)
		})

		it('should identify M3U8 playlists from Uint8Array', () => {
			const data = new TextEncoder().encode(sampleMediaPlaylist)
			expect(isM3u8(data)).toBe(true)
		})

		it('should reject non-M3U8 data', () => {
			expect(isM3u8('not a playlist')).toBe(false)
			expect(isM3u8(new Uint8Array([0x00, 0x00, 0x00]))).toBe(false)
		})

		it('should handle whitespace before header', () => {
			expect(isM3u8('  \n#EXTM3U\n#EXTINF:10,\nseg.ts')).toBe(true)
		})
	})

	describe('parseM3u8Info', () => {
		it('should parse media playlist info', () => {
			const info = parseM3u8Info(sampleMediaPlaylist)

			expect(info.type).toBe('media')
			expect(info.version).toBe(3)
			expect(info.segmentCount).toBe(3)
			expect(info.duration).toBeCloseTo(21.021, 2)
			expect(info.isLive).toBe(false)
			expect(info.hasEncryption).toBe(false)
		})

		it('should parse master playlist info', () => {
			const info = parseM3u8Info(sampleMasterPlaylist)

			expect(info.type).toBe('master')
			expect(info.version).toBe(3)
			expect(info.variantCount).toBe(2)
		})

		it('should detect encryption', () => {
			const encrypted = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:10,
seg.ts
`
			const info = parseM3u8Info(encrypted)
			expect(info.hasEncryption).toBe(true)
		})

		it('should detect live streams', () => {
			const live = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10,
seg.ts
`
			const info = parseM3u8Info(live)
			expect(info.isLive).toBe(true)
		})
	})

	describe('decodeM3u8', () => {
		describe('media playlist', () => {
			it('should decode basic media playlist', () => {
				const playlist = decodeM3u8(sampleMediaPlaylist) as M3u8MediaPlaylist

				expect(playlist.type).toBe('media')
				expect(playlist.version).toBe(3)
				expect(playlist.targetDuration).toBe(10)
				expect(playlist.mediaSequence).toBe(0)
				expect(playlist.playlistType).toBe('VOD')
				expect(playlist.endList).toBe(true)
				expect(playlist.segments.length).toBe(3)
			})

			it('should parse segment details', () => {
				const playlist = decodeM3u8(sampleMediaPlaylist) as M3u8MediaPlaylist

				expect(playlist.segments[0]?.uri).toBe('segment0.ts')
				expect(playlist.segments[0]?.duration).toBe(9.009)
				expect(playlist.segments[2]?.duration).toBe(3.003)
			})

			it('should calculate total duration', () => {
				const playlist = decodeM3u8(sampleMediaPlaylist) as M3u8MediaPlaylist
				expect(playlist.totalDuration).toBeCloseTo(21.021, 2)
			})

			it('should parse encryption keys', () => {
				const encrypted = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x1234567890ABCDEF
#EXTINF:10,
seg.ts
#EXT-X-ENDLIST
`
				const playlist = decodeM3u8(encrypted) as M3u8MediaPlaylist
				const key = playlist.segments[0]?.key

				expect(key?.method).toBe('AES-128')
				expect(key?.uri).toBe('key.bin')
				expect(key?.iv).toBe('0x1234567890ABCDEF')
			})

			it('should parse byte ranges', () => {
				const byteRange = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-TARGETDURATION:10
#EXT-X-BYTERANGE:1000@0
#EXTINF:10,
file.ts
#EXT-X-BYTERANGE:1000@1000
#EXTINF:10,
file.ts
#EXT-X-ENDLIST
`
				const playlist = decodeM3u8(byteRange) as M3u8MediaPlaylist

				expect(playlist.segments[0]?.byteRange?.length).toBe(1000)
				expect(playlist.segments[0]?.byteRange?.offset).toBe(0)
				expect(playlist.segments[1]?.byteRange?.offset).toBe(1000)
			})

			it('should parse discontinuity markers', () => {
				const discontinuous = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10,
seg0.ts
#EXT-X-DISCONTINUITY
#EXTINF:10,
seg1.ts
#EXT-X-ENDLIST
`
				const playlist = decodeM3u8(discontinuous) as M3u8MediaPlaylist

				expect(playlist.segments[0]?.discontinuity).toBeFalsy()
				expect(playlist.segments[1]?.discontinuity).toBe(true)
			})

			it('should parse media initialization map', () => {
				const withMap = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:10
#EXT-X-MAP:URI="init.mp4"
#EXTINF:10,
seg.m4s
#EXT-X-ENDLIST
`
				const playlist = decodeM3u8(withMap) as M3u8MediaPlaylist
				expect(playlist.segments[0]?.map?.uri).toBe('init.mp4')
			})
		})

		describe('master playlist', () => {
			it('should decode basic master playlist', () => {
				const playlist = decodeM3u8(sampleMasterPlaylist) as M3u8MasterPlaylist

				expect(playlist.type).toBe('master')
				expect(playlist.version).toBe(3)
				expect(playlist.variants.length).toBe(2)
				expect(playlist.renditions.length).toBe(1)
			})

			it('should parse variant streams', () => {
				const playlist = decodeM3u8(sampleMasterPlaylist) as M3u8MasterPlaylist

				expect(playlist.variants[0]?.uri).toBe('360p.m3u8')
				expect(playlist.variants[0]?.bandwidth).toBe(800000)
				expect(playlist.variants[0]?.resolution?.width).toBe(640)
				expect(playlist.variants[0]?.resolution?.height).toBe(360)
				expect(playlist.variants[0]?.codecs).toBe('avc1.4d001f,mp4a.40.2')

				expect(playlist.variants[1]?.uri).toBe('720p.m3u8')
				expect(playlist.variants[1]?.bandwidth).toBe(1400000)
			})

			it('should parse renditions', () => {
				const playlist = decodeM3u8(sampleMasterPlaylist) as M3u8MasterPlaylist

				expect(playlist.renditions[0]?.type).toBe('AUDIO')
				expect(playlist.renditions[0]?.groupId).toBe('audio')
				expect(playlist.renditions[0]?.name).toBe('English')
				expect(playlist.renditions[0]?.default).toBe(true)
				expect(playlist.renditions[0]?.uri).toBe('audio.m3u8')
			})

			it('should parse frame rate', () => {
				const withFrameRate = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=800000,FRAME-RATE=29.970
stream.m3u8
`
				const playlist = decodeM3u8(withFrameRate) as M3u8MasterPlaylist
				expect(playlist.variants[0]?.frameRate).toBeCloseTo(29.97, 2)
			})
		})

		it('should throw on invalid playlist', () => {
			expect(() => decodeM3u8('not a playlist')).toThrow()
		})
	})

	describe('encodeM3u8Media', () => {
		it('should encode basic media playlist', () => {
			const segments: M3u8Segment[] = [
				{ uri: 'seg0.ts', duration: 10 },
				{ uri: 'seg1.ts', duration: 10 },
				{ uri: 'seg2.ts', duration: 5 },
			]

			const output = encodeM3u8Media(segments)

			expect(output).toContain('#EXTM3U')
			expect(output).toContain('#EXT-X-VERSION:3')
			expect(output).toContain('#EXT-X-TARGETDURATION:10')
			expect(output).toContain('#EXTINF:10.000000,')
			expect(output).toContain('seg0.ts')
			expect(output).toContain('#EXT-X-ENDLIST')
		})

		it('should encode with options', () => {
			const segments: M3u8Segment[] = [{ uri: 'seg.ts', duration: 10 }]

			const output = encodeM3u8Media(segments, {
				version: 6,
				targetDuration: 10,
				mediaSequence: 100,
				playlistType: 'VOD',
			})

			expect(output).toContain('#EXT-X-VERSION:6')
			expect(output).toContain('#EXT-X-MEDIA-SEQUENCE:100')
			expect(output).toContain('#EXT-X-PLAYLIST-TYPE:VOD')
		})

		it('should encode live playlist without endlist', () => {
			const segments: M3u8Segment[] = [{ uri: 'seg.ts', duration: 10 }]
			const output = encodeM3u8Media(segments, { endList: false })

			expect(output).not.toContain('#EXT-X-ENDLIST')
		})

		it('should encode encryption keys', () => {
			const segments: M3u8Segment[] = [{
				uri: 'seg.ts',
				duration: 10,
				key: { method: 'AES-128', uri: 'key.bin', iv: '0x123' },
			}]

			const output = encodeM3u8Media(segments)

			expect(output).toContain('#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x123')
		})

		it('should encode byte ranges', () => {
			const segments: M3u8Segment[] = [{
				uri: 'file.ts',
				duration: 10,
				byteRange: { length: 1000, offset: 500 },
			}]

			const output = encodeM3u8Media(segments)

			expect(output).toContain('#EXT-X-BYTERANGE:1000@500')
		})

		it('should encode discontinuity', () => {
			const segments: M3u8Segment[] = [
				{ uri: 'seg0.ts', duration: 10 },
				{ uri: 'seg1.ts', duration: 10, discontinuity: true },
			]

			const output = encodeM3u8Media(segments)

			expect(output).toContain('#EXT-X-DISCONTINUITY')
		})
	})

	describe('encodeM3u8Master', () => {
		it('should encode basic master playlist', () => {
			const variants: M3u8Variant[] = [
				{ uri: '360p.m3u8', bandwidth: 800000 },
				{ uri: '720p.m3u8', bandwidth: 1400000 },
			]

			const output = encodeM3u8Master(variants)

			expect(output).toContain('#EXTM3U')
			expect(output).toContain('#EXT-X-STREAM-INF:BANDWIDTH=800000')
			expect(output).toContain('360p.m3u8')
			expect(output).toContain('#EXT-X-STREAM-INF:BANDWIDTH=1400000')
			expect(output).toContain('720p.m3u8')
		})

		it('should encode with resolution and codecs', () => {
			const variants: M3u8Variant[] = [{
				uri: 'stream.m3u8',
				bandwidth: 800000,
				resolution: { width: 640, height: 360 },
				codecs: 'avc1.4d001f,mp4a.40.2',
			}]

			const output = encodeM3u8Master(variants)

			expect(output).toContain('RESOLUTION=640x360')
			expect(output).toContain('CODECS="avc1.4d001f,mp4a.40.2"')
		})

		it('should encode renditions', () => {
			const variants: M3u8Variant[] = [{ uri: 'stream.m3u8', bandwidth: 800000, audio: 'audio' }]
			const renditions = [{
				type: 'AUDIO' as const,
				groupId: 'audio',
				name: 'English',
				uri: 'audio.m3u8',
				language: 'en',
				default: true,
			}]

			const output = encodeM3u8Master(variants, renditions)

			expect(output).toContain('#EXT-X-MEDIA:TYPE=AUDIO')
			expect(output).toContain('GROUP-ID="audio"')
			expect(output).toContain('NAME="English"')
			expect(output).toContain('LANGUAGE="en"')
			expect(output).toContain('DEFAULT=YES')
		})

		it('should encode independent segments', () => {
			const variants: M3u8Variant[] = [{ uri: 'stream.m3u8', bandwidth: 800000 }]
			const output = encodeM3u8Master(variants, [], { independentSegments: true })

			expect(output).toContain('#EXT-X-INDEPENDENT-SEGMENTS')
		})
	})

	describe('encodeM3u8 (auto-detect)', () => {
		it('should encode media playlist', () => {
			const playlist: M3u8MediaPlaylist = {
				type: 'media',
				version: 3,
				targetDuration: 10,
				mediaSequence: 0,
				discontinuitySequence: 0,
				iFramesOnly: false,
				endList: true,
				segments: [{ uri: 'seg.ts', duration: 10 }],
				totalDuration: 10,
			}

			const output = encodeM3u8(playlist)
			expect(output).toContain('#EXT-X-TARGETDURATION:10')
			expect(output).toContain('seg.ts')
		})

		it('should encode master playlist', () => {
			const playlist: M3u8MasterPlaylist = {
				type: 'master',
				version: 3,
				variants: [{ uri: 'stream.m3u8', bandwidth: 800000 }],
				renditions: [],
				independentSegments: false,
			}

			const output = encodeM3u8(playlist)
			expect(output).toContain('#EXT-X-STREAM-INF:BANDWIDTH=800000')
			expect(output).toContain('stream.m3u8')
		})
	})

	describe('roundtrip', () => {
		it('should roundtrip media playlist', () => {
			const original = decodeM3u8(sampleMediaPlaylist) as M3u8MediaPlaylist
			const encoded = encodeM3u8(original)
			const decoded = decodeM3u8(encoded) as M3u8MediaPlaylist

			expect(decoded.version).toBe(original.version)
			expect(decoded.targetDuration).toBe(original.targetDuration)
			expect(decoded.segments.length).toBe(original.segments.length)
			expect(decoded.endList).toBe(original.endList)
		})

		it('should roundtrip master playlist', () => {
			const original = decodeM3u8(sampleMasterPlaylist) as M3u8MasterPlaylist
			const encoded = encodeM3u8(original)
			const decoded = decodeM3u8(encoded) as M3u8MasterPlaylist

			expect(decoded.version).toBe(original.version)
			expect(decoded.variants.length).toBe(original.variants.length)
			expect(decoded.variants[0]?.bandwidth).toBe(original.variants[0]?.bandwidth)
		})

		it('should roundtrip with encryption', () => {
			const segments: M3u8Segment[] = [{
				uri: 'seg.ts',
				duration: 10,
				key: { method: 'AES-128', uri: 'key.bin' },
			}]

			const encoded = encodeM3u8Media(segments)
			const decoded = decodeM3u8(encoded) as M3u8MediaPlaylist

			expect(decoded.segments[0]?.key?.method).toBe('AES-128')
			expect(decoded.segments[0]?.key?.uri).toBe('key.bin')
		})
	})

	describe('edge cases', () => {
		it('should handle empty segment title', () => {
			const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10,
seg.ts
#EXT-X-ENDLIST
`
			const decoded = decodeM3u8(playlist) as M3u8MediaPlaylist
			expect(decoded.segments[0]?.title).toBeFalsy()
		})

		it('should handle segment with title', () => {
			const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10,Segment Title
seg.ts
#EXT-X-ENDLIST
`
			const decoded = decodeM3u8(playlist) as M3u8MediaPlaylist
			expect(decoded.segments[0]?.title).toBe('Segment Title')
		})

		it('should handle program date time', () => {
			const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-PROGRAM-DATE-TIME:2024-01-01T00:00:00.000Z
#EXTINF:10,
seg.ts
#EXT-X-ENDLIST
`
			const decoded = decodeM3u8(playlist) as M3u8MediaPlaylist
			expect(decoded.segments[0]?.programDateTime).toBeInstanceOf(Date)
		})

		it('should handle Uint8Array input', () => {
			const data = new TextEncoder().encode(sampleMediaPlaylist)
			const decoded = decodeM3u8(data) as M3u8MediaPlaylist

			expect(decoded.type).toBe('media')
			expect(decoded.segments.length).toBe(3)
		})

		it('should preserve key across segments', () => {
			const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:10,
seg0.ts
#EXTINF:10,
seg1.ts
#EXT-X-ENDLIST
`
			const decoded = decodeM3u8(playlist) as M3u8MediaPlaylist

			expect(decoded.segments[0]?.key?.method).toBe('AES-128')
			expect(decoded.segments[1]?.key?.method).toBe('AES-128')
		})
	})
})
