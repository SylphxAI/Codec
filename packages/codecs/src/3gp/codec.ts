/**
 * 3GP codec implementation
 */

import type { Codec } from '@sylphx/codec-core'
import { decode3GPToVideo, is3GP } from './decoder'
import { encode3GP } from './encoder'

export const ThreeGPCodec: Codec = {
	name: '3GP',
	mimeTypes: ['video/3gpp', 'video/3gpp2'],
	extensions: ['.3gp', '.3g2'],
	detect: is3GP,
	decode: decode3GPToVideo,
	encode: encode3GP,
}
