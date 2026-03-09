import { init } from '../src/index.ts';
import { TransportType, AudioEncodingType } from '../src/core/types.ts';

// --- Global Config ---
const middlewareUrl = 'https://localhost:7166';

// --- Test for Inline Widget ---
init({
    // Core Config
    middlewareUrl: middlewareUrl,
    transportType: TransportType.WebSocket,
    audioConfig: {
        inputEncodingType: AudioEncodingType.PCM,
        inputSampleRate: 24000,
        inputBitsPerSample: 16,

        outputEncodingType: AudioEncodingType.PCM,
        outputSampleRate: 24000,
        outputBitsPerSample: 16,

        bufferThresholdMs: 100
    },
    // UI Config
    container: '#my-widget-container',
    formFields: [
        { name: 'firstName', label: 'First Name', type: 'text', target: 'dynamicVariable', required: true },
        { name: 'lastName', label: 'Last Name', type: 'text', target: 'dynamicVariable' },
        { name: 'email', label: 'Email Address', type: 'email', target: 'metadata', required: true }
    ],
});

// --- Test for Headless Mode ---
const headlessButton = document.getElementById('headless-button')!;
const headlessHangup = document.getElementById('headless-hangup')!;
const headlessStatus = document.getElementById('headless-status')!;

const headlessClient = init({
    // Core Config
    middlewareUrl: middlewareUrl,
    transportType: TransportType.WebSocket,
    audioConfig: {
        inputEncodingType: AudioEncodingType.PCM,
        inputSampleRate: 24000,
        inputBitsPerSample: 16,

        outputEncodingType: AudioEncodingType.PCM,
        outputSampleRate: 24000,
        outputBitsPerSample: 16,

        bufferThresholdMs: 100
    }
});

// Listeners
headlessClient.on('stateChange', ({ state, data }) => {
    headlessStatus.textContent = `Headless State: ${state}`;
    if (data) {
        headlessStatus.textContent += ` - ${JSON.stringify(data)}`;
    }

    if (state === "CONNECTED") {
        headlessHangup.style.display = 'block';
    }
    else {
        headlessHangup.style.display = 'none';
    }
});

headlessClient.on('message', (message) => {
    console.log("Headless Message:", message);
});

headlessButton.addEventListener('click', () => {
    headlessClient.startSession({
        dynamicVariables: {
            source: 'headlessButton',
            Name: "John Doe"
        },
        metadata: {
            timestamp: new Date().toISOString()
        }
    });
});

headlessHangup.addEventListener('click', () => {
    headlessClient.hangUp();
})