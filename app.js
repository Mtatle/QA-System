document.addEventListener('DOMContentLoaded', async () => {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendButton = document.getElementById('sendButton');
    const internalNotesEl = document.getElementById('internalNotes');
    const logoutBtn = document.getElementById('logoutBtn');
    const csvUploadContainer = document.getElementById('csvUploadContainer');
    const csvFileInput = document.getElementById('csvFileInput');
    const csvUploadBtn = document.getElementById('csvUploadBtn');
    const csvClearBtn = document.getElementById('csvClearBtn');
    const csvStatus = document.getElementById('csvStatus');
    const templatesUploadContainer = document.getElementById('templatesUploadContainer');
    const templatesFileInput = document.getElementById('templatesFileInput');
    const templatesUploadBtn = document.getElementById('templatesUploadBtn');
    const templatesClearBtn = document.getElementById('templatesClearBtn');
    const templatesStatus = document.getElementById('templatesStatus');
    const assignmentSelect = document.getElementById('assignmentSelect');
    const assignmentRefreshBtn = document.getElementById('assignmentRefreshBtn');
    const assignmentOpenBtn = document.getElementById('assignmentOpenBtn');
    const assignmentsStatus = document.getElementById('assignmentsStatus');
    const nextConversationBtn = document.getElementById('nextConversationBtn');
    const API_BASE_URL = 'https://qa-templates-worker.qasystem.workers.dev'; // e.g. https://your-worker.example.workers.dev

    // Google Sheets integration
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxSTqGjhuR_AjFUNIeJOalTvVk1hGDLs0lazVoLKG7qmAKCErfAOkSRAHU84SyYIs98zw/exec';
    // Current scenario data
    let currentScenario = null;
    let scenarioData = null;
    let hasRespondedOnce = false; // For scenario 5 angry response
    let totalScenarioCount = 0;
    let templatesData = [];
    let assignmentQueue = [];
    let assignmentContext = null;
    let draftSaveTimer = null;
    
    // CSV upload permission lists
    let csvUploadAllowedAgents = [];
    let csvUploadAllowedEmails = [];
    let templateUploadAllowedAgents = [];
    let templateUploadAllowedEmails = [];

    async function loadCsvUploadPermissions() {
        try {
            const response = await fetch('allowed-agents.json');
            const data = await response.json();
            csvUploadAllowedAgents = (data.csvUploadAllowedAgents || []).map(a => a.toLowerCase());
            csvUploadAllowedEmails = (data.csvUploadAllowedEmails || []).map(e => e.toLowerCase());
            templateUploadAllowedAgents = (data.templateUploadAllowedAgents || []).map(a => a.toLowerCase());
            templateUploadAllowedEmails = (data.templateUploadAllowedEmails || []).map(e => e.toLowerCase());
        } catch (error) {
            console.error('Error loading CSV upload permissions:', error);
            csvUploadAllowedAgents = [];
            csvUploadAllowedEmails = [];
            templateUploadAllowedAgents = [];
            templateUploadAllowedEmails = [];
        }
    }

    async function refreshAssignmentQueue() {
        const email = getLoggedInEmail();
        if (!email) throw new Error('Missing logged-in email.');
        const response = await fetchAssignmentGet('queue', {
            email,
            app_base: getCurrentAppBaseUrl()
        });
        const assignments = Array.isArray(response.assignments) ? response.assignments : [];
        renderAssignmentQueue(assignments);
        return assignments;
    }

    async function loadAssignmentContextFromUrl(scenarios) {
        const params = getAssignmentParamsFromUrl();
        if (!params.aid) return null;
        if (!params.token) throw new Error('Missing assignment token in URL.');

        const response = await fetchAssignmentGet('getAssignment', {
            assignment_id: params.aid,
            token: params.token
        });
        const assignment = response && response.assignment ? response.assignment : null;
        if (!assignment) throw new Error('Assignment payload is missing.');

        const scenarioMatch = findScenarioBySendId(scenarios, assignment.send_id);
        if (!scenarioMatch) {
            throw new Error(`Scenario for send_id ${assignment.send_id} was not found in loaded scenarios.`);
        }

        assignmentContext = {
            assignment_id: assignment.assignment_id,
            send_id: assignment.send_id,
            role: assignment.role === 'viewer' ? 'viewer' : 'editor',
            mode: params.mode,
            token: params.token,
            status: assignment.status || '',
            scenarioKey: scenarioMatch.scenarioKey,
            form_state_json: assignment.form_state_json || '',
            internal_note: assignment.internal_note || ''
        };
        return assignmentContext;
    }

    function canUploadCsv() {
        const agentName = (localStorage.getItem('agentName') || '').toLowerCase();
        const agentEmail = (localStorage.getItem('agentEmail') || '').toLowerCase();
        if (!agentName && !agentEmail) return false;
        if (agentEmail && csvUploadAllowedEmails.includes(agentEmail)) return true;
        if (agentName && csvUploadAllowedAgents.includes(agentName)) return true;
        return false;
    }

    function canUploadTemplates() {
        const agentName = (localStorage.getItem('agentName') || '').toLowerCase();
        const agentEmail = (localStorage.getItem('agentEmail') || '').toLowerCase();
        if (!agentName && !agentEmail) return false;
        if (agentEmail && templateUploadAllowedEmails.includes(agentEmail)) return true;
        if (agentName && templateUploadAllowedAgents.includes(agentName)) return true;
        return false;
    }

    function setCsvStatus(message) {
        if (csvStatus) {
            csvStatus.textContent = message || '';
        }
    }

    function getUploadedScenarios() {
        try {
            const raw = localStorage.getItem('uploadedScenarios');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function setUploadedScenarios(list) {
        localStorage.setItem('uploadedScenarios', JSON.stringify(list || []));
        localStorage.setItem('uploadedScenariosAt', String(Date.now()));
    }

    function hasUploadedScenarios() {
        const list = getUploadedScenarios();
        return Array.isArray(list) && list.length > 0;
    }

    function isCsvScenarioMode() {
        return hasUploadedScenarios();
    }

    function getUploadedTemplates() {
        try {
            const raw = localStorage.getItem('uploadedTemplates');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function setUploadedTemplates(list) {
        localStorage.setItem('uploadedTemplates', JSON.stringify(list || []));
        localStorage.setItem('uploadedTemplatesAt', String(Date.now()));
    }

    function setTemplatesStatus(message) {
        if (templatesStatus) {
            templatesStatus.textContent = message || '';
        }
    }
    
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
        if (isCsvScenarioMode()) return true;
        const unlockedScenario = getCurrentUnlockedScenario();
        return parseInt(scenarioNumber) <= unlockedScenario;
    }
    
    function canAccessScenario(scenarioNumber) {
        if (isCsvScenarioMode()) return true;
        const currentUnlocked = getCurrentUnlockedScenario();
        const requestedScenario = parseInt(scenarioNumber);
        
        // Can only access the current unlocked scenario (no going back)
        return requestedScenario === currentUnlocked;
    }
    
    function getScenarioNumberFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const value = params.get('scenario');
        return value ? String(value) : null;
    }

    function setCurrentScenarioNumber(value) {
        if (value) {
            localStorage.setItem('currentScenarioNumber', String(value));
        }
    }

    function getCurrentScenarioNumber() {
        return getScenarioNumberFromUrl() ||
            localStorage.getItem('currentScenarioNumber') ||
            '1';
    }

    function getAssignmentParamsFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const aid = params.get('aid');
        const token = params.get('token');
        const mode = (params.get('mode') || 'edit').toLowerCase();
        return {
            aid: aid ? String(aid) : '',
            token: token ? String(token) : '',
            mode: mode === 'view' ? 'view' : 'edit'
        };
    }

    function getLoggedInEmail() {
        return String(localStorage.getItem('agentEmail') || '').trim().toLowerCase();
    }

    function setAssignmentsStatus(message, isError) {
        if (!assignmentsStatus) return;
        assignmentsStatus.textContent = message || '';
        assignmentsStatus.style.color = isError ? '#b00020' : '#4a4a4a';
    }

    function getCurrentAppBaseUrl() {
        const origin = window.location.origin || '';
        const path = window.location.pathname || '/app.html';
        return `${origin}${path}`;
    }

    async function fetchAssignmentGet(action, queryParams) {
        const params = new URLSearchParams({ action });
        Object.keys(queryParams || {}).forEach((key) => {
            if (queryParams[key] != null && queryParams[key] !== '') {
                params.set(key, String(queryParams[key]));
            }
        });
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`, {
            method: 'GET',
            mode: 'cors'
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || (json && json.error)) {
            throw new Error((json && json.error) ? json.error : `Request failed (${res.status})`);
        }
        return json;
    }

    async function fetchAssignmentPost(action, payload) {
        const params = new URLSearchParams({ action });
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?${params.toString()}`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload || {})
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || (json && json.error)) {
            throw new Error((json && json.error) ? json.error : `Request failed (${res.status})`);
        }
        return json;
    }

    function renderAssignmentQueue(assignments) {
        assignmentQueue = Array.isArray(assignments) ? assignments : [];
        if (!assignmentSelect) return;

        assignmentSelect.innerHTML = '';
        if (!assignmentQueue.length) {
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = 'No active assignments';
            assignmentSelect.appendChild(emptyOption);
            if (assignmentOpenBtn) assignmentOpenBtn.disabled = true;
            return;
        }

        assignmentQueue.forEach((assignment) => {
            const option = document.createElement('option');
            option.value = assignment.assignment_id || '';
            option.textContent = `${assignment.send_id || assignment.assignment_id} (${assignment.status || 'ASSIGNED'})`;
            option.dataset.editUrl = assignment.edit_url || '';
            option.dataset.viewUrl = assignment.view_url || '';
            assignmentSelect.appendChild(option);
        });
        if (assignmentOpenBtn) assignmentOpenBtn.disabled = false;
    }

    function selectCurrentAssignmentInQueue() {
        if (!assignmentContext || !assignmentSelect) return;
        const currentAid = assignmentContext.assignment_id;
        if (!currentAid) return;
        for (let i = 0; i < assignmentSelect.options.length; i++) {
            if (assignmentSelect.options[i].value === currentAid) {
                assignmentSelect.selectedIndex = i;
                return;
            }
        }
    }

    function openSelectedAssignmentFromList() {
        if (!assignmentSelect || !assignmentSelect.value) return;
        const selectedOption = assignmentSelect.options[assignmentSelect.selectedIndex];
        if (!selectedOption) return;
        const url = selectedOption.dataset.editUrl || '';
        if (url) window.location.href = url;
    }

    function findScenarioBySendId(scenarios, sendId) {
        const target = String(sendId || '').trim();
        const entries = Object.entries(scenarios || {});
        for (let i = 0; i < entries.length; i++) {
            const [scenarioKey, scenario] = entries[i];
            if (String((scenario && scenario.id) || '').trim() === target) {
                return { scenarioKey, scenario };
            }
        }
        return null;
    }

    function assignmentNotesStorageKey() {
        if (!assignmentContext || !assignmentContext.assignment_id) return '';
        return `internalNotes_assignment_${assignmentContext.assignment_id}`;
    }

    function assignmentFormStateStorageKey() {
        if (!assignmentContext || !assignmentContext.assignment_id) return '';
        return `customFormState_assignment_${assignmentContext.assignment_id}`;
    }

    function setAssignmentReadOnlyState(isReadOnly) {
        const customForm = document.getElementById('customForm');
        const formSubmitBtn = document.getElementById('formSubmitBtn');
        const clearFormBtn = document.getElementById('clearFormBtn');
        if (customForm) {
            const controls = customForm.querySelectorAll('input, select, textarea, button');
            controls.forEach((el) => {
                if (el.id === 'clearFormBtn') return;
                el.disabled = !!isReadOnly;
            });
        }
        if (formSubmitBtn) formSubmitBtn.disabled = !!isReadOnly;
        if (clearFormBtn) clearFormBtn.disabled = !!isReadOnly;
        if (internalNotesEl) internalNotesEl.disabled = !!isReadOnly;
        if (nextConversationBtn) nextConversationBtn.disabled = !!isReadOnly;
        if (chatInput) chatInput.disabled = !!isReadOnly;
        if (sendButton) sendButton.disabled = !!isReadOnly;
    }

    function parseStoredFormState(raw) {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function applyCustomFormState(customForm, parsedState) {
        if (!customForm || !parsedState || typeof parsedState !== 'object') return;
        const formElements = customForm.elements;
        for (let i = 0; i < formElements.length; i++) {
            const el = formElements[i];
            if (el.type === 'checkbox') {
                const key = `${el.name}::${el.value}`;
                if (Object.prototype.hasOwnProperty.call(parsedState, key)) {
                    el.checked = !!parsedState[key];
                }
            } else if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.type === 'text') {
                const key = el.name || el.id;
                if (Object.prototype.hasOwnProperty.call(parsedState, key)) {
                    el.value = parsedState[key];
                }
            }
        }
    }

    function collectCustomFormState(customForm) {
        const state = {};
        if (!customForm) return state;
        const formElements = customForm.elements;
        for (let i = 0; i < formElements.length; i++) {
            const el = formElements[i];
            if (!el.name && !el.id) continue;
            if (el.type === 'checkbox') {
                state[`${el.name}::${el.value}`] = el.checked;
            } else if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.type === 'text') {
                const key = el.name || el.id;
                state[key] = el.value;
            }
        }
        return state;
    }

    async function saveAssignmentDraft(customForm) {
        if (!assignmentContext || assignmentContext.role !== 'editor') return;
        if (!assignmentContext.assignment_id || !assignmentContext.token) return;

        const formState = collectCustomFormState(customForm);
        const notesValue = internalNotesEl ? internalNotesEl.value : '';
        const formStateRaw = JSON.stringify(formState);

        const formKey = assignmentFormStateStorageKey();
        if (formKey) localStorage.setItem(formKey, formStateRaw);
        const notesKey = assignmentNotesStorageKey();
        if (notesKey) localStorage.setItem(notesKey, notesValue || '');

        await fetchAssignmentPost('saveDraft', {
            assignment_id: assignmentContext.assignment_id,
            token: assignmentContext.token,
            form_state_json: formStateRaw,
            internal_note: notesValue
        });
    }

    function scheduleAssignmentDraftSave(customForm) {
        if (!assignmentContext || assignmentContext.role !== 'editor') return;
        if (draftSaveTimer) {
            clearTimeout(draftSaveTimer);
        }
        draftSaveTimer = setTimeout(async () => {
            try {
                await saveAssignmentDraft(customForm);
                setAssignmentsStatus('Draft saved.', false);
            } catch (error) {
                console.error('Draft save failed:', error);
                setAssignmentsStatus(`Draft save failed: ${error.message || error}`, true);
            }
        }, 1200);
    }

    function parseCsv(text) {
        const rows = [];
        const normalized = (text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < normalized.length; i++) {
            const char = normalized[i];
            const next = normalized[i + 1];

            if (inQuotes) {
                if (char === '"' && next === '"') {
                    field += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = false;
                } else {
                    field += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    row.push(field);
                    field = '';
                } else if (char === '\n') {
                    row.push(field);
                    rows.push(row);
                    row = [];
                    field = '';
                } else {
                    field += char;
                }
            }
        }

        if (field.length > 0 || row.length > 0) {
            row.push(field);
            rows.push(row);
        }

        return rows;
    }

    function cleanQuotedValue(value) {
        if (value == null) return '';
        let text = String(value).trim();
        while (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
            text = text.slice(1, -1).trim();
        }
        text = text.replace(/""/g, '"').trim();
        return text;
    }

    function parseConversationField(value) {
        const text = cleanQuotedValue(value);
        if (!text) return {};
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const messageRegex = /(SystemMessage|customerMessage|agentMessage|agentMessages)(\d*)/gi;
        const matches = [];
        let match;

        while ((match = messageRegex.exec(normalized)) !== null) {
            matches.push({
                index: match.index,
                rawPrefix: match[1],
                number: match[2] || '',
                matchedText: match[0]
            });
        }

        if (matches.length === 0) return {};

        const conversation = {};
        const counters = {
            SystemMessage: 1,
            customerMessage: 1,
            AgentMessage: 1
        };

        const prefixFor = (rawPrefix) => {
            const lower = rawPrefix.toLowerCase();
            if (lower.startsWith('system')) return 'SystemMessage';
            if (lower.startsWith('customer')) return 'customerMessage';
            if (lower.startsWith('agent')) return 'AgentMessage';
            return null;
        };

        matches.forEach((entry, idx) => {
            const canonicalPrefix = prefixFor(entry.rawPrefix);
            if (!canonicalPrefix) return;

            const colonIndex = normalized.indexOf(':', entry.index + entry.matchedText.length);
            const nextIndex = idx + 1 < matches.length ? matches[idx + 1].index : normalized.length;
            if (colonIndex === -1 || colonIndex > nextIndex) {
                return;
            }

            let rawValue = normalized.slice(colonIndex + 1, nextIndex).trim();
            if (rawValue.endsWith(',')) {
                rawValue = rawValue.slice(0, -1).trim();
            }
            if (rawValue.length >= 2) {
                const quotePairs = [
                    ['"', '"'],
                    ['“', '”'],
                    ['‘', '’']
                ];
                const matchingPair = quotePairs.find(([open, close]) => rawValue.startsWith(open) && rawValue.endsWith(close));
                if (matchingPair) {
                    rawValue = rawValue.slice(matchingPair[0].length, rawValue.length - matchingPair[1].length).trim();
                }
            }
            rawValue = rawValue.replace(/\r?\n/g, '\n').trim();
            rawValue = rawValue.replace(/\\"/g, '"').replace(/""/g, '"');
            if (!rawValue) return;

            let number = entry.number;
            if (number) {
                counters[canonicalPrefix] = Math.max(counters[canonicalPrefix], parseInt(number, 10) + 1);
            } else {
                number = String(counters[canonicalPrefix]);
                counters[canonicalPrefix] += 1;
            }

            let key = `${canonicalPrefix}${number}`;
            while (Object.prototype.hasOwnProperty.call(conversation, key)) {
                number = String(parseInt(number, 10) + 1);
                key = `${canonicalPrefix}${number}`;
                counters[canonicalPrefix] = Math.max(counters[canonicalPrefix], parseInt(number, 10) + 1);
            }

            conversation[key] = rawValue;
        });

        return conversation;
    }

    function getCompanyInitial(companyName) {
        const name = String(companyName || '').trim();
        return name ? name.charAt(0).toUpperCase() : '';
    }

    function parseCompanyNotes(notesText) {
        if (!notesText) return {};

        const notes = {};
        const categories = {
            '📬 SEND TO CS': 'send_to_cs',
            '🛑 ESCALATE': 'escalate',
            '📢 TONE': 'tone',
            '⚡ TEMPLATES': 'templates',
            '✅ DOs AND DON\'Ts': 'dos_and_donts',
            '🛒 DRIVE TO PURCHASE': 'drive_to_purchase',
            '✨ PROMO & PROMO EXCLUSIONS': 'promo_and_exclusions',
            '🚨 IMPORTANT': 'important'
        };

        const sections = String(notesText).split('#').filter(section => section.trim());
        sections.forEach(section => {
            const lines = section.trim().split('\n');
            if (!lines.length) return;
            const header = lines[0].trim();
            const categoryKey = Object.keys(categories).find(key =>
                header.includes(key) || header.includes(key.replace(/[📬🛑📢⚡✅🛒✨🚨]/g, '').trim())
            );
            if (!categoryKey) return;
            const notesKey = categories[categoryKey];
            const bulletPoints = lines
                .slice(1)
                .map(line => line.trim())
                .filter(line => line.startsWith('•'))
                .map(line => line.substring(1).trim())
                .filter(line => line.length > 0);
            if (bulletPoints.length > 0) {
                notes[notesKey] = bulletPoints;
            }
        });

        return notes;
    }

    function buildConversationFromScenario(scenario) {
        if (!scenario) return [];
        if (Array.isArray(scenario.conversation) && scenario.conversation.length) {
            return scenario.conversation.slice();
        }
        const messages = [];
        const entries = Object.entries(scenario);
        entries.forEach(([key, value]) => {
            if (!value || typeof value !== 'string') return;
            if (/^SystemMessage\d+$/i.test(key)) {
                messages.push({ role: 'system', content: value });
            } else if (/^customerMessage\d*$/i.test(key)) {
                messages.push({ role: 'customer', content: value });
            } else if (/^AgentMessage\d+$/i.test(key)) {
                messages.push({ role: 'agent', content: value });
            }
        });
        return messages;
    }

    function getFirstCustomerMessageFromScenario(scenario, conversation) {
        if (scenario && typeof scenario.customerMessage === 'string' && scenario.customerMessage.trim()) {
            return scenario.customerMessage;
        }
        const conv = Array.isArray(conversation) ? conversation : [];
        const firstCustomer = conv.find(m => m && m.role === 'customer' && m.content);
        return firstCustomer ? firstCustomer.content : '';
    }

    function safeJsonParse(raw) {
        if (!raw) return null;
        try {
            return JSON.parse(cleanQuotedValue(raw));
        } catch (_) {
            return null;
        }
    }

    function normalizeName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function formatDollarAmount(rawValue) {
        if (rawValue == null) return '';
        const text = String(rawValue).trim();
        if (!text) return '';
        if (text.startsWith('$')) return text;
        return `$${text}`;
    }

    function convertCsvRowToTemplate(row) {
        const id = cleanQuotedValue(row.TEMPLATE_ID);
        const companyName = cleanQuotedValue(row.COMPANY_NAME);
        const title = cleanQuotedValue(row.TEMPLATE_TITLE);
        const shortcut = cleanQuotedValue(row.SHORTCUT);
        const textField = row.TEMPLATE_TEXT ?? row.TEMPLATE_TEXT ?? '';
        const content = cleanQuotedValue(textField);

        if (!title && !content) return null;

        return {
            id: id || '',
            companyName: companyName || '',
            name: title || 'Untitled',
            shortcut: shortcut || '',
            content: content || ''
        };
    }

    function convertCsvRowToScenario(row, index) {
        const sendId = cleanQuotedValue(row.SEND_ID);
        const companyName = cleanQuotedValue(row.COMPANY_NAME) || 'Unknown Company';
        const companyWebsite = cleanQuotedValue(row.COMPANY_WEBSITE);
        const persona = cleanQuotedValue(row.PERSONA);
        const messageTone = cleanQuotedValue(row.MESSAGE_TONE);
        const companyNotes = cleanQuotedValue(row.COMPANY_NOTES);
        const promoNotesRaw = cleanQuotedValue(row.PROMO_NOTES);
        const conversationFields = parseConversationField(row.PARAPHRASED_CONVERSATION);

        const lastProducts = safeJsonParse(row.LAST_5_PRODUCTS) || [];
        const orders = safeJsonParse(row.ORDERS) || [];

        const guidelines = parseCompanyNotes(companyNotes);
        const promoNotes = promoNotesRaw
            ? promoNotesRaw.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
            : [];

        const agentName = persona || '';
        const agentInitial = getCompanyInitial(companyName);

        const rightPanel = {
            source: {
                label: 'Website',
                value: companyWebsite || 'N/A',
                date: ''
            },
            browsingHistory: Array.isArray(lastProducts)
                ? lastProducts.map(item => ({
                    item: item && item.product_name ? String(item.product_name) : '',
                    link: item && item.product_link ? String(item.product_link) : '',
                    icon: 'eye'
                })).filter(entry => entry.item)
                : [],
            orders: Array.isArray(orders)
                ? orders.map(order => {
                    const products = Array.isArray(order && order.products) ? order.products : [];
                    const currency = order && order.currency ? String(order.currency) : '';
                    return {
                        orderNumber: order && order.order_number ? String(order.order_number) : '',
                        orderDate: order && order.order_date ? String(order.order_date) : '',
                        link: order && order.order_status_url ? String(order.order_status_url) : '',
                        trackingLink: order && order.tracking_url ? String(order.tracking_url) : '',
                        currency,
                        items: products.map(product => ({
                            name: product && product.product_name ? String(product.product_name) : '',
                            price: product && product.product_price != null ? String(product.product_price) : '',
                            currency: product && product.product_currency ? String(product.product_currency) : currency,
                            productLink: product && product.product_link ? String(product.product_link) : ''
                        })).filter(p => p.name),
                        total: order && order.total != null ? String(order.total) : ''
                    };
                }).filter(order => order.orderNumber || order.items.length)
                : []
        };

        // Promotions panel uses PROMO_NOTES only.
        if (promoNotes.length) {
            rightPanel.promotions = {
                title: 'Promotion',
                content: promoNotes
            };
        }

        return {
            id: sendId || '',
            companyName,
            companyWebsite: companyWebsite || '',
            agentName,
            agentInitial,
            messageTone: messageTone || '',
            customerPhone: '',
            customerMessage: '',
            responseType: 'template',
            guidelines,
            ...conversationFields,
            rightPanel,
            orders: Array.isArray(orders) ? orders : [],
        };
    }

    function appendUploadedScenarios(scenarios, uploadedList) {
        const uploaded = Array.isArray(uploadedList) ? uploadedList : [];
        if (!uploaded.length) return scenarios;
        const keys = Object.keys(scenarios).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
        let nextKey = keys.length ? Math.max(...keys) + 1 : 1;
        uploaded.forEach(item => {
            scenarios[String(nextKey)] = item;
            nextKey++;
        });
        return scenarios;
    }

    async function loadTemplatesData() {
        if (API_BASE_URL) {
            try {
                const response = await fetch(`${API_BASE_URL}/templates`, { method: 'GET' });
                if (!response.ok) throw new Error('API error');
                const data = await response.json();
                return Array.isArray(data.templates) ? data.templates : [];
            } catch (error) {
                console.error('Error loading templates via API:', error);
                return [];
            }
        }

        return [];
    }

    async function loadUploadedScenarios() {
        if (!API_BASE_URL) return getUploadedScenarios();
        try {
            const response = await fetch(`${API_BASE_URL}/scenarios`, { method: 'GET' });
            if (!response.ok) throw new Error('API error');
            const data = await response.json();
            const list = Array.isArray(data.scenarios) ? data.scenarios : [];
            setUploadedScenarios(list);
            return list;
        } catch (error) {
            console.error('Error loading scenarios via API:', error);
            return [];
        }
    }

    function getTemplatesForScenario(scenario) {
        const sourceTemplates = Array.isArray(templatesData) && templatesData.length
            ? templatesData
            : (scenario.rightPanel && Array.isArray(scenario.rightPanel.templates) ? scenario.rightPanel.templates : []);

        if (!sourceTemplates.length) return [];

        const companyKey = normalizeName(scenario.companyName);
        const matching = [];
        const global = [];

        sourceTemplates.forEach(template => {
            const templateCompany = normalizeName(template && template.companyName);
            if (!templateCompany) {
                global.push(template);
            } else if (templateCompany === companyKey) {
                matching.push(template);
            }
        });

        return matching.concat(global);
    }

    
    // Load scenarios data
    async function loadScenariosData() {
        const uploaded = await loadUploadedScenarios();
        // Immediate fallback when running from file:// to avoid CORS/network errors
        if (window.location.protocol === 'file:') {
            const fallback = {
                '1': {
                    companyName: 'Demo Company',
                    agentName: localStorage.getItem('agentName') || 'Agent',
                    customerPhone: '(000) 000-0000',
                    customerMessage: 'Welcome! Start the conversation here.',
                    agentInitial: 'A',
                    notes: {
                        important: ['Run with a local server to load full scenarios.json']
                    },
                    rightPanel: { source: { label: 'Source', value: 'Local Demo', date: '' } }
                }
            };
            return appendUploadedScenarios(fallback, uploaded);
        }
        try {
            const response = await fetch('scenarios.json');
            const data = await response.json();
            
            // Merge defaults with each scenario
            const scenarios = {};
            const defaults = data.defaults || {};
            
            Object.keys(data.scenarios).forEach(scenarioKey => {
                const scenarioNotes = (data.scenarios[scenarioKey].notes || data.scenarios[scenarioKey].guidelines) || {};
                const defaultNotes = (defaults.notes || defaults.guidelines) || {};
                const mergedScenario = {
                    ...defaults,
                    ...data.scenarios[scenarioKey],
                    // Merge guidelines specifically
                    guidelines: {
                        ...defaults.guidelines,
                        ...data.scenarios[scenarioKey].guidelines
                    },
                    notes: {
                        ...defaultNotes,
                        ...scenarioNotes
                    },
                    // Merge rightPanel specifically  
                    rightPanel: {
                        ...defaults.rightPanel,
                        ...data.scenarios[scenarioKey].rightPanel
                    }
                };
                if (!mergedScenario.agentName) {
                    mergedScenario.agentName = '';
                }
                mergedScenario.agentInitial = getCompanyInitial(mergedScenario.companyName);
                scenarios[scenarioKey] = mergedScenario;
            });
            
            return appendUploadedScenarios(scenarios, uploaded);
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
        const scenarioNumbers = Object.keys(scenarios)
            .map(k => parseInt(k, 10))
            .filter(n => !isNaN(n))
            .sort((a, b) => a - b)
            .map(n => String(n));
        
        // Add scenario options
        scenarioNumbers.forEach(scenarioNumber => {
            const option = document.createElement('option');
            option.value = scenarioNumber;
            
            const scenarioNum = parseInt(scenarioNumber);
            
            if (isCsvScenarioMode()) {
                option.textContent = `Scenario ${scenarioNumber}`;
            } else if (scenarioNum === currentAllowed) {
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

    function renderConversationMessages(conversation, scenario) {
        if (!chatMessages) return;
        chatMessages.innerHTML = '';

        if (!Array.isArray(conversation) || conversation.length === 0) {
            const fallbackMessage = document.createElement('div');
            fallbackMessage.className = 'message received';
            fallbackMessage.innerHTML = `
                <div class="message-content">
                    <p>${scenario.customerMessage || ''}</p>
                </div>
            `;
            chatMessages.appendChild(fallbackMessage);
            return;
        }

        conversation.forEach(message => {
            if (!message || !message.content) return;
            if (message.role === 'system') {
                const systemMessage = document.createElement('div');
                systemMessage.className = 'message sent system-message';
                systemMessage.innerHTML = `
                    <div class="message-content">
                        <p>${message.content}</p>
                    </div>
                `;
                chatMessages.appendChild(systemMessage);
                return;
            }

            const isAgent = message.role === 'agent';
            const wrapper = document.createElement('div');
            wrapper.className = `message ${isAgent ? 'sent' : 'received'}`;

            const content = document.createElement('div');
            content.className = 'message-content';
            const p = document.createElement('p');
            p.textContent = message.content;
            content.appendChild(p);
            wrapper.appendChild(content);
            chatMessages.appendChild(wrapper);
        });
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
        
        // Build conversation from scenario mapping or preloaded array
        let conversation = buildConversationFromScenario(scenario);
        scenario.conversation = conversation;

        // Update company info with error checking
        const companyLink = document.getElementById('companyNameLink');
        const agentElement = document.getElementById('agentName');
        const messageToneElement = document.getElementById('messageTone');
        const phoneElement = document.getElementById('customerPhone');
        const messageElement = document.getElementById('customerMessage');
        
        if (companyLink) {
            companyLink.textContent = scenario.companyName;
            const websiteRaw = (scenario.companyWebsite || (scenario.rightPanel && scenario.rightPanel.source && scenario.rightPanel.source.value) || '').trim();
            const hasWebsite = websiteRaw && websiteRaw.toLowerCase() !== 'n/a';
            if (hasWebsite) {
                const url = /^https?:\/\//i.test(websiteRaw) ? websiteRaw : `https://${websiteRaw}`;
                companyLink.href = url;
                companyLink.target = '_blank';
                companyLink.rel = 'noopener';
                companyLink.classList.remove('is-disabled');
            } else {
                companyLink.removeAttribute('href');
                companyLink.removeAttribute('target');
                companyLink.removeAttribute('rel');
                companyLink.classList.add('is-disabled');
            }
        } else {
            console.error('companyNameLink element not found');
        }
        
        if (agentElement) {
            agentElement.textContent = scenario.agentName || '';
        }
        else console.error('agentName element not found');

        if (messageToneElement) {
            const tone = String(scenario.messageTone || '').trim();
            messageToneElement.textContent = tone;
            messageToneElement.style.display = tone ? 'inline-block' : 'none';
        } else {
            console.error('messageTone element not found');
        }
        
        if (phoneElement) phoneElement.textContent = scenario.customerPhone || '';
        else console.error('customerPhone element not found');
        
        if (messageElement) {
            messageElement.textContent = getFirstCustomerMessageFromScenario(scenario, conversation);
        }
        else console.error('customerMessage element not found');

        // Render preloaded conversation if provided
        if (conversation && Array.isArray(conversation) && conversation.length > 0) {
            renderConversationMessages(conversation, scenario);
        }
        
        // Update guidelines dynamically
        const guidelinesContainer = document.getElementById('dynamic-guidelines-container');
        const notesData = scenario.notes || scenario.guidelines;
        if (guidelinesContainer && notesData) {
            guidelinesContainer.innerHTML = '';
            
            // Create categories dynamically based on scenario data
            Object.keys(notesData).forEach(categoryKey => {
                const categoryData = notesData[categoryKey];
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
        
        // Store current scenario data
        currentScenario = scenarioNumber;
        scenarioData = scenario;
        
        // Re-initialize Feather icons after DOM changes
        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Load internal notes for this scenario
        if (internalNotesEl) {
            const assignmentKey = assignmentNotesStorageKey();
            const scenarioKey = `internalNotes_scenario_${scenarioNumber}`;
            const fallback = localStorage.getItem(scenarioKey) || '';
            const saved = assignmentKey ? (localStorage.getItem(assignmentKey) || fallback) : fallback;
            internalNotesEl.value = saved;
        }
    }
    
    // Render dynamic Promotions/Gifts from scenarios.json if provided
    function renderPromotions(promotions) {
        const container = document.getElementById('promotionsContainer');
        if (!container) return 0;

        // Allow single object or array
        const items = Array.isArray(promotions) ? promotions : [promotions];
        let rendered = 0;

        items.forEach(promo => {
            if (!promo) return;
            const contentLines = (() => {
                if (Array.isArray(promo.content)) {
                    return promo.content.map(line => String(line || '').trim()).filter(Boolean);
                }
                if (typeof promo.content === 'string') {
                    return promo.content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
                }
                return [];
            })();
            if (!contentLines.length) return;

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

            contentLines.forEach(line => {
                const p = document.createElement('p');
                p.textContent = `• ${line}`;
                desc.appendChild(p);
            });

            info.appendChild(titleRow);
            info.appendChild(desc);
            header.appendChild(icon);
            header.appendChild(info);
            section.appendChild(header);
            container.appendChild(section);
            rendered += 1;
        });

        if (rendered > 0 && typeof feather !== 'undefined') {
            feather.replace();
        }
        return rendered;
    }

    // Function to load right panel dynamic content
    function loadRightPanelContent(scenario) {
        const promosContainer = document.getElementById('promotionsContainer');
        if (promosContainer) {
            promosContainer.innerHTML = '';
            promosContainer.style.display = 'none';
        }
        if (!scenario.rightPanel) return;

        // Render promotions dynamically, supporting multiple keys: promotions, promotions_2, promotions_3, ...
        const rightPanel = scenario.rightPanel || {};
        const promoKeys = Object.keys(rightPanel)
            .filter(k => /^promotions(_\d+)?$/.test(k))
            .sort((a, b) => {
                const na = a === 'promotions' ? 1 : parseInt(a.split('_')[1] || '0', 10);
                const nb = b === 'promotions' ? 1 : parseInt(b.split('_')[1] || '0', 10);
                return na - nb;
            });
        let renderedPromotions = 0;
        if (promoKeys.length > 0) {
            promoKeys.forEach(key => {
                const block = rightPanel[key];
                if (block) {
                    renderedPromotions += renderPromotions(block);
                }
            });
        }
        if (promosContainer) {
            promosContainer.style.display = renderedPromotions > 0 ? '' : 'none';
        }
        
        // Update source information
        if (scenario.rightPanel.source) {
            const sourceLabel = document.getElementById('sourceLabel');
            const sourceValue = document.getElementById('sourceValue');
            const sourceDate = document.getElementById('sourceDate');
            const sourceBlock = document.getElementById('sourceBlock');
            const sourceValueText = String(scenario.rightPanel.source.value || '').trim();
            const hideWebsiteSource = scenario.rightPanel.source.label === 'Website' && sourceValueText;
            
            if (sourceLabel) sourceLabel.textContent = scenario.rightPanel.source.label;
            if (sourceValue) sourceValue.textContent = scenario.rightPanel.source.value;
            if (sourceDate) sourceDate.textContent = scenario.rightPanel.source.date;
            if (sourceBlock) {
                sourceBlock.style.display = hideWebsiteSource ? 'none' : '';
            }
        }
        
        // Update browsing history
        if (scenario.rightPanel.browsingHistory) {
            const historyContainer = document.getElementById('browsingHistory');
            if (historyContainer) {
                historyContainer.innerHTML = '';
                scenario.rightPanel.browsingHistory.forEach(historyItem => {
                    const li = document.createElement('li');
                    const itemText = historyItem && historyItem.item ? String(historyItem.item) : '';
                    const itemLink = historyItem && historyItem.link ? String(historyItem.link) : '';
                    const itemEl = itemLink ? document.createElement('a') : document.createElement('span');
                    itemEl.textContent = itemText;
                    if (itemLink && itemEl.tagName.toLowerCase() === 'a') {
                        itemEl.href = itemLink;
                        itemEl.target = '_blank';
                        itemEl.rel = 'noopener';
                    }
                    li.appendChild(itemEl);

                    if (historyItem && historyItem.timeAgo) {
                        const time = document.createElement('span');
                        time.className = 'time-ago';
                        time.textContent = historyItem.timeAgo;
                        li.appendChild(time);
                    }

                    const icon = document.createElement('i');
                    icon.setAttribute('data-feather', 'eye');
                    icon.className = 'icon-small';
                    li.appendChild(icon);

                    historyContainer.appendChild(li);
                });
            }
        }

        // Orders (expandable). Hide section when not present or empty.
        const ordersSection = document.getElementById('ordersSection');
        const ordersList = document.getElementById('ordersList');
        if (ordersSection && ordersList) {
            ordersList.innerHTML = '';
            const orders = Array.isArray(scenario.rightPanel.orders) ? scenario.rightPanel.orders : [];
            if (orders.length > 0) {
                orders.forEach(order => {
                    const li = document.createElement('li');

                    const details = document.createElement('details');
                    details.className = 'order-details';

                    const summary = document.createElement('summary');
                    summary.className = 'order-summary';

                    const summaryLeft = document.createElement('span');
                    summaryLeft.className = 'order-summary-left';

                    const orderLabel = document.createElement(order && order.link ? 'a' : 'span');
                    orderLabel.textContent = (order && order.orderNumber) ? `#${order.orderNumber}` : 'Order';
                    if (order && order.link && orderLabel.tagName.toLowerCase() === 'a') {
                        orderLabel.href = order.link;
                        orderLabel.target = '_blank';
                        orderLabel.rel = 'noopener';
                    }

                    const orderDate = document.createElement('span');
                    orderDate.className = 'time-ago';
                    orderDate.textContent = (order && order.orderDate) ? order.orderDate : '';

                    summaryLeft.appendChild(orderLabel);
                    summaryLeft.appendChild(orderDate);

                    const arrow = document.createElement('span');
                    arrow.className = 'order-chevron-text';
                    arrow.setAttribute('aria-hidden', 'true');

                    summary.appendChild(summaryLeft);
                    summary.appendChild(arrow);
                    details.appendChild(summary);

                    const body = document.createElement('div');
                    body.className = 'order-body';

                    const products = Array.isArray(order && order.items) ? order.items : [];
                    products.forEach(product => {
                        const row = document.createElement('div');
                        row.className = 'order-product-row';

                        const resolvedProductLink = product && (product.productLink || product.product_link)
                            ? String(product.productLink || product.product_link)
                            : '';
                        const productName = document.createElement(resolvedProductLink ? 'a' : 'span');
                        productName.textContent = product && product.name ? product.name : '';
                        if (resolvedProductLink && productName.tagName.toLowerCase() === 'a') {
                            productName.href = resolvedProductLink;
                            productName.target = '_blank';
                            productName.rel = 'noopener';
                        }

                        const productPrice = document.createElement('span');
                        const productPriceRaw = (product && product.price != null) ? String(product.price).trim() : '';
                        productPrice.textContent = formatDollarAmount(productPriceRaw);

                        row.appendChild(productName);
                        row.appendChild(productPrice);
                        body.appendChild(row);
                    });

                    const totalRow = document.createElement('div');
                    totalRow.className = 'order-total-row';
                    const totalLabel = document.createElement('strong');
                    totalLabel.textContent = 'Total';
                    const totalValue = document.createElement('strong');
                    const orderTotalRaw = (order && order.total != null)
                        ? String(order.total).trim()
                        : (order && order.subtotal != null ? String(order.subtotal).trim() : '');
                    totalValue.textContent = formatDollarAmount(orderTotalRaw);
                    totalRow.appendChild(totalLabel);
                    totalRow.appendChild(totalValue);
                    body.appendChild(totalRow);

                    details.appendChild(body);
                    li.appendChild(details);
                    ordersList.appendChild(li);
                });
                ordersSection.style.display = '';
            } else {
                ordersSection.style.display = 'none';
            }
        }
        
        // Update template items
        const templatesForScenario = getTemplatesForScenario(scenario);
        if (templatesForScenario && templatesForScenario.length) {
            const templatesContainer = document.getElementById('templateItems');
            if (templatesContainer) {
                templatesContainer.innerHTML = '';
                templatesForScenario.forEach(template => {
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
                initializeTemplateSearch(templatesForScenario);
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

    // Helper: EST datetime format like "1/30/2025 13:24:49" (no comma, month/day numeric)
    function toESTDateTimeNoComma() {
        const now = new Date();
        const str = now.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: 'numeric', // no leading zero
            day: 'numeric',   // no leading zero
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        // Many browsers include a comma between date and time; remove it
        return str.replace(", ", " ");
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
    
    // Check if user is logged in (redirect to login if not). Only enforce on http/https to avoid file:// loops
    const isHttpProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    if (isHttpProtocol && !localStorage.getItem('agentName') && !window.location.href.includes('login.html') && 
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
        messageDiv.appendChild(messageContentDiv);

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
        if (isCsvScenarioMode()) return;
        if (messageCount >= 2) {
            const nextScenario = unlockNextScenario();
            
            // Show notification about unlocked scenario
            if (totalScenarioCount === 0 || nextScenario <= totalScenarioCount) {
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
    if (nextConversationBtn) {
        nextConversationBtn.addEventListener('click', async () => {
            const data = await loadScenariosData();
            if (!data) return;
            const keys = Object.keys(data)
                .map(k => parseInt(k, 10))
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b)
                .map(n => String(n));
            if (!keys.length) return;
            const current = String(getCurrentScenarioNumber());
            const currentIndex = keys.indexOf(current);
            const nextIndex = currentIndex >= 0 && currentIndex + 1 < keys.length ? currentIndex + 1 : 0;
            const nextScenario = keys[nextIndex];
            if (!isCsvScenarioMode() && !canAccessScenario(nextScenario)) return;
            setCurrentScenarioNumber(nextScenario);
            window.location.href = `app.html?scenario=${nextScenario}`;
        });
    }

    if (sendButton) {
        sendButton.addEventListener('click', handleSendMessage);
    }
    if (chatInput) {
        chatInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                handleSendMessage();
            }
        });
    }

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

    async function initializeCsvUpload() {
        if (!csvUploadContainer) return;
        await loadCsvUploadPermissions();

        if (!canUploadCsv()) {
            csvUploadContainer.style.display = 'none';
            return;
        }

        csvUploadContainer.style.display = 'flex';

        const uploaded = getUploadedScenarios();
        if (uploaded.length > 0) {
            setCsvStatus(`Loaded ${uploaded.length} uploaded scenario(s)`);
        }

        if (csvUploadBtn && csvFileInput) {
            csvUploadBtn.addEventListener('click', () => {
                csvFileInput.click();
            });

            csvFileInput.addEventListener('change', async (event) => {
                const file = event.target.files && event.target.files[0];
                if (!file) return;
                setCsvStatus('Reading CSV...');

                const reader = new FileReader();
                reader.onload = async () => {
                    try {
                        const text = String(reader.result || '');
                        const rows = parseCsv(text);
                        if (!rows.length) {
                            setCsvStatus('No rows found.');
                            return;
                        }

                        const headers = rows[0].map((h, i) => {
                            const text = String(h || '').trim();
                            return i === 0 ? text.replace(/^\uFEFF/, '') : text;
                        });
                        const requiredHeaders = [
                            'SEND_ID',
                            'COMPANY_NAME',
                            'COMPANY_WEBSITE',
                            'PERSONA',
                            'MESSAGE_TONE',
                            'PARAPHRASED_CONVERSATION',
                            'LAST_5_PRODUCTS',
                            'ORDERS',
                            'COMPANY_NOTES'
                        ];
                        const missing = requiredHeaders.filter(h => !headers.includes(h));
                        if (missing.length) {
                            setCsvStatus(`Missing headers: ${missing.join(', ')}`);
                            return;
                        }

                        const rowData = rows.slice(1)
                            .filter(row => row.some(cell => String(cell || '').trim() !== ''))
                            .map(row => {
                                const obj = {};
                                headers.forEach((header, i) => {
                                    obj[header] = row[i] ?? '';
                                });
                                return obj;
                            });

                        if (!rowData.length) {
                            setCsvStatus('No data rows found.');
                            return;
                        }

                        const scenarios = rowData.map(convertCsvRowToScenario);

                        if (API_BASE_URL) {
                            const response = await fetch(`${API_BASE_URL}/scenarios`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ scenarios })
                            });
                            if (!response.ok) {
                                throw new Error('API update failed');
                            }
                            const data = await response.json();
                            setCsvStatus(`Saved ${scenarios.length} scenario(s) via API`);
                            setUploadedScenarios(data.scenarios || []);
                        } else {
                            setUploadedScenarios(scenarios);
                        }

                        const merged = await loadScenariosData();
                        const keys = Object.keys(merged)
                            .map(k => parseInt(k, 10))
                            .filter(n => !isNaN(n))
                            .sort((a, b) => a - b)
                            .map(n => String(n));
                        const uploadedCount = scenarios.length;
                        const firstUploadedKey = keys.length - uploadedCount >= 0 ? keys[keys.length - uploadedCount] : keys[0];

                        localStorage.setItem('unlockedScenario', String(keys.length));
                        setCurrentScenarioNumber(firstUploadedKey);
                        setCsvStatus(`Loaded ${scenarios.length} scenario(s) from ${file.name}`);
                        window.location.href = `app.html?scenario=${firstUploadedKey}`;
                    } catch (error) {
                        console.error('CSV parsing failed:', error);
                        setCsvStatus('CSV parsing failed. Check the file format.');
                    } finally {
                        csvFileInput.value = '';
                    }
                };

                reader.onerror = () => {
                    setCsvStatus('Failed to read CSV file.');
                };

                reader.readAsText(file);
            });
        }

        if (csvClearBtn) {
            csvClearBtn.addEventListener('click', async () => {
                if (API_BASE_URL) {
                    try {
                        const response = await fetch(`${API_BASE_URL}/scenarios`, { method: 'DELETE' });
                        if (!response.ok) throw new Error('API delete failed');
                        setCsvStatus('Cleared uploaded scenarios via API.');
                        localStorage.removeItem('uploadedScenarios');
                        localStorage.removeItem('uploadedScenariosAt');
                    } catch (error) {
                        setCsvStatus('Failed to clear scenarios via API.');
                        return;
                    }
                } else {
                    localStorage.removeItem('uploadedScenarios');
                    localStorage.removeItem('uploadedScenariosAt');
                    setCsvStatus('Cleared uploaded scenarios.');
                }
                window.location.href = 'app.html?scenario=1';
            });
        }
    }

    async function initializeTemplatesUpload() {
        if (!templatesUploadContainer) return;
        await loadCsvUploadPermissions();

        if (!canUploadTemplates()) {
            templatesUploadContainer.style.display = 'none';
            return;
        }

        templatesUploadContainer.style.display = 'flex';

        if (templatesUploadBtn && templatesFileInput) {
            templatesUploadBtn.addEventListener('click', () => {
                templatesFileInput.click();
            });

            templatesFileInput.addEventListener('change', async (event) => {
                const file = event.target.files && event.target.files[0];
                if (!file) return;
                setTemplatesStatus('Reading CSV...');

                const reader = new FileReader();
                reader.onload = async () => {
                    try {
                        const text = String(reader.result || '');
                        const rows = parseCsv(text);
                        if (!rows.length) {
                            setTemplatesStatus('No rows found.');
                            return;
                        }

                        const headers = rows[0].map((h, i) => {
                            const text = String(h || '').trim();
                            return i === 0 ? text.replace(/^\uFEFF/, '') : text;
                        });
                        const requiredHeaders = [
                            'TEMPLATE_ID',
                            'COMPANY_NAME',
                            'TEMPLATE_TITLE',
                            'TEMPLATE_TEXT',
                            'SHORTCUT'
                        ];
                        const missing = requiredHeaders.filter(h => !headers.includes(h));
                        if (missing.length) {
                            setTemplatesStatus(`Missing headers: ${missing.join(', ')}`);
                            return;
                        }

                        const rowData = rows.slice(1)
                            .filter(row => row.some(cell => String(cell || '').trim() !== ''))
                            .map(row => {
                                const obj = {};
                                headers.forEach((header, i) => {
                                    obj[header] = row[i] ?? '';
                                });
                                return obj;
                            });

                        if (!rowData.length) {
                            setTemplatesStatus('No data rows found.');
                            return;
                        }

                        const templates = rowData
                            .map(convertCsvRowToTemplate)
                            .filter(Boolean);

                        if (!templates.length) {
                            setTemplatesStatus('No valid templates found.');
                            return;
                        }

                        if (API_BASE_URL) {
                            setTemplatesStatus('Uploading templates...');
                            const response = await fetch(`${API_BASE_URL}/templates`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ templates })
                            });

                            if (!response.ok) {
                                const errorBody = await response.text().catch(() => '');
                                const trimmed = errorBody ? `: ${errorBody.slice(0, 240)}` : '';
                                throw new Error(`API update failed (${response.status})${trimmed}`);
                            }

                            const data = await response.json();
                            templatesData = Array.isArray(data.templates) ? data.templates : [];
                            setTemplatesStatus(`Saved ${templates.length} template(s) via API`);
                        } else {
                            setTemplatesStatus('Templates API is not configured.');
                            return;
                        }
                        if (scenarioData) {
                            loadRightPanelContent(scenarioData);
                        }
                    } catch (error) {
                        console.error('Templates CSV parsing failed:', error);
                        setTemplatesStatus(`Template upload failed. ${error && error.message ? error.message : 'Check the CSV/API.'}`);
                    } finally {
                        templatesFileInput.value = '';
                    }
                };

                reader.onerror = () => {
                    setTemplatesStatus('Failed to read CSV file.');
                };

                reader.readAsText(file);
            });
        }

        if (templatesClearBtn) {
            templatesClearBtn.addEventListener('click', async () => {
                if (API_BASE_URL) {
                    try {
                        const response = await fetch(`${API_BASE_URL}/templates`, { method: 'DELETE' });
                        if (!response.ok) {
                            const errorBody = await response.text().catch(() => '');
                            const trimmed = errorBody ? `: ${errorBody.slice(0, 180)}` : '';
                            throw new Error(`API delete failed (${response.status})${trimmed}`);
                        }
                        templatesData = [];
                        setTemplatesStatus('Cleared templates via API.');
                    } catch (error) {
                        setTemplatesStatus(`Failed to clear templates via API. ${error.message || ''}`.trim());
                    }
                } else {
                    setTemplatesStatus('Templates API is not configured.');
                    return;
                }
                if (scenarioData) {
                    loadRightPanelContent(scenarioData);
                }
            });
        }
    }

    // Initialize everything
    const scenarios = await loadScenariosData();
    if (!scenarios) {
        console.error('Could not load scenarios data');
    } else {
        const assignmentParams = getAssignmentParamsFromUrl();
        const hasAid = !!assignmentParams.aid;

        try {
            if (hasAid) {
                await refreshAssignmentQueue().catch(() => []);
                await loadAssignmentContextFromUrl(scenarios);
                loadScenarioContent(assignmentContext.scenarioKey, scenarios);
                const serverFormState = parseStoredFormState(assignmentContext.form_state_json);
                const localFormStateKey = assignmentFormStateStorageKey();
                const localFormState = localFormStateKey ? parseStoredFormState(localStorage.getItem(localFormStateKey)) : null;
                const customForm = document.getElementById('customForm');
                applyCustomFormState(customForm, serverFormState || localFormState);

                if (internalNotesEl) {
                    const notesKey = assignmentNotesStorageKey();
                    const localNote = notesKey ? (localStorage.getItem(notesKey) || '') : '';
                    internalNotesEl.value = assignmentContext.internal_note || localNote || '';
                }

                const forceView = assignmentContext.role === 'viewer' || assignmentContext.mode === 'view';
                setAssignmentReadOnlyState(forceView);
                setAssignmentsStatus(
                    forceView
                        ? `Opened ${assignmentContext.send_id} in view-only mode.`
                        : `Opened ${assignmentContext.send_id} in editor mode.`,
                    false
                );
                selectCurrentAssignmentInQueue();
            } else {
                const queue = await refreshAssignmentQueue();
                if (queue.length) {
                    setAssignmentsStatus('Queue loaded. Opening first assignment...', false);
                    const firstEditUrl = queue[0].edit_url || '';
                    if (firstEditUrl) {
                        window.location.href = firstEditUrl;
                        return;
                    }
                } else {
                    setAssignmentsStatus('No assignments available.', false);
                }

                const scenarioKeys = Object.keys(scenarios)
                    .map(k => parseInt(k, 10))
                    .filter(n => !isNaN(n))
                    .sort((a, b) => a - b)
                    .map(n => String(n));
                totalScenarioCount = scenarioKeys.length;
                const requestedScenario = getCurrentScenarioNumber();
                const activeScenario = scenarios[requestedScenario] ? requestedScenario : (scenarioKeys[0] || '1');
                setCurrentScenarioNumber(activeScenario);
                loadScenarioContent(activeScenario, scenarios);
            }
        } catch (assignmentError) {
            console.error('Assignment flow error:', assignmentError);
            setAssignmentsStatus(`Assignment error: ${assignmentError.message || assignmentError}`, true);

            const scenarioKeys = Object.keys(scenarios)
                .map(k => parseInt(k, 10))
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b)
                .map(n => String(n));
            totalScenarioCount = scenarioKeys.length;
            const requestedScenario = getCurrentScenarioNumber();
            const activeScenario = scenarios[requestedScenario] ? requestedScenario : (scenarioKeys[0] || '1');
            setCurrentScenarioNumber(activeScenario);
            loadScenarioContent(activeScenario, scenarios);
        }
    }

    templatesData = await loadTemplatesData();
    await initializeCsvUpload();
    await initializeTemplatesUpload();

    // If this scenario was previously ended (via action buttons), keep input disabled IF it's NOT the current unlocked scenario.
    // This prevents stale ended flags from blocking a fresh session when logging back in or starting a new unlocked scenario.
    // Conversation end state and timer removed
    
    // Initialize new features
    initTemplateSearchKeyboardShortcut();

    if (assignmentRefreshBtn) {
        assignmentRefreshBtn.addEventListener('click', async () => {
            try {
                setAssignmentsStatus('Refreshing assignments...', false);
                const queue = await refreshAssignmentQueue();
                if (!queue.length) {
                    setAssignmentsStatus('No assignments available.', false);
                } else {
                    setAssignmentsStatus('Assignments refreshed.', false);
                    selectCurrentAssignmentInQueue();
                }
            } catch (error) {
                setAssignmentsStatus(`Refresh failed: ${error.message || error}`, true);
            }
        });
    }

    if (assignmentOpenBtn) {
        assignmentOpenBtn.addEventListener('click', () => {
            openSelectedAssignmentFromList();
        });
    }

    if (assignmentSelect) {
        assignmentSelect.addEventListener('dblclick', () => {
            openSelectedAssignmentFromList();
        });
    }
    
    // Persist internal notes and assignment drafts
    if (internalNotesEl) {
        internalNotesEl.addEventListener('input', () => {
            if (assignmentContext && assignmentContext.assignment_id) {
                const key = assignmentNotesStorageKey();
                if (key) localStorage.setItem(key, internalNotesEl.value);
                const customForm = document.getElementById('customForm');
                scheduleAssignmentDraftSave(customForm);
            } else {
                const scenarioNumForNotes = getCurrentScenarioNumber();
                localStorage.setItem(`internalNotes_scenario_${scenarioNumForNotes}`, internalNotesEl.value);
            }
        });
        // Add drag-to-resize behavior via handle below the textarea
        const notesContainer = document.getElementById('internalNotesContainer');
        const resizeHandle = document.querySelector('.resize-handle-horizontal[data-resize="internal-notes"]');
        if (notesContainer && resizeHandle && internalNotesEl) {
            let isResizingNotes = false;
            let startY = 0;
            let startHeight = 0;
            resizeHandle.addEventListener('mousedown', (e) => {
                isResizingNotes = true;
                startY = e.clientY;
                startHeight = internalNotesEl.offsetHeight;
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!isResizingNotes) return;
                const delta = e.clientY - startY;
                // Handle is on top: moving up (smaller clientY) should increase height
                const newHeight = Math.max(60, Math.min(300, startHeight - delta));
                internalNotesEl.style.height = newHeight + 'px';
                // Persist height
                try { localStorage.setItem('internalNotesHeight', String(newHeight)); } catch (_) {}
            });
            document.addEventListener('mouseup', () => {
                if (!isResizingNotes) return;
                isResizingNotes = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            });
        }
        // Restore saved height
        const savedHeight = parseInt(localStorage.getItem('internalNotesHeight') || '0', 10);
        if (!isNaN(savedHeight) && savedHeight > 0) {
            internalNotesEl.style.height = savedHeight + 'px';
        }
    }

    // Start the session timer after content is loaded
    initSessionTimer();

    // Custom form submission -> Google Sheets (Data tab)
    const customForm = document.getElementById('customForm');
    if (customForm) {
        const formStatus = document.getElementById('formStatus');
        const formSubmitBtn = document.getElementById('formSubmitBtn');
        const clearFormBtn = document.getElementById('clearFormBtn');
        
        // Ensure all checkboxes are checked by default (and on reset)
        const checkboxInputs = customForm.querySelectorAll('input[type="checkbox"]');
        checkboxInputs.forEach(cb => {
            cb.checked = true;
            cb.defaultChecked = true;
        });
        
        // ---- Form autosave/restore ----
        function saveCustomFormState() {
            const state = collectCustomFormState(customForm);
            const key = assignmentContext && assignmentContext.assignment_id
                ? assignmentFormStateStorageKey()
                : 'customFormState';
            try { localStorage.setItem(key, JSON.stringify(state)); } catch (_) {}
            scheduleAssignmentDraftSave(customForm);
        }
        function restoreCustomFormState() {
            let parsed = null;
            const key = assignmentContext && assignmentContext.assignment_id
                ? assignmentFormStateStorageKey()
                : 'customFormState';
            try { parsed = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { parsed = null; }
            if (!parsed) return;
            applyCustomFormState(customForm, parsed);
        }
        customForm.addEventListener('input', saveCustomFormState);
        customForm.addEventListener('change', saveCustomFormState);
        restoreCustomFormState();

        // Clear form functionality
        if (clearFormBtn) {
            clearFormBtn.addEventListener('click', () => {
                customForm.reset();
                // Re-apply default checked state
                checkboxInputs.forEach(cb => {
                    cb.checked = true;
                });
                try {
                    const key = assignmentContext && assignmentContext.assignment_id
                        ? assignmentFormStateStorageKey()
                        : 'customFormState';
                    localStorage.removeItem(key);
                } catch (_) {}
                scheduleAssignmentDraftSave(customForm);
                if (formStatus) {
                    formStatus.textContent = '';
                }
            });
        }
        
        customForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (assignmentContext && (assignmentContext.role !== 'editor' || assignmentContext.mode === 'view')) {
                if (formStatus) {
                    formStatus.textContent = 'View-only link cannot submit.';
                    formStatus.style.color = '#e74c3c';
                }
                return;
            }
            
            // Collect all form data
            const formData = new FormData(customForm);

            // Full ordered labels and slug->label maps for each category
            const CATEGORY_LABELS = {
                issue_identification: ['Intent Identified', 'Necessary Reply'],
                proper_resolution: ['Efficient Troubleshooting', 'Correct Escalation', 'Double Text', 'Partial Reply'],
                product_sales: ['General Recommendation', 'Discount Upsell', 'Restock Question', 'Upsell'],
                accuracy: [
                    'Credible Source', 'Promo - Active', 'Promo - Correct', 'Promo - Hallucinated',
                    'Link - Broken', 'Link - Correct Page', 'Link - Correct Region', 'Link - Correct Website',
                    'Link - Filtered', 'Link - Relevant Item'
                ],
                workflow: [
                    'Checkout Page', 'Company Profile', 'Conversation', 'Customer Profile', 'Notes',
                    'Product Information', 'Promo Notes', 'Templates', 'Website'
                ],
                clarity: ['Correct Grammar', 'No Typos', 'No Repetition', 'Understandable Message'],
                tone: ['Preferred tone followed', 'Personalized', 'Empathetic']
            };
            const VALUE_TO_LABEL = {
                issue_identification: { intent_identified: 'Intent Identified', necessary_reply: 'Necessary Reply' },
                proper_resolution: { efficient_troubleshooting: 'Efficient Troubleshooting', correct_escalation: 'Correct Escalation', double_text: 'Double Text', partial_reply: 'Partial Reply' },
                product_sales: { general_recommendation: 'General Recommendation', discount_upsell: 'Discount Upsell', restock_question: 'Restock Question', upsell: 'Upsell' },
                accuracy: {
                    credible_source: 'Credible Source', promo_active: 'Promo - Active', promo_correct: 'Promo - Correct', promo_hallucinated: 'Promo - Hallucinated',
                    link_broken: 'Link - Broken', link_correct_page: 'Link - Correct Page', link_correct_region: 'Link - Correct Region', link_correct_website: 'Link - Correct Website',
                    link_filtered: 'Link - Filtered', link_relevant_item: 'Link - Relevant Item'
                },
                workflow: {
                    checkout_page: 'Checkout Page', company_profile: 'Company Profile', conversation: 'Conversation', customer_profile: 'Customer Profile',
                    notes: 'Notes', product_information: 'Product Information', promo_notes: 'Promo Notes', templates: 'Templates', website: 'Website'
                },
                clarity: { correct_grammar: 'Correct Grammar', no_typos: 'No Typos', no_repetition: 'No Repetition', understandable_message: 'Understandable Message' },
                tone: { preferred_tone_followed: 'Preferred tone followed', personalized: 'Personalized', empathetic: 'Empathetic' }
            };

            // Process checkboxes (multiple values per category)
            const checkboxCategories = ['issue_identification', 'proper_resolution', 'product_sales', 'accuracy', 'workflow', 'clarity', 'tone'];
            const selectedByCategory = {};
            checkboxCategories.forEach(category => {
                selectedByCategory[category] = formData.getAll(category); // array of slugs
            });

            function buildCategoryCell(categoryKey) {
                const full = CATEGORY_LABELS[categoryKey] || [];
                const valueMap = VALUE_TO_LABEL[categoryKey] || {};
                const selected = new Set((selectedByCategory[categoryKey] || []).map(v => valueMap[v]).filter(Boolean));
                // Include all items unless selected; keep original order
                const included = full.filter(label => !selected.has(label));
                return included.join(', ');
            }

            // Process dropdowns: capture human-readable labels
            const troubleshootSel = document.getElementById('troubleshootingMiss');
            const zeroTolSel = document.getElementById('zeroTolerance');
            const troubleshootingMissLabel = (troubleshootSel && troubleshootSel.value) ? troubleshootSel.options[troubleshootSel.selectedIndex].text : '';
            const zeroToleranceLabel = (zeroTolSel && zeroTolSel.value) ? zeroTolSel.options[zeroTolSel.selectedIndex].text : '';
            const notesVal = formData.get('notes') || '';
            
            // Validate required fields
            if (!notesVal.trim()) {
                if (formStatus) { 
                    formStatus.textContent = 'Notes field is required.'; 
                    formStatus.style.color = '#e74c3c'; 
                }
                return;
            }
            
            const agentUsername = localStorage.getItem('agentName') || 'Unknown Agent';
            const agentEmail = localStorage.getItem('agentEmail') || '';
            const emailAddress = agentEmail || agentUsername;
            const auditTime = getCurrentTimerTime();
            // Reset timer after capturing audit time
            resetTimer();
            
            try {
                if (formSubmitBtn) formSubmitBtn.disabled = true;
                if (formStatus) { 
                    formStatus.textContent = 'Submitting...'; 
                    formStatus.style.color = '#555'; 
                }
                
                // Build Data tab payload
                const payload = {
                    eventType: 'evaluationFormSubmission',
                    timestamp: toESTDateTimeNoComma(), // e.g., 1/30/2025 13:24:49
                    emailAddress,
                    messageId: assignmentContext ? (assignmentContext.send_id || '') : '',
                    auditTime,
                    issueIdentification: buildCategoryCell('issue_identification'),
                    properResolution: buildCategoryCell('proper_resolution'),
                    productSales: buildCategoryCell('product_sales'),
                    accuracy: buildCategoryCell('accuracy'),
                    workflow: buildCategoryCell('workflow'),
                    clarity: buildCategoryCell('clarity'),
                    tone: buildCategoryCell('tone'),
                    efficientTroubleshootingMiss: troubleshootingMissLabel || '',
                    zeroTolerance: zeroToleranceLabel || '',
                    notes: notesVal
                };

                const res = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(payload)
                });
                let success = false;
                let serverMsg = '';
                try {
                    const json = await res.json();
                    success = res.ok && json && json.status === 'success';
                    serverMsg = (json && json.message) ? json.message : '';
                } catch (parseErr) {
                    // Fall back to text for debugging
                    try {
                        const txt = await res.text();
                        serverMsg = txt || '';
                    } catch (_) {}
                    success = res.ok; // if 2xx, treat as success even if body not JSON
                }

                if (success) {
                    if (assignmentContext && assignmentContext.role === 'editor') {
                        await saveAssignmentDraft(customForm).catch(() => {});
                        const doneRes = await fetchAssignmentPost('done', {
                            assignment_id: assignmentContext.assignment_id,
                            token: assignmentContext.token,
                            app_base: getCurrentAppBaseUrl()
                        });
                        const nextQueue = Array.isArray(doneRes.assignments) ? doneRes.assignments : [];
                        renderAssignmentQueue(nextQueue);
                        if (nextQueue.length && nextQueue[0].edit_url) {
                            window.location.href = nextQueue[0].edit_url;
                            return;
                        }
                    }
                    if (formStatus) { 
                        formStatus.textContent = 'Submitted successfully.'; 
                        formStatus.style.color = '#28a745'; 
                    }
                    customForm.reset();
                    checkboxInputs.forEach(cb => { cb.checked = true; });
                    try {
                        const key = assignmentContext && assignmentContext.assignment_id
                            ? assignmentFormStateStorageKey()
                            : 'customFormState';
                        localStorage.removeItem(key);
                    } catch (_) {}
                } else {
                    if (formStatus) {
                        formStatus.textContent = 'Submission failed. ' + (serverMsg ? `Details: ${serverMsg}` : 'Please try again.');
                        formStatus.style.color = '#e74c3c';
                    }
                }
            } catch (err) {
                console.error('Form submission error:', err);
                if (formStatus) { 
                    formStatus.textContent = 'Submission failed. Please try again.'; 
                    formStatus.style.color = '#e74c3c'; 
                }
            } finally {
                if (formSubmitBtn) formSubmitBtn.disabled = false;
            }
        });
    }

    // Panel resizing functionality
    initPanelResizing();

    // Attempt to record logout on tab close/navigation
    window.addEventListener('beforeunload', () => {
        sendSessionLogout();
    });
});

// Panel resizing functionality
function initPanelResizing() {
    const resizeHandles = document.querySelectorAll('.resize-handle');
    let isResizing = false;
    let currentHandle = null;
    let startX = 0;
    let startWidths = {};

    resizeHandles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            currentHandle = handle;
            startX = e.clientX;
            
            // Get current panel widths
            const panels = getPanelsForHandle(handle);
            startWidths = {
                left: panels.left.offsetWidth,
                right: panels.right.offsetWidth
            };
            
            handle.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing || !currentHandle) return;
        
        const deltaX = e.clientX - startX;
        const panels = getPanelsForHandle(currentHandle);
        const container = document.querySelector('.main-content');
        const containerWidth = container.offsetWidth;
        
        // Calculate new widths
        const newLeftWidth = startWidths.left + deltaX;
        const newRightWidth = startWidths.right - deltaX;
        
        // Set minimum widths
        const minWidth = 200;
        if (newLeftWidth < minWidth || newRightWidth < minWidth) return;
        
        // Calculate percentages
        const leftPercent = (newLeftWidth / containerWidth) * 100;
        const rightPercent = (newRightWidth / containerWidth) * 100;
        
        // Apply new flex-basis values
        panels.left.style.flexBasis = `${leftPercent}%`;
        panels.right.style.flexBasis = `${rightPercent}%`;
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        
        isResizing = false;
        if (currentHandle) {
            currentHandle.classList.remove('resizing');
            currentHandle = null;
        }
        
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });

    function getPanelsForHandle(handle) {
        const resizeType = handle.getAttribute('data-resize');
        
        switch (resizeType) {
            case 'form-left':
                return {
                    left: document.querySelector('.form-panel'),
                    right: document.querySelector('.left-panel')
                };
            case 'left-chat':
                return {
                    left: document.querySelector('.left-panel'),
                    right: document.querySelector('.chat-panel')
                };
            case 'chat-right':
                return {
                    left: document.querySelector('.chat-panel'),
                    right: document.querySelector('.right-panel')
                };
            default:
                return { left: null, right: null };
        }
    }

}

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
