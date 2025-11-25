/**
 * AMR codec implementation for @sylphx/codec-core
 */

import type { AudioData, Codec, MediaInfo, FeatureLevel } from '@sylphx/codec-core'
import { decodeAmr, getAmrVariant, isAmr, parseAmrInfo } from './decoder'
import { encodeAmr, encodeAmrFromPcm } from './encoder'
import { AMR_NB_SAMPLES_PER_FRAME, AMR_WB_SAMPLES_PER_FRAME, AmrVariant } from './types'

/**
 * AMR codec for @sylphx/codec-core
 */
export const amrCodec: Codec<AudioData> = {
	name: 'amr',
	mediaType: 'audio',
	mimeTypes: ['audio/amr', 'audio/amr-wb'],
	extensions: ['amr', '3ga'],

	detect(data: Uint8Array): boolean {
		return isAmr(data)
	},

	getInfo(data: Uint8Array): MediaInfo {
		const info = parseAmrInfo(data)

		return {
			mediaType: 'audio',
			width: 0,
			height: 0,
			duration: info.duration,
			frameCount: info.frameCount,
			fps: 0,
			hasAudio: true,
			hasVideo: false,
			bitrate: info.bitrate,
			metadata: {
				variant: info.variant,
				sampleRate: info.sampleRate,
				channels: info.numChannels,
			},
		}
	},

	decode(data: Uint8Array): AudioData {
		const amr = decodeAmr(data)

		// Note: Real decoding would require codec implementation
		// For now, return silence PCM as placeholder
		const samplesPerFrame =
			amr.info.variant === AmrVariant.NB ? AMR_NB_SAMPLES_PER_FRAME : AMR_WB_SAMPLES_PER_FRAME
		const totalSamples = amr.info.frameCount * samplesPerFrame

		const samples = [new Float32Array(totalSamples)]

		return {
			samples,
			sampleRate: amr.info.sampleRate,
			channels: amr.info.numChannels,
		}
	},

	encode(audio: AudioData): Uint8Array {
		// Determine variant from sample rate
		const variant = audio.sampleRate === 16000 ? AmrVariant.WB : AmrVariant.NB
		const mode = variant === AmrVariant.NB ? 7 : 8

		// Use first channel
		const samples = audio.samples[0] || new Float32Array(0)

		return encodeAmrFromPcm(samples, { variant, mode })
	},

	getSupportLevel(): FeatureLevel {
		return {
			decode: 'partial', // Can parse format but not decode speech
			encode: 'partial', // Can create format but not encode speech
			info: 'full',
			detect: 'full',
		}
	},
}
