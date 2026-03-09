import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { SdkState, WidgetOptions, AudioConfiguration, TransportType, AudioEncodingType } from "./types";
import { ITransport } from "./transports/ITransport";
import { WebSocketTransport } from "./transports/WebSocketTransport";
import { AudioManager } from "./audio/AudioManager";
import { WebRtcTransport } from './transports/WebRtcTransport';

type Listener = (data?: any) => void;

export class VoiceAiClient {
    private state: SdkState = 'IDLE';
    private options: WidgetOptions;
    private listeners: Map<string, Listener[]> = new Map();
    private signalRConnection: HubConnection | null = null;

    private transport: ITransport;
    private audioManager: AudioManager;
    private audioConfig: AudioConfiguration;

    // For WebRTC Playback
    private remoteAudioElement: HTMLAudioElement | null = null;

    constructor(options: WidgetOptions) {
        if (!options.middlewareUrl) throw new Error("middlewareUrl is required.");

        this.options = {
            ...options,
            middlewareUrl: options.middlewareUrl.endsWith('/') ? options.middlewareUrl.slice(0, -1) : options.middlewareUrl,
            transportType: options.transportType ?? TransportType.WebSocket
        };

        // 1. Config Defaults
        this.audioConfig = {
            inputEncodingType: options.audioConfig?.inputEncodingType || AudioEncodingType.PCM,
            inputSampleRate: options.audioConfig?.inputSampleRate || 16000,
            inputBitsPerSample: options.audioConfig?.inputBitsPerSample || 16,

            outputEncodingType: options.audioConfig?.outputEncodingType || AudioEncodingType.PCM,
            outputSampleRate: options.audioConfig?.outputSampleRate || 16000,
            outputBitsPerSample: options.audioConfig?.outputBitsPerSample || 16,

            // for internal websockets
            bufferThresholdMs: options.audioConfig?.bufferThresholdMs || 200
        };

        // 2. Initialize Transport
        if (this.options.transportType === TransportType.WebRTC) {
            this.transport = new WebRtcTransport();
        } else {
            this.transport = new WebSocketTransport();
        }

        // 3. Initialize Audio Manager (Mic access is always needed)
        // Note: We only pass the callback if we are in WebSocket mode!
        const onMicCapture = (this.options.transportType === TransportType.WebSocket)
            ? (pcmData: ArrayBuffer) => this.transport.sendAudio(pcmData)
            : () => { }; // No-op for WebRTC, we use attachInput

        this.audioManager = new AudioManager(this.audioConfig, onMicCapture);

        this.setupTransportListeners();
    }

    private validateAudioConfig(): void {
        const { transportType } = this.options;
        const config = this.audioConfig;

        const validateSide = (
            encoding: AudioEncodingType,
            rate: number,
            bits: number,
            sideName: string
        ) => {
            // PCM/WAV Rules
            if (encoding === AudioEncodingType.PCM || encoding === AudioEncodingType.WAV) {
                const validBits = [8, 16, 32];
                if (!validBits.includes(bits) || rate < 8000 || rate > 48000) {
                    throw new Error(`VALIDATION:INVALID_SAMPLE_RATE: ${sideName}: PCM/WAV must have 8, 16, or 32 bits per sample and a sample rate between 8000 and 48000.`);
                }
            }

            // OPUS Rules
            if (encoding === AudioEncodingType.OPUS) {
                if (rate < 8000 || rate > 48000 || bits !== 16) {
                    throw new Error(`VALIDATION:INVALID_SAMPLE_RATE: ${sideName}: OPUS requires 8000Hz to 48000Hz sample rate and 16 bits per sample.`);
                }
            }

            // G.711 (MuLaw/ALaw) Rules
            if (encoding === AudioEncodingType.MULAW || encoding === AudioEncodingType.ALAW) {
                if (rate !== 8000 || bits !== 8) {
                    throw new Error(`VALIDATION:INVALID_SAMPLE_RATE: ${sideName}: G.711 (MuLaw/ALaw) requires 8000Hz sample rate and 8 bits per sample.`);
                }
            }

            // G.722 Rules
            if (encoding === AudioEncodingType.G722) {
                if (rate !== 16000 || bits !== 14) {
                    throw new Error(`VALIDATION:INVALID_SAMPLE_RATE: ${sideName}: G.722 requires 16000Hz sample rate and 14 bits per sample.`);
                }
            }

            // G.729 Rules
            if (encoding === AudioEncodingType.G729) {
                if (rate !== 8000 || bits !== 8) {
                    throw new Error(`VALIDATION:INVALID_SAMPLE_RATE: ${sideName}: G.729 requires 8000Hz sample rate and 8 bits per sample.`);
                }
            }
        };

        // 1. Run General Codec Validations
        validateSide(config.inputEncodingType, config.inputSampleRate, config.inputBitsPerSample, "Input");
        validateSide(config.outputEncodingType, config.outputSampleRate, config.outputBitsPerSample, "Output");

        // 2. WebRTC Specific Rules
        if (transportType === TransportType.WebRTC) {
            if (config.inputEncodingType !== config.outputEncodingType) {
                throw new Error(`VALIDATION:WEBRTC_UNSUPPORTED_FORMAT: Input and output formats must be the same.`);
            }

            const allowedWebRtcEncodings = [
                AudioEncodingType.OPUS,
                AudioEncodingType.MULAW,
                AudioEncodingType.ALAW,
                AudioEncodingType.G722
            ];

            if (!allowedWebRtcEncodings.includes(config.inputEncodingType)) {
                throw new Error(`VALIDATION:WEBRTC_UNSUPPORTED_FORMAT: Input format ${AudioEncodingType[config.inputEncodingType]} is not supported over WebRTC. Use OPUS, MULAW, ALAW, or G722.`);
            }

            if (!allowedWebRtcEncodings.includes(config.outputEncodingType)) {
                throw new Error(`VALIDATION:WEBRTC_UNSUPPORTED_FORMAT: Output format ${AudioEncodingType[config.outputEncodingType]} is not supported over WebRTC. Use OPUS, MULAW, ALAW, or G722.`);
            }
        }
    }

