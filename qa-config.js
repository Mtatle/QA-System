window.QA_CONFIG = Object.assign({}, window.QA_CONFIG || {}, {
    // Single backend URL used by both login and app assignment flows.
    // Update this once per environment (staging or production).
    GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxdYddYfnFwK4nWaaMmOgzhH6wD0i3jY_1G1XM8PB4NzfJDsmxLrF8abc142KEhagfAbw/exec',
    // Keep true while troubleshooting; set false to reduce console noise.
    DEBUG: true,
});
