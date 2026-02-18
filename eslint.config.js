const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'crosschecking temp/**',
      'old local/**',
      'qa-system-ptr/**',
      'data/scenarios/chunks/**',
      '*.bak',
      '*.pre_repair*.bak',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
        feather: 'readonly',
        google: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.gs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.es2022,
        SpreadsheetApp: 'readonly',
        Utilities: 'readonly',
        LockService: 'readonly',
        ScriptApp: 'readonly',
        ContentService: 'readonly',
        PropertiesService: 'readonly',
        CacheService: 'readonly',
        Session: 'readonly',
        Logger: 'readonly',
        UrlFetchApp: 'readonly',
        HtmlService: 'readonly',
        DriveApp: 'readonly',
        GmailApp: 'readonly',
        CalendarApp: 'readonly',
        Maps: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unused-vars': 'off',
    },
  },
];
