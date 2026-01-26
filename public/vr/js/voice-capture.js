/**
 * VR Voice Capture Subsystem
 * Captures microphone audio as raw PCM and streams it to the server.
 * Uses ScriptProcessorNode for wide browser compatibility.
 */

export class VoiceCapture {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.isRecording = false;
        this.isInitialized = false;

        // Callback for sending audio chunks to network
        this.onChunk = null;

        // Audio settings
        this.sampleRate = 16000; // 16kHz for voice
        this.bufferSize = 4096;  // ~256ms at 16kHz

        // Debug tracking
        this._chunkCount = 0;
        this._lastLogTime = 0;
    }

    async init() {
        if (this.isInitialized) {
            console.warn('[VoiceCapture] Already initialized');
            return true;
        }

        try {
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.sampleRate,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Create audio context at desired sample rate
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });

            // Create source from microphone stream
            this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

            // Create processor node to capture raw PCM
            // Note: ScriptProcessorNode is deprecated but AudioWorklet requires HTTPS and more setup
            this.processorNode = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);

            this.processorNode.onaudioprocess = (event) => {
                if (!this.isRecording || !this.onChunk) return;

                // Get raw Float32 samples from input
                const inputData = event.inputBuffer.getChannelData(0);

                // Convert to Int16 for smaller transmission (Float32 -> Int16)
                const int16Data = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    // Clamp and convert float [-1, 1] to int16 [-32768, 32767]
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                this._chunkCount++;

                // Send the Int16Array buffer
                this.onChunk(int16Data.buffer);
            };

            this.isInitialized = true;
            return true;

        } catch (err) {
            if (err.name === 'NotAllowedError') {
                console.warn('[VoiceCapture] Microphone permission denied');
            } else if (err.name === 'NotFoundError') {
                console.warn('[VoiceCapture] No microphone found');
            } else {
                console.error('[VoiceCapture] Failed to initialize:', err);
            }
            return false;
        }
    }

    start() {
        if (!this.isInitialized) {
            console.warn('[VoiceCapture] Cannot start - not initialized');
            return false;
        }

        if (this.isRecording) {
            return true;
        }

        // Connect the audio graph: mic -> processor -> destination (required for processing)
        this.sourceNode.connect(this.processorNode);
        this.processorNode.connect(this.audioContext.destination);

        this.isRecording = true;
        return true;
    }

    stop() {
        if (!this.isRecording) return;

        // Disconnect nodes
        if (this.sourceNode) {
            this.sourceNode.disconnect();
        }
        if (this.processorNode) {
            this.processorNode.disconnect();
        }

        this.isRecording = false;
    }

    dispose() {
        this.stop();

        // Release media stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Close audio context
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }

        this.sourceNode = null;
        this.processorNode = null;
        this.isInitialized = false;
        this.onChunk = null;
    }
}
