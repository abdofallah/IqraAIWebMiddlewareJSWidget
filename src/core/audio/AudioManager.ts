import { resample } from 'wave-resampler';
import { AudioConfiguration } from "../types";

export class AudioManager {
    private audioContext: AudioContext | null = null;

    // Input State
    private localStream: MediaStream | null = null;
    private inputProcessor: ScriptProcessorNode | null = null;
    private audioInput: MediaStreamAudioSourceNode | null = null;

    // Output State (Jitter Buffer)
    private nextStartTime: number = 0;
    private isPlaying: boolean = false;
    private bufferQueue: Float32Array[] = [];
    private bufferedDuration: number = 0;

    private config: AudioConfiguration;
    private onAudioCaptured: (data: ArrayBuffer) => void;

    constructor(config: AudioConfiguration, onAudioCaptured: (data: ArrayBuffer) => void) {
        this.config = config;
        this.onAudioCaptured = onAudioCaptured;

        // Initialize Audio Context immediately or on first interaction depending on browser policy
        const AudioCtor = (window.AudioContext || (window as any).webkitAudioContext);
        this.audioContext = new AudioCtor();
    }

    public async startInput(): Promise<void> {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.setupInputProcessing();
        } catch (error) {
            throw new Error("Microphone access denied.");
        }
    }

    public getLocalStream(): MediaStream | null {
        return this.localStream;
    }

    public handleIncomingAudio(pcmData: ArrayBuffer): void {
        if (!this.audioContext) return;

        // 1. Decode based on configured Output Bits Per Sample
        let floatData: Float32Array;

        switch (this.config.outputBitsPerSample) {
            case 8:
                floatData = this.decodeUint8ToFloat32(pcmData);
                break;
            case 16:
                floatData = this.decodeInt16ToFloat32(pcmData);
                break;
            case 32:
                // Assuming 32-bit is IEEE Float (standard for Web Audio/High Def)
                floatData = new Float32Array(pcmData);
                break;
            default:
                console.warn(`Unsupported output bit depth: ${this.config.outputBitsPerSample}. Defaulting to 16-bit decoding.`);
                floatData = this.decodeInt16ToFloat32(pcmData);
                break;
        }

        // 2. Add to Buffer
        this.bufferQueue.push(floatData);

        // Calculate duration: Samples / Rate
        const duration = floatData.length / this.config.outputSampleRate;
        this.bufferedDuration += duration;

        // 3. Jitter Buffer Logic
        if (!this.isPlaying) {
            // BUFFERING STATE: Wait until threshold met
            // We compare seconds vs seconds
            if (this.bufferedDuration >= (this.config.bufferThresholdMs / 1000)) {
                console.log(`Jitter Buffer Full (${this.bufferedDuration.toFixed(3)}s). Starting Playback.`);
                this.isPlaying = true;

                // Reset timeline to "Now" + small safety margin
                this.nextStartTime = this.audioContext.currentTime + 0.05;
                this.flushQueue();
            }
        } else {
            // PLAYING STATE: Schedule immediately
            this.flushQueue();
        }
    }

    private flushQueue(): void {
        if (!this.audioContext) return;

        while (this.bufferQueue.length > 0) {
            const data = this.bufferQueue.shift()!;
            const duration = data.length / this.config.outputSampleRate;
            this.bufferedDuration -= duration; // Decrease tracked buffer size

            // Drift Correction: If we fell behind, jump ahead
            if (this.nextStartTime < this.audioContext.currentTime) {
                // We ran dry! (Underrun)
                // console.warn("Buffer Underrun! Resyncing..."); // Uncomment for debugging
                this.nextStartTime = this.audioContext.currentTime + 0.01;
            }

            const buffer = this.audioContext.createBuffer(1, data.length, this.config.outputSampleRate);
            // @ts-ignore
            buffer.copyToChannel(data, 0);

            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(this.nextStartTime);

            this.nextStartTime += buffer.duration;
        }
    }

    private setupInputProcessing(): void {
        if (!this.audioContext || !this.localStream) return;

        this.audioInput = this.audioContext.createMediaStreamSource(this.localStream);
        this.inputProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.inputProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const inputRate = e.inputBuffer.sampleRate;

            // 1. Resample to Target
            let processedData = inputData;
            if (inputRate !== this.config.inputSampleRate) {
                processedData = new Float32Array(resample(inputData, inputRate, this.config.inputSampleRate));
            }

            // 2. Encode based on configured Input Bits Per Sample
            let pcmData: ArrayBuffer;

            switch (this.config.inputBitsPerSample) {
                case 8:
                    pcmData = this.encodeFloat32ToUint8(processedData);
                    break;
                case 16:
                    pcmData = this.encodeFloat32ToInt16(processedData);
                    break;
                case 32:
                    // Send raw Float32
                    pcmData = processedData.buffer;
                    break;
                default:
                    // Default to 16-bit
                    pcmData = this.encodeFloat32ToInt16(processedData);
                    break;
            }

            // 3. Callback to Transport
            this.onAudioCaptured(pcmData);
        };

        // Mute connection to prevent echo
        const gain = this.audioContext.createGain();
        gain.gain.value = 0;
        this.audioInput.connect(this.inputProcessor);
        this.inputProcessor.connect(gain);
        gain.connect(this.audioContext.destination);
    }

    public stop(): void {
        this.localStream?.getTracks().forEach(t => t.stop());
        this.inputProcessor?.disconnect();
        this.audioInput?.disconnect();

        // Reset Buffer
        this.bufferQueue = [];
        this.bufferedDuration = 0;
        this.isPlaying = false;
    }

    // --- Encoding Helpers (Mic -> Server) ---

    private encodeFloat32ToUint8(samples: Float32Array): ArrayBuffer {
        const buffer = new ArrayBuffer(samples.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < samples.length; i++) {
            // Clamp -1.0 to 1.0
            const s = Math.max(-1, Math.min(1, samples[i]));
            // Convert to 0-255
            view[i] = Math.floor(((s + 1) / 2) * 255);
        }
        return buffer;
    }

    private encodeFloat32ToInt16(samples: Float32Array): ArrayBuffer {
        const buffer = new ArrayBuffer(samples.length * 2);
        const view = new Int16Array(buffer);
        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            // Convert to -32768 to 32767
            view[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return buffer;
    }

    // --- Decoding Helpers (Server -> Speaker) ---

    private decodeUint8ToFloat32(data: ArrayBuffer): Float32Array {
        const uint8 = new Uint8Array(data);
        const float32 = new Float32Array(uint8.length);
        for (let i = 0; i < uint8.length; i++) {
            // Convert 0-255 to -1.0 to 1.0
            float32[i] = (uint8[i] - 128) / 128.0;
        }
        return float32;
    }

    private decodeInt16ToFloat32(data: ArrayBuffer): Float32Array {
        const int16 = new Int16Array(data);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            // Convert -32768-32767 to -1.0 to 1.0
            float32[i] = int16[i] / 32768.0;
        }
        return float32;
    }
}