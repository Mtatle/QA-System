export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === '/templates' && request.method === 'GET') {
        try {
            const data = await readTemplates(env);
            return jsonResponse({ templates: data.templates }, corsHeaders);
        } catch (error) {
            console.error('GET /templates failed', error);
            return jsonResponse({ error: 'Failed to load templates.', details: error.message || String(error) }, corsHeaders, 500);
        }
    }

    if (url.pathname === '/templates' && request.method === 'POST') {
        try {
            const payload = await request.json();
            const incoming = Array.isArray(payload.templates) ? payload.templates : [];
            if (!incoming.length) {
                return jsonResponse({ error: 'No templates provided.' }, corsHeaders, 400);
            }
            const updated = await mergeAndSaveTemplates(env, incoming);
            return jsonResponse({ templates: updated.templates }, corsHeaders);
        } catch (error) {
            console.error('POST /templates failed', error);
            return jsonResponse({ error: 'Failed to update templates.', details: error.message || String(error) }, corsHeaders, 500);
        }
    }

    if (url.pathname === '/templates' && request.method === 'DELETE') {
        try {
            await clearTemplates(env);
            return jsonResponse({ templates: [] }, corsHeaders);
        } catch (error) {
            console.error('DELETE /templates failed', error);
            return jsonResponse({ error: 'Failed to clear templates.', details: error.message || String(error) }, corsHeaders, 500);
        }
    }

    if (url.pathname === '/scenarios' && request.method === 'GET') {
        try {
            const data = await readScenarios(env);
            return jsonResponse({ scenarios: data.scenarios }, corsHeaders);
        } catch (error) {
            console.error('GET /scenarios failed', error);
            return jsonResponse({ error: 'Failed to load scenarios.', details: error.message || String(error) }, corsHeaders, 500);
        }
    }

    if (url.pathname === '/scenarios' && request.method === 'POST') {
        try {
            const payload = await request.json();
            const incoming = Array.isArray(payload.scenarios) ? payload.scenarios : [];
            if (!incoming.length) {
                return jsonResponse({ error: 'No scenarios provided.' }, corsHeaders, 400);
            }
            const updated = await mergeAndSaveScenarios(env, incoming);
            return jsonResponse({ scenarios: updated.scenarios }, corsHeaders);
        } catch (error) {
            console.error('POST /scenarios failed', error);
            return jsonResponse({ error: 'Failed to update scenarios.', details: error.message || String(error) }, corsHeaders, 500);
        }
    }

    if (url.pathname === '/scenarios' && request.method === 'DELETE') {
        try {
            await clearScenarios(env);
            return jsonResponse({ scenarios: [] }, corsHeaders);
        } catch (error) {
            console.error('DELETE /scenarios failed', error);
            return jsonResponse({ error: 'Failed to clear scenarios.', details: error.message || String(error) }, corsHeaders, 500);
        }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

function jsonResponse(body, headers, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

async function readTemplates(env) {
  const { owner, repo, templatesPath, branch, token } = getRepoConfig(env);
  const path = templatesPath;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'qa-templates-worker'
    }
  });

  if (response.status === 404) {
    return { templates: [], sha: null };
  }

  if (!response.ok) {
    throw new Error('GitHub fetch failed');
  }

  const json = await response.json();
  const content = json && json.content ? atob(json.content) : '{"templates":[]}';
  const parsed = JSON.parse(content);
  return {
    templates: Array.isArray(parsed.templates) ? parsed.templates : [],
    sha: json.sha
  };
}

async function mergeAndSaveTemplates(env, incomingTemplates) {
  const existing = await readTemplates(env);
  const merged = mergeTemplates(existing.templates, incomingTemplates);
  await writeTemplates(env, merged, existing.sha);
  return { templates: merged };
}

function mergeTemplates(existing, incoming) {
  const map = new Map();
  existing.forEach(template => {
    if (!template || !template.id) return;
    map.set(String(template.id), template);
  });

  incoming.forEach(template => {
    if (!template || !template.id) return;
    map.set(String(template.id), template);
  });

  const existingIds = new Set(existing.map(t => t && t.id).filter(Boolean).map(String));
  const incomingIds = new Set(incoming.map(t => t && t.id).filter(Boolean).map(String));

  const result = [];
  existing.forEach(template => {
    if (!template || !template.id) return;
    if (!incomingIds.has(String(template.id))) {
      result.push(template);
    }
  });

  incoming.forEach(template => {
    if (!template || !template.id) return;
    result.push(template);
  });

  const remaining = [];
  map.forEach(value => {
    if (!value || !value.id) return;
    if (!existingIds.has(String(value.id)) && !incomingIds.has(String(value.id))) {
      remaining.push(value);
    }
  });

  return result.concat(remaining);
}

async function writeTemplates(env, templates, sha) {
  const { owner, repo, templatesPath, branch, token } = getRepoConfig(env);
  const path = templatesPath;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    message: 'Update templates.json via uploader',
    content: btoa(JSON.stringify({ templates }, null, 2)),
    branch
  };
  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'qa-templates-worker',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error('GitHub update failed');
  }
}

async function clearTemplates(env) {
  await writeTemplates(env, [], (await readTemplates(env)).sha);
}

async function readScenarios(env) {
  const { owner, repo, scenariosPath, branch, token } = getRepoConfig(env);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${scenariosPath}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'qa-templates-worker'
    }
  });

  if (response.status === 404) {
    return { scenarios: [], sha: null };
  }

  if (!response.ok) {
    throw new Error('GitHub fetch failed');
  }

  const json = await response.json();
  const content = json && json.content ? atob(json.content) : '{"scenarios":[]}';
  const parsed = JSON.parse(content);
  return {
    scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
    sha: json.sha
  };
}

async function mergeAndSaveScenarios(env, incomingScenarios) {
  const existing = await readScenarios(env);
  const merged = mergeTemplates(existing.scenarios, incomingScenarios);
  await writeScenarios(env, merged, existing.sha);
  return { scenarios: merged };
}

async function writeScenarios(env, scenarios, sha) {
  const { owner, repo, scenariosPath, branch, token } = getRepoConfig(env);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${scenariosPath}`;
  const body = {
    message: 'Update scenarios upload via uploader',
    content: btoa(JSON.stringify({ scenarios }, null, 2)),
    branch
  };
  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'qa-templates-worker',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error('GitHub update failed');
  }
}

async function clearScenarios(env) {
  await writeScenarios(env, [], (await readScenarios(env)).sha);
}

function getRepoConfig(env) {
  const owner = env.GH_OWNER;
  const repo = env.GH_REPO;
  const templatesPath = env.GH_TEMPLATES_PATH || 'templates.json';
  const scenariosPath = env.GH_SCENARIOS_PATH || 'scenarios-uploads.json';
  const branch = env.GH_BRANCH || 'main';
  const token = env.GH_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error('Missing GitHub configuration');
  }

  return { owner, repo, templatesPath, scenariosPath, branch, token };
}
