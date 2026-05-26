// fut.invest - Lazy Loading Module Loader
// Code splitting: carga módulos bajo demanda

const FUT_MODULES = {
    dashboard: { loaded: false, el: null },
    wallet: { loaded: false, el: null },
    security: { loaded: false, el: null },
    network: { loaded: false, el: null },
    codehub: { loaded: false, el: null },
    settings: { loaded: false, el: null },
    admin: { loaded: false, el: null },
};

function preloadModule(name) {
    if (FUT_MODULES[name]?.loaded) return;
    // Signal to app.js that this module should be initialized
    const event = new CustomEvent('fut:preload', { detail: { module: name } });
    window.dispatchEvent(event);
}

function markModuleLoaded(name) {
    if (FUT_MODULES[name]) {
        FUT_MODULES[name].loaded = true;
    }
}

// Intersection Observer for lazy tab content
const tabObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            const tabId = entry.target.id?.replace('tab-', '');
            if (tabId && FUT_MODULES[tabId]) {
                preloadModule(tabId);
            }
        }
    }
}, { rootMargin: '200px' });

function observeTabs() {
    document.querySelectorAll('.tab-content').forEach((el) => tabObserver.observe(el));
}

// Defer non-critical images
function deferImages() {
    document.querySelectorAll('img[data-src]').forEach((img) => {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
    });
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        observeTabs();
        setTimeout(deferImages, 2000);
    });
} else {
    observeTabs();
    setTimeout(deferImages, 2000);
}

window.FUT_MODULES = FUT_MODULES;
window.markModuleLoaded = markModuleLoaded;
window.preloadModule = preloadModule;
