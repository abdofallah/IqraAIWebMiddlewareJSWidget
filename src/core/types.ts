export type SdkState = 'IDLE' | 'VALIDATING' | 'CONNECTING' | 'QUEUED' | 'CONNECTED' | 'ERROR';

export interface FormField {
    name: string;
    label: string;
    type?: 'text' | 'email' | 'tel';
    target: 'dynamicVariable' | 'metadata';
    required?: boolean;
}

export enum TransportType {
    WebSocket = 0,
    WebRTC = 1
}

export enum AudioEncodingType {
    PCM = 1,
    WAV = 2,

    MULAW = 3,
    ALAW = 4,

    G722 = 5,
    G729 = 6,
    OPUS = 7,

    MPEG = 8
}

export interface AudioConfiguration {
    inputEncodingType: AudioEncodingType;
    inputSampleRate: number;
    inputBitsPerSample: number;

    outputEncodingType: AudioEncodingType;
    outputSampleRate: number;
    outputBitsPerSample: number;

    bufferThresholdMs: number;
}

export interface WidgetOptions {
    middlewareUrl: string;
    campaignId: string;
    regionId: string;
    transportType?: TransportType;
    audioConfig?: Partial<AudioConfiguration>;
    container?: string | HTMLElement;
    formFields?: FormField[];
    headers?: Record<string, string>;
}

export interface QueueData {
    uniqueRequestId: string;
    queuePosition: number;
}