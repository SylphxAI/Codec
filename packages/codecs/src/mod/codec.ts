/**
 * MOD AudioCodec implementation
 * Provides AudioCodec interface for MOD files
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeMod, modToAudio } from './decoder'
import { createModFromAudio } from './encoder'
import type { ModEncodeOptions } from './types'

/**
 * MOD Audio Codec
 */
export class ModCodec {
	readonly format = 'mod' as const

	/**
	 * Decode MOD file to AudioData
	 */
	decode(data: Uint8Array): AudioData {
		const mod = decodeMod(data)
		const audio = modToAudio(mod, 44100)

		return {
			samples: audio.samples,
			sampleRate: audio.sampleRate,
			channels: audio.channels,
		}
	}

	/**
	 * Encode AudioData to MOD file
	 */
	encode(audio: AudioData, options?: ModEncodeOptions): Uint8Array {
		return createModFromAudio(audio.samples, audio.sampleRate, options)
	}
}

/**
 * Create MOD codec instance
 */
export function createModCodec(): ModCodec {
	return new ModCodec()
}
