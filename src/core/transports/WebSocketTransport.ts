import { ITransport, TransportEvents } from "./ITransport";

export class WebSocketTransport implements ITransport {
    private socket: WebSocket | null = null;
    private listeners: { [K in keyof TransportEvents]?: TransportEvents[K][] } = {};

    connect(url: string): void {
        this.socket = new WebSocket(url);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => this.emit('onOpen');
        this.socket.onclose = (ev) => this.emit('onClose', `${ev.code}: ${ev.reason}`);
        this.socket.onerror = (ev) => this.emit('onError', new Error("WebSocket Error"));

        this.socket.onmessage = (ev) => {
            if (ev.data instanceof ArrayBuffer) {
                this.emit('onAudio', ev.data);
            } else {
                this.emit('onMessage', ev.data);
            }
        };
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    sendText(text: string): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(text);
        }
    }

    sendAudio(data: ArrayBuffer): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(data);
        }
    }

    attachInput(stream: MediaStream): void {
        // No-op for WebSocket. 
        // Logic handled by AudioManager -> sendAudio()
    }

    on<K extends keyof TransportEvents>(event: K, callback: TransportEvents[K]): void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event]!.push(callback);
    }

    private emit<K extends keyof TransportEvents>(event: K, ...args: Parameters<TransportEvents[K]>): void {
        this.listeners[event]?.forEach(cb => (cb as any)(...args));
    }
}