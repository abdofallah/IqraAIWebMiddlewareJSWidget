import { ITransport, TransportEvents } from "./ITransport";

export class WebRtcTransport implements ITransport {
    private signalingSocket: WebSocket | null = null;
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private listeners: { [K in keyof TransportEvents]?: TransportEvents[K][] } = {};

    // State to handle Race Conditions
    private isRemoteDescriptionSet = false;
    private candidateQueue: RTCIceCandidateInit[] = [];

    // Google STUN is reliable
    private rtcConfig: RTCConfiguration = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    private localStream: MediaStream | null = null;

    connect(url: string): void {
        this.signalingSocket = new WebSocket(url);

        this.signalingSocket.onopen = () => {
            console.log("Signaling connected. Starting WebRTC negotiation.");
            this.startWebRtcHandshake();
        };

        this.signalingSocket.onmessage = (ev) => this.handleSignalingMessage(ev.data);
        this.signalingSocket.onclose = (ev) => this.emit('onClose', ev.reason);
        this.signalingSocket.onerror = () => this.emit('onError', new Error("Signaling Error"));
    }

    private async startWebRtcHandshake() {
        console.log("Creating RTCPeerConnection...");
        this.peerConnection = new RTCPeerConnection(this.rtcConfig);

        // 1. ATTACH PENDING LOCAL TRACKS
        if (this.localStream) {
            console.log("Attaching local stream tracks to PeerConnection");
            this.localStream.getTracks().forEach(track => {
                this.peerConnection!.addTrack(track, this.localStream!);
            });
        }

        // 1. Handle Incoming Audio Tracks
        this.peerConnection.ontrack = (event) => {
            console.log("Received Remote Track", event.track.kind);
            if (event.streams && event.streams[0]) {
                this.emit('onRemoteTrack', event.track);
            }
        };

        // 2. Handle Local ICE Candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignaling({ type: 'candidate', candidate: event.candidate });
            }
        };

        // 3. Connection State Monitoring
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection?.connectionState;
            console.log("WebRTC Connection State:", state);
            if (state === 'connected') {
                this.emit('onOpen');
            } else if (state === 'failed' || state === 'closed') {
                this.emit('onError', new Error(`WebRTC Connection ${state}`));
            }
        };

        // 4. Data Channel
        this.dataChannel = this.peerConnection.createDataChannel("chat");
        this.dataChannel.onmessage = (ev) => this.emit('onMessage', ev.data);

        // 5. Create Offer
        // Important: Add Transceiver to ensure we ask for Audio
        this.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.sendSignaling({ type: 'offer', sdp: offer.sdp });
        } catch (err) {
            console.error("Error creating offer:", err);
        }
    }

    private async handleSignalingMessage(json: string) {
        console.log("RX Signaling:", json);
        try {
            const msg = JSON.parse(json);

            if (msg.type === 'answer') {
                console.log("Setting Remote Description (Answer)");
                await this.peerConnection?.setRemoteDescription(msg);
                this.isRemoteDescriptionSet = true;

                // Flush the candidate queue
                while (this.candidateQueue.length > 0) {
                    const c = this.candidateQueue.shift();
                    if (c) {
                        console.log("Adding queued candidate");
                        await this.peerConnection?.addIceCandidate(c);
                    }
                }
            }
            else if (msg.type === 'candidate') {
                // Ensure we handle the structure correctly
                const candidate = msg.candidate;
                if (candidate) {
                    if (this.isRemoteDescriptionSet) {
                        await this.peerConnection?.addIceCandidate(candidate);
                    } else {
                        console.log("Queuing early candidate");
                        this.candidateQueue.push(candidate);
                    }
                }
            }
        } catch (e) {
            console.error("Signaling error", e);
        }
    }

    private sendSignaling(msg: object) {
        if (this.signalingSocket?.readyState === WebSocket.OPEN) {
            this.signalingSocket.send(JSON.stringify(msg));
        }
    }

    // --- ITransport Implementation ---

    attachInput(stream: MediaStream): void {
        this.localStream = stream;

        if (this.peerConnection) {
            stream.getTracks().forEach(track => {
                this.peerConnection!.addTrack(track, stream);
            });
        }
    }

    sendText(text: string): void {
        if (this.dataChannel?.readyState === 'open') {
            this.dataChannel.send(text);
        }
    }

    sendAudio(data: ArrayBuffer): void { } // No-op

    disconnect(): void {
        this.dataChannel?.close();
        this.peerConnection?.close();
        this.signalingSocket?.close();
    }

    on<K extends keyof TransportEvents>(event: K, callback: TransportEvents[K]): void {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event]!.push(callback);
    }

    private emit<K extends keyof TransportEvents>(event: K, ...args: Parameters<TransportEvents[K]>): void {
        this.listeners[event]?.forEach(cb => (cb as any)(...args));
    }
}