#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function readJson(relPath) {
  const absPath = path.join(rootDir, relPath);
  if (!fs.existsSync(absPath)) {
    fail(`Missing file: ${relPath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON in ${relPath}: ${String(error.message || error)}`);
    return null;
  }
}

function normalizePath(relPath) {
  return String(relPath || '').replace(/\\/g, '/');
}

function validateScenarios() {
  const relIndexPath = 'data/scenarios/index.json';
  const index = readJson(relIndexPath);
  if (!index) return;

  const order = Array.isArray(index.order) ? index.order.map((v) => String(v || '').trim()) : [];
  const byKey = index.byKey && typeof index.byKey === 'object' ? index.byKey : {};
  const byId = index.byId && typeof index.byId === 'object' ? index.byId : {};

  if (!order.length) fail('Scenario index order is empty.');
  if (!Object.keys(byKey).length) fail('Scenario index byKey is empty.');
  if (!Object.keys(byId).length) fail('Scenario index byId is empty.');

  const uniqueOrder = new Set(order);
  if (uniqueOrder.size !== order.length) {
    fail('Scenario index order contains duplicate keys.');
  }

  const chunkToScenarioKeys = {};
  const expectedById = {};

  order.forEach((scenarioKey) => {
    const entry = byKey[scenarioKey];
    if (!entry || typeof entry !== 'object') {
      fail(`Missing byKey entry for scenario key ${scenarioKey}.`);
      return;
    }
    const sendId = String(entry.id || '').trim();
    const chunkFile = normalizePath(entry.chunkFile || '');
    if (!sendId) fail(`Scenario key ${scenarioKey} is missing send_id in byKey.`);
    if (!chunkFile) fail(`Scenario key ${scenarioKey} is missing chunkFile in byKey.`);
    if (sendId) {
      if (expectedById[sendId] && expectedById[sendId] !== scenarioKey) {
        fail(
          `Duplicate send_id mapping in byKey: ${sendId} maps to both ${expectedById[sendId]} and ${scenarioKey}.`
        );
      }
      expectedById[sendId] = scenarioKey;
    }
    if (chunkFile) {
      if (!chunkToScenarioKeys[chunkFile]) chunkToScenarioKeys[chunkFile] = new Set();
      chunkToScenarioKeys[chunkFile].add(scenarioKey);
      if (!fs.existsSync(path.join(rootDir, chunkFile))) {
        fail(`Missing scenario chunk file referenced by index: ${chunkFile}`);
      }
    }
  });

  Object.keys(byKey).forEach((scenarioKey) => {
    if (!uniqueOrder.has(String(scenarioKey))) {
      warn(`Scenario key ${scenarioKey} exists in byKey but not in order.`);
    }
  });

  Object.keys(byId).forEach((sendId) => {
    const scenarioKey = String(byId[sendId] || '').trim();
    if (!scenarioKey) {
      fail(`byId entry ${sendId} has empty scenario key.`);
      return;
    }
    const byKeyEntry = byKey[scenarioKey];
    if (!byKeyEntry) {
      fail(`byId entry ${sendId} points to missing scenario key ${scenarioKey}.`);
      return;
    }
    const expectedSendId = String(byKeyEntry.id || '').trim();
    if (expectedSendId !== sendId) {
      fail(
        `byId/byKey mismatch: byId[${sendId}] -> ${scenarioKey}, but byKey[${scenarioKey}].id=${expectedSendId}.`
      );
    }
  });

  Object.keys(expectedById).forEach((sendId) => {
    if (!Object.prototype.hasOwnProperty.call(byId, sendId)) {
      fail(`Missing byId entry for send_id ${sendId}.`);
    }
  });

  const seenScenarioKeysInChunks = new Set();
  const seenScenarioIdsInChunks = new Set();
  Object.keys(chunkToScenarioKeys).forEach((chunkFile) => {
    const chunkJson = readJson(chunkFile);
    if (!chunkJson) return;
    const scenarios =
      chunkJson.scenarios && typeof chunkJson.scenarios === 'object' ? chunkJson.scenarios : {};
    const chunkScenarioKeys = Object.keys(scenarios);
    if (!chunkScenarioKeys.length) {
      fail(`Chunk has no scenarios: ${chunkFile}`);
      return;
    }

    chunkScenarioKeys.forEach((scenarioKey) => {
      seenScenarioKeysInChunks.add(String(scenarioKey));
      const scenario =
        scenarios[scenarioKey] && typeof scenarios[scenarioKey] === 'object'
          ? scenarios[scenarioKey]
          : {};
      const sendId = String(scenario.id || '').trim();
      if (!sendId) {
        fail(`Scenario ${scenarioKey} in ${chunkFile} is missing id.`);
        return;
      }
      if (seenScenarioIdsInChunks.has(sendId)) {
        fail(`Duplicate scenario id in chunks: ${sendId}`);
      }
      seenScenarioIdsInChunks.add(sendId);

      const idxEntry = byKey[String(scenarioKey)];
      if (!idxEntry) {
        fail(`Scenario ${scenarioKey} exists in ${chunkFile} but not in index.byKey.`);
        return;
      }

      const expectedChunk = normalizePath(idxEntry.chunkFile || '');
      if (expectedChunk !== chunkFile) {
        fail(
          `Chunk mismatch for scenario ${scenarioKey}: index=${expectedChunk}, actual=${chunkFile}`
        );
      }

      const expectedId = String(idxEntry.id || '').trim();
      if (expectedId !== sendId) {
        fail(`Scenario id mismatch for key ${scenarioKey}: index=${expectedId}, chunk=${sendId}`);
      }
    });
  });

  Object.keys(byKey).forEach((scenarioKey) => {
    if (!seenScenarioKeysInChunks.has(String(scenarioKey))) {
      fail(`Scenario key ${scenarioKey} is present in index but missing from chunks.`);
    }
  });
}

