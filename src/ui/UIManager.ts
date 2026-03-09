import { VoiceAiClient } from '../core/VoiceAiClient';
import { FormField, SdkState, WidgetOptions } from '../core/types';
import { getInlineFormTemplate } from './templates';
import styles from './styles.css?inline';

/**
 * Manages all DOM interactions, rendering, and UI updates for the widget.
 */
export class UIManager {
    private client: VoiceAiClient;
    private containerElement: HTMLElement;
    private formElement: HTMLFormElement | null = null;
    private options: WidgetOptions;
    private hangupButtonElement: HTMLButtonElement | null = null;

    constructor(container: string | HTMLElement, options: WidgetOptions, client: VoiceAiClient) {
        const el = typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;
        if (!el) {
            throw new Error(`Container element "${container}" not found.`);
        }
        this.containerElement = el;
        this.options = options;
        this.client = client;

        this.injectStyles();
        this.renderInitial();

        // Listen for state changes from the core client to update the UI
        this.client.on('stateChange', this.handleStateChange.bind(this));
    }

    private injectStyles(): void {
        const styleTagId = 'voice-ai-widget-styles';
        if (document.getElementById(styleTagId)) return; // Inject only once

        const styleTag = document.createElement('style');
        styleTag.id = styleTagId;
        styleTag.innerHTML = styles;
        document.head.appendChild(styleTag);
    }

    private renderInitial(): void {
        const formFieldsHtml = this.options.formFields?.map(this.createFieldHtml).join('') || '';
        this.containerElement.innerHTML = getInlineFormTemplate(formFieldsHtml);
        this.formElement = this.containerElement.querySelector('form');
        this.hangupButtonElement = this.containerElement.querySelector('.vaw-hangup-button');

        this.formElement?.addEventListener('submit', this.handleFormSubmit.bind(this));
        this.hangupButtonElement?.addEventListener('click', () => this.client.hangUp());
    }

    private createFieldHtml(field: FormField): string {
        return `
            <div class="vaw-form-group">
                <label for="vaw-field-${field.name}">${field.label}${field.required ? '<span style="color: red;">*</span>' : ''}</label>
                <input type="${field.type || 'text'}" id="vaw-field-${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>
            </div>
        `;
    }

    private handleFormSubmit(event: SubmitEvent): void {
        event.preventDefault();
        if (!this.formElement) return;

        const formData = new FormData(this.formElement);
        const payload = {
            dynamicVariables: {} as Record<string, any>,
            metadata: {} as Record<string, any>,
        };

        this.options.formFields?.forEach(field => {
            const value = formData.get(field.name);
            if (field.target === 'dynamicVariable') {
                payload.dynamicVariables[field.name] = value;
            } else {
                payload.metadata[field.name] = value;
            }
        });

        // Tell the core client to start the session
        this.client.startSession(payload);
    }

    private handleStateChange({ state, data }: { state: SdkState, data?: any }): void {
        const statusElement = this.containerElement.querySelector<HTMLElement>('.vaw-status-message');
        const startButton = this.containerElement.querySelector<HTMLButtonElement>('.vaw-start-button');
        const formElement = this.containerElement.querySelector<HTMLElement>('.vaw-form');
        const formFieldsContainer = this.containerElement.querySelector<HTMLElement>('.vaw-form-fields');

        // Safety check for all required elements
        if (!statusElement || !startButton || !formElement || !this.hangupButtonElement || !formFieldsContainer) {
            console.error("One or more UI elements could not be found.");
            return;
        }

        // By handling all UI changes within the switch, we ensure each state is managed cleanly.
        switch (state) {
            case 'IDLE':
                statusElement.textContent = '';
                formElement.style.display = 'block';        // Show the form
                formFieldsContainer.style.display = 'block'; // Show the fields within the form
                startButton.textContent = 'Start Call';
                startButton.disabled = false;               // CRITICAL: Re-enable the button for a new call
                this.hangupButtonElement.style.display = 'none'; // Hide the hangup button
                break;

            case 'CONNECTING':
            case 'QUEUED':
                statusElement.textContent = state === 'CONNECTING'
                    ? 'Connecting...'
                    : `You are position #${data.queuePosition} in the queue. Please wait.`;

                formElement.style.display = 'block';
                formFieldsContainer.style.display = 'none'; // Hide only the fields, show status and button
                startButton.textContent = state === 'CONNECTING' ? 'Connecting...' : 'Waiting...';
                startButton.disabled = true;                 // CRITICAL: Disable button while busy
                this.hangupButtonElement.style.display = 'none';
                break;

            case 'CONNECTED':
                statusElement.textContent = 'Connected! The call is live.';
                formElement.style.display = 'none';         // Hide the entire form (including the start button)
                this.hangupButtonElement.style.display = 'block'; // Show the hangup button
                break;

            case 'ERROR':
                statusElement.textContent = `Error: ${data?.message || 'An unknown error occurred.'}`;
                formElement.style.display = 'block';
                formFieldsContainer.style.display = 'block'; // Show fields again so user can correct them
                startButton.textContent = 'Try Again';
                startButton.disabled = false;               // CRITICAL: Allow the user to try again
                this.hangupButtonElement.style.display = 'none';
                break;
        }
    }
}