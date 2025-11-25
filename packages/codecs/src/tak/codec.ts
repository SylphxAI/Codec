/**
 * TAK codec implementation
 * Provides unified codec interface for TAK audio
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeTakToAudioData, isTak } from './decoder'
import { encodeAudioDataToTak } from './encoder'
import type { TakEncodeOptions } from './types'

/**
 * TAK audio codec
 */
export class TakCodec {
	/**
	 * Check if data is TAK format
	 */
	static detect(data: Uint8Array): boolean {
		return isTak(data)
	}

	/**
	 * Get codec information
	 */
	static info() {
		return {
			name: 'TAK',
			fullName: "Tom's Audio Kompressor",
			extensions: ['.tak'],
			mimeTypes: ['audio/x-tak'],
			description: 'Lossless audio compression with high compression ratios',
		}
	}

	/**
	 * Decode TAK to AudioData
	 */
	static decode(data: Uint8Array): AudioData {
		return decodeTakToAudioData(data)
	}

	/**
	 * Encode AudioData to TAK
	 */
	static encode(audio: AudioData, options: TakEncodeOptions = {}): Uint8Array {
		return encodeAudioDataToTak(audio, options)
	}
}
