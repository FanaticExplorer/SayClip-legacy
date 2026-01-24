const defaultSettings = {
    temperature: 0,
    model: "gpt-4o-mini-transcribe",
    initialPrompt: "Transcribe accurately with proper punctuation and capitalization."
};

function loadSettings() {
    const saved = localStorage.getItem('sayclip_settings');
    return saved ? JSON.parse(saved) : defaultSettings;
}

function saveSettings(settings) {
    localStorage.setItem('sayclip_settings', JSON.stringify(settings));
    console.log('Settings saved:', settings);
    // In a real scenario, you might send this to Python here.
}

document.addEventListener('DOMContentLoaded', () => {
    const temperatureInput = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperatureValue');
    const modelInput = document.getElementById('model');
    const initialPromptInput = document.getElementById('initialPrompt');
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');

    // Load initial values
    const settings = loadSettings();
    temperatureInput.value = settings.temperature;
    temperatureValue.textContent = parseFloat(settings.temperature).toFixed(1);
    modelInput.value = settings.model;
    initialPromptInput.value = settings.initialPrompt;

    // Update temperature value display when slider changes
    temperatureInput.addEventListener('input', () => {
        temperatureValue.textContent = parseFloat(temperatureInput.value).toFixed(1);
    });

    // Save button handler
    saveBtn.addEventListener('click', () => {
        const newSettings = {
            temperature: parseFloat(temperatureInput.value),
            model: modelInput.value,
            initialPrompt: initialPromptInput.value
        };
        saveSettings(newSettings);

        // Visual feedback
        const originalText = saveBtn.innerText;
        saveBtn.innerText = 'Saved!';
        setTimeout(() => {
            saveBtn.innerText = originalText;
        }, 1000);
    });

    // Reset button handler
    resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all settings to default?')) {
            temperatureInput.value = defaultSettings.temperature;
            temperatureValue.textContent = parseFloat(defaultSettings.temperature).toFixed(1);
            modelInput.value = defaultSettings.model;
            initialPromptInput.value = defaultSettings.initialPrompt;
            saveSettings(defaultSettings);
        }
    });
});
