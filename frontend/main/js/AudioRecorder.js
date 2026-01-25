/**
 * AudioRecorder class - Main class for audio recording functionality
 */
import { Visualization } from './Visualization.js';
import { UIManager } from './UIManager.js';
import { cleanupAudioStream, blobToBase64, formatTime } from './utils.js';

export class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.recordingStartTime = null;
        this.timerInterval = null;
        this.audioStream = null;
        this.harkEvents = null;
        this.hasSpeech = false;

        // Initialize UI and visualization
        this.uiManager = new UIManager();
        this.uiManager.setupUI();

        const canvas = document.getElementById('frequencyCanvas');
        this.visualization = new Visualization(canvas);
        this.visualization.setupCanvas();

        // Setup event listeners
        this.uiManager.getRecordBtn().addEventListener('click', () => this.handleToggleRecording());
        this.uiManager.getSettingsBtn().addEventListener('click', () => this.openSettings());
    }

    /**
     * Open settings window
     */
    openSettings() {
        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.open_settings().catch(error => {
                console.error('Failed to open settings:', error);
                this.uiManager.setStatus('Error opening settings');
            });
        } else {
            console.warn('Settings unavailable (Python backend not connected)');
        }
    }

    /**
     * Handle toggle recording button click
     */
    handleToggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording().catch((error) => {
                console.error('Failed to start recording:', error);
                this.uiManager.setStatus('Failed to start recording');
                this.cleanup();
            });
        }
    }

    /**
     * Start recording audio
     */
    async startRecording() {
        try {
            // Clean up any existing stream before starting new recording
            this.cleanup();

            const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });

            // Store the stream reference for proper cleanup
            this.audioStream = audioStream;

            this.setupAudioAnalysis(audioStream);
            this.setupAudioRecording(audioStream);
            this.uiManager.updateUIForRecording();
            this.startTimer();
            this.startVisualization();
        } catch (error) {
            console.error('Microphone access failed:', error);
            this.uiManager.setStatus('Error: No microphone access');
            this.cleanup();
        }
    }

    /**
     * Setup audio analysis with Web Audio API
     * @param {MediaStream} audioStream - The audio stream from microphone
     */
    setupAudioAnalysis(audioStream) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.7;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        const microphone = this.audioContext.createMediaStreamSource(audioStream);
        microphone.connect(this.analyser);

        // Setup speech detection with hark
        this.harkEvents = hark(audioStream, {
            interval: 100,
            threshold: -50,
            play: false
        });

        this.hasSpeech = false;

        this.harkEvents.on('speaking', () => {
            this.hasSpeech = true;
            console.log('Speech detected');
        });
    }

    /**
     * Setup MediaRecorder for audio recording
     * @param {MediaStream} audioStream - The audio stream from microphone
     */
    setupAudioRecording(audioStream) {
        let mimeType;
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
        } else {
            mimeType = 'audio/webm';
        }

        this.mediaRecorder = new MediaRecorder(audioStream, { mimeType });
        this.recordedChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = () => this.processRecording();

        this.mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event.error);
            this.uiManager.setStatus('Recording error');
            this.cleanup();
        };

        this.mediaRecorder.start(100);
        this.isRecording = true;
        this.recordingStartTime = Date.now();
    }

    /**
     * Stop recording audio
     */
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }

        this.visualization.stop();

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        if (this.harkEvents) {
            this.harkEvents.stop();
            this.harkEvents = null;
        }

        this.cleanup();

        this.isRecording = false;
        this.dataArray = null;
        this.uiManager.updateUIForStopped();
        this.visualization.clearCanvasCompletely();
        setTimeout(() => {
            this.visualization.drawEmptyBars();
        }, 10);
    }

    /**
     * Process the recorded audio
     */
    processRecording() {
        if (!this.hasSpeech) {
            this.uiManager.setStatus('No speech detected');
            setTimeout(() => this.visualization.drawEmptyBars(), 100);
            return;
        }

        const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.uiManager.setStatus('Transcribing...');
        this.saveToFile(audioBlob)
            .then((result) => {
                if (result && result.success) {
                    this.uiManager.setStatus(result.copied ? 'Done! (copied)' : 'Done!');
                } else {
                    this.uiManager.setStatus('Failed');
                }
            })
            .catch((error) => {
                console.error('Failed to save audio file:', error);
                this.uiManager.setStatus('Failed');
            })
            .finally(() => {
                this.cleanup();
            });
    }

    /**
     * Clean up audio stream and resources
     */
    cleanup() {
        if (this.audioStream) {
            cleanupAudioStream(this.audioStream);
            this.audioStream = null;
        }
    }

    /**
     * Start the recording timer
     */
    startTimer() {
        this.timerInterval = setInterval(() => {
            if (this.recordingStartTime) {
                const elapsed = Date.now() - this.recordingStartTime;
                const timeString = formatTime(elapsed);
                requestAnimationFrame(() => {
                    this.uiManager.setRecordingTime(timeString);
                });
            }
        }, 500);
    }

    /**
     * Start the visualization
     */
    startVisualization() {
        this.visualization.startVisualization(this.analyser, this.dataArray, this.isRecording);
    }

    /**
     * Save audio file and send to backend for processing
     * @param {Blob} audioBlob - The recorded audio blob
     * @returns {Promise<Object>} Result from backend processing
     */
    async saveToFile(audioBlob) {
        try {
            const base64Audio = await blobToBase64(audioBlob);

            if (window.pywebview && window.pywebview.api && window.pywebview.api.process_audio) {
                const result = await window.pywebview.api.process_audio(base64Audio);
                if (result && result.success) {
                    console.log('Audio saved successfully:', result);
                    return result;
                } else {
                    const message = result && result.message ? result.message : 'Unknown error';
                    console.error('Failed to save audio:', message);
                    throw new Error(message);
                }
            } else {
                console.log('Audio ready (Python connection not available)');
                this.uiManager.setStatus('Ready (no Python connection)');
                return { success: false, message: 'Python connection unavailable' };
            }
        } catch (error) {
            console.error('Processing error:', error);
            this.uiManager.setStatus('Processing error');
            throw error;
        }
    }

    /**
     * Update canvas configuration (called on resize)
     */
    updateCachedBarConfig(rect) {
        this.visualization.updateCachedBarConfig(rect);
    }

    /**
     * Draw empty bars (called on resize)
     */
    drawEmptyBars() {
        this.visualization.drawEmptyBars();
    }
}

