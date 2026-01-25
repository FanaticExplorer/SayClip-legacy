const defaultSettings = {
    temperature: 0,
    model: "gpt-4o-mini-transcribe",
    initialPrompt: "Transcribe accurately with proper punctuation and capitalization."
};
const STORAGE_KEY = "sayclip_settings";
const API_WAIT_MS = 2000;

function hasPywebviewApi() {
    return Boolean(window.pywebview?.api);
}

async function waitForApi(timeoutMs = API_WAIT_MS) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (hasPywebviewApi()) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    return hasPywebviewApi();
}

async function loadSettings() {
    if (hasPywebviewApi() && window.pywebview.api.get_settings) {
        try {
            const remote = await window.pywebview.api.get_settings();
            return { ...defaultSettings, ...remote };
        } catch (error) {
            console.error("Failed to load settings from backend, falling back to local storage.", error);
        }
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings };
}

async function saveSettings(settings) {
    if (hasPywebviewApi() && window.pywebview.api.update_settings) {
        const result = await window.pywebview.api.update_settings(settings);
        if (!result?.success) throw new Error(result?.error || "Failed to save settings");
        return result.settings;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return settings;
}

function applySettingsToUI(settings, refs) {
    const { temperatureInput, temperatureValue, modelInput, initialPromptInput } = refs;
    temperatureInput.value = settings.temperature;
    temperatureValue.textContent = parseFloat(settings.temperature).toFixed(1);

    const modelOptions = Array.from(modelInput.options).map(opt => opt.value);
    modelInput.value = modelOptions.includes(settings.model) ? settings.model : defaultSettings.model;

    initialPromptInput.value = settings.initialPrompt;
}

function getRefs() {
    const temperatureInput = document.getElementById("temperature");
    const temperatureValue = document.getElementById("temperatureValue");
    const modelInput = document.getElementById("model");
    const initialPromptInput = document.getElementById("initialPrompt");
    const saveBtn = document.getElementById("saveBtn");
    const resetBtn = document.getElementById("resetBtn");
    if (!temperatureInput || !temperatureValue || !modelInput || !initialPromptInput || !saveBtn || !resetBtn) return null;
    return { temperatureInput, temperatureValue, modelInput, initialPromptInput, saveBtn, resetBtn };
}

document.addEventListener("DOMContentLoaded", () => {
    initSettings().catch(error => {
        console.error("Unable to initialize settings UI", error);
        alert("Unable to initialize settings. Please check the console logs.");
    });
});

async function initSettings() {
    const refs = getRefs();
    if (!refs) return;

    await waitForApi(); // prefer backend if it becomes available quickly

    let currentSettings = await loadSettings();
    applySettingsToUI(currentSettings, refs);

    refs.temperatureInput.addEventListener("input", () => {
        refs.temperatureValue.textContent = parseFloat(refs.temperatureInput.value).toFixed(1);
    });

    refs.saveBtn.addEventListener("click", async () => {
        const newSettings = {
            temperature: parseFloat(refs.temperatureInput.value),
            model: refs.modelInput.value,
            initialPrompt: refs.initialPromptInput.value.trim()
        };

        const originalText = refs.saveBtn.innerText;
        refs.saveBtn.disabled = true;
        try {
            currentSettings = await saveSettings(newSettings);
            refs.saveBtn.innerText = "Saved!";
        } catch (error) {
            console.error("Failed to save settings", error);
            alert(error.message || "Failed to save settings.");
        } finally {
            setTimeout(() => {
                refs.saveBtn.innerText = originalText;
                refs.saveBtn.disabled = false;
            }, 1000);
        }
    });

    refs.resetBtn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to reset all settings to default?")) return;
        try {
            currentSettings = await saveSettings(defaultSettings);
            applySettingsToUI(currentSettings, refs);
        } catch (error) {
            console.error("Failed to reset settings", error);
            alert(error.message || "Failed to reset settings.");
        }
    });
}
