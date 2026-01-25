/**
 * Chat UI for PC client
 * Handles chat input, message display, and XSS prevention
 */

const MAX_VISIBLE_MESSAGES = 50;

export class ChatUI {
    constructor(network) {
        this.network = network;
        this.localPlayerId = null;
        this.localPlayerName = 'Player';

        // Cache DOM references
        this.container = document.getElementById('chat-container');
        this.messagesEl = document.getElementById('chat-messages');
        this.inputEl = document.getElementById('chat-input');
        this.minimizeBtn = document.getElementById('chat-minimize-btn');
        this.minimizeBtnInline = document.getElementById('chat-minimize-btn-inline');
        this.unreadBadge = document.getElementById('chat-unread');

        this.messageCount = 0;
        this.unreadCount = 0;
        this.isMinimized = false;

        // Callback for when user finishes with chat (send message or click outside)
        this.onReturnToGame = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Send message on Enter
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleSend();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.inputEl.value = '';
                this.inputEl.blur();
                // Return to game on Escape
                if (this.onReturnToGame) {
                    this.onReturnToGame();
                }
            }
        });

        // Prevent game controls when typing
        this.inputEl.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });

        // Prevent pointer lock request when clicking chat
        this.container.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Minimize button (in header)
        if (this.minimizeBtn) {
            this.minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMinimize();
            });
            this.minimizeBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMinimize();
            }, { passive: false });
        }

        // Minimize button (inline, shown when minimized)
        if (this.minimizeBtnInline) {
            this.minimizeBtnInline.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMinimize();
            });
            this.minimizeBtnInline.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMinimize();
            }, { passive: false });
        }
    }

    /**
     * Toggle minimized state
     */
    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.container.classList.toggle('minimized', this.isMinimized);
        this.minimizeBtn.textContent = this.isMinimized ? '+' : '_';

        // Move unread badge to inline button area when minimized
        if (this.unreadBadge && this.minimizeBtnInline) {
            const inputContainer = document.getElementById('chat-input-container');
            const header = document.getElementById('chat-header');
            if (this.isMinimized) {
                // Move badge to input container (will be positioned on inline button)
                inputContainer.appendChild(this.unreadBadge);
            } else {
                // Move badge back to header
                header.insertBefore(this.unreadBadge, this.minimizeBtn);
            }
        }

        // Clear unread count when expanding
        if (!this.isMinimized) {
            this.clearUnread();
        }
    }

    /**
     * Increment unread count when minimized
     */
    incrementUnread() {
        if (this.isMinimized) {
            this.unreadCount++;
            this.updateUnreadBadge();
        }
    }

    /**
     * Clear unread count
     */
    clearUnread() {
        this.unreadCount = 0;
        this.updateUnreadBadge();
    }

    /**
     * Update the unread badge display
     */
    updateUnreadBadge() {
        if (this.unreadBadge) {
            if (this.unreadCount > 0) {
                this.unreadBadge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                this.unreadBadge.classList.remove('hidden');
            } else {
                this.unreadBadge.classList.add('hidden');
            }
        }
    }

    /**
     * Handle sending a chat message
     */
    handleSend() {
        const text = this.inputEl.value.trim();
        if (!text) return;

        // Send to server
        if (this.network && this.network.isConnected) {
            this.network.sendChatMessage(text);
        }

        // Clear input
        this.inputEl.value = '';

        // Return to game after sending
        this.inputEl.blur();
        if (this.onReturnToGame) {
            this.onReturnToGame();
        }
    }

    /**
     * Add a message to the chat display
     * @param {string} senderName - Display name of sender
     * @param {string} text - Message text
     * @param {boolean} isLocal - Whether this is the local player's message
     * @param {string} senderId - Player ID of sender
     */
    addMessage(senderName, text, isLocal = false, senderId = null) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message';

        const senderEl = document.createElement('span');
        senderEl.className = `sender ${isLocal ? 'local' : 'remote'}`;
        senderEl.textContent = this.escapeHtml(senderName) + ': ';

        const textEl = document.createElement('span');
        textEl.className = 'text';
        textEl.textContent = this.escapeHtml(text);

        messageEl.appendChild(senderEl);
        messageEl.appendChild(textEl);
        this.messagesEl.appendChild(messageEl);

        this.messageCount++;

        // Remove oldest messages if over limit
        while (this.messageCount > MAX_VISIBLE_MESSAGES) {
            this.messagesEl.removeChild(this.messagesEl.firstChild);
            this.messageCount--;
        }

        // Auto-scroll to bottom
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

        // Track unread if minimized
        this.incrementUnread();
    }

    /**
     * Add a system message (join/leave/mute notifications)
     * @param {string} text - System message text
     */
    addSystemMessage(text) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message';

        const senderEl = document.createElement('span');
        senderEl.className = 'sender system';
        senderEl.textContent = '* ';

        const textEl = document.createElement('span');
        textEl.className = 'text';
        textEl.style.color = '#888888';
        textEl.style.fontStyle = 'italic';
        textEl.textContent = this.escapeHtml(text);

        messageEl.appendChild(senderEl);
        messageEl.appendChild(textEl);
        this.messagesEl.appendChild(messageEl);

        this.messageCount++;

        // Remove oldest messages if over limit
        while (this.messageCount > MAX_VISIBLE_MESSAGES) {
            this.messagesEl.removeChild(this.messagesEl.firstChild);
            this.messageCount--;
        }

        // Auto-scroll to bottom
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

        // Track unread if minimized
        this.incrementUnread();
    }

    /**
     * Add a stream chat message (Twitch, YouTube, etc.)
     * @param {string} platform - Platform name ('twitch', 'youtube', etc.)
     * @param {string} senderName - Streamer chat username
     * @param {string} text - Message text
     * @param {string} color - Optional platform-specific user color
     */
    addStreamMessage(platform, senderName, text, color = null) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message stream-message';

        // Platform indicator badge
        const platformEl = document.createElement('span');
        platformEl.className = `platform-badge ${platform}`;
        platformEl.textContent = platform === 'twitch' ? 'TTV' : platform.toUpperCase().slice(0, 3);

        const senderEl = document.createElement('span');
        senderEl.className = 'sender stream';
        // Use Twitch user color if available
        if (color) {
            senderEl.style.color = color;
        }
        senderEl.textContent = this.escapeHtml(senderName) + ': ';

        const textEl = document.createElement('span');
        textEl.className = 'text';
        textEl.textContent = this.escapeHtml(text);

        messageEl.appendChild(platformEl);
        messageEl.appendChild(senderEl);
        messageEl.appendChild(textEl);
        this.messagesEl.appendChild(messageEl);

        this.messageCount++;

        // Remove oldest messages if over limit
        while (this.messageCount > MAX_VISIBLE_MESSAGES) {
            this.messagesEl.removeChild(this.messagesEl.firstChild);
            this.messageCount--;
        }

        // Auto-scroll to bottom
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

        // Track unread if minimized
        this.incrementUnread();
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Raw text
     * @returns {string} - Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Set the local player ID for identifying own messages
     * @param {string} playerId - Local player's socket ID
     */
    setLocalPlayerId(playerId) {
        this.localPlayerId = playerId;
    }

    /**
     * Set the local player's display name
     * @param {string} name - Display name
     */
    setLocalPlayerName(name) {
        this.localPlayerName = name;
    }

    /**
     * Show the chat container
     */
    show() {
        this.container.classList.remove('hidden');
    }

    /**
     * Hide the chat container
     */
    hide() {
        this.container.classList.add('hidden');
    }

    /**
     * Check if chat container is visible
     * @returns {boolean}
     */
    isVisible() {
        return !this.container.classList.contains('hidden');
    }

    /**
     * Focus the chat input
     */
    focus() {
        this.inputEl.focus();
    }

    /**
     * Blur the chat input
     */
    blur() {
        this.inputEl.blur();
    }

    /**
     * Check if chat input is focused
     * @returns {boolean}
     */
    isFocused() {
        return document.activeElement === this.inputEl;
    }

    /**
     * Clear all messages
     */
    clear() {
        this.messagesEl.innerHTML = '';
        this.messageCount = 0;
    }

    /**
     * Dispose of the chat UI
     */
    dispose() {
        this.clear();
    }
}