    public on(eventName: string, callback: Listener): void {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName)?.push(callback);
    }

    public async startSession(payload: object): Promise<void> {
        if (this.state !== 'IDLE' && this.state !== 'ERROR') {
            console.warn("Session start requested while not in IDLE or ERROR state. Ignoring.");
            return;
        }

        try {
            this.validateAudioConfig();
        } catch (error) {
            this.setState('ERROR', { message: error instanceof Error ? error.message : String(error) });
            return;
        }

        var requestPayload = {
            ...payload,
            transportType: this.options.transportType,
            audioConfiguration: {
                inputEncodingType: this.audioConfig.inputEncodingType,
                inputSampleRate: this.audioConfig.inputSampleRate,
                inputBitsPerSample: this.audioConfig.inputBitsPerSample,

                outputEncodingType: this.audioConfig.outputEncodingType,
                outputSampleRate: this.audioConfig.outputSampleRate,
                outputBitsPerSample: this.audioConfig.outputBitsPerSample
            }
        }

        this.setState('CONNECTING');
        try {
            var headers = {
                ...this.options.headers,
                'Content-Type': 'application/json'
            };

            const response = await fetch(`${this.options.middlewareUrl}/api/session/request`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestPayload)
            });

            const responseData = await response.json();

            if (response.status === 200 && responseData.webSocketUrl) {
                // Success, got a slot immediately
                this.connectToVoiceSocket(responseData.webSocketUrl);
            } else if (response.status === 202 && responseData.uniqueRequestId) {
                // Queued
                this.setState('QUEUED', { queuePosition: responseData.queuePosition });
                this.connectToSignalR(responseData.uniqueRequestId);
            } else {
                throw new Error(responseData.message || `Server responded with status ${response.status}`);
            }
        } catch (error) {
            this.setState('ERROR', { message: error instanceof Error ? error.message : String(error) });
        }
    }

    private setState(newState: SdkState, data?: any): void {
        if (this.state === newState) return;
        this.state = newState;
        this.emit('stateChange', { state: this.state, data: data });
    }

    private emit(eventName: string, data?: any): void {
        this.listeners.get(eventName)?.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error(`Error in '${eventName}' event listener:`, e);
            }
        });
    }

    private async connectToSignalR(uniqueRequestId: string): Promise<void> {
        this.signalRConnection = new HubConnectionBuilder()
            .withUrl(`${this.options.middlewareUrl}/sessionHub`)
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Warning)
            .build();

        this.signalRConnection.on('SessionReady', (data: { webSocketUrl: string }) => {
            console.log("SignalR: Received SessionReady event.", data);
            this.connectToVoiceSocket(data.webSocketUrl);
            this.signalRConnection?.stop();
        });

        this.signalRConnection.on('SessionFailed', (data: { message: string }) => {
            console.error("SignalR: Received SessionFailed event.", data);
            this.setState('ERROR', { message: data.message || "Failed to get a session from the queue." });
            this.signalRConnection?.stop();
        });

        try {
            await this.signalRConnection.start();
            console.log("SignalR: Connection started. Registering client.");
            await this.signalRConnection.invoke('Register', uniqueRequestId);
        } catch (error) {
            console.error("SignalR: Connection failed.", error);
            this.setState('ERROR', { message: "Could not connect to the waiting queue." });
        }
    }

    private async connectToVoiceSocket(url: string): Promise<void> {
        try {
            await this.audioManager.startInput();
        } catch (error) {
            this.setState('ERROR', { message: "Microphone access denied." });
            return;
        }

        if (this.options.transportType === TransportType.WebRTC) {
            const stream = this.audioManager.getLocalStream();
            if (stream) {
                console.log("Attaching Mic Stream to Transport");
                this.transport.attachInput(stream);
            } else {
                console.error("No Local Stream found!");
            }
        }

        this.setState('CONNECTED');
        this.transport.connect(url);
    }

    private setupTransportListeners(): void {
        this.transport.on('onOpen', () => {
            console.log("Transport connected.");
        });

        this.transport.on('onMessage', (data) => {
            this.emit('message', { type: 'text', data: data });
        });

        this.transport.on('onAudio', (data) => {
            // Only used by WebSocket
            if (this.options.transportType === TransportType.WebSocket) {
                this.audioManager.handleIncomingAudio(data);
            }
        });

        this.transport.on('onRemoteTrack', (track) => {
            // Used by WebRTC: Create <audio> element to play the stream
            if (!this.remoteAudioElement) {
                this.remoteAudioElement = document.createElement('audio');
                this.remoteAudioElement.autoplay = true;
            }
            const stream = new MediaStream([track]);
            this.remoteAudioElement.srcObject = stream;
            // Ensure audio context is resumed (browser policy)
            this.remoteAudioElement.play().catch(e => console.log("Auto-play blocked?", e));
        });

        this.transport.on('onClose', (reason) => {
            console.log("Transport closed:", reason);
            this.hangUp();
        });

        this.transport.on('onError', () => {
            this.setState('ERROR', { message: "Connection failed.", });
            this.hangUp();
        });
    }

    public hangUp(): void {
        console.log("Hanging up...");
        this.audioManager.stop();
        this.transport.disconnect();

        if (this.remoteAudioElement) {
            this.remoteAudioElement.srcObject = null;
            this.remoteAudioElement = null;
        }

        if (this.state !== 'IDLE') {
            this.setState('IDLE');
        }
    }
}