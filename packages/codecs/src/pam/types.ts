/**
 * PAM (Portable Arbitrary Map) format types
 * Extension of PNM with alpha channel support
 */

export type PAMTupleType =
	| 'BLACKANDWHITE'
	| 'GRAYSCALE'
	| 'RGB'
	| 'BLACKANDWHITE_ALPHA'
	| 'GRAYSCALE_ALPHA'
	| 'RGB_ALPHA'

export type PAMEncodeOptions = Record<string, never>
