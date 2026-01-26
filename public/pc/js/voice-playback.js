/**
 * PC Voice Playback Subsystem
 * Receives raw PCM audio from VR players and plays it back.
 * Handles Int16 PCM data at 16kHz sample rate.
 */

export class VoicePlayback {
    constructor() {
        this.audioContext = null;
        this.isInitialized = false;

        // Track playback state per VR player
        this.activeSources = new Map(); // senderId -> { nextStartTime }

        // Audio settings (must match VR capture settings)
        this.sampleRate = 16000;

        // Debug tracking
        this._chunkCount = 0;
        this._lastLogTime = 0;
    }

    init() {
        if (this.isInitialized) {
            console.warn('[VoicePlayback] Already initialized');
            return true;
        }

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            this.isInitialized = true;
            return true;
        } catch (err) {
            console.error('[VoicePlayback] Failed to initialize:', err);
            return false;
        }
    }

    /**
     * Receive and play a raw PCM audio chunk
     * @param {string} senderId - ID of the VR player
     * @param {ArrayBuffer} audioData - Raw Int16 PCM samples
     */
    async receiveChunk(senderId, audioData) {
        if (!this.isInitialized || !this.audioContext) {
            return;
        }

        this._chunkCount++;
        const now = Date.now();

        // Ensure AudioContext is running
        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (err) {
                console.warn('[VoicePlayback] Failed to resume:', err);
                return;
            }
        }

        try {
            // Convert ArrayBuffer to Int16Array
            let int16Data;
            if (audioData instanceof ArrayBuffer) {
                int16Data = new Int16Array(audioData);
            } else if (audioData.buffer instanceof ArrayBuffer) {
                // Handle if it's already a typed array view
                int16Data = new Int16Array(audioData.buffer, audioData.byteOffset, audioData.byteLength / 2);
            } else {
                console.warn('[VoicePlayback] Unknown data type:', typeof audioData);
                return;
            }

            // Convert Int16 to Float32 for Web Audio API
            const float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
                // Convert int16 [-32768, 32767] to float [-1, 1]
                float32Data[i] = int16Data[i] / 32768;
            }

            // Create audio buffer
            const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, this.sampleRate);
            audioBuffer.getChannelData(0).set(float32Data);

            // Play the buffer
            this.playBuffer(senderId, audioBuffer);

        } catch (err) {
            console.warn('[VoicePlayback] Error playing chunk:', err);
        }
    }

    /**
     * Schedule audio buffer for seamless playback
     */
    playBuffer(senderId, audioBuffer) {
        // Get or create player state
        let state = this.activeSources.get(senderId);
        if (!state) {
            state = { nextStartTime: this.audioContext.currentTime };
            this.activeSources.set(senderId, state);
        }

        // Create and configure source
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        // Schedule playback
        const now = this.audioContext.currentTime;
        const startTime = Math.max(state.nextStartTime, now);

        source.start(startTime);
        state.nextStartTime = startTime + audioBuffer.duration;

        // Cleanup old state after silence
        source.onended = () => {
            setTimeout(() => {
                const s = this.activeSources.get(senderId);
                if (s && this.audioContext.currentTime > s.nextStartTime + 0.5) {
                    this.activeSources.delete(senderId);
                }
            }, 1000);
        };
    }

    dispose() {
        this.activeSources.clear();

        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }

        this.isInitialized = false;
    }
}
