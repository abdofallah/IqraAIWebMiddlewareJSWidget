# Voice AI Widget SDK

A highly customizable, framework-agnostic SDK for embedding Voice AI capabilities into any website. It supports "inline form" mode for quick integration and "headless" mode for complete UI control.

## 🚀 Features

*   **Universal Compatibility:** Works with Vanilla JS, React, Vue, WordPress, and more.
*   **Real-time Queueing:** Handles high traffic gracefully with waiting queues.
*   **Audio Streaming:** Robust WebSocket handling for low-latency voice interaction.
*   **Customizable:** Configure form fields, styles, and behaviors dynamically.
*   **Headless Mode:** Full programmatic control for building custom UIs.

---

## 📦 Installation

### Method 1: Direct Browser Script (CDN)
Simply include the script in your HTML file.

```html
<!-- Replace with your actual CDN URL -->
<script src="https://cdn.your-domain.com/voice-ai-widget.umd.js"></script>
```

### Method 2: NPM / Module Import
*Coming soon.*

---

## 🛠 Usage

The SDK exposes a global variable `VoiceAiWidget`. The primary entry point is the `init` method.

### 1. The "Turnkey" Widget (Inline Form)

This mode renders a pre-built, styled form inside a container of your choice.

**HTML:**
```html
<div id="voice-widget-container"></div>
```

**JavaScript:**
```javascript
const client = VoiceAiWidget.init({
    // 1. URL of your middleware (Required)
    middlewareUrl: 'https://api.your-middleware.com',

    // 2. Where to render the widget (Required for UI mode)
    container: '#voice-widget-container',

    // 3. Define the form fields
    formFields: [
        { 
            name: 'firstName', 
            label: 'First Name', 
            type: 'text', 
            target: 'dynamicVariable', // Sends as dynamic variable to AI
            required: true 
        },
        { 
            name: 'email', 
            label: 'Email Address', 
            type: 'email', 
            target: 'metadata', // Sends as metadata to AI
            required: true 
        }
    ]
});
```

### 2. Headless Mode (Custom UI)

If you want to build your own button and form, simply omit the `container` option. The SDK will return a client instance for you to control.

```javascript
// Initialize without a container
const client = VoiceAiWidget.init({
    middlewareUrl: 'https://api.your-middleware.com'
});

// Listen to state changes to update your custom UI
client.on('stateChange', ({ state, data }) => {
    console.log('Current State:', state); 
    // States: 'IDLE' | 'CONNECTING' | 'QUEUED' | 'CONNECTED' | 'ERROR'
    
    if (state === 'QUEUED') {
        alert(`You are #${data.queuePosition} in line.`);
    }
});

// Start the session manually (e.g., on button click)
document.getElementById('my-custom-btn').addEventListener('click', () => {
    client.startSession({
        dynamicVariables: { firstName: 'Abdullah' },
        metadata: { source: 'custom-ui' }
    });
});

// Hang up manually
document.getElementById('hangup-btn').addEventListener('click', () => {
    client.hangUp();
});
```

---

## ⚙️ Configuration Options

The `init(options)` method accepts the following configuration object:

| Option | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `middlewareUrl` | `string` | **Yes** | The base URL of your C# Middleware API (e.g., `https://api.myapp.com`). |
| `container` | `string` \| `HTMLElement` | No | CSS selector or DOM element. If provided, the UI Manager is initialized. |
| `formFields` | `FormField[]` | No | Array of field definitions for the inline form. |

### FormField Object Structure
```typescript
{
    name: string;       // Unique ID for the input
    label: string;      // Label text shown to user
    type?: 'text' | 'email' | 'tel'; // HTML input type (default: text)
    target: 'dynamicVariable' | 'metadata'; // Where to send this data in the AI payload
    required?: boolean; // Is this field mandatory?
}
```

---

## 📡 Events

The client instance emits the `stateChange` event. You can subscribe to it using `client.on()`.

```javascript
client.on('stateChange', (payload) => {
    const { state, data } = payload;
    // Handle updates...
});
```

### State Reference

| State | Description | Data Payload |
| :--- | :--- | :--- |
| `IDLE` | Client is ready. No active call. | `undefined` |
| `CONNECTING` | Contacting middleware/server. | `undefined` |
| `QUEUED` | Waiting for an available slot. | `{ queuePosition: number }` |
| `CONNECTED` | Call is live. Audio is streaming. | `undefined` |
| `ERROR` | An error occurred. | `{ message: string }` |

---

## ⚠️ Important Requirements

1.  **HTTPS is Required:** The browser **will not** grant microphone access (`getUserMedia`) if the site is served over HTTP. Your website and the middleware must be served over HTTPS.
2.  **Microphone Permissions:** The user must explicitly grant permission for the microphone. The SDK handles the request, but if denied, the state will transition to `ERROR`.

---

## 🏗 Architecture Overview

1.  **VoiceAiClient:** The core logic engine. Handles SignalR (queueing), REST API (session requests), and Web Audio API (PCM conversion/streaming).
2.  **UIManager:** A lightweight DOM manager that renders the form and handles user interactions based on the Client's state.

---

### **Part 3: Testing the Production Build**

Before you publish, test the build locally:

1.  Create a new file named `test-production.html` in your project root.
2.  Add this code:
    ```html
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <title>Production Build Test</title>
    </head>
    <body>
        <h1>Production Test</h1>
        <div id="widget"></div>

        <!-- Import the built file from the dist folder -->
        <script src="./dist/voice-ai-widget.umd.js"></script>
        
        <script>
            // Check if the global variable exists
            if (window.VoiceAiWidget) {
                console.log("SDK Loaded successfully!");
                
                VoiceAiWidget.init({
                    middlewareUrl: 'https://localhost:7157', // Your running middleware
                    container: '#widget',
                    formFields: [
                        { name: 'name', label: 'Name', target: 'dynamicVariable' }
                    ]
                });
            } else {
                console.error("SDK failed to load.");
            }
        </script>
    </body>
    </html>
    ```
3.  Open this file in your browser. Note: Because of CORS and module security, simply double-clicking the HTML file might not work. It's best to serve it using a simple server:
    ```bash
    npx serve .
    ```
    Then go to `http://localhost:3000/test-production.html`.

Alhamdulillah, you are now ready to deploy!