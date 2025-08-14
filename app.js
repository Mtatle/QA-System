document.addEventListener('DOMContentLoaded', async () => {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // Google Sheets integration
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw2QItqEKnA9flsplRYiO-TF5jSZ_8zXH7YA5SAwVCGlmkZhlojwv5wZk0EVuKtSTpvog/exec'; // Replace with the new deployment URL
    
    // Current scenario data
    let currentScenario = null;
    let scenarioData = null;
    let hasRespondedOnce = false; // For scenario 5 angry response
    
    // Scenario progression system
    function getCurrentUnlockedScenario() {
        const unlockedScenario = localStorage.getItem('unlockedScenario');
        return unlockedScenario ? parseInt(unlockedScenario) : 1; // Default to scenario 1
    }
    
    function getMessageCountForScenario(scenarioNumber) {
        const messageCount = localStorage.getItem(`messageCount_scenario_${scenarioNumber}`);
        return messageCount ? parseInt(messageCount) : 0;
    }
    
    function incrementMessageCount(scenarioNumber) {
        const currentCount = getMessageCountForScenario(scenarioNumber);
        const newCount = currentCount + 1;
        localStorage.setItem(`messageCount_scenario_${scenarioNumber}`, newCount);
        return newCount;
    }
    
    function unlockNextScenario() {
        const currentUnlocked = getCurrentUnlockedScenario();
        const nextScenario = currentUnlocked + 1;
        localStorage.setItem('unlockedScenario', nextScenario);
        console.log(`Unlocked scenario ${nextScenario}`);
        return nextScenario;
    }
    
    function isScenarioUnlocked(scenarioNumber) {
        const unlockedScenario = getCurrentUnlockedScenario();
        return parseInt(scenarioNumber) <= unlockedScenario;
    }
    
    function canAccessScenario(scenarioNumber) {
        const currentUnlocked = getCurrentUnlockedScenario();
        const requestedScenario = parseInt(scenarioNumber);
        
        // Can only access the current unlocked scenario (no going back)
        return requestedScenario === currentUnlocked;
    }
    
    // Get scenario from URL with validation
    function getCurrentScenarioNumber() {
        const urlParams = new URLSearchParams(window.location.search);
        const requestedScenario = urlParams.get('scenario') || '1';
        
        // Check if the requested scenario can be accessed (only current scenario allowed)
        if (!canAccessScenario(requestedScenario)) {
            // Redirect to the current allowed scenario
            const currentScenario = getCurrentUnlockedScenario();
            console.log(`Can only access scenario ${currentScenario}. Redirecting from ${requestedScenario}`);
            window.location.href = `app.html?scenario=${currentScenario}`;
            return currentScenario.toString();
        }
        
        return requestedScenario;
    }

    
    // Load scenarios data
    async function loadScenariosData() {
        try {
            const response = await fetch('scenarios.json');
            const data = await response.json();
            
            // Merge defaults with each scenario
            const scenarios = {};
            const defaults = data.defaults || {};
            
            Object.keys(data.scenarios).forEach(scenarioKey => {
                scenarios[scenarioKey] = {
                    ...defaults,
                    ...data.scenarios[scenarioKey],
                    // Merge guidelines specifically
                    guidelines: {
                        ...defaults.guidelines,
                        ...data.scenarios[scenarioKey].guidelines
                    },
                    // Merge rightPanel specifically  
                    rightPanel: {
                        ...defaults.rightPanel,
                        ...data.scenarios[scenarioKey].rightPanel
                    }
                };
            });
            
            return scenarios;
        } catch (error) {
            console.error('Error loading scenarios data:', error);
            return null;
        }
    }
    
    // Generate dynamic navigation with scenario locking
    function generateScenarioNavigation(scenarios) {
        const dropdown = document.getElementById('scenarioDropdown');
        if (!dropdown) return;
        
        // Clear and do NOT add a placeholder (centered single option looks like a pill button)
        dropdown.innerHTML = '';
        
        const currentAllowed = getCurrentUnlockedScenario();
        
        // Add scenario options
        Object.keys(scenarios).forEach(scenarioNumber => {
            const option = document.createElement('option');
            option.value = scenarioNumber;
            
            const scenarioNum = parseInt(scenarioNumber);
            
            if (scenarioNum === currentAllowed) {
                // Current scenario - accessible
                option.textContent = `Scenario ${scenarioNumber}`;
            } else if (scenarioNum < currentAllowed) {
                // Previous scenarios - completed but not accessible
                option.textContent = `Scenario ${scenarioNumber} ✅ Completed`;
                option.disabled = true;
                option.style.color = '#28a745';
            } else {
                // Future scenarios - locked
                option.textContent = `Scenario ${scenarioNumber} 🔒`;
                option.disabled = true;
                option.style.color = '#999';
            }
            
            dropdown.appendChild(option);
        });
        
        // Set current scenario as selected
        const currentScenario = getCurrentScenarioNumber();
        if (currentScenario) {
            // Ensure the current scenario appears as the selected option (even with no placeholder)
            dropdown.value = currentScenario;
        }
        
        // Add change event listener for navigation (but they can't actually navigate anywhere)
        dropdown.addEventListener('change', (e) => {
            const selectedScenario = e.target.value;
            if (selectedScenario && canAccessScenario(selectedScenario)) {
                window.location.href = `app.html?scenario=${selectedScenario}`;
            } else {
                // Reset dropdown to current scenario if they try to select something else
                dropdown.value = getCurrentScenarioNumber();
            }
        });
    }
    
    // Helper function to get display name and icon for guideline categories
    function getCategoryInfo(categoryKey) {
        const categoryMap = {
            'send_to_cs': { 
                display: 'SEND TO CS', 
                icon: 'mail' 
            },
            'escalate': { 
                display: 'ESCALATE', 
                icon: 'arrow-up-circle' 
            },
            'tone': { 
                display: 'TONE', 
                icon: 'message-square' 
            },
            'templates': { 
                display: 'TEMPLATES', 
                icon: 'zap' 
            },
            'dos_and_donts': { 
                display: 'DOs AND DON\'Ts', 
                icon: 'check-square' 
            },
            'drive_to_purchase': { 
                display: 'DRIVE TO PURCHASE', 
                icon: 'shopping-cart' 
            },
            'promo_and_exclusions': { 
                display: 'PROMO & PROMO EXCLUSIONS', 
                icon: 'gift' 
            },
            'important': { 
                display: 'IMPORTANT', 
                icon: 'alert-circle' 
            }
        };
        
        // Return category info if found, otherwise default
        return categoryMap[categoryKey.toLowerCase()] || { 
            display: categoryKey.toUpperCase(), 
            icon: 'info' 
        };
    }
    
    // Load scenario content into the page
    function loadScenarioContent(scenarioNumber, data) {
        const scenario = data[scenarioNumber];
        if (!scenario) {
            console.error('Scenario not found:', scenarioNumber);
            return;
        }
        
        console.log('Loading scenario:', scenarioNumber, scenario);
        
        // Update page title
        document.title = `Training - Scenario ${scenarioNumber}`;
        
        // Update company info with error checking
        const companyElement = document.getElementById('companyName');
        const agentElement = document.getElementById('agentName');
        const phoneElement = document.getElementById('customerPhone');
        const messageElement = document.getElementById('customerMessage');
        
        if (companyElement) companyElement.textContent = scenario.companyName;
        else console.error('companyName element not found');
        
        if (agentElement) agentElement.textContent = scenario.agentName;
        else console.error('agentName element not found');
        
        if (phoneElement) phoneElement.textContent = scenario.customerPhone;
        else console.error('customerPhone element not found');
        
        if (messageElement) messageElement.textContent = scenario.customerMessage;
        else console.error('customerMessage element not found');
        
        // Update guidelines dynamically
        const guidelinesContainer = document.getElementById('dynamic-guidelines-container');
        if (guidelinesContainer && scenario.guidelines) {
            guidelinesContainer.innerHTML = '';
            
            // Create categories dynamically based on scenario data
            Object.keys(scenario.guidelines).forEach(categoryKey => {
                const categoryData = scenario.guidelines[categoryKey];
                if (Array.isArray(categoryData) && categoryData.length > 0) {
                    // Get category display info
                    const categoryInfo = getCategoryInfo(categoryKey);
                    
                    // Create category section
                    const categorySection = document.createElement('div');
                    categorySection.className = 'guidelines-section';
                    
                    // Create category header
                    const categoryHeader = document.createElement('div');
                    categoryHeader.className = 'guidelines-header';
                    
                    // Create icon element
                    const iconElement = document.createElement('i');
                    iconElement.setAttribute('data-feather', categoryInfo.icon);
                    iconElement.className = 'icon-small';
                    
                    // Create category title
                    const titleElement = document.createElement('span');
                    titleElement.textContent = categoryInfo.display;
                    
                    // Assemble header
                    categoryHeader.appendChild(iconElement);
                    categoryHeader.appendChild(titleElement);
                    
                    // Create guidelines list
                    const guidelinesList = document.createElement('ul');
                    guidelinesList.className = 'guidelines-list';
                    
                    // Add guidelines items
                    categoryData.forEach(item => {
                        const li = document.createElement('li');
                        li.textContent = item;
                        guidelinesList.appendChild(li);
                    });
                    
                    // Assemble category section
                    categorySection.appendChild(categoryHeader);
                    categorySection.appendChild(guidelinesList);
                    
                    // Add to container
                    guidelinesContainer.appendChild(categorySection);
                }
            });
        }
        
        // Update right panel content
        loadRightPanelContent(scenario);
        
        // Update dropdown selection
        const dropdown = document.getElementById('scenarioDropdown');
        if (dropdown) {
            dropdown.value = scenarioNumber;
        }
        
        // Store current scenario data
        currentScenario = scenarioNumber;
        scenarioData = scenario;
        
        // Re-initialize Feather icons after DOM changes
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }
    
    // Render dynamic Promotions/Gifts from scenarios.json if provided
    function renderPromotions(promotions) {
        const container = document.getElementById('promotionsContainer');
        if (!container) return;

        container.innerHTML = '';

        // Allow single object or array
        const items = Array.isArray(promotions) ? promotions : [promotions];

        items.forEach(promo => {
            if (!promo) return;

            const section = document.createElement('div');
            section.className = 'promotions-section';

            const header = document.createElement('div');
            header.className = 'promotions-header';

            const icon = document.createElement('div');
            icon.className = 'promotions-icon';
            icon.innerHTML = '<i data-feather="gift"></i>';

            const info = document.createElement('div');
            info.className = 'promotions-info';

            const titleRow = document.createElement('div');
            titleRow.className = 'promotions-title';

            const titleSpan = document.createElement('span');
            titleSpan.textContent = promo.title || 'Promotion';
            titleRow.appendChild(titleSpan);

            // Active badge if active_status truthy or equals "active"
            const status = (promo.active_status ?? '').toString().toLowerCase();
            if (promo.active_status === true || status === 'active' || status === 'true' || status === '1') {
                const badge = document.createElement('div');
                badge.className = 'active-badge';
                badge.textContent = 'Active';
                titleRow.appendChild(badge);
            }

            const desc = document.createElement('div');
            desc.className = 'promotions-description';

            // Content can be string or array -> render as bullet lines
            if (Array.isArray(promo.content)) {
                promo.content.forEach(line => {
                    const p = document.createElement('p');
                    p.textContent = `• ${line}`;
                    desc.appendChild(p);
                });
            } else if (typeof promo.content === 'string') {
                const lines = promo.content.split(/\r?\n/).filter(Boolean);
                lines.forEach(line => {
                    const p = document.createElement('p');
                    p.textContent = `• ${line}`;
                    desc.appendChild(p);
                });
            }

            info.appendChild(titleRow);
            info.appendChild(desc);
            header.appendChild(icon);
            header.appendChild(info);
            section.appendChild(header);
            container.appendChild(section);
        });

        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    // Function to load right panel dynamic content
    function loadRightPanelContent(scenario) {
        if (!scenario.rightPanel) return;

        // Render promotions dynamically if provided
        const promos = scenario.rightPanel.promotions;
        const promosContainer = document.getElementById('promotionsContainer');
        if (promos) {
            renderPromotions(promos);
        } else if (promosContainer) {
            promosContainer.innerHTML = '';
        }
        
        // Update source information
        if (scenario.rightPanel.source) {
            const sourceLabel = document.getElementById('sourceLabel');
            const sourceValue = document.getElementById('sourceValue');
            const sourceDate = document.getElementById('sourceDate');
            
            if (sourceLabel) sourceLabel.textContent = scenario.rightPanel.source.label;
            if (sourceValue) sourceValue.textContent = scenario.rightPanel.source.value;
            if (sourceDate) sourceDate.textContent = scenario.rightPanel.source.date;
        }
        
        // Update recommended items
        if (scenario.rightPanel.recommended) {
            const recommendedContainer = document.getElementById('recommendedItems');
            if (recommendedContainer) {
                recommendedContainer.innerHTML = '';
                scenario.rightPanel.recommended.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = item;
                    recommendedContainer.appendChild(li);
                });
            }
        }
        
        // Update browsing history
        if (scenario.rightPanel.browsingHistory) {
            const historyContainer = document.getElementById('browsingHistory');
            if (historyContainer) {
                historyContainer.innerHTML = '';
                scenario.rightPanel.browsingHistory.forEach(historyItem => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        ${historyItem.item} 
                        <span class="time-ago">${historyItem.timeAgo}</span> 
                        <i data-feather="${historyItem.icon}" class="icon-small"></i>
                    `;
                    historyContainer.appendChild(li);
                });
            }
        }
        
        // Update template items
        if (scenario.rightPanel.templates) {
            const templatesContainer = document.getElementById('templateItems');
            if (templatesContainer) {
                templatesContainer.innerHTML = '';
                scenario.rightPanel.templates.forEach(template => {
                    const templateDiv = document.createElement('div');
                    templateDiv.className = 'template-item';

                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'template-header';

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = template.name;

                    const shortcutSpan = document.createElement('span');
                    shortcutSpan.className = 'template-shortcut';
                    shortcutSpan.textContent = template.shortcut;

                    headerDiv.appendChild(nameSpan);
                    headerDiv.appendChild(shortcutSpan);

                    const contentP = document.createElement('p');
                    contentP.textContent = template.content;

                    templateDiv.appendChild(headerDiv);
                    templateDiv.appendChild(contentP);

                    templatesContainer.appendChild(templateDiv);
                });
                
                // Initialize template search functionality
                initializeTemplateSearch(scenario.rightPanel.templates);
            }
        }
    }
    
    // Helper function to convert timestamp to EST - just date
    function toESTTimestamp() {
        const now = new Date();
        // Convert to EST (Eastern Time) and format as MM/DD/YYYY only
        const options = {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };
        
        const estDate = now.toLocaleDateString('en-US', options);
        return estDate; // Returns in format: "MM/DD/YYYY"
    }

    // Helper function to get current timer time
    function getCurrentTimerTime() {
        const timerElement = document.getElementById('sessionTimer');
        return timerElement ? timerElement.textContent : '00:00';
    }

    // Function to send data to Google Sheets
    async function sendToGoogleSheets(agentUsername, scenario, customerMessage, agentResponse) {
        try {
            // Create a unique session ID per scenario that persists throughout the session
            let scenarioSessionId = localStorage.getItem(`scenarioSession_${currentScenario}`);
            if (!scenarioSessionId) {
                scenarioSessionId = `${currentScenario}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                localStorage.setItem(`scenarioSession_${currentScenario}`, scenarioSessionId);
            }
            
            const data = {
                timestampEST: toESTTimestamp(),
                agentUsername: agentUsername,
                scenario: scenario,
                customerMessage: customerMessage,
                agentResponse: agentResponse,
                sessionId: scenarioSessionId, // Use scenario-specific session ID
                sendTime: getCurrentTimerTime()
            };
            
            console.log('Sending to Google Sheets:', data);
            
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                console.log('Successfully sent to Google Sheets');
                const result = await response.json();
                console.log('Sheet response:', result);
            } else {
                console.error('Failed to send to Google Sheets:', response.status);
            }
        } catch (error) {
            console.error('Error sending to Google Sheets:', error);
            // Store locally if Google Sheets fails
            try {
                const failedData = JSON.parse(localStorage.getItem('failedSheetData') || '[]');
                // Guard: data might be undefined if error occurred before it was built
                const safeData = typeof data === 'object' && data ? data : {
                    timestampEST: toESTTimestamp(),
                    agentUsername,
                    scenario,
                    customerMessage,
                    agentResponse,
                    sessionId: localStorage.getItem(`scenarioSession_${currentScenario}`) || 'unknown',
                    sendTime: getCurrentTimerTime()
                };
                failedData.push(safeData);
                localStorage.setItem('failedSheetData', JSON.stringify(failedData));
            } catch (e) {
                console.error('Failed to persist failedSheetData:', e);
            }
        }
    }

    // Function to send data to Google Sheets with custom timer value
    async function sendToGoogleSheetsWithTimer(agentUsername, scenario, customerMessage, agentResponse, timerValue) {
        try {
            // Create a unique session ID per scenario that persists throughout the session
            let scenarioSessionId = localStorage.getItem(`scenarioSession_${currentScenario}`);
            if (!scenarioSessionId) {
                scenarioSessionId = `${currentScenario}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                localStorage.setItem(`scenarioSession_${currentScenario}`, scenarioSessionId);
            }
            
            const data = {
                timestampEST: toESTTimestamp(),
                agentUsername: agentUsername,
                scenario: scenario,
                customerMessage: customerMessage,
                agentResponse: agentResponse,
                sessionId: scenarioSessionId, // Use scenario-specific session ID
                sendTime: timerValue // Use the provided timer value instead of getCurrentTimerTime()
            };
            
            console.log('Sending to Google Sheets:', data);
            
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                console.log('Successfully sent to Google Sheets');
                const result = await response.json();
                console.log('Sheet response:', result);
            } else {
                console.error('Failed to send to Google Sheets:', response.status);
            }
        } catch (error) {
            console.error('Error sending to Google Sheets:', error);
            // Store locally if Google Sheets fails
            try {
                const failedData = JSON.parse(localStorage.getItem('failedSheetData') || '[]');
                // Guard: data might be undefined if error occurred before it was built
                const safeData = typeof data === 'object' && data ? data : {
                    timestampEST: toESTTimestamp(),
                    agentUsername,
                    scenario,
                    customerMessage,
                    agentResponse,
                    sessionId: localStorage.getItem(`scenarioSession_${currentScenario}`) || 'unknown',
                    sendTime: timerValue || getCurrentTimerTime()
                };
                failedData.push(safeData);
                localStorage.setItem('failedSheetData', JSON.stringify(failedData));
            } catch (e) {
                console.error('Failed to persist failedSheetData:', e);
            }
        }
    }
    
    // Get the last customer message for context
    function getLastCustomerMessage() {
        const customerMessages = document.querySelectorAll('.message.received .message-content p');
        if (customerMessages.length > 0) {
            return customerMessages[customerMessages.length - 1].textContent;
        }
        return 'No customer message found';
    }
    
    // Set the agent name from localStorage if available
    const agentName = localStorage.getItem('agentName');
    if (agentName) {
        const agentNameElements = document.querySelectorAll('.agent-name');
        agentNameElements.forEach(element => {
            element.innerHTML = agentName + ' <i data-feather="chevron-down" class="icon-small"></i>';
        });
        
        // Re-initialize Feather icons after DOM changes
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }
    
    // Check if user is logged in (redirect to login if not)
    if (!localStorage.getItem('agentName') && !window.location.href.includes('login.html') && 
        !window.location.href.includes('index.html')) {
        window.location.href = 'index.html';
    }
    
    // Add logout functionality
    function sendSessionLogout() {
        try {
            const sessionId = localStorage.getItem('globalSessionId');
            const agentName = localStorage.getItem('agentName') || 'Unknown Agent';
            const agentEmail = localStorage.getItem('agentEmail') || '';
            const loginMethod = localStorage.getItem('loginMethod') || 'unknown';
            const payload = {
                eventType: 'sessionLogout',
                agentUsername: agentName,
                agentEmail,
                sessionId,
                loginMethod,
                logoutAt: new Date().toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                }),
                logoutAtMs: Date.now()
            };
            const body = JSON.stringify(payload);
            if (navigator.sendBeacon) {
                const blob = new Blob([body], { type: 'text/plain' });
                navigator.sendBeacon(GOOGLE_SCRIPT_URL, blob);
            } else {
                fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' }, body });
            }
        } catch (_) {}
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // Log session logout before clearing
            sendSessionLogout();
            localStorage.removeItem('agentName');
            localStorage.removeItem('unlockedScenario'); // Reset scenario progression
            
            // Clear all scenario timer and message count data
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sessionStartTime_scenario_') || 
                    key.startsWith('scenarioSession_') ||
                    key.startsWith('messageCount_scenario_')) {
                    localStorage.removeItem(key);
                }
            });
            
            window.location.href = 'index.html';
        });
    }
    
    function addMessage(text, type = 'sent') {
        if (!text.trim()) return;

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', type);

        const senderIconDiv = document.createElement('div');
        senderIconDiv.classList.add('message-sender-icon');
        
        const messageContentDiv = document.createElement('div');
        messageContentDiv.classList.add('message-content');

        const messageTextP = document.createElement('p');
        messageTextP.textContent = text;

        const timestampSpan = document.createElement('span');
        timestampSpan.classList.add('timestamp');
        const now = new Date();
        const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + 
                             ', ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        timestampSpan.textContent = formattedDate;

        messageContentDiv.appendChild(messageTextP);
        messageContentDiv.appendChild(timestampSpan);
        
        if (type === 'sent') {
            senderIconDiv.classList.add('self');
            senderIconDiv.textContent = scenarioData ? scenarioData.agentInitial : 'A'; // Use scenario-specific initial
            messageDiv.appendChild(messageContentDiv); // Content first
            messageDiv.appendChild(senderIconDiv); // Icon second
        } else { // received
            senderIconDiv.textContent = 'C'; // Customer initial
            messageDiv.appendChild(senderIconDiv);
            messageDiv.appendChild(messageContentDiv);
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to bottom
    }
    
    function handleSendMessage() {
        const messageText = chatInput.value;
        if (!messageText.trim()) return; // Don't send empty messages
        
        // Get current timer value BEFORE resetting it
        const currentTimerValue = getCurrentTimerTime();
        
        // Get current context for logging
        const agentUsername = localStorage.getItem('agentName') || 'Unknown Agent';
        const currentScenarioName = `Scenario ${currentScenario}`;
        const lastCustomerMessage = getLastCustomerMessage();
        
        // UI updates happen immediately for fast response
        addMessage(messageText, 'sent');
        resetTimer();
        chatInput.value = ''; // Clear input
        chatInput.focus();
        
        // Send to Google Sheets in the next tick (completely non-blocking)
        setTimeout(() => {
            sendToGoogleSheetsWithTimer(agentUsername, currentScenarioName, lastCustomerMessage, messageText, currentTimerValue);
        }, 0);

        // Increment message count for current scenario
        const messageCount = incrementMessageCount(currentScenario);
        console.log(`Message ${messageCount} sent for scenario ${currentScenario}`);

        // Generate scenario-specific response
        generateScenarioResponse(currentScenario, messageText);
        
        // Check if we should unlock next scenario after customer response
        // We'll handle this in the generateScenarioResponse function
    }

    // Function to generate scenario-specific customer responses
    function generateScenarioResponse(scenarioNumber, agentMessage) {
        if (!scenarioData) return;
        
        const messageCount = getMessageCountForScenario(scenarioNumber);
        
        if (scenarioData.responseType === 'angry_custom' && scenarioNumber === '5') {
            // Special handling for scenario 5
            if (!hasRespondedOnce) {
                hasRespondedOnce = true;
                setTimeout(() => {
                    addMessage(scenarioData.angryResponse, 'received');
                    // Check if this is the second message and unlock next scenario
                    checkAndUnlockNextScenario(scenarioNumber, messageCount);
                }, 1000);
            } else if (messageCount >= 2) {
                // No more responses after 2nd message
                checkAndUnlockNextScenario(scenarioNumber, messageCount);
            }
        } else if (scenarioData.responseType === 'template') {
            // Template responses for scenarios 1-4
            if (messageCount === 1) {
                // First message - customer responds
                setTimeout(() => {
                    addMessage("[Customer response - please reply again]", 'received');
                }, 1000);
            } else if (messageCount >= 2) {
                // Second message - scenario complete, unlock next
                setTimeout(() => {
                    addMessage("[Thank you! This scenario is now complete.]", 'received');
                    checkAndUnlockNextScenario(scenarioNumber, messageCount);
                }, 1000);
            }
        }
    }
    
    // Function to check if we should unlock the next scenario
    function checkAndUnlockNextScenario(scenarioNumber, messageCount) {
        if (messageCount >= 2) {
            const nextScenario = unlockNextScenario();
            
            // Show notification about unlocked scenario
            if (nextScenario <= 5) { // Assuming you have 5 scenarios total
                setTimeout(() => {
                    const notification = document.createElement('div');
                    notification.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #28a745;
                        color: white;
                        padding: 15px 20px;
                        border-radius: 8px;
                        font-weight: 500;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        z-index: 1000;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                    `;
                    notification.textContent = `🎉 Scenario ${nextScenario} unlocked! Click here to continue.`;
                    notification.style.cursor = 'pointer';
                    
                    // Make notification clickable to go to next scenario
                    notification.addEventListener('click', () => {
                        window.location.href = `app.html?scenario=${nextScenario}`;
                    });
                    
                    document.body.appendChild(notification);
                    
                    // Fade in
                    setTimeout(() => notification.style.opacity = '1', 100);
                    
                    // Fade out and remove after 5 seconds (longer since it's clickable)
                    setTimeout(() => {
                        notification.style.opacity = '0';
                        setTimeout(() => notification.remove(), 300);
                    }, 5000);
                    
                    // Update dropdown to show newly unlocked scenario
                    loadScenariosData().then(scenarios => {
                        if (scenarios) {
                            generateScenarioNavigation(scenarios);
                        }
                    });
                }, 1000);
            } else {
                // All scenarios completed
                setTimeout(() => {
                    const notification = document.createElement('div');
                    notification.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #007bff;
                        color: white;
                        padding: 15px 20px;
                        border-radius: 8px;
                        font-weight: 500;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        z-index: 1000;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                    `;
                    notification.textContent = `🎉 Congratulations! All scenarios completed!`;
                    document.body.appendChild(notification);
                    
                    // Fade in
                    setTimeout(() => notification.style.opacity = '1', 100);
                    
                    // Keep it visible longer for completion
                    setTimeout(() => {
                        notification.style.opacity = '0';
                        setTimeout(() => notification.remove(), 300);
                    }, 7000);
                }, 1000);
            }
        }
    }

    // Event listeners
    sendButton.addEventListener('click', handleSendMessage);

    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSendMessage();
        }
    });

    // Action buttons: Close / Unsubscribe / Block
    const closeBtn = document.getElementById('closeBtn');
    const unsubscribeBtn = document.getElementById('unsubscribeBtn');
    const blockBtn = document.getElementById('blockBtn');

    function endConversation(action) {
        // Map for display message and sheet value
        const actionConfig = {
            closed:   { display: 'closed', sheet: 'Closed' },
            unsubscribed: { display: 'unsubscribed', sheet: 'Unsubscribed' },
            blocked:  { display: 'blocked', sheet: 'Blocked' }
        };

        const cfg = actionConfig[action];
        if (!cfg) return;

        // Add the end message from the AGENT side (wrapped in brackets)
        addMessage(`[This conversation has been ${cfg.display}.]`, 'sent');

        // Disable further sending in this scenario
        if (chatInput) {
            chatInput.disabled = true;
            chatInput.placeholder = 'Conversation ended. Proceed to the next scenario.';
        }
        if (sendButton) {
            sendButton.disabled = true;
        }

        // Persist a flag that this scenario is ended to prevent further input on reload
        localStorage.setItem(`scenarioEnded_${currentScenario}`, action);

        // Send minimal agent response to Google Sheets
        const agentUsername = localStorage.getItem('agentName') || 'Unknown Agent';
        const currentScenarioName = `Scenario ${currentScenario}`;
        const lastCustomerMessage = getLastCustomerMessage();
        const currentTimerValue = getCurrentTimerTime();

        // Use the "with timer" sender to ensure we capture current timer value
        sendToGoogleSheetsWithTimer(agentUsername, currentScenarioName, lastCustomerMessage, cfg.sheet, currentTimerValue);

        // Unlock next scenario immediately (treat as completion)
        const nextScenario = unlockNextScenario();

        // Show notification about unlocked scenario
        setTimeout(() => {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #28a745;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000;
                opacity: 0;
                transition: opacity 0.3s ease;
                cursor: pointer;
            `;
            notification.textContent = `🎉 Scenario ${nextScenario} unlocked! Click here to continue.`;
            notification.addEventListener('click', () => {
                window.location.href = `app.html?scenario=${nextScenario}`;
            });
            document.body.appendChild(notification);
            setTimeout(() => notification.style.opacity = '1', 100);
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }, 5000);

            // Refresh dropdown to reflect unlock state
            loadScenariosData().then(scenarios => {
                if (scenarios) {
                    generateScenarioNavigation(scenarios);
                }
            });
        }, 500);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => endConversation('closed'));
    }
    if (unsubscribeBtn) {
        unsubscribeBtn.addEventListener('click', () => endConversation('unsubscribed'));
    }
    if (blockBtn) {
        blockBtn.addEventListener('click', () => endConversation('blocked'));
    }

    // Keyboard shortcuts for actions:
    // Shift + B => Block
    // Shift + D => Unsubscribe
    // Shift + N => Close
    document.addEventListener('keydown', (event) => {
        // Ignore if any modifier other than Shift is pressed
        if (event.altKey || event.ctrlKey || event.metaKey) return;

        if (event.shiftKey) {
            const key = event.key.toLowerCase();
            if (key === 'b') {
                event.preventDefault();
                endConversation('blocked');
            } else if (key === 'd') {
                event.preventDefault();
                endConversation('unsubscribed');
            } else if (key === 'n') {
                event.preventDefault();
                endConversation('closed');
            }
        }
    });

    // Initial scroll to bottom if there's pre-loaded content
    if(chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Session Timer functionality - persists across page refreshes
    let timerStartTime = Date.now();
    let timerInterval = null;

    function initSessionTimer() {
        const timerElement = document.getElementById('sessionTimer');
        if (!timerElement) {
            console.error('Timer element not found!');
            return;
        }
        
        console.log('Initializing timer...');

        // Get or create session start time that persists across refreshes
        const currentScenario = getCurrentScenarioNumber();
        const sessionKey = `sessionStartTime_scenario_${currentScenario}`;
        
        let sessionStartTime = localStorage.getItem(sessionKey);
        if (!sessionStartTime) {
            // First time loading this scenario - start fresh timer
            sessionStartTime = Date.now();
            localStorage.setItem(sessionKey, sessionStartTime);
        } else {
            // Convert back to number
            sessionStartTime = parseInt(sessionStartTime);
        }
        
        timerStartTime = sessionStartTime;
        
        function updateTimer() {
            const currentTime = Date.now();
            const elapsedTime = Math.floor((currentTime - timerStartTime) / 1000); // in seconds
            
            const minutes = Math.floor(elapsedTime / 60);
            const seconds = elapsedTime % 60;
            
            const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            timerElement.textContent = formattedTime;
        }

        // Clear any existing timer interval
        if (timerInterval) {
            clearInterval(timerInterval);
        }

        // Update timer immediately and then every second
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
        console.log('Timer started successfully');
    }

    // Function to reset the timer when agent sends a message
    function resetTimer() {
        console.log('Resetting timer...');
        const newStartTime = Date.now();
        timerStartTime = newStartTime;
        
        // Update localStorage with new start time
        const currentScenario = getCurrentScenarioNumber();
        const sessionKey = `sessionStartTime_scenario_${currentScenario}`;
        localStorage.setItem(sessionKey, newStartTime);
        
        // Don't update display immediately - let the timer interval handle it
        // This ensures the timer value is captured before the reset takes effect
    }

    // Utility to safely create highlighted content without using innerHTML
    function escapeRegExpForSearch(input) {
        return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function createHighlightedFragment(text, searchTerm) {
        const fragment = document.createDocumentFragment();
        if (!searchTerm) {
            fragment.appendChild(document.createTextNode(text));
            return fragment;
        }
        const safePattern = new RegExp(`(${escapeRegExpForSearch(searchTerm)})`, 'gi');
        let lastIndex = 0;
        let match;
        while ((match = safePattern.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (start > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
            }
            const mark = document.createElement('mark');
            mark.textContent = text.slice(start, end);
            fragment.appendChild(mark);
            lastIndex = end;
        }
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        return fragment;
    }

    // Function to initialize template search functionality
    function initializeTemplateSearch(templates) {
        const searchInput = document.querySelector('.search-templates input');
        const templatesContainer = document.getElementById('templateItems');
        
        if (!searchInput || !templatesContainer) return;
        
        // Store original templates for filtering
        const originalTemplates = templates;
        
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            // Clear current templates
            templatesContainer.innerHTML = '';
            
            // Filter templates based on search term
            const filteredTemplates = originalTemplates.filter(template => {
                return template.name.toLowerCase().includes(searchTerm) ||
                       template.shortcut.toLowerCase().includes(searchTerm) ||
                       template.content.toLowerCase().includes(searchTerm);
            });
            
            // Display filtered templates
            filteredTemplates.forEach(template => {
                const templateDiv = document.createElement('div');
                templateDiv.className = 'template-item';

                const headerDiv = document.createElement('div');
                headerDiv.className = 'template-header';

                const nameSpan = document.createElement('span');
                nameSpan.appendChild(createHighlightedFragment(template.name, searchTerm));

                const shortcutSpan = document.createElement('span');
                shortcutSpan.className = 'template-shortcut';
                shortcutSpan.appendChild(createHighlightedFragment(template.shortcut, searchTerm));

                headerDiv.appendChild(nameSpan);
                headerDiv.appendChild(shortcutSpan);

                const contentP = document.createElement('p');
                contentP.appendChild(createHighlightedFragment(template.content, searchTerm));

                templateDiv.appendChild(headerDiv);
                templateDiv.appendChild(contentP);

                templatesContainer.appendChild(templateDiv);
            });
            
            // Show "No results" message if no templates match
            if (filteredTemplates.length === 0 && searchTerm !== '') {
                const noResultsDiv = document.createElement('div');
                noResultsDiv.className = 'no-results';
                noResultsDiv.textContent = 'No templates found';
                templatesContainer.appendChild(noResultsDiv);
            }
        });
    }
    
    // Deprecated: previous text highlighter used with innerHTML (kept for backward compatibility, not used)
    function highlightSearchTerm(text, searchTerm) {
        return text;
    }

    // Initialize everything
    const scenarios = await loadScenariosData();
    if (scenarios) {
        const scenarioNumber = getCurrentScenarioNumber();
        generateScenarioNavigation(scenarios);
        loadScenarioContent(scenarioNumber, scenarios);
    } else {
        console.error('Could not load scenarios data');
    }
    
    // Initialize timer
    initSessionTimer();

    // If this scenario was previously ended (via action buttons), keep input disabled IF it's NOT the current unlocked scenario.
    // This prevents stale ended flags from blocking a fresh session when logging back in or starting a new unlocked scenario.
    const currentScenarioNumber = getCurrentScenarioNumber();
    const ended = localStorage.getItem(`scenarioEnded_${currentScenarioNumber}`);
    const isCurrentUnlocked = parseInt(currentScenarioNumber) === getCurrentUnlockedScenario();

    if (ended && !isCurrentUnlocked) {
        if (chatInput) {
            chatInput.disabled = true;
            chatInput.placeholder = 'Conversation ended. Proceed to the next scenario.';
        }
        if (sendButton) {
            sendButton.disabled = true;
        }
        if (typeof feather !== 'undefined') feather.replace();
    } else if (ended && isCurrentUnlocked) {
        // The current unlocked scenario should always start fresh. Clear any stale end flag.
        localStorage.removeItem(`scenarioEnded_${currentScenarioNumber}`);
        if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = 'Type your message...';
        }
        if (sendButton) {
            sendButton.disabled = false;
        }
    }
    
    // Initialize new features
    initTemplateSearchKeyboardShortcut();

    // Attempt to record logout on tab close/navigation
    window.addEventListener('beforeunload', () => {
        sendSessionLogout();
    });
});

// ==================
// NEW FEATURES CODE
// ==================

// Template search keyboard shortcut (Ctrl + /)
function initTemplateSearchKeyboardShortcut() {
    const templateSearch = document.getElementById('templateSearch');
    
    if (templateSearch) {
        document.addEventListener('keydown', (event) => {
            // Check for Ctrl + / or Cmd + / (Mac)
            if ((event.ctrlKey || event.metaKey) && event.key === '/') {
                event.preventDefault();
                templateSearch.focus();
            }
        });
        
        // Optional: Add visual feedback when focused via keyboard shortcut
        templateSearch.addEventListener('focus', () => {
            templateSearch.style.borderColor = '#007bff';
        });
        
        templateSearch.addEventListener('blur', () => {
            templateSearch.style.borderColor = '#ddd';
        });
    }
}
