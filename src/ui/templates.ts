export function getInlineFormTemplate(formFieldsHtml: string): string {
    return `
        <div class="vaw-container">
            <div class="vaw-status-message"></div>
            <form class="vaw-form">
                <div class="vaw-form-fields">
                    ${formFieldsHtml}
                </div>
                <button type="submit" class="vaw-button vaw-start-button">Start Call</button>
            </form>
            <button class="vaw-button vaw-hangup-button" style="display: none;">Hang Up</button>
        </div>
    `;
}