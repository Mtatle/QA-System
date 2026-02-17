document.addEventListener('DOMContentLoaded', () => {
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw2QItqEKnA9flsplRYiO-TF5jSZ_8zXH7YA5SAwVCGlmkZhlojwv5wZk0EVuKtSTpvog/exec';
    // Load allowed agents and emails list
    let allowedAgents = [];
    let allowedEmails = [];

    // Load allowed agents from JSON file
    async function loadAllowedUsers() {
        try {
            const response = await fetch('allowed-agents.json');
            const data = await response.json();
            allowedAgents = data.allowedAgents ? data.allowedAgents.map(agent => agent.toLowerCase()) : [];
            allowedEmails = data.allowedEmails ? data.allowedEmails.map(email => email.toLowerCase()) : [];
        } catch (error) {
            console.error('Error loading allowed users:', error);
            // Fallback list if file can't be loaded
            allowedAgents = ['admin', 'agent1', 'sarah', 'emma', 'marcus', 'jessica', 'david'];
            allowedEmails = ['admin@company.com', 'your-email@gmail.com'];
        }
    }

    // ===== Session logging helpers =====
    function ensureGlobalSessionId() {
        let sessionId = localStorage.getItem('globalSessionId');
        if (!sessionId) {
            sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('globalSessionId', sessionId);
        }
        return sessionId;
    }

    function toESTDateTimeString() {
        const now = new Date();
        return now.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    function sendSessionLogin({ agentName, agentEmail, loginMethod }) {
        const sessionId = ensureGlobalSessionId();
        const payload = {
            eventType: 'sessionLogin',
            agentUsername: agentName || 'Unknown Agent',
            agentEmail: agentEmail || '',
            sessionId,
            loginMethod: loginMethod || 'unknown',
            loginAt: toESTDateTimeString(),
            loginAtMs: Date.now()
        };

        const body = JSON.stringify(payload);
        // Use sendBeacon to avoid being canceled by navigation
        if (navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'text/plain' });
            navigator.sendBeacon(GOOGLE_SCRIPT_URL, blob);
        } else {
            // Fallback (fire and forget)
            try { fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' }, body }); } catch (_) {}
        }
    }

    // Initialize Google Sign-In
    function initializeGoogleSignIn() {
        const GOOGLE_CLIENT_ID = '859624417507-jih3s0ub8apicj7cr4sja0l7rj2t3kbt.apps.googleusercontent.com';
        
        console.log('Current origin:', window.location.origin);
        console.log('Current URL:', window.location.href);
        
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            try {
                google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleGoogleSignIn,
                    auto_select: false,
                    cancel_on_tap_outside: false
                });
                
                console.log('Google Sign-In initialized successfully');
                
            } catch (error) {
                console.error('Google Sign-In initialization failed:', error);
                showError('Google Sign-In is not available. Please use username login below.');
            }
        } else {
            console.warn('Google Sign-In API not loaded');
            showError('Google Sign-In is loading... Please try again in a moment or use username login.');
        }
    }

    // Handle Google Sign-In response
    function handleGoogleSignIn(response) {
        try {
            // Decode the JWT token to get user info
            const payload = parseJwt(response.credential);
            const email = payload.email.toLowerCase();
            const name = payload.name;
            
            // Check if email is allowed
            if (allowedEmails.includes(email)) {
                // Store user info
                localStorage.setItem('agentName', name);
                localStorage.setItem('agentEmail', email);
                localStorage.setItem('sessionStartTime', Date.now());
                localStorage.setItem('loginMethod', 'google');
                // Log session login
                sendSessionLogin({ agentName: name, agentEmail: email, loginMethod: 'google' });
                
                // Redirect to app
                window.location.href = 'app.html?scenario=1';
            } else {
                showError('Your email is not authorized to access this training portal.');
            }
        } catch (error) {
            console.error('Error handling Google sign-in:', error);
            showError('Error signing in with Google. Please try again.');
        }
    }

    // Parse JWT token
    function parseJwt(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    }

    // Show error message
    function showError(message) {
        const errorElement = document.getElementById('error-message');
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }

    // Hide error message
    function hideError() {
        const errorElement = document.getElementById('error-message');
        errorElement.textContent = '';
        errorElement.classList.remove('show');
    }

    // Load allowed users when page loads
    loadAllowedUsers().then(() => {
        // Give Google API more time to load and try multiple times
        let attempts = 0;
        const maxAttempts = 5;
        
        function tryInitialize() {
            attempts++;
            if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
                console.log('Google API loaded, initializing...');
                initializeGoogleSignIn();
            } else if (attempts < maxAttempts) {
                console.log(`Google API not ready, attempt ${attempts}/${maxAttempts}`);
                setTimeout(tryInitialize, 1000);
            } else {
                console.log('Google API failed to load after multiple attempts');
                showError('Google Sign-In unavailable. Please use username login.');
            }
        }
        
        tryInitialize();
    });

    // Google Sign-In button click handler
    document.getElementById('googleSignInBtn').addEventListener('click', function() {
        console.log('Google Sign-In button clicked');
        hideError();
        
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            try {
                console.log('Attempting to show Google Sign-In prompt');
                google.accounts.id.prompt();
            } catch (error) {
                console.error('Google Sign-In prompt failed:', error);
                showError('Google Sign-In failed: ' + error.message);
            }
        } else {
            console.error('Google Sign-In API not available');
            showError('Google Sign-In is not available. Please use username login below.');
        }
    });

    // Username-only login with whitelist validation (fallback)
    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        hideError();
        
        if (username.length < 2) {
            showError('Please enter a valid name');
            return;
        }
        
        if (!allowedAgents.includes(username.toLowerCase())) {
            showError('Invalid username');
            return;
        }
        
        localStorage.setItem('agentName', username);
        localStorage.setItem('sessionStartTime', Date.now());
        localStorage.setItem('loginMethod', 'username');
        // Log session login (email unknown)
        sendSessionLogin({ agentName: username, agentEmail: '', loginMethod: 'username' });
        window.location.href = 'app.html?scenario=1';
    });

    // Auto-redirect if already logged in (only when served over http/https to avoid file:// origin issues)
    const isHttpProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    if (isHttpProtocol && localStorage.getItem('agentName') && localStorage.getItem('sessionStartTime')) {
        const sessionAge = Date.now() - parseInt(localStorage.getItem('sessionStartTime'));
        const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (sessionAge < maxSessionAge) {
            window.location.href = 'app.html?scenario=1';
        } else {
            // Session expired, clear storage
            localStorage.removeItem('agentName');
            localStorage.removeItem('agentEmail');
            localStorage.removeItem('sessionStartTime');
            localStorage.removeItem('loginMethod');
        }
    }
});