function validateTemplates() {
  const relIndexPath = 'data/templates/index.json';
  const index = readJson(relIndexPath);
  if (!index) return;

  const globalFile = normalizePath(index.globalFile || '');
  const companies = index.companies && typeof index.companies === 'object' ? index.companies : {};

  if (!globalFile) fail('Template index is missing globalFile.');
  if (globalFile && !fs.existsSync(path.join(rootDir, globalFile))) {
    fail(`Template global file missing: ${globalFile}`);
  }

  const globalJson = globalFile ? readJson(globalFile) : null;
  if (globalJson && !Array.isArray(globalJson.templates)) {
    fail(`Template global file does not contain a templates array: ${globalFile}`);
  }

  const seenTemplateFiles = new Set();
  Object.keys(companies).forEach((companyKey) => {
    const relPath = normalizePath(companies[companyKey] || '');
    if (!relPath) {
      fail(`Template index has empty file path for company "${companyKey}".`);
      return;
    }
    if (seenTemplateFiles.has(relPath)) {
      warn(`Template file reused by multiple companies: ${relPath}`);
    }
    seenTemplateFiles.add(relPath);

    const absPath = path.join(rootDir, relPath);
    if (!fs.existsSync(absPath)) {
      fail(`Missing company template file: ${relPath}`);
      return;
    }

    const companyJson = readJson(relPath);
    if (!companyJson) return;
    if (!Array.isArray(companyJson.templates)) {
      fail(`Company template file missing templates array: ${relPath}`);
      return;
    }

    companyJson.templates.forEach((tpl, idx) => {
      const name = String((tpl && tpl.name) || '').trim();
      const content = String((tpl && tpl.content) || '').trim();
      if (!name) {
        fail(`Empty template name in ${relPath} at index ${idx}.`);
      }
      if (!content) {
        fail(`Empty template content in ${relPath} at index ${idx}.`);
      }
    });
  });
}

function printSummary() {
  if (warnings.length) {
    console.log('Warnings:');
    warnings.forEach((msg) => console.log(`- ${msg}`));
  }

  if (errors.length) {
    console.error('Data validation failed:');
    errors.forEach((msg) => console.error(`- ${msg}`));
    process.exit(1);
  }

  console.log('Runtime data validation passed.');
  if (warnings.length) {
    console.log(`Completed with ${warnings.length} warning(s).`);
  }
}

validateScenarios();
validateTemplates();
printSummary();
