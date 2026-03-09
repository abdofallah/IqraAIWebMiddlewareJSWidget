import { VoiceAiClient } from "./core/VoiceAiClient";
import { WidgetOptions } from "./core/types";
import { UIManager } from "./ui/UIManager";

/**
 * Initializes the Voice AI Widget. This is the main public entry point.
 */
export function init(options: WidgetOptions): VoiceAiClient {
    const client = new VoiceAiClient(options);

    // If a container is provided, we are NOT in headless mode.
    // Instantiate the UIManager to render the widget.
    if (options.container) {
        new UIManager(options.container, options, client);
    }

    console.log("Widget SDK Initialized.");
    return client; // Always return the client for programmatic control.
}