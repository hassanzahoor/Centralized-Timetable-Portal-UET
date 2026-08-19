// UET KSK Theme Switcher — Sage / Indigo / Ocean

const THEME_STORAGE_KEY = 'uet_selected_theme';
const VALID_THEMES = ['sage', 'indigo', 'ocean'];

function getSavedTheme() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return VALID_THEMES.includes(saved) ? saved : 'sage';
}

function applyTheme(themeName) {
    if (!VALID_THEMES.includes(themeName)) themeName = 'sage';

    if (themeName === 'sage') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
    }

    localStorage.setItem(THEME_STORAGE_KEY, themeName);
    updateThemeToggleUI(themeName);
}

function updateThemeToggleUI(themeName) {
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-theme-option') === themeName);
    });
}

function setTheme(themeName) {
    applyTheme(themeName);
}

// Apply saved theme immediately (before other scripts render UI)
applyTheme(getSavedTheme());