/**
 * DSF (DSD Stream File) codec
 * Combines decoder and encoder
 */

import type { AudioCodec, AudioData } from '@sylphx/codec-core'
import { decodeDsf } from './decoder'
import { encodeDsf } from './encoder'
import type { DsfEncodeOptions } from './types'

/**
 * DSF audio codec
 */
export const dsfCodec: AudioCodec = {
	format: 'dsf' as any, // DSF not yet in core types
	decode: (data: Uint8Array): AudioData => decodeDsf(data),
	encode: (audio: AudioData, options?: DsfEncodeOptions): Uint8Array => encodeDsf(audio, options),
}
