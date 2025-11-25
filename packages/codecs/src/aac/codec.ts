/**
 * AAC codec class implementation
 * Integrates decoder and encoder
 */

import { decodeAac, isAac, parseAacInfo } from './decoder'
import { encodeAac } from './encoder'
import type { AacAudioData, AacDecodeResult, AacEncodeOptions, AacInfo } from './types'

/**
 * AAC Codec class
 */
export class AacCodec {
	/**
	 * Detect if data is AAC
	 */
	static detect(data: Uint8Array): boolean {
		return isAac(data)
	}

	/**
	 * Parse AAC metadata
	 */
	static parse(data: Uint8Array): AacInfo {
		return parseAacInfo(data)
	}

	/**
	 * Decode AAC to raw audio
	 */
	static decode(data: Uint8Array): AacDecodeResult {
		return decodeAac(data)
	}

	/**
	 * Encode raw audio to AAC
	 */
	static encode(audio: AacAudioData, options?: AacEncodeOptions): Uint8Array {
		return encodeAac(audio, options)
	}

	/**
	 * Get supported sample rates
	 */
	static getSupportedSampleRates(): number[] {
		return [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]
	}

	/**
	 * Get supported channel configurations
	 */
	static getSupportedChannels(): number[] {
		return [1, 2, 3, 4, 5, 6, 7, 8]
	}

	/**
	 * Validate sample rate
	 */
	static isValidSampleRate(sampleRate: number): boolean {
		return this.getSupportedSampleRates().includes(sampleRate)
	}

	/**
	 * Validate channel count
	 */
	static isValidChannelCount(channels: number): boolean {
		return channels >= 1 && channels <= 8
	}
}

/**
 * Convenience exports
 */
export { decodeAac, encodeAac, isAac, parseAacInfo }
