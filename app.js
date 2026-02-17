document.addEventListener('DOMContentLoaded', async () => {
    const chatMessages = document.getElementById('chatMessages');
    const internalNotesEl = document.getElementById('internalNotes');
    const logoutBtn = document.getElementById('logoutBtn');
    const assignmentSelect = document.getElementById('assignmentSelect');
    const assignmentRefreshBtn = document.getElementById('assignmentRefreshBtn');
    const snapshotShareBtn = document.getElementById('snapshotShareBtn');
    const assignmentsStatus = document.getElementById('assignmentsStatus');
    const previousConversationBtn = document.getElementById('previousConversationBtn');
    const nextConversationBtn = document.getElementById('nextConversationBtn');
    // Google Sheets integration
    const GOOGLE_SCRIPT_URL = String(
        (window.QA_CONFIG && window.QA_CONFIG.GOOGLE_SCRIPT_URL) ||
        'https://script.google.com/macros/s/AKfycbyGbsJuilfRrAi111vKpEnlXBmhiHU3z1-YsIESqdKO0lTYRkkoV9r-Z9l07a-27ZJBdA/exec'
    ).trim();
    const RUNTIME_SCENARIO_INDEX_PATH = 'data/scenarios/index.json';
    const RUNTIME_TEMPLATE_INDEX_PATH = 'data/templates/index.json';
    const ASSIGNMENT_HEARTBEAT_INTERVAL_MS = 60 * 1000;
    // Current scenario data
    let currentScenario = null;
    let scenarioData = null;
    let allScenariosData = null;
    let templatesData = [];
    let assignmentQueue = [];
    let assignmentContext = null;
    let draftSaveTimer = null;
    let monolithicScenariosLoaded = false;
    let runtimeScenariosIndex = null;
    let runtimeScenariosIndexPromise = null;
    let runtimeScenarioChunkCache = {};
    let runtimeScenarioChunkPromises = {};
    let runtimeScenariosUnavailable = false;
    let runtimeTemplatesIndex = null;
    let runtimeTemplatesIndexPromise = null;
    let runtimeTemplateGlobalTemplates = [];
    let runtimeTemplateGlobalLoaded = false;
    let runtimeTemplateCompanyCache = {};
    let runtimeTemplateFilePromises = {};
    let runtimeTemplatesUnavailable = false;
    let templateSearchSourceTemplates = [];
    let templateSearchBound = false;
    let assignmentSessionState = null;
    let assignmentHeartbeatTimer = null;
    let assignmentHeartbeatWarningShown = false;
    let isExplicitLogoutInProgress = false;
    let pendingLogoutReleasePayload = null;
    let isSnapshotMode = false;
    let snapshotContext = null;

    async function refreshAssignmentQueue() {
        if (isSnapshotMode) {
            throw new Error('Snapshot view is read-only.');
        }
        if (!canUseAssignmentMode()) {
            throw new Error('Assignment mode requires email login.');
        }
        const email = getLoggedInEmail();
        const sessionId = getAssignmentSessionId({ createIfMissing: true });
        if (!sessionId) throw new Error('Missing assignment session id.');
        const response = await fetchAssignmentGet('queue', {
            email,
            app_base: getCurrentAppBaseUrl(),
            session_id: sessionId
        });
        applyAssignmentSessionState(response && response.session, { silent: true });
        const assignments = Array.isArray(response.assignments) ? response.assignments : [];
        renderAssignmentQueue(assignments);
        if (assignmentContext && assignmentContext.assignment_id && assignments.length) {
            prefetchAssignmentWindow(assignmentContext.assignment_id).catch((error) => {
                console.warn('Assignment prefetch after queue refresh failed:', error);
            });
        }
        return assignments;
    }

    async function resolveScenarioKeyForSendId(sendId, scenariosOverride) {
        const target = String(sendId || '').trim();
        if (!target) return '';

        const scenarioIndex = await loadRuntimeScenariosIndex();
        if (scenarioIndex && scenarioIndex.byId && scenarioIndex.byId[target]) {
            return String(scenarioIndex.byId[target]);
        }

        const candidateScenarios = scenariosOverride || allScenariosData || {};
        const directMatch = findScenarioBySendId(candidateScenarios, target);
        if (directMatch && directMatch.scenarioKey) {
            return String(directMatch.scenarioKey);
        }

        const fullScenarios = await loadScenariosDataMonolith();
        const fallbackMatch = findScenarioBySendId(fullScenarios || {}, target);
        return fallbackMatch && fallbackMatch.scenarioKey ? String(fallbackMatch.scenarioKey) : '';
    }

    function isCsvScenarioMode() {
        return false;
    }

    // Scenario progression system
    function getCurrentUnlockedScenario() {
        const unlockedScenario = localStorage.getItem('unlockedScenario');
        return unlockedScenario ? parseInt(unlockedScenario) : 1; // Default to scenario 1
    }
    
    function unlockNextScenario() {
        const currentUnlocked = getCurrentUnlockedScenario();
        const nextScenario = currentUnlocked + 1;
        localStorage.setItem('unlockedScenario', nextScenario);
        console.log(`Unlocked scenario ${nextScenario}`);
        return nextScenario;
    }
    
    function canAccessScenario(scenarioNumber) {
        if (isAdminUser()) return true;
        if (isCsvScenarioMode()) return true;
        const currentUnlocked = getCurrentUnlockedScenario();
        const requestedScenario = parseInt(scenarioNumber);
        
        // Can only access the current unlocked scenario (no going back)
        return requestedScenario === currentUnlocked;
    }

    function isAdminUser() {
        const agentName = String(localStorage.getItem('agentName') || '').trim().toLowerCase();
        return agentName === 'admin';
    }
    
    function getScenarioNumberFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const value = params.get('scenario');
        return value ? String(value) : null;
    }

    function getScenarioIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const value = params.get('sid');
        return value ? String(value).trim() : '';
    }

    function getPageModeFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const mode = String(params.get('mode') || 'edit').toLowerCase();
        return mode === 'view' ? 'view' : 'edit';
    }

    function findScenarioKeyById(scenarios, scenarioId) {
        const target = String(scenarioId || '').trim();
        if (!target) return '';
        const entries = Object.entries(scenarios || {});
        for (let i = 0; i < entries.length; i++) {
            const [key, scenario] = entries[i];
            if (String((scenario && scenario.id) || '').trim() === target) {
                return key;
            }
        }
        return '';
    }

    function resolveRequestedScenarioKey(scenarios) {
        const sid = getScenarioIdFromUrl();
        if (sid) {
            const byId = findScenarioKeyById(scenarios, sid);
            if (byId) return byId;
        }

        const byNumber = getScenarioNumberFromUrl();
        if (byNumber && scenarios && scenarios[byNumber]) {
            return byNumber;
        }

        const stored = localStorage.getItem('currentScenarioNumber');
        if (stored && scenarios && scenarios[stored]) {
            return stored;
        }

        return '';
    }

    function buildScenarioUrl(scenarioKey, scenariosOverride) {
        const key = String(scenarioKey || '').trim();
        if (!key) return 'app.html';

        const scenarios = scenariosOverride || allScenariosData || {};
        const scenario = scenarios && scenarios[key] ? scenarios[key] : null;
        const scenarioId = scenario && scenario.id ? String(scenario.id).trim() : '';

        const params = new URLSearchParams();
        params.set('scenario', key);
        if (scenarioId) params.set('sid', scenarioId);
        params.set('mode', getPageModeFromUrl());
        return `app.html?${params.toString()}`;
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

    function getAssignmentParamsFromHref(urlValue) {
        if (!urlValue) return null;
        try {
            const resolved = new URL(String(urlValue), window.location.href);
            const params = new URLSearchParams(resolved.search);
            const aid = String(params.get('aid') || '').trim();
            const token = String(params.get('token') || '').trim();
            if (!aid || !token) return null;
            const modeRaw = String(params.get('mode') || 'edit').toLowerCase();
            return {
                aid,
                token,
                mode: modeRaw === 'view' ? 'view' : 'edit',
                href: `app.html?${params.toString()}`
            };
        } catch (_) {
            return null;
        }
    }

    function getSnapshotParamsFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const snapshotId = String(params.get('snap') || '').trim();
        const snapshotToken = String(params.get('st') || '').trim();
        return {
            snapshotId,
            snapshotToken
        };
    }

    function isSnapshotLinkActive() {
        const snapshotParams = getSnapshotParamsFromUrl();
        return !!(snapshotParams.snapshotId && snapshotParams.snapshotToken);
    }

    function getLoggedInEmail() {
        return String(localStorage.getItem('agentEmail') || '').trim().toLowerCase();
    }

    function setAssignmentsStatus(message, isError) {
        if (!assignmentsStatus) return;
        assignmentsStatus.textContent = message || '';
        assignmentsStatus.style.color = isError ? '#b00020' : '#4a4a4a';
    }

    function createAssignmentSessionId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    function getAssignmentSessionId(options = {}) {
        const createIfMissing = !!options.createIfMissing;
        let sessionId = String(localStorage.getItem('assignmentSessionId') || '').trim();
        if (!sessionId && createIfMissing) {
            sessionId = createAssignmentSessionId();
            localStorage.setItem('assignmentSessionId', sessionId);
        }
        return sessionId;
    }

    function clearAssignmentSessionId() {
        localStorage.removeItem('assignmentSessionId');
    }

    function canUseAssignmentMode() {
        return !!getLoggedInEmail();
    }

    function setAssignmentSessionUiLocked(isLocked) {
        if (assignmentRefreshBtn) assignmentRefreshBtn.disabled = !!isLocked;
        if (assignmentSelect) assignmentSelect.disabled = !!isLocked;
    }

    function applyAssignmentSessionState(sessionLike, options = {}) {
        if (!sessionLike || typeof sessionLike !== 'object') return;
        assignmentSessionState = sessionLike;
        const sessionId = String(sessionLike.session_id || '').trim();
        if (sessionId) {
            localStorage.setItem('assignmentSessionId', sessionId);
        }

        setAssignmentSessionUiLocked(false);
        if (!options.silent) {
            setAssignmentsStatus('', false);
        }
        if (assignmentContext) {
            const forceView = assignmentContext.role === 'viewer' || assignmentContext.mode === 'view';
            setAssignmentReadOnlyState(forceView);
        }
    }

    function getCurrentAppBaseUrl() {
        const origin = window.location.origin || '';
        const path = window.location.pathname || '/app.html';
        return `${origin}${path}`;
    }

    function normalizeRuntimePath(pathValue) {
        return String(pathValue || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
    }

    function buildDemoScenarioFallback() {
        return {
            '1': normalizeScenarioRecord({
                companyName: 'Demo Company',
                agentName: localStorage.getItem('agentName') || 'Agent',
                customerPhone: '(000) 000-0000',
                customerMessage: 'Welcome! Start the conversation here.',
                notes: {
                    important: ['Run with a local server to load full scenarios.json']
                },
                rightPanel: { source: { label: 'Source', value: 'Local Demo', date: '' } }
            }, {}, '1')
        };
    }

    async function loadScenariosDataMonolith() {
        if (monolithicScenariosLoaded && allScenariosData && Object.keys(allScenariosData).length) {
            return allScenariosData;
        }

        if (window.location.protocol === 'file:') {
            allScenariosData = buildDemoScenarioFallback();
            monolithicScenariosLoaded = true;
            return allScenariosData;
        }

        try {
            const response = await fetch('scenarios.json');
            if (!response.ok) throw new Error(`scenarios.json load failed (${response.status})`);
            const data = await response.json();
            const scenarios = coerceScenariosPayloadToMap(data);
            allScenariosData = scenarios || {};
            monolithicScenariosLoaded = true;
            return allScenariosData;
        } catch (error) {
            console.error('Error loading scenarios data:', error);
            return allScenariosData;
        }
    }

    async function loadTemplatesDataMonolith() {
        if (Array.isArray(templatesData) && templatesData.length) {
            return templatesData;
        }
        try {
            const response = await fetch('templates.json', { method: 'GET' });
            if (!response.ok) throw new Error(`templates.json load failed (${response.status})`);
            const data = await response.json();
            templatesData = Array.isArray(data.templates) ? data.templates : [];
            return templatesData;
        } catch (error) {
            console.error('Error loading templates.json fallback:', error);
            return templatesData;
        }
    }

    async function loadRuntimeScenariosIndex() {
        if (runtimeScenariosUnavailable) return null;
        if (runtimeScenariosIndex) return runtimeScenariosIndex;
        if (runtimeScenariosIndexPromise) return runtimeScenariosIndexPromise;

        runtimeScenariosIndexPromise = (async () => {
            try {
                const response = await fetch(RUNTIME_SCENARIO_INDEX_PATH, { method: 'GET' });
                if (!response.ok) throw new Error(`Scenario runtime index unavailable (${response.status})`);
                const data = await response.json();
                const hasShape = data && typeof data === 'object' &&
                    Array.isArray(data.order) &&
                    data.byKey && typeof data.byKey === 'object';
                if (!hasShape) throw new Error('Scenario runtime index has invalid shape.');
                runtimeScenariosIndex = data;
                return runtimeScenariosIndex;
            } catch (error) {
                runtimeScenariosUnavailable = true;
                console.warn('Falling back to monolithic scenarios:', error);
                return null;
            } finally {
                runtimeScenariosIndexPromise = null;
            }
        })();
        return runtimeScenariosIndexPromise;
    }

    async function loadRuntimeScenarioChunk(chunkPath) {
        const normalizedPath = normalizeRuntimePath(chunkPath);
        if (!normalizedPath) return {};
        if (runtimeScenarioChunkCache[normalizedPath]) return runtimeScenarioChunkCache[normalizedPath];
        if (runtimeScenarioChunkPromises[normalizedPath]) return runtimeScenarioChunkPromises[normalizedPath];

        runtimeScenarioChunkPromises[normalizedPath] = (async () => {
            const response = await fetch(normalizedPath, { method: 'GET' });
            if (!response.ok) throw new Error(`Scenario chunk load failed (${response.status}): ${normalizedPath}`);
            const data = await response.json();
            const scenariosRaw = (data && typeof data === 'object' && data.scenarios && typeof data.scenarios === 'object')
                ? data.scenarios
                : {};
            const normalizedScenarios = {};
            Object.keys(scenariosRaw).forEach((scenarioKey) => {
                normalizedScenarios[String(scenarioKey)] = normalizeScenarioRecord(scenariosRaw[scenarioKey], {}, String(scenarioKey));
            });
            runtimeScenarioChunkCache[normalizedPath] = normalizedScenarios;
            return normalizedScenarios;
        })();

        try {
            return await runtimeScenarioChunkPromises[normalizedPath];
        } finally {
            delete runtimeScenarioChunkPromises[normalizedPath];
        }
    }

    async function ensureScenariosLoaded(keys) {
        const requestedKeys = Array.from(new Set((Array.isArray(keys) ? keys : []).map(k => String(k || '').trim()).filter(Boolean)));
        if (!requestedKeys.length) return allScenariosData || {};
        allScenariosData = allScenariosData || {};

        const missingKeys = requestedKeys.filter(k => !allScenariosData[k]);
        if (!missingKeys.length) return allScenariosData;

        if (window.location.protocol === 'file:') {
            if (!Object.keys(allScenariosData).length) {
                allScenariosData = buildDemoScenarioFallback();
            }
            return allScenariosData;
        }

        const scenarioIndex = await loadRuntimeScenariosIndex();
        if (scenarioIndex) {
            try {
                const chunkFiles = Array.from(new Set(
                    missingKeys
                        .map((scenarioKey) => scenarioIndex.byKey && scenarioIndex.byKey[scenarioKey] ? normalizeRuntimePath(scenarioIndex.byKey[scenarioKey].chunkFile) : '')
                        .filter(Boolean)
                ));
                for (let i = 0; i < chunkFiles.length; i++) {
                    const chunkMap = await loadRuntimeScenarioChunk(chunkFiles[i]);
                    Object.keys(chunkMap).forEach((scenarioKey) => {
                        allScenariosData[scenarioKey] = chunkMap[scenarioKey];
                    });
                }
            } catch (error) {
                runtimeScenariosUnavailable = true;
                console.warn('Scenario chunk load failed, switching to monolithic mode:', error);
            }
        }

        const stillMissing = requestedKeys.filter(k => !allScenariosData[k]);
        if (stillMissing.length) {
            await loadScenariosDataMonolith();
        }
        return allScenariosData || {};
    }

    async function loadRuntimeTemplatesIndex() {
        if (runtimeTemplatesUnavailable) return null;
        if (runtimeTemplatesIndex) return runtimeTemplatesIndex;
        if (runtimeTemplatesIndexPromise) return runtimeTemplatesIndexPromise;

        runtimeTemplatesIndexPromise = (async () => {
            try {
                const response = await fetch(RUNTIME_TEMPLATE_INDEX_PATH, { method: 'GET' });
                if (!response.ok) throw new Error(`Template runtime index unavailable (${response.status})`);
                const data = await response.json();
                const hasShape = data && typeof data === 'object' &&
                    data.companies && typeof data.companies === 'object' &&
                    typeof data.globalFile === 'string';
                if (!hasShape) throw new Error('Template runtime index has invalid shape.');
                runtimeTemplatesIndex = data;
                return runtimeTemplatesIndex;
            } catch (error) {
                runtimeTemplatesUnavailable = true;
                console.warn('Falling back to monolithic templates:', error);
                return null;
            } finally {
                runtimeTemplatesIndexPromise = null;
            }
        })();
        return runtimeTemplatesIndexPromise;
    }

    async function loadRuntimeTemplateFile(pathValue) {
        const normalizedPath = normalizeRuntimePath(pathValue);
        if (!normalizedPath) return null;
        if (runtimeTemplateFilePromises[normalizedPath]) return runtimeTemplateFilePromises[normalizedPath];

        runtimeTemplateFilePromises[normalizedPath] = (async () => {
            const response = await fetch(normalizedPath, { method: 'GET' });
            if (!response.ok) throw new Error(`Template bundle load failed (${response.status}): ${normalizedPath}`);
            return response.json();
        })();

        try {
            return await runtimeTemplateFilePromises[normalizedPath];
        } finally {
            delete runtimeTemplateFilePromises[normalizedPath];
        }
    }

    async function ensureRuntimeTemplateGlobalLoaded() {
        if (runtimeTemplateGlobalLoaded) return true;
        const templateIndex = await loadRuntimeTemplatesIndex();
        if (!templateIndex) return false;
        const globalFile = normalizeRuntimePath(templateIndex.globalFile);
        if (!globalFile) return false;
        try {
            const globalData = await loadRuntimeTemplateFile(globalFile);
            runtimeTemplateGlobalTemplates = Array.isArray(globalData && globalData.templates) ? globalData.templates : [];
            runtimeTemplateGlobalLoaded = true;
            return true;
        } catch (error) {
            runtimeTemplatesUnavailable = true;
            console.warn('Template global bundle failed, switching to monolithic mode:', error);
            return false;
        }
    }

    async function ensureRuntimeTemplateCompanyLoaded(companyKey) {
        const normalizedCompany = normalizeName(companyKey);
        if (!normalizedCompany) return true;
        if (runtimeTemplateCompanyCache[normalizedCompany]) return true;

        const templateIndex = await loadRuntimeTemplatesIndex();
        if (!templateIndex) return false;

        const relativePath = templateIndex.companies ? templateIndex.companies[normalizedCompany] : '';
        if (!relativePath) {
            runtimeTemplateCompanyCache[normalizedCompany] = [];
            return true;
        }

        try {
            const companyData = await loadRuntimeTemplateFile(relativePath);
            runtimeTemplateCompanyCache[normalizedCompany] = Array.isArray(companyData && companyData.templates) ? companyData.templates : [];
            return true;
        } catch (error) {
            runtimeTemplatesUnavailable = true;
            console.warn('Template company bundle failed, switching to monolithic mode:', error);
            return false;
        }
    }

    async function ensureTemplatesLoadedForScenarioKeys(scenarioKeys) {
        const keys = Array.from(new Set((Array.isArray(scenarioKeys) ? scenarioKeys : []).map(k => String(k || '').trim()).filter(Boolean)));
        if (!keys.length) return;

        if (window.location.protocol === 'file:') {
            await loadTemplatesDataMonolith();
            return;
        }

        const templateIndex = await loadRuntimeTemplatesIndex();
        if (!templateIndex) {
            await loadTemplatesDataMonolith();
            return;
        }

        const globalLoaded = await ensureRuntimeTemplateGlobalLoaded();
        if (!globalLoaded) {
            await loadTemplatesDataMonolith();
            return;
        }

        const companyKeys = Array.from(new Set(keys
            .map((scenarioKey) => {
                const scenario = allScenariosData && allScenariosData[scenarioKey];
                return normalizeName(scenario && scenario.companyName);
            })
            .filter(Boolean)));

        for (let i = 0; i < companyKeys.length; i++) {
            const ok = await ensureRuntimeTemplateCompanyLoaded(companyKeys[i]);
            if (!ok) break;
        }

        if (runtimeTemplatesUnavailable) {
            await loadTemplatesDataMonolith();
        }
    }

    function getCenteredWindowItems(list, currentIndex, windowSize) {
        const safeList = Array.isArray(list) ? list : [];
        if (!safeList.length) return [];
        if (safeList.length <= windowSize) return safeList.slice();
        const max = Math.floor(windowSize / 2);
        const selected = [];
        for (let offset = -max; offset <= max; offset++) {
            const idx = (currentIndex + offset + safeList.length) % safeList.length;
            selected.push(safeList[idx]);
        }
        return selected;
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

    function stopAssignmentHeartbeat() {
        if (assignmentHeartbeatTimer) {
            clearInterval(assignmentHeartbeatTimer);
            assignmentHeartbeatTimer = null;
        }
    }

    async function sendAssignmentHeartbeat() {
        if (isSnapshotMode) return;
        if (!canUseAssignmentMode()) return;
        const email = getLoggedInEmail();
        const sessionId = getAssignmentSessionId();
        if (!email || !sessionId) return;
        try {
            const response = await fetchAssignmentPost('heartbeat', {
                email,
                session_id: sessionId,
                client_ts: new Date().toISOString()
            });
            applyAssignmentSessionState(response && response.session, { silent: true });
            assignmentHeartbeatWarningShown = false;
        } catch (error) {
            console.warn('Assignment heartbeat failed:', error);
            if (!assignmentHeartbeatWarningShown) {
                setAssignmentsStatus('Assignment heartbeat warning. Your queue is still open; keep working.', true);
                assignmentHeartbeatWarningShown = true;
            }
        }
    }

    function startAssignmentHeartbeat() {
        if (isSnapshotMode) return;
        if (!canUseAssignmentMode()) return;
        if (!assignmentSessionState || !assignmentSessionState.session_id) return;
        const sessionId = getAssignmentSessionId();
        if (!sessionId) return;
        stopAssignmentHeartbeat();
        sendAssignmentHeartbeat();
        assignmentHeartbeatTimer = setInterval(() => {
            sendAssignmentHeartbeat();
        }, ASSIGNMENT_HEARTBEAT_INTERVAL_MS);
    }

    async function releaseAssignmentSession(reason) {
        if (isSnapshotMode) return { ok: false, released_count: 0 };
        const email = getLoggedInEmail();
        const sessionId = getAssignmentSessionId();
        if (!email || !sessionId) return { ok: false, released_count: 0 };
        try {
            const response = await fetchAssignmentPost('releaseSession', {
                email,
                session_id: sessionId,
                reason: String(reason || 'manual')
            });
            applyAssignmentSessionState(response && response.session, { silent: true });
            return response;
        } catch (error) {
            console.warn('releaseSession failed:', error);
            return { ok: false, released_count: 0 };
        }
    }

    function sendBeaconReleaseSession(reason, payloadOverride) {
        if (!navigator.sendBeacon) return;
        const override = payloadOverride && typeof payloadOverride === 'object' ? payloadOverride : null;
        const email = override
            ? String(override.email || '').trim().toLowerCase()
            : String(localStorage.getItem('agentEmail') || '').trim().toLowerCase();
        const sessionId = override
            ? String(override.session_id || '').trim()
            : String(localStorage.getItem('assignmentSessionId') || '').trim();
        if (!email || !sessionId) return;
        const payload = JSON.stringify({
            email,
            session_id: sessionId,
            reason: String(reason || 'logout')
        });
        const params = new URLSearchParams({ action: 'releaseSession' });
        const endpoint = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
        const blob = new Blob([payload], { type: 'text/plain' });
        navigator.sendBeacon(endpoint, blob);
    }

    function updateSnapshotShareButtonVisibility() {
        if (!snapshotShareBtn) return;
        const canShow = !isSnapshotMode &&
            !!assignmentContext &&
            !!assignmentContext.assignment_id &&
            assignmentContext.role === 'editor';
        snapshotShareBtn.style.display = canShow ? 'inline-flex' : 'none';
        snapshotShareBtn.disabled = !canShow;
    }

    async function copyTextToClipboard(text) {
        const value = String(text || '');
        if (!value) return false;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(value);
                return true;
            } catch (_) {}
        }

        try {
            const temp = document.createElement('textarea');
            temp.value = value;
            temp.style.position = 'fixed';
            temp.style.opacity = '0';
            temp.style.pointerEvents = 'none';
            document.body.appendChild(temp);
            temp.focus();
            temp.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(temp);
            return !!ok;
        } catch (_) {
            return false;
        }
    }

    function buildSnapshotPayloadForShare() {
        if (!assignmentContext || !assignmentContext.assignment_id) {
            throw new Error('No assignment is currently open.');
        }
        if (!scenarioData || typeof scenarioData !== 'object') {
            throw new Error('Scenario data is not available yet.');
        }

        const scenarioClone = JSON.parse(JSON.stringify(scenarioData));
        const templatesForScenario = getTemplatesForScenario(scenarioData);
        const templatesClone = JSON.parse(JSON.stringify(Array.isArray(templatesForScenario) ? templatesForScenario : []));
        const internalNote = internalNotesEl ? String(internalNotesEl.value || '') : '';

        return {
            version: 1,
            assignment_id: String(assignmentContext.assignment_id || ''),
            send_id: String((assignmentContext && assignmentContext.send_id) || (scenarioClone && scenarioClone.id) || ''),
            scenario: scenarioClone,
            templates: templatesClone,
            internal_note: internalNote,
            created_at: new Date().toISOString()
        };
    }

    function formatSnapshotExpiry(expiryIso) {
        const t = Date.parse(String(expiryIso || ''));
        if (!Number.isFinite(t)) return '';
        return new Date(t).toLocaleString();
    }

    async function createSnapshotAndCopyLink() {
        if (isSnapshotMode) return;
        if (!assignmentContext || assignmentContext.role !== 'editor') {
            setAssignmentsStatus('Open an editable assignment first to create a snapshot link.', true);
            return;
        }
        const sessionId = getAssignmentSessionId();
        if (!sessionId) {
            setAssignmentsStatus('Missing assignment session id.', true);
            return;
        }

        try {
            setAssignmentsStatus('Creating snapshot link...', false);
            const payload = buildSnapshotPayloadForShare();
            const response = await fetchAssignmentPost('createSnapshot', {
                assignment_id: assignmentContext.assignment_id,
                token: assignmentContext.token,
                session_id: sessionId,
                agent_email: getLoggedInEmail(),
                app_base: getCurrentAppBaseUrl(),
                snapshot_payload: payload
            });
            const shareUrl = String((response && response.share_url) || '').trim();
            if (!shareUrl) throw new Error('Snapshot URL was not returned.');

            const copied = await copyTextToClipboard(shareUrl);
            if (copied) {
                setAssignmentsStatus(`Snapshot link copied. Expires ${formatSnapshotExpiry(response && response.expires_at)}.`, false);
            } else {
                setAssignmentsStatus(`Snapshot created but copy failed. Link: ${shareUrl}`, true);
            }
        } catch (error) {
            setAssignmentsStatus(`Snapshot failed: ${error.message || error}`, true);
        }
    }

    function enterSnapshotModeUi() {
        isSnapshotMode = true;
        stopAssignmentHeartbeat();
        assignmentQueue = [];
        assignmentContext = null;
        assignmentSessionState = null;
        setAssignmentSessionUiLocked(false);
        document.body.classList.remove('assignment-view-only');
        document.body.classList.add('snapshot-share-view');
        updateSnapshotShareButtonVisibility();
    }

    function setSnapshotErrorState(message) {
        const text = String(message || 'This snapshot link is invalid or expired.');
        if (chatMessages) {
            chatMessages.innerHTML = '';
            addSystemStatusMessage(text);
        }
        if (internalNotesEl) {
            internalNotesEl.value = '';
            internalNotesEl.readOnly = true;
            internalNotesEl.disabled = false;
        }
        setAssignmentsStatus(text, true);
    }

    async function loadSnapshotFromLink(snapshotId, snapshotToken) {
        enterSnapshotModeUi();
        try {
            const response = await fetchAssignmentGet('getSnapshot', {
                snapshot_id: snapshotId,
                snapshot_token: snapshotToken
            });
            const snapshot = response && response.snapshot ? response.snapshot : null;
            if (!snapshot || !snapshot.payload || typeof snapshot.payload !== 'object') {
                throw new Error('Snapshot payload is missing.');
            }

            const payload = snapshot.payload;
            const scenarioRaw = payload.scenario && typeof payload.scenario === 'object' ? payload.scenario : {};
            const snapshotScenario = normalizeScenarioRecord(scenarioRaw, {}, 'snapshot');
            const templates = Array.isArray(payload.templates) ? payload.templates : [];
            if (!snapshotScenario.rightPanel || typeof snapshotScenario.rightPanel !== 'object') {
                snapshotScenario.rightPanel = {};
            }
            snapshotScenario.rightPanel.templates = templates;
            if (!snapshotScenario.id) {
                snapshotScenario.id = String(payload.send_id || '');
            }

            snapshotContext = {
                snapshot_id: String(snapshot.snapshot_id || ''),
                expires_at: String(snapshot.expires_at || '')
            };
            templatesData = templates;
            allScenariosData = { snapshot: snapshotScenario };
            loadScenarioContent('snapshot', allScenariosData);

            if (internalNotesEl) {
                internalNotesEl.value = String(payload.internal_note || '');
                internalNotesEl.readOnly = true;
                internalNotesEl.disabled = false;
            }
            setAssignmentsStatus(`Snapshot view${snapshotContext.expires_at ? ` (expires ${formatSnapshotExpiry(snapshotContext.expires_at)})` : ''}.`, false);
            return true;
        } catch (error) {
            console.error('Snapshot load failed:', error);
            setSnapshotErrorState(error && error.message ? error.message : 'This snapshot link is invalid or expired.');
            return false;
        }
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

    async function openSelectedAssignmentFromList() {
        if (isSnapshotMode) return;
        if (!assignmentSelect || !assignmentSelect.value) return;
        const selectedOption = assignmentSelect.options[assignmentSelect.selectedIndex];
        if (!selectedOption) return;
        const prefersViewUrl = !!(assignmentContext && (assignmentContext.role === 'viewer' || assignmentContext.mode === 'view'));
        const editUrl = String(selectedOption.dataset.editUrl || '').trim();
        const viewUrl = String(selectedOption.dataset.viewUrl || '').trim();
        const url = prefersViewUrl ? (viewUrl || editUrl) : (editUrl || viewUrl);
        if (!url) return;
        if (assignmentContext && assignmentContext.assignment_id) {
            const opened = await openAssignmentInPageByUrl(url, {
                updateHistory: true,
                replaceHistory: false,
                refreshQueue: false
            });
            if (!opened) {
                window.location.href = url;
            }
            return;
        }
        window.location.href = url;
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

    function buildAssignmentContextRecord(assignment, params, scenarioKey) {
        return {
            assignment_id: assignment.assignment_id,
            send_id: assignment.send_id,
            role: assignment.role === 'viewer' ? 'viewer' : 'editor',
            mode: (params && params.mode) ? params.mode : getPageModeFromUrl(),
            token: (params && params.token) ? params.token : '',
            status: assignment.status || '',
            scenarioKey: String(scenarioKey || ''),
            form_state_json: assignment.form_state_json || '',
            internal_note: assignment.internal_note || ''
        };
    }

    function buildAssignmentPageUrl(params, scenarioKey) {
        const query = new URLSearchParams();
        query.set('aid', String(params && params.aid ? params.aid : ''));
        query.set('token', String(params && params.token ? params.token : ''));
        query.set('mode', String(params && params.mode ? params.mode : 'edit'));
        if (scenarioKey) {
            query.set('scenario', String(scenarioKey));
            const scenario = allScenariosData && allScenariosData[String(scenarioKey)];
            const scenarioId = scenario && scenario.id ? String(scenario.id).trim() : '';
            if (scenarioId) {
                query.set('sid', scenarioId);
            }
        }
        return `app.html?${query.toString()}`;
    }

    async function getScenarioKeysForAssignmentWindow(targetAssignmentId) {
        const queue = Array.isArray(assignmentQueue) ? assignmentQueue : [];
        if (!queue.length) return [];
        const targetId = String(targetAssignmentId || (assignmentContext && assignmentContext.assignment_id) || '').trim();
        const currentIndex = targetId
            ? queue.findIndex(item => String((item && item.assignment_id) || '') === targetId)
            : 0;
        const resolvedIndex = currentIndex >= 0 ? currentIndex : 0;
        const windowAssignments = getCenteredWindowItems(queue, resolvedIndex, 5);
        const scenarioKeys = [];

        for (let i = 0; i < windowAssignments.length; i++) {
            const assignmentItem = windowAssignments[i] || {};
            const assignmentId = String(assignmentItem.assignment_id || '').trim();
            let sendId = String(assignmentItem.send_id || '').trim();
            if (!sendId && assignmentContext && assignmentId && String(assignmentContext.assignment_id) === assignmentId) {
                sendId = String(assignmentContext.send_id || '').trim();
            }
            if (!sendId) continue;
            const scenarioKey = await resolveScenarioKeyForSendId(sendId, allScenariosData);
            if (scenarioKey) scenarioKeys.push(String(scenarioKey));
        }

        return Array.from(new Set(scenarioKeys));
    }

    async function prefetchAssignmentWindow(targetAssignmentId) {
        const scenarioKeys = await getScenarioKeysForAssignmentWindow(targetAssignmentId);
        if (!scenarioKeys.length) return;
        await ensureScenariosLoaded(scenarioKeys);
        await ensureTemplatesLoadedForScenarioKeys(scenarioKeys);
    }

    async function applyAssignmentContextToUi(options = {}) {
        if (!assignmentContext || !assignmentContext.scenarioKey) return;

        await ensureScenariosLoaded([assignmentContext.scenarioKey]);
        await ensureTemplatesLoadedForScenarioKeys([assignmentContext.scenarioKey]);
        await prefetchAssignmentWindow(assignmentContext.assignment_id).catch((error) => {
            console.warn('Assignment prefetch window failed:', error);
        });

        setCurrentScenarioNumber(assignmentContext.scenarioKey);
        loadScenarioContent(assignmentContext.scenarioKey, allScenariosData || {});

        const customForm = document.getElementById('customForm');
        const serverFormState = parseStoredFormState(assignmentContext.form_state_json);
        const localFormStateKey = assignmentFormStateStorageKey();
        const localFormState = localFormStateKey ? parseStoredFormState(localStorage.getItem(localFormStateKey)) : null;
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
        startAssignmentHeartbeat();
        selectCurrentAssignmentInQueue();
        updateSnapshotShareButtonVisibility();

        if (options.updateHistory) {
            const method = options.replaceHistory ? 'replaceState' : 'pushState';
            const nextUrl = buildAssignmentPageUrl(options.params || {}, assignmentContext.scenarioKey);
            window.history[method](
                {
                    aid: String((options.params && options.params.aid) || ''),
                    token: String((options.params && options.params.token) || ''),
                    mode: String((options.params && options.params.mode) || assignmentContext.mode || 'edit')
                },
                '',
                nextUrl
            );
        }
    }

    async function openAssignmentInPage(params, options = {}) {
        if (!params || !params.aid || !params.token) return false;
        if (!canUseAssignmentMode()) {
            setAssignmentsStatus('Assignment mode requires email login.', true);
            return false;
        }
        try {
            const sessionId = getAssignmentSessionId({ createIfMissing: true });
            if (!sessionId) throw new Error('Missing assignment session id.');
            const response = await fetchAssignmentGet('getAssignment', {
                assignment_id: params.aid,
                token: params.token,
                session_id: sessionId
            });
            applyAssignmentSessionState(response && response.session, { silent: true });
            const assignment = response && response.assignment ? response.assignment : null;
            if (!assignment) throw new Error('Assignment payload is missing.');

            const scenarioKey = await resolveScenarioKeyForSendId(assignment.send_id, allScenariosData);
            if (!scenarioKey) throw new Error(`Scenario for send_id ${assignment.send_id} was not found.`);

            assignmentContext = buildAssignmentContextRecord(assignment, params, scenarioKey);

            if (options.refreshQueue) {
                await refreshAssignmentQueue().catch(() => []);
            }

            await applyAssignmentContextToUi({
                updateHistory: !!options.updateHistory,
                replaceHistory: !!options.replaceHistory,
                params
            });
            return true;
        } catch (error) {
            console.error('Assignment open failed:', error);
            setAssignmentsStatus(`Assignment error: ${error.message || error}`, true);
            return false;
        }
    }

    async function openAssignmentInPageByUrl(url, options = {}) {
        const params = getAssignmentParamsFromHref(url);
        if (!params) return false;
        return openAssignmentInPage(params, options);
    }

    function setAssignmentReadOnlyState(isReadOnly) {
        if (isSnapshotMode) return;
        const effectiveReadOnly = !!isReadOnly;
        const isAssignmentViewMode = !!(
            isReadOnly &&
            assignmentContext &&
            (assignmentContext.role === 'viewer' || assignmentContext.mode === 'view')
        );
        document.body.classList.toggle('assignment-view-only', isAssignmentViewMode);
        setAssignmentSessionUiLocked(false);

        const customForm = document.getElementById('customForm');
        const formSubmitBtn = document.getElementById('formSubmitBtn');
        const clearFormBtn = document.getElementById('clearFormBtn');
        if (customForm) {
            const controls = customForm.querySelectorAll('input, select, textarea, button');
            controls.forEach((el) => {
                if (el.id === 'clearFormBtn') return;
                el.disabled = effectiveReadOnly;
            });
        }
        if (formSubmitBtn) formSubmitBtn.disabled = effectiveReadOnly;
        if (clearFormBtn) clearFormBtn.disabled = effectiveReadOnly;
        if (internalNotesEl) internalNotesEl.disabled = effectiveReadOnly;
        if (previousConversationBtn) previousConversationBtn.disabled = effectiveReadOnly;
        if (nextConversationBtn) nextConversationBtn.disabled = effectiveReadOnly;
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
        if (isSnapshotMode) return;
        if (!assignmentContext || assignmentContext.role !== 'editor') return;
        if (!assignmentContext.assignment_id || !assignmentContext.token) return;
        const sessionId = getAssignmentSessionId();
        if (!sessionId) return;

        const formState = collectCustomFormState(customForm);
        const notesValue = internalNotesEl ? internalNotesEl.value : '';
        const formStateRaw = JSON.stringify(formState);

        const formKey = assignmentFormStateStorageKey();
        if (formKey) localStorage.setItem(formKey, formStateRaw);
        const notesKey = assignmentNotesStorageKey();
        if (notesKey) localStorage.setItem(notesKey, notesValue || '');

        const response = await fetchAssignmentPost('saveDraft', {
            assignment_id: assignmentContext.assignment_id,
            token: assignmentContext.token,
            session_id: sessionId,
            form_state_json: formStateRaw,
            internal_note: notesValue
        });
        applyAssignmentSessionState(response && response.session, { silent: true });
    }

    function scheduleAssignmentDraftSave(customForm) {
        if (isSnapshotMode) return;
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

    function getCompanyInitial(companyName) {
        const name = String(companyName || '').trim();
        return name ? name.charAt(0).toUpperCase() : '';
    }

    function mapMessageTypeToRole(messageType) {
        const type = String(messageType || '').trim().toLowerCase();
        if (type === 'subscriber' || type === 'customer' || type === 'user') return 'customer';
        if (type === 'agent') return 'agent';
        if (type === 'system') return 'system';
        return '';
    }

    function normalizeMessageMedia(media) {
        if (!Array.isArray(media)) return [];
        return media
            .map(item => {
                if (typeof item === 'string') return item.trim();
                if (item && typeof item === 'object' && typeof item.url === 'string') return item.url.trim();
                return '';
            })
            .filter(Boolean);
    }

    function normalizeConversationMessage(message) {
        if (!message || typeof message !== 'object') return null;

        const explicitRole = String(message.role || '').trim().toLowerCase();
        const mappedRole = mapMessageTypeToRole(message.message_type);
        const role = explicitRole || mappedRole;
        if (!role) return null;

        const contentRaw = message.content != null ? message.content : message.message_text;
        const content = typeof contentRaw === 'string' ? contentRaw : (contentRaw == null ? '' : String(contentRaw));
        if (!content.trim()) return null;

        const normalized = { role, content };
        const media = normalizeMessageMedia(message.media || message.message_media);
        if (media.length) normalized.media = media;

        const id = String(message.id || message.message_id || '').trim();
        if (id) normalized.id = id;

        return normalized;
    }

    function isConversationMessageObject(item) {
        if (!item || typeof item !== 'object') return false;
        return (
            Object.prototype.hasOwnProperty.call(item, 'message_text') ||
            Object.prototype.hasOwnProperty.call(item, 'message_type') ||
            Object.prototype.hasOwnProperty.call(item, 'content') ||
            Object.prototype.hasOwnProperty.call(item, 'role')
        );
    }

    function isMessageArray(value) {
        return Array.isArray(value) && value.length > 0 && value.every(isConversationMessageObject);
    }

    function normalizeConversationList(list) {
        if (!Array.isArray(list)) return [];
        return list
            .map(normalizeConversationMessage)
            .filter(Boolean);
    }

    function normalizeScenarioRecord(rawScenario, defaults, scenarioKey) {
        const scenarioObject = Array.isArray(rawScenario)
            ? { conversation: rawScenario }
            : ((rawScenario && typeof rawScenario === 'object') ? rawScenario : {});

        const scenarioNotes = (scenarioObject.notes || scenarioObject.guidelines) || {};
        const defaultNotes = (defaults.notes || defaults.guidelines) || {};
        const mergedScenario = {
            ...defaults,
            ...scenarioObject,
            guidelines: {
                ...(defaults.guidelines || {}),
                ...(scenarioObject.guidelines || {})
            },
            notes: {
                ...defaultNotes,
                ...scenarioNotes
            },
            rightPanel: {
                ...(defaults.rightPanel || {}),
                ...(scenarioObject.rightPanel || {})
            }
        };

        const preloadedConversation = Array.isArray(scenarioObject.conversation)
            ? scenarioObject.conversation
            : (Array.isArray(scenarioObject.messages) ? scenarioObject.messages : []);
        if (preloadedConversation.length) {
            mergedScenario.conversation = preloadedConversation;
        }

        mergedScenario.conversation = buildConversationFromScenario(mergedScenario);
        if (!mergedScenario.customerMessage) {
            const firstCustomer = mergedScenario.conversation.find(m => m && m.role === 'customer' && m.content);
            if (firstCustomer) mergedScenario.customerMessage = firstCustomer.content;
        }
        if (!mergedScenario.agentName) mergedScenario.agentName = '';
        if (!mergedScenario.companyName) mergedScenario.companyName = `Scenario ${scenarioKey}`;
        mergedScenario.agentInitial = getCompanyInitial(mergedScenario.companyName);
        return mergedScenario;
    }

    function coerceScenariosPayloadToMap(data) {
        const scenarios = {};
        const defaults = (data && typeof data === 'object' && !Array.isArray(data)) ? (data.defaults || {}) : {};

        const addScenario = (key, rawScenario) => {
            scenarios[String(key)] = normalizeScenarioRecord(rawScenario, defaults, String(key));
        };

        if (data && typeof data === 'object' && !Array.isArray(data) && data.scenarios && !Array.isArray(data.scenarios)) {
            Object.keys(data.scenarios).forEach(scenarioKey => {
                addScenario(scenarioKey, data.scenarios[scenarioKey]);
            });
            return scenarios;
        }

        const asArray = Array.isArray(data)
            ? data
            : ((data && typeof data === 'object' && Array.isArray(data.scenarios)) ? data.scenarios : null);

        if (!asArray) return scenarios;

        if (isMessageArray(asArray)) {
            addScenario('1', { conversation: asArray });
            return scenarios;
        }

        asArray.forEach((item, index) => {
            const key = String(index + 1);
            addScenario(key, item);
        });
        return scenarios;
    }

    function buildConversationFromScenario(scenario) {
        if (!scenario) return [];
        if (Array.isArray(scenario) && scenario.length) {
            return normalizeConversationList(scenario);
        }
        if (Array.isArray(scenario.conversation) && scenario.conversation.length) {
            return normalizeConversationList(scenario.conversation);
        }
        if (Array.isArray(scenario.messages) && scenario.messages.length) {
            return normalizeConversationList(scenario.messages);
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
        return normalizeConversationList(messages);
    }

    function getFirstCustomerMessageFromScenario(scenario, conversation) {
        if (scenario && typeof scenario.customerMessage === 'string' && scenario.customerMessage.trim()) {
            return scenario.customerMessage;
        }
        const conv = Array.isArray(conversation) ? conversation : [];
        const firstCustomer = conv.find(m => m && m.role === 'customer' && m.content);
        return firstCustomer ? firstCustomer.content : '';
    }

    function normalizeScenarioLabelList(value) {
        if (Array.isArray(value)) {
            return value
                .map(item => String(item || '').trim())
                .filter(item => item && item !== '[object Object]')
                .map(item => item.replace(/^['"]|['"]$/g, ''))
                .filter(Boolean);
        }
        if (value && typeof value === 'object') {
            const objValues = Object.values(value)
                .map(item => String(item || '').trim())
                .filter(item => item && item !== '[object Object]')
                .map(item => item.replace(/^['"]|['"]$/g, ''))
                .filter(Boolean);
            return objValues;
        }
        if (value == null) return [];
        const text = String(value).trim();
        if (!text) return [];
        return text
            .split(/[\n,|;]+/)
            .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
    }

    function normalizeName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function isGlobalTemplate(template) {
        return !normalizeName(template && template.companyName);
    }

    function formatDollarAmount(rawValue) {
        if (rawValue == null) return '';
        const text = String(rawValue).trim();
        if (!text) return '';
        if (text.startsWith('$')) return text;
        return `$${text}`;
    }

    function appendUploadedScenarios(scenarios, uploadedList) {
        const uploaded = Array.isArray(uploadedList) ? uploadedList : [];
        if (!uploaded.length) return scenarios;
        const keys = Object.keys(scenarios).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
        let nextKey = keys.length ? Math.max(...keys) + 1 : 1;
        uploaded.forEach(item => {
            scenarios[String(nextKey)] = normalizeScenarioRecord(item, {}, String(nextKey));
            nextKey++;
        });
        return scenarios;
    }

    async function loadTemplatesData() {
        return loadTemplatesDataMonolith();
    }

    async function loadUploadedScenarios() {
        return [];
    }

    function getTemplatesForScenario(scenario) {
        if (runtimeTemplatesIndex && runtimeTemplateGlobalLoaded && !runtimeTemplatesUnavailable) {
            const companyKey = normalizeName(scenario && scenario.companyName);
            const companyTemplates = companyKey && Array.isArray(runtimeTemplateCompanyCache[companyKey])
                ? runtimeTemplateCompanyCache[companyKey]
                : [];
            const globalTemplates = Array.isArray(runtimeTemplateGlobalTemplates) ? runtimeTemplateGlobalTemplates : [];
            const runtimeTemplates = companyTemplates.concat(globalTemplates);
            if (runtimeTemplates.length) {
                return runtimeTemplates;
            }
        }

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
        return loadScenariosDataMonolith();
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

        const lastAgentConversationIndex = (() => {
            for (let i = conversation.length - 1; i >= 0; i--) {
                if (conversation[i] && conversation[i].role === 'agent' && conversation[i].content) return i;
            }
            return -1;
        })();

        const getPriorCustomerMessage = (index) => {
            for (let i = index - 1; i >= 0; i--) {
                const msg = conversation[i];
                if (msg && msg.role === 'customer' && msg.content) return msg.content;
            }
            return 'N/A';
        };

        const submitSelectedAgentMessage = async (message, index, checkbox) => {
            const agentUsername = localStorage.getItem('agentName') || 'Unknown Agent';
            const scenarioLabel = `Scenario ${currentScenario}`;
            const customerContext = getPriorCustomerMessage(index);
            const messageId = String((message && message.id) || '').trim();
            const uniquePart = messageId || String(index + 1);
            const sessionIdOverride = `${currentScenario}_selected_agent_${uniquePart}`;
            const timerValue = getCurrentTimerTime();
            checkbox.disabled = true;
            const ok = await sendToGoogleSheetsWithTimer(
                agentUsername,
                scenarioLabel,
                customerContext,
                message.content,
                timerValue,
                {
                    sessionIdOverride,
                    messageId
                }
            );
            if (!ok) {
                checkbox.disabled = false;
                checkbox.checked = false;
            }
        };

        const appendMedia = (container, mediaList) => {
            if (!Array.isArray(mediaList) || mediaList.length === 0) return;
            const mediaWrap = document.createElement('div');
            mediaWrap.className = 'message-media-list';
            mediaList.forEach(mediaUrl => {
                const url = String(mediaUrl || '').trim();
                if (!url) return;
                const lower = url.toLowerCase();
                const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/.test(lower);
                if (isImage) {
                    const img = document.createElement('img');
                    img.src = url;
                    img.alt = 'Message media';
                    img.loading = 'lazy';
                    img.style.maxWidth = '220px';
                    img.style.borderRadius = '8px';
                    img.style.display = 'block';
                    img.style.marginTop = '6px';
                    mediaWrap.appendChild(img);
                    return;
                }
                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.rel = 'noopener';
                link.textContent = url;
                link.style.display = 'block';
                link.style.marginTop = '6px';
                mediaWrap.appendChild(link);
            });
            if (mediaWrap.childNodes.length > 0) {
                container.appendChild(mediaWrap);
            }
        };

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

        conversation.forEach((message, index) => {
            if (!message || !message.content) return;
            if (message.role === 'system') {
                const systemText = String(message.content || '').trim();
                const isCenteredSystemNote = /^(template used:|escalation notes?:)/i.test(systemText);
                const systemMessage = document.createElement('div');
                systemMessage.className = `message sent system-message${isCenteredSystemNote ? ' center-system-note' : ''}`;
                systemMessage.innerHTML = `
                    <div class="message-content">
                        <p>${message.content}</p>
                    </div>
                `;
                appendMedia(systemMessage.querySelector('.message-content'), message.media);
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
            appendMedia(content, message.media);

            if (isAgent && index !== lastAgentConversationIndex) {
                wrapper.classList.add('has-agent-selector');
                const selectorWrap = document.createElement('label');
                selectorWrap.className = 'agent-message-selector';

                const selectorInput = document.createElement('input');
                selectorInput.type = 'checkbox';
                selectorInput.className = 'agent-message-selector-input';
                selectorInput.setAttribute('aria-label', 'Send this agent message to sheet');

                selectorInput.addEventListener('change', async () => {
                    if (!selectorInput.checked) return;
                    const confirmed = window.confirm('Send this message to the sheet?');
                    if (!confirmed) {
                        selectorInput.checked = false;
                        return;
                    }
                    await submitSelectedAgentMessage(message, index, selectorInput);
                });

                selectorWrap.appendChild(selectorInput);
                wrapper.appendChild(selectorWrap);
            }

            wrapper.appendChild(content);
            chatMessages.appendChild(wrapper);
        });
    }

    function scrollChatToBottomAfterRender() {
        if (!chatMessages) return;
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
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
        const blocklistedWordsRow = document.getElementById('blocklistedWordsRow');
        const escalationPreferencesRow = document.getElementById('escalationPreferencesRow');
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

        const renderBadges = (rowElement, items) => {
            if (!rowElement) return;
            rowElement.innerHTML = '';
            if (!items.length) {
                rowElement.style.display = 'none';
                return;
            }
            items.forEach(item => {
                const badge = document.createElement('span');
                badge.className = 'agent-badge';
                badge.textContent = item;
                rowElement.appendChild(badge);
            });
            rowElement.style.display = 'flex';
        };

        const blocklistedWords = normalizeScenarioLabelList(
            scenario.blocklisted_words != null ? scenario.blocklisted_words : scenario.blocklistedWords
        );
        const escalationPreferences = normalizeScenarioLabelList(
            scenario.escalation_preferences != null ? scenario.escalation_preferences : scenario.escalationPreferences
        );

        renderBadges(blocklistedWordsRow, blocklistedWords);
        renderBadges(escalationPreferencesRow, escalationPreferences);
        
        if (phoneElement) phoneElement.textContent = scenario.customerPhone || '';
        else console.error('customerPhone element not found');
        
        if (messageElement) {
            messageElement.textContent = getFirstCustomerMessageFromScenario(scenario, conversation);
        }
        else console.error('customerMessage element not found');

        // Render conversation and always land on the latest message.
        renderConversationMessages(Array.isArray(conversation) ? conversation : [], scenario);
        scrollChatToBottomAfterRender();
        
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
                        const text = String(item || '').trim();
                        const match = text.match(/^\*\*(.*)\*\*$/);
                        if (match) {
                            const strong = document.createElement('strong');
                            strong.textContent = match[1];
                            li.appendChild(strong);
                        } else {
                            li.textContent = text;
                        }
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
        
        // Update browsing history (support multiple key shapes + show explicit empty state)
        const historyContainer = document.getElementById('browsingHistory');
        if (historyContainer) {
            historyContainer.innerHTML = '';
            const rawHistory =
                (Array.isArray(scenario.rightPanel.browsingHistory) && scenario.rightPanel.browsingHistory) ||
                (Array.isArray(scenario.rightPanel.browsing_history) && scenario.rightPanel.browsing_history) ||
                (Array.isArray(scenario.rightPanel.last5Products) && scenario.rightPanel.last5Products) ||
                (Array.isArray(scenario.rightPanel.last_5_products) && scenario.rightPanel.last_5_products) ||
                [];

            const normalizedHistory = rawHistory
                .map(historyItem => {
                    if (!historyItem || typeof historyItem !== 'object') return null;
                    const itemText =
                        String(historyItem.item || historyItem.product_name || historyItem.name || '').trim();
                    const itemLink =
                        String(historyItem.link || historyItem.product_link || historyItem.url || '').trim();
                    const timeAgo =
                        String(historyItem.timeAgo || historyItem.view_date || historyItem.date || '').trim();
                    if (!itemText && !itemLink) return null;
                    return { itemText: itemText || itemLink, itemLink, timeAgo };
                })
                .filter(Boolean);

            if (!normalizedHistory.length) {
                const empty = document.createElement('li');
                empty.textContent = 'No browsing history for this scenario.';
                empty.style.color = '#8a8a8a';
                historyContainer.appendChild(empty);
            } else {
                normalizedHistory.forEach(historyItem => {
                    const li = document.createElement('li');
                    const itemEl = historyItem.itemLink ? document.createElement('a') : document.createElement('span');
                    itemEl.textContent = historyItem.itemText;
                    if (historyItem.itemLink && itemEl.tagName.toLowerCase() === 'a') {
                        itemEl.href = historyItem.itemLink;
                        itemEl.target = '_blank';
                        itemEl.rel = 'noopener';
                    }
                    li.appendChild(itemEl);

                    if (historyItem.timeAgo) {
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
        initializeTemplateSearch(templatesForScenario);
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

    // Function to send data to Google Sheets with custom timer value
    async function sendToGoogleSheetsWithTimer(agentUsername, scenario, customerMessage, agentResponse, timerValue, options = {}) {
        try {
            // Create a unique session ID per scenario that persists throughout the session
            let scenarioSessionId = options.sessionIdOverride || localStorage.getItem(`scenarioSession_${currentScenario}`);
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
                sendTime: (options.sendTimeOverride || timerValue), // Use the provided timer value instead of getCurrentTimerTime()
                messageId: options.messageId || ''
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
                return true;
            } else {
                console.error('Failed to send to Google Sheets:', response.status);
                return false;
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
                    sendTime: timerValue || getCurrentTimerTime(),
                    messageId: (options && options.messageId) || ''
                };
                failedData.push(safeData);
                localStorage.setItem('failedSheetData', JSON.stringify(failedData));
            } catch (e) {
                console.error('Failed to persist failedSheetData:', e);
            }
            return false;
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
    if (isHttpProtocol && !isSnapshotLinkActive() && !localStorage.getItem('agentName') && !window.location.href.includes('login.html') && 
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
        logoutBtn.addEventListener('click', async () => {
            isExplicitLogoutInProgress = true;
            pendingLogoutReleasePayload = {
                email: getLoggedInEmail(),
                session_id: getAssignmentSessionId()
            };
            stopAssignmentHeartbeat();
            await releaseAssignmentSession('logout').catch(() => ({ ok: false }));
            sendSessionLogout();
            assignmentSessionState = null;
            clearAssignmentSessionId();
            localStorage.removeItem('agentName');
            localStorage.removeItem('agentEmail');
            localStorage.removeItem('sessionStartTime');
            localStorage.removeItem('loginMethod');
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
    
    function addSystemStatusMessage(text) {
        if (!chatMessages || !text) return;
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message sent system-message center-system-note';
        messageDiv.innerHTML = `
            <div class="message-content">
                <p>${text}</p>
            </div>
        `;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function navigateScenarioList(direction) {
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
        const fallbackIndex = direction > 0 ? 0 : keys.length - 1;
        const targetIndex = currentIndex >= 0
            ? (currentIndex + direction + keys.length) % keys.length
            : fallbackIndex;
        const targetScenario = keys[targetIndex];
        if (!isCsvScenarioMode() && !canAccessScenario(targetScenario)) return;
        setCurrentScenarioNumber(targetScenario);
        window.location.href = buildScenarioUrl(targetScenario, data);
    }

    async function navigateAssignmentQueue(direction) {
        if (isSnapshotMode) return false;
        if (!canUseAssignmentMode()) return false;
        let queue = assignmentQueue;
        if (!Array.isArray(queue) || !queue.length) {
            queue = await refreshAssignmentQueue().catch(() => []);
        }
        if (!Array.isArray(queue) || !queue.length) return false;

        const currentId = assignmentContext && assignmentContext.assignment_id
            ? String(assignmentContext.assignment_id)
            : '';
        const currentIndex = currentId
            ? queue.findIndex(item => String((item && item.assignment_id) || '') === currentId)
            : -1;
        const fallbackIndex = direction > 0 ? 0 : queue.length - 1;
        const targetIndex = currentIndex >= 0
            ? (currentIndex + direction + queue.length) % queue.length
            : fallbackIndex;
        const target = queue[targetIndex];
        const prefersViewUrl = !!(assignmentContext && (assignmentContext.role === 'viewer' || assignmentContext.mode === 'view'));
        const editUrl = target && target.edit_url ? String(target.edit_url) : '';
        const viewUrl = target && target.view_url ? String(target.view_url) : '';
        const url = prefersViewUrl ? (viewUrl || editUrl) : (editUrl || viewUrl);
        if (!url) return false;

        if (assignmentContext && assignmentContext.assignment_id) {
            const opened = await openAssignmentInPageByUrl(url, {
                updateHistory: true,
                replaceHistory: false,
                refreshQueue: false
            });
            if (!opened) {
                window.location.href = url;
                return true;
            }
            return true;
        }

        window.location.href = url;
        return true;
    }

    async function navigateConversation(direction) {
        if (isSnapshotMode) return;
        const movedByAssignment = await navigateAssignmentQueue(direction);
        if (assignmentContext && assignmentContext.assignment_id) {
            return;
        }
        if (!movedByAssignment) {
            await navigateScenarioList(direction);
        }
    }

    function isTypingTarget(target) {
        if (!target) return false;
        const tag = String(target.tagName || '').toUpperCase();
        return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    // Event listeners
    if (previousConversationBtn) {
        previousConversationBtn.addEventListener('click', async () => {
            await navigateConversation(-1);
        });
    }

    if (nextConversationBtn) {
        nextConversationBtn.addEventListener('click', async () => {
            await navigateConversation(1);
        });
    }

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
        addSystemStatusMessage(`[This conversation has been ${cfg.display}.]`);

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
                window.location.href = buildScenarioUrl(String(nextScenario));
            });
            document.body.appendChild(notification);
            setTimeout(() => notification.style.opacity = '1', 100);
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }, 5000);

        }, 500);
    }

    // Keyboard shortcuts for actions:
    // Shift + B => Block
    // Shift + D => Unsubscribe
    // Shift + N => Close
    document.addEventListener('keydown', (event) => {
        if (isSnapshotMode) return;
        // Ignore if any modifier other than Shift is pressed
        if (event.altKey || event.ctrlKey || event.metaKey) return;

        if (!event.shiftKey && !isTypingTarget(event.target)) {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                navigateConversation(-1);
                return;
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                navigateConversation(1);
                return;
            }
        }

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

    function renderTemplateItems(templates, searchTerm) {
        const templatesContainer = document.getElementById('templateItems');
        if (!templatesContainer) return;
        templatesContainer.innerHTML = '';

        const safeSearch = String(searchTerm || '').toLowerCase().trim();
        const sourceTemplates = Array.isArray(templates) ? templates : [];
        const filteredTemplates = sourceTemplates.filter(template => {
            const name = String((template && template.name) || '').toLowerCase();
            const shortcut = String((template && template.shortcut) || '').toLowerCase();
            const content = String((template && template.content) || '').toLowerCase();
            return name.includes(safeSearch) ||
                shortcut.includes(safeSearch) ||
                content.includes(safeSearch);
        });

        filteredTemplates.forEach(template => {
            const templateDiv = document.createElement('div');
            templateDiv.className = 'template-item';
            if (isGlobalTemplate(template)) {
                templateDiv.classList.add('template-item--global');
            }

            const headerDiv = document.createElement('div');
            headerDiv.className = 'template-header';

            const nameSpan = document.createElement('span');
            nameSpan.appendChild(createHighlightedFragment(String(template && template.name ? template.name : ''), safeSearch));

            headerDiv.appendChild(nameSpan);
            const shortcutText = String((template && template.shortcut) || '').trim();
            if (shortcutText) {
                const shortcutSpan = document.createElement('span');
                shortcutSpan.className = 'template-shortcut';
                shortcutSpan.appendChild(createHighlightedFragment(shortcutText, safeSearch));
                headerDiv.appendChild(shortcutSpan);
            }

            const contentP = document.createElement('p');
            contentP.appendChild(createHighlightedFragment(String(template && template.content ? template.content : ''), safeSearch));

            templateDiv.appendChild(headerDiv);
            templateDiv.appendChild(contentP);
            templatesContainer.appendChild(templateDiv);
        });

        if (filteredTemplates.length === 0 && safeSearch !== '') {
            const noResultsDiv = document.createElement('div');
            noResultsDiv.className = 'no-results';
            noResultsDiv.textContent = 'No templates found';
            templatesContainer.appendChild(noResultsDiv);
        }
    }

    // Function to initialize template search functionality
    function initializeTemplateSearch(templates) {
        const searchInput = document.querySelector('.search-templates input');
        const templatesContainer = document.getElementById('templateItems');
        if (!searchInput || !templatesContainer) return;

        templateSearchSourceTemplates = Array.isArray(templates) ? templates : [];

        if (!templateSearchBound) {
            searchInput.addEventListener('input', function(e) {
                const searchTerm = e && e.target ? e.target.value : '';
                renderTemplateItems(templateSearchSourceTemplates, searchTerm);
            });
            templateSearchBound = true;
        }

        renderTemplateItems(templateSearchSourceTemplates, searchInput.value || '');
    }
    
    // Initialize everything
    updateSnapshotShareButtonVisibility();
    const snapshotParams = getSnapshotParamsFromUrl();
    const hasSnapshot = !!(snapshotParams.snapshotId && snapshotParams.snapshotToken);
    const assignmentParams = getAssignmentParamsFromUrl();
    const hasAid = !!assignmentParams.aid;

    if (hasSnapshot) {
        await loadSnapshotFromLink(snapshotParams.snapshotId, snapshotParams.snapshotToken);
    } else if (hasAid) {
        await loadRuntimeScenariosIndex();
        await loadRuntimeTemplatesIndex();
        try {
            if (!canUseAssignmentMode()) {
                throw new Error('Assignment mode requires email login.');
            }
            getAssignmentSessionId({ createIfMissing: true });
            await refreshAssignmentQueue().catch(() => []);
            const opened = await openAssignmentInPage(assignmentParams, {
                updateHistory: true,
                replaceHistory: true,
                refreshQueue: false
            });
            if (!opened) {
                throw new Error('Failed to open assignment in-page.');
            }
        } catch (assignmentError) {
            console.error('Assignment flow error:', assignmentError);
            setAssignmentsStatus(`Assignment error: ${assignmentError.message || assignmentError}`, true);

            templatesData = await loadTemplatesData();
            const scenarios = await loadScenariosData();
            allScenariosData = scenarios || {};
            if (scenarios && Object.keys(scenarios).length) {
                const scenarioKeys = Object.keys(scenarios)
                    .map(k => parseInt(k, 10))
                    .filter(n => !isNaN(n))
                    .sort((a, b) => a - b)
                    .map(n => String(n));
                const requestedScenario = resolveRequestedScenarioKey(scenarios) || getCurrentScenarioNumber();
                const activeScenario = scenarios[requestedScenario] ? requestedScenario : (scenarioKeys[0] || '1');
                setCurrentScenarioNumber(activeScenario);
                loadScenarioContent(activeScenario, scenarios);
            }
        }
    } else {
        templatesData = await loadTemplatesData();
        const scenarios = await loadScenariosData();
        allScenariosData = scenarios || {};
        if (!scenarios) {
            console.error('Could not load scenarios data');
        } else {
            if (canUseAssignmentMode()) {
                getAssignmentSessionId({ createIfMissing: true });
                try {
                    const queue = await refreshAssignmentQueue();
                    if (queue.length) {
                        setAssignmentsStatus('Queue loaded. Opening first assignment...', false);
                        const firstEditUrl = queue[0].edit_url || queue[0].view_url || '';
                        if (firstEditUrl) {
                            window.location.href = firstEditUrl;
                            return;
                        }
                    } else {
                        setAssignmentsStatus('No assignments available.', false);
                    }
                } catch (assignmentError) {
                    console.error('Assignment flow error:', assignmentError);
                    setAssignmentsStatus(`Assignment error: ${assignmentError.message || assignmentError}`, true);
                }
            } else {
                setAssignmentsStatus('Assignment mode requires email login.', true);
            }

            const scenarioKeys = Object.keys(scenarios)
                .map(k => parseInt(k, 10))
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b)
                .map(n => String(n));
            const requestedScenario = resolveRequestedScenarioKey(scenarios) || getCurrentScenarioNumber();
            const activeScenario = scenarios[requestedScenario] ? requestedScenario : (scenarioKeys[0] || '1');
            setCurrentScenarioNumber(activeScenario);
            loadScenarioContent(activeScenario, scenarios);
        }
    }

    // If this scenario was previously ended (via action buttons), keep input disabled IF it's NOT the current unlocked scenario.
    // This prevents stale ended flags from blocking a fresh session when logging back in or starting a new unlocked scenario.
    // Conversation end state and timer removed
    
    // Initialize new features
    initTemplateSearchKeyboardShortcut();

    if (snapshotShareBtn) {
        snapshotShareBtn.addEventListener('click', async () => {
            await createSnapshotAndCopyLink();
        });
    }

    if (assignmentRefreshBtn) {
        assignmentRefreshBtn.addEventListener('click', async () => {
            if (isSnapshotMode) return;
            if (!canUseAssignmentMode()) {
                setAssignmentsStatus('Assignment mode requires email login.', true);
                return;
            }
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

    if (assignmentSelect) {
        assignmentSelect.addEventListener('dblclick', () => {
            openSelectedAssignmentFromList();
        });
    }

    window.addEventListener('popstate', async () => {
        const snapshotParamsNow = getSnapshotParamsFromUrl();
        if (snapshotParamsNow.snapshotId && snapshotParamsNow.snapshotToken) {
            await loadSnapshotFromLink(snapshotParamsNow.snapshotId, snapshotParamsNow.snapshotToken);
            return;
        }
        if (isSnapshotMode) {
            window.location.reload();
            return;
        }
        const params = getAssignmentParamsFromUrl();
        if (!params.aid || !params.token) return;
        const currentAid = assignmentContext ? String(assignmentContext.assignment_id || '') : '';
        const currentToken = assignmentContext ? String(assignmentContext.token || '') : '';
        const currentMode = assignmentContext ? String(assignmentContext.mode || '') : '';
        if (currentAid === params.aid && currentToken === params.token && currentMode === params.mode) return;
        await openAssignmentInPage(params, {
            updateHistory: false,
            replaceHistory: false,
            refreshQueue: false
        });
    });
    
    // Persist internal notes and assignment drafts
    if (internalNotesEl) {
        internalNotesEl.addEventListener('input', () => {
            if (isSnapshotMode) return;
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

    // Start the session timer after content is loaded (not used in anonymous snapshot mode)
    if (!isSnapshotMode) {
        initSessionTimer();
    }

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
            if (isSnapshotMode) {
                if (formStatus) {
                    formStatus.textContent = 'Snapshot view is read-only.';
                    formStatus.style.color = '#e74c3c';
                }
                return;
            }
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
                // Include selected items only, keeping original category order.
                const included = full.filter(label => selected.has(label));
                return included.join(',');
            }

            // Process dropdowns: capture human-readable labels
            const zeroTolSel = document.getElementById('zeroTolerance');
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
                        const sessionId = getAssignmentSessionId();
                        if (!sessionId) {
                            throw new Error('Missing assignment session id.');
                        }
                        await saveAssignmentDraft(customForm).catch(() => {});
                        const doneRes = await fetchAssignmentPost('done', {
                            assignment_id: assignmentContext.assignment_id,
                            token: assignmentContext.token,
                            session_id: sessionId,
                            app_base: getCurrentAppBaseUrl()
                        });
                        applyAssignmentSessionState(doneRes && doneRes.session, { silent: true });
                        const nextQueue = Array.isArray(doneRes.assignments) ? doneRes.assignments : [];
                        renderAssignmentQueue(nextQueue);
                        const nextUrl = nextQueue.length
                            ? String(nextQueue[0].edit_url || nextQueue[0].view_url || '').trim()
                            : '';
                        if (nextUrl) {
                            const opened = await openAssignmentInPageByUrl(nextUrl, {
                                updateHistory: true,
                                replaceHistory: false,
                                refreshQueue: false
                            });
                            if (opened) return;
                            window.location.href = nextUrl;
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
        stopAssignmentHeartbeat();
        if (isExplicitLogoutInProgress) {
            sendBeaconReleaseSession('logout', pendingLogoutReleasePayload);
            pendingLogoutReleasePayload = null;
        }
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
