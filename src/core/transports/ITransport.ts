export interface TransportEvents {
    onOpen: () => void;
    onClose: (reason: string) => void;
    onError: (error: Error) => void;
    onMessage: (data: any) => void;

    // WebSocket Mode: Receives raw bytes
    onAudio: (data: ArrayBuffer) => void;

    // WebRTC Mode: Receives a remote MediaStreamTrack
    onRemoteTrack: (track: MediaStreamTrack) => void;
}

export interface ITransport {
    connect(url: string): void;
    disconnect(): void;

    // Data Channel / Text Frame
    sendText(text: string): void;

    // WebSocket Mode: Sends raw bytes
    sendAudio(data: ArrayBuffer): void;

    // WebRTC Mode: Attaches the microphone stream directly
    attachInput(stream: MediaStream): void;

    on<K extends keyof TransportEvents>(event: K, callback: TransportEvents[K]): void;
}