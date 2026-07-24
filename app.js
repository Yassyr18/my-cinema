// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc, updateDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyBPP2z4q90HhlQBrTLHaxxNnubMy1IrqI4",
    authDomain: "my-cinema-e5a0d.firebaseapp.com",
    projectId: "my-cinema-e5a0d",
    storageBucket: "my-cinema-e5a0d.firebasestorage.app",
    messagingSenderId: "260887036992",
    appId: "1:260887036992:web:5e6412e21622fc254c4ba5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TMDB_API_KEY = '73ae67fa40ec16ffe7a242b6d2a4e1d9';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';

// ===== INLINE PLACEHOLDERS =====
const PLACEHOLDER_POSTER  = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='210'%3E%3Crect width='140' height='210' fill='%23222'/%3E%3Ctext x='70' y='112' text-anchor='middle' fill='%23666' font-size='13' font-family='sans-serif'%3ENo Image%3C/text%3E%3C/svg%3E";
const PLACEHOLDER_THUMB   = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='52' height='78'%3E%3Crect width='52' height='78' fill='%23222'/%3E%3Ctext x='26' y='42' text-anchor='middle' fill='%23666' font-size='10' font-family='sans-serif'%3E?%3C/text%3E%3C/svg%3E";
const PLACEHOLDER_SMALL   = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='66'%3E%3Crect width='44' height='66' fill='%23222'/%3E%3Ctext x='22' y='36' text-anchor='middle' fill='%23666' font-size='10' font-family='sans-serif'%3E?%3C/text%3E%3C/svg%3E";
const PLACEHOLDER_AVATAR  = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Ccircle cx='30' cy='30' r='30' fill='%23222'/%3E%3Ctext x='30' y='34' text-anchor='middle' fill='%23666' font-size='10' font-family='sans-serif'%3E?%3C/text%3E%3C/svg%3E";
const PLACEHOLDER_SIMILAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150'%3E%3Crect width='100' height='150' fill='%23222'/%3E%3Ctext x='50' y='78' text-anchor='middle' fill='%23666' font-size='11' font-family='sans-serif'%3E?%3C/text%3E%3C/svg%3E";

function safePoster(url, type) {
    if (!url || url.includes('placeholder') || url.startsWith('data:')) {
        if (type === 'thumb')   return PLACEHOLDER_THUMB;
        if (type === 'small')   return PLACEHOLDER_SMALL;
        if (type === 'avatar')  return PLACEHOLDER_AVATAR;
        if (type === 'similar') return PLACEHOLDER_SIMILAR;
        return PLACEHOLDER_POSTER;
    }
    return url;
}

let myList = [];
let currentSearchType = 'multi';
let currentSection = 'anime';
let isLoading = false;
let activeDetailTab = 'info-tab';
let expandedSeasons = new Set();
let scrollPosition = 0;

function seasonKey(docId, seasonNum) { return `${docId}_season_${seasonNum}`; }

// ===== PERSISTENT TMDB CACHE =====
let tmdbCache = {};

function loadTmdbCache() {
    try {
        const saved = localStorage.getItem('tmdbCache');
        if (!saved) return;
        const parsed = JSON.parse(saved);
        const sixHours = 6 * 60 * 60 * 1000;
        const now = Date.now();
        Object.keys(parsed).forEach(key => {
            if (now - parsed[key].time < sixHours) tmdbCache[key] = parsed[key];
        });
    } catch(e) { tmdbCache = {}; }
}

function saveTmdbCache() {
    try {
        const keys = Object.keys(tmdbCache);
        if (keys.length > 300) {
            const sorted = keys.sort((a, b) => tmdbCache[b].time - tmdbCache[a].time);
            const keep = {};
            sorted.slice(0, 300).forEach(k => keep[k] = tmdbCache[k]);
            tmdbCache = keep;
        }
        localStorage.setItem('tmdbCache', JSON.stringify(tmdbCache));
    } catch(e) {}
}

async function tmdbFetch(url) {
    if (tmdbCache[url] && Date.now() - tmdbCache[url].time < 3600000) return tmdbCache[url].data;
    const response = await fetch(url);
    const data = await response.json();
    tmdbCache[url] = { data, time: Date.now() };
    if (Object.keys(tmdbCache).length % 15 === 0) saveTmdbCache();
    return data;
}

// ===== MODAL MANAGEMENT =====
const MODAL_IDS = [
    'modal','episode-modal','preview-modal','confirm-dialog',
    'stats-modal','bulk-modal','tag-specials-modal',
    'rate-shows-modal','personal-list-modal'
];

function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    scrollPosition = window.scrollY;
    document.body.classList.add('modal-open');
    document.body.style.top = `-${scrollPosition}px`;
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    const anyOpen = MODAL_IDS.some(mid => {
        const m = document.getElementById(mid);
        return m && m.style.display !== 'none' && m.style.display !== '';
    });
    if (!anyOpen) {
        document.body.classList.remove('modal-open');
        document.body.style.top = '';
        window.scrollTo(0, scrollPosition);
    }
}

function setupModalClosing() {
    MODAL_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const handler = (e) => { if (e.target === el) closeModal(id); };
        el.addEventListener('click', handler);
        el.addEventListener('touchend', (e) => {
            if (e.target === el) { e.preventDefault(); closeModal(id); }
        }, { passive: false });
    });

    document.addEventListener('touchend', (e) => {
        ['tag-specials-modal','rate-shows-modal','personal-list-modal'].forEach(id => {
            const el = document.getElementById(id);
            if (el && e.target === el) closeModal(id);
        });
    }, { passive: false });
}

// ===== APPEARANCE SETTINGS =====
function setupAppearance() {
    const html = document.documentElement;

    // Dark mode — default ON
    const darkSaved = localStorage.getItem('darkMode');
    const isDark = darkSaved === null ? true : darkSaved === 'true';
    html.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const toggle = document.getElementById('dark-mode-toggle');
    if (toggle) {
        toggle.checked = isDark;
        toggle.addEventListener('change', () => {
            html.setAttribute('data-theme', toggle.checked ? 'dark' : 'light');
            localStorage.setItem('darkMode', toggle.checked);
        });
    }

    // Accent color
    const savedAccent = localStorage.getItem('accentColor') || 'blue';
    html.setAttribute('data-accent', savedAccent);
    updateColorPresets('accent-color-presets', savedAccent);

    // Rewatch bar color
    const savedRewatch = localStorage.getItem('rewatchColor') || '#FFC107';
    html.style.setProperty('--rewatch-color', savedRewatch);
    updateColorPresets('rewatch-color-presets', savedRewatch);

    // Card style
    const savedCardStyle = localStorage.getItem('cardStyle') || 'normal';
    html.setAttribute('data-card-style', savedCardStyle);
    updateSegmentedControl('card-style-control', savedCardStyle);

    // Poster size
    const savedPosterSize = localStorage.getItem('posterSize') || 'medium';
    html.setAttribute('data-poster-size', savedPosterSize);
    updateSegmentedControl('poster-size-control', savedPosterSize);

    // Font size
    const savedFontSize = localStorage.getItem('fontSize') || 'normal';
    html.setAttribute('data-font-size', savedFontSize);
    updateSegmentedControl('font-size-control', savedFontSize);
}

function updateColorPresets(containerId, activeValue) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.color-preset').forEach(p => {
        p.classList.toggle('active', p.dataset.color === activeValue);
    });
}

function updateSegmentedControl(controlId, activeValue) {
    const control = document.getElementById(controlId);
    if (!control) return;
    control.querySelectorAll('.segment-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.val === activeValue);
    });
}

function setAccentColor(color) {
    document.documentElement.setAttribute('data-accent', color);
    localStorage.setItem('accentColor', color);
    updateColorPresets('accent-color-presets', color);
}

function setRewatchColor(color) {
    document.documentElement.style.setProperty('--rewatch-color', color);
    localStorage.setItem('rewatchColor', color);
    updateColorPresets('rewatch-color-presets', color);
}

function setCardStyle(style) {
    document.documentElement.setAttribute('data-card-style', style);
    localStorage.setItem('cardStyle', style);
    updateSegmentedControl('card-style-control', style);
}

function setPosterSize(size) {
    document.documentElement.setAttribute('data-poster-size', size);
    localStorage.setItem('posterSize', size);
    updateSegmentedControl('poster-size-control', size);
}

function setFontSize(size) {
    document.documentElement.setAttribute('data-font-size', size);
    localStorage.setItem('fontSize', size);
    updateSegmentedControl('font-size-control', size);
}

// ===== SETTINGS GROUPS TOGGLE =====
function toggleSettingsGroup(header) {
    const content = header.nextElementSibling;
    const arrow   = header.querySelector('.settings-arrow');
    content.classList.toggle('open');
    arrow.classList.toggle('open');
}

function toggleImportSection() {
    const content = document.getElementById('import-content');
    const arrow   = document.getElementById('import-arrow');
    if (!content) return;
    const isOpen = content.style.display !== 'none';
    content.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.textContent = isOpen ? '▶' : '▼';
}

// ===== REFRESH APP =====
async function refreshApp() {
    const btn = document.getElementById('refresh-btn-top');
    if (btn) { btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; }
    await loadMyList();
    if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
}

// ===== PULL TO REFRESH =====
let pullStartY = 0, pulling = false;

function setupPullToRefresh() {
    const container = document.getElementById('main-container');
    const indicator = document.getElementById('pull-refresh-indicator');

    container.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0 && !document.body.classList.contains('modal-open')) {
            pullStartY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!pulling || document.body.classList.contains('modal-open')) return;
        const d = e.touches[0].clientY - pullStartY;
        if (d > 0 && d < 100) indicator.style.top = `${d - 60}px`;
        else if (d >= 100) indicator.classList.add('visible');
    }, { passive: true });

    container.addEventListener('touchend', async () => {
        if (!pulling) return;
        pulling = false;
        if (indicator.classList.contains('visible')) {
            indicator.querySelector('span').textContent = 'Refreshing...';
            await loadMyList();
            setTimeout(() => {
                indicator.classList.remove('visible');
                indicator.style.top = '-60px';
                indicator.querySelector('span').textContent = 'Release to refresh...';
            }, 800);
        } else {
            indicator.style.top = '-60px';
        }
    });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    loadTmdbCache();
    setupAppearance();
    setupBottomNav();
    setupSearch();
    setupSubTabSwipe();
    setupPullToRefresh();
    setupModalClosing();
    await loadMyList();
    setupRealtimeListeners();
    setupAutoSync();
    setupUpcomingAutoRefresh();
});

// ===== REALTIME =====
function setupRealtimeListeners() {
    let debounceTimer;
    const debouncedLoad = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { if (!isLoading) loadMyList(); }, 5000);
    };
    onSnapshot(collection(db, 'movies'), debouncedLoad);
    onSnapshot(collection(db, 'series'), debouncedLoad);
}

// ===== AUTO SYNC =====
function setupAutoSync() {
    const lastSync = localStorage.getItem('lastEpisodeSync');
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    if (!lastSync || now - parseInt(lastSync) > twentyFourHours) {
        setTimeout(() => syncAllAiringShows(true), 8000);
    }
    setInterval(() => {
        const last = localStorage.getItem('lastEpisodeSync');
        if (!last || Date.now() - parseInt(last) > twentyFourHours) {
            syncAllAiringShows(true);
        }
    }, 3600000);
}

// ===== UPCOMING AUTO REFRESH =====
function setupUpcomingAutoRefresh() {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.subtab;
            if (tabId === 'anime-upcoming' || tabId === 'tv-upcoming') {
                const section = tabId.includes('anime') ? 'anime' : 'tv';
                const cacheKey = `upcomingCache_${section}`;
                const cacheTime = localStorage.getItem(`${cacheKey}_time`);
                const twentyFourHours = 24 * 60 * 60 * 1000;
                if (!cacheTime || Date.now() - parseInt(cacheTime) > twentyFourHours) {
                    loadSectionCalendar(section);
                } else {
                    const cached = localStorage.getItem(cacheKey);
                    if (cached) {
                        try { displayCalendarFromCache(section, JSON.parse(cached)); }
                        catch(e) { loadSectionCalendar(section); }
                    } else { loadSectionCalendar(section); }
                }
            }
        });
    });
}

// ===== INCREMENTAL TIMESTAMPS =====
function generateIncrementalTimestamps(count, isAnime) {
    const now = new Date();
    const gapMinutes = isAnime ? 24 : 45;
    const timestamps = [];
    for (let i = 0; i < count; i++) {
        const t = new Date(now.getTime() - (count - 1 - i) * gapMinutes * 60000);
        timestamps.push(t.toISOString());
    }
    return timestamps;
}

// ===== ENRICH LIBRARY =====
async function enrichLibrary() {
    const statusEl = document.getElementById('settings-action-status');
    const needsEnrichment = myList.filter(i => !i.genres || i.genres.length === 0 || !i.year);
    if (needsEnrichment.length === 0) {
        statusEl.innerHTML = `<p style="color:var(--green);">✓ All shows up to date! (0 new)</p>`;
        return;
    }
    statusEl.innerHTML = `<p style="color:var(--accent);">Enriching ${needsEnrichment.length} shows...</p>`;
    let done = 0, failed = 0;
    for (const item of needsEnrichment) {
        if (!item.tmdb_id) { failed++; continue; }
        try {
            statusEl.innerHTML = `<p style="color:var(--accent);">Enriching ${done+1}/${needsEnrichment.length}: ${item.title}</p>`;
            const endpoint = item.type === 'movie' ? 'movie' : 'tv';
            const det = await tmdbFetch(`${TMDB_BASE_URL}/${endpoint}/${item.tmdb_id}?api_key=${TMDB_API_KEY}`);
            const enrichData = {};
            if (!item.genres || item.genres.length === 0) {
                enrichData.genres            = (det.genres||[]).map(g => g.name);
                enrichData.original_language = det.original_language || null;
                enrichData.origin_country    = (det.origin_country || det.production_countries?.map(c=>c.iso_3166_1) || []);
                enrichData.popularity        = det.popularity || null;
                enrichData.tmdb_rating       = det.vote_average || item.tmdb_rating || null;
                enrichData.networks = item.type === 'tv'
                    ? (det.networks||[]).map(n => n.name)
                    : (det.production_companies||[]).map(n => n.name);
            }
            if (!item.year) {
                const dateStr = item.type === 'tv' ? det.first_air_date : det.release_date;
                if (dateStr) enrichData.year = parseInt(dateStr.substring(0, 4));
            }
            if (Object.keys(enrichData).length > 0) {
                const col = item.type === 'movie' ? 'movies' : 'series';
                await updateDoc(doc(db, col, item.docId), enrichData);
                Object.assign(item, enrichData);
            }
            done++;
            await new Promise(r => setTimeout(r, 250));
        } catch(e) { failed++; }
    }
    saveTmdbCache();
    statusEl.innerHTML = `<p style="color:var(--green);">✓ Done! ${done} enriched${failed>0?`, ${failed} failed`:''}.</p>`;
    await loadMyList();
}

// ===== SYNC ALL AIRING SHOWS =====
async function syncAllAiringShows(silent = false) {
    const statusEl = document.getElementById('settings-action-status');
    const shows = myList.filter(i =>
        i.type === 'tv' && i.tmdb_id &&
        ['Returning Series', 'In Production'].includes(i.tmdb_status)
    );
    if (!silent && statusEl)
        statusEl.innerHTML = `<p style="color:var(--accent);">Syncing ${shows.length} airing shows...</p>`;

    let updated = 0;
    for (let i = 0; i < shows.length; i++) {
        const show = shows[i];
        try {
            if (!silent && statusEl)
                statusEl.innerHTML = `<p style="color:var(--accent);">Syncing ${i+1}/${shows.length}: ${show.title}</p>`;
            const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);
            const newSeasons = [];
            for (let s = 0; s <= det.number_of_seasons; s++) {
                try {
                    const sd = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}/season/${s}?api_key=${TMDB_API_KEY}`);
                    if (!sd.episodes?.length) continue;
                    const existingSeason = show.seasons?.find(es => es.number === s);
                    const tmdbEpMap = {};
                    sd.episodes.forEach(ep => { tmdbEpMap[ep.episode_number] = ep.name; });
                    const episodes = sd.episodes.map(ep => {
                        const existing = findExistingEpisode(existingSeason, ep.episode_number, ep.name, s === 0);
                        return {
                            number: ep.episode_number, name: ep.name || `Episode ${ep.episode_number}`,
                            air_date: ep.air_date || null,
                            is_watched: existing?.is_watched || false, watched_at: existing?.watched_at || null,
                            rewatch_count: existing?.rewatch_count || 0, rewatch_history: existing?.rewatch_history || [],
                            is_special: existing?.is_special || (s === 0), my_rating: existing?.my_rating || null
                        };
                    });
                    const fixed = s === 0 ? episodes : detectImposters(episodes, tmdbEpMap, existingSeason);
                    newSeasons.push({ number: s, is_specials: s === 0, episodes: fixed });
                } catch(e) {}
            }
            if (newSeasons.length > 0) {
                await updateDoc(doc(db, 'series', show.docId), {
                    seasons: newSeasons, tmdb_status: det.status || show.tmdb_status,
                    last_synced: new Date().toISOString()
                });
                show.seasons = newSeasons;
                show.tmdb_status = det.status || show.tmdb_status;
                updated++;
            }
            await new Promise(r => setTimeout(r, 400));
        } catch(e) { console.error(`Sync failed for ${show.title}:`, e); }
    }
    localStorage.setItem('lastEpisodeSync', Date.now().toString());
    saveTmdbCache();
    if (!silent && statusEl)
        statusEl.innerHTML = `<p style="color:var(--green);">✓ Synced ${updated} shows!</p>`;
    if (updated > 0) await loadMyList();
}

function findExistingEpisode(existingSeason, epNumber, tmdbName, isSeasonZero) {
    if (!existingSeason) return null;
    const eps = existingSeason.episodes || [];
    if (isSeasonZero) return eps.find(e => e.number === epNumber) || null;
    return eps.find(e => e.number === epNumber && !e.is_special)
        || eps.find(e => e.number === epNumber) || null;
}

function detectImposters(episodes, tmdbEpMap, existingSeason) {
    const byNumber = {};
    episodes.forEach((ep, idx) => {
        if (!byNumber[ep.number]) byNumber[ep.number] = [];
        byNumber[ep.number].push({ ep, idx });
    });
    const result = [...episodes];
    Object.entries(byNumber).forEach(([numStr, group]) => {
        if (group.length < 2) return;
        const officialTitle = tmdbEpMap[parseInt(numStr)] || '';
        let bestMatch = -1, bestScore = -1;
        group.forEach(({ ep, idx }) => {
            const score = titleSimilarity(ep.name || '', officialTitle);
            if (score > bestScore) { bestScore = score; bestMatch = idx; }
        });
        group.forEach(({ ep, idx }) => {
            if (idx !== bestMatch) {
                const existingEp = existingSeason?.episodes?.find(e => e.number === ep.number && e.name === ep.name);
                result[idx] = { ...result[idx], is_special: true,
                    ...(existingEp ? {
                        is_watched: existingEp.is_watched, watched_at: existingEp.watched_at,
                        rewatch_count: existingEp.rewatch_count || 0, rewatch_history: existingEp.rewatch_history || [],
                        my_rating: existingEp.my_rating || null
                    } : {})
                };
            }
        });
    });
    return result;
}

function titleSimilarity(a, b) {
    if (!a || !b) return 0;
    const wa = a.toLowerCase().split(/\s+/);
    const wb = new Set(b.toLowerCase().split(/\s+/));
    return wa.filter(w => wb.has(w)).length / Math.max(wa.length, wb.size);
}

function titlesMatch(a, b) { return titleSimilarity(a, b) > 0.5; }

// ===== TASTE PROFILE =====
function buildTasteProfile(items) {
    const profile = { genres: {}, networks: {}, languages: {}, totalRated: 0, avgRating: 0 };
    let totalScore = 0;
    items.forEach(item => {
        const rating = item.my_rating;
        if (!rating || rating < 1) return;
        profile.totalRated++;
        totalScore += rating;
        const weight = rating / 10;
        (item.genres || []).forEach(g => {
            if (g === 'Animation' && item.is_anime) return;
            profile.genres[g] = (profile.genres[g] || 0) + weight;
        });
        (item.networks || []).slice(0, 1).forEach(n => {
            profile.networks[n] = (profile.networks[n] || 0) + weight;
        });
        if (item.original_language)
            profile.languages[item.original_language] = (profile.languages[item.original_language] || 0) + weight;
    });
    profile.avgRating = profile.totalRated > 0 ? totalScore / profile.totalRated : 5;
    return profile;
}

function calculateMatchScore(showDetails, profile) {
    if (profile.totalRated < 3) return null;
    let score = 0, maxScore = 0;
    const showGenres = (showDetails.genres || []).map(g => typeof g === 'object' ? g.name : g);
    if (showGenres.length > 0) {
        maxScore += 60;
        const topGenres = Object.entries(profile.genres).sort((a,b) => b[1]-a[1]).slice(0, 8);
        const topGenreNames = new Set(topGenres.map(([g]) => g));
        score += (showGenres.filter(g => topGenreNames.has(g)).length / Math.max(showGenres.length, 1)) * 60;
    }
    if (showDetails.original_language && Object.keys(profile.languages).length) {
        maxScore += 20;
        const topLang = Object.entries(profile.languages).sort((a,b) => b[1]-a[1])[0]?.[0];
        if (showDetails.original_language === topLang) score += 20;
        else if (profile.languages[showDetails.original_language]) score += 10;
    }
    if (showDetails.vote_average) {
        maxScore += 20;
        score += Math.max(0, 20 - Math.abs(showDetails.vote_average - profile.avgRating) * 4);
    }
    return maxScore > 0 ? Math.round((score / maxScore) * 100) : null;
}

// ===== BOTTOM NAV =====
function setupBottomNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchSection(btn.dataset.section));
    });
}

function switchSection(section) {
    currentSection = section;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.nav-btn[data-section="${section}"]`)?.classList.add('active');
    document.querySelectorAll('.section-page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${section}`)?.classList.add('active');
    if (section === 'profile') updateProfilePage();
    window.scrollTo(0, 0);
}

// ===== SUB TABS =====
function switchSubTab(tabId) {
    const tabEl = document.getElementById(tabId);
    if (!tabEl) return;
    const page = tabEl.closest('.section-page');
    if (!page) return;
    page.querySelectorAll('.sub-tab-content').forEach(t => t.classList.remove('active'));
    page.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    tabEl.classList.add('active');
    page.querySelector(`.sub-tab-btn[data-subtab="${tabId}"]`)?.classList.add('active');
}

document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSubTab(btn.dataset.subtab));
});

function setupSubTabSwipe() {
    document.querySelectorAll('.swipeable-tabs').forEach(container => {
        let startX = 0;
        container.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
        container.addEventListener('touchend', (e) => {
            const diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) < 60) return;
            const page = container.closest('.section-page');
            const tabs = page.querySelectorAll('.sub-tab-btn');
            const activeTab = page.querySelector('.sub-tab-btn.active');
            const currentIdx = parseInt(activeTab?.dataset.index || '0');
            let newIdx;
            if (diff > 0) newIdx = Math.min(currentIdx + 1, tabs.length - 1);
            else newIdx = Math.max(currentIdx - 1, 0);
            if (newIdx !== currentIdx) switchSubTab(tabs[newIdx].dataset.subtab);
        });
    });
}

// ===== SEARCH =====
function setupSearch() {
    const topInput     = document.getElementById('search-input');
    const overlayInput = document.getElementById('search-overlay-input');
    const btn          = document.getElementById('search-btn');
    const closeBtn     = document.getElementById('close-search-btn');
    const clearBtn     = document.getElementById('search-clear-btn');

    topInput.addEventListener('focus', (e) => { e.preventDefault(); showSearchOverlay(); });
    topInput.addEventListener('click', (e) => { e.preventDefault(); showSearchOverlay(); });
    btn.addEventListener('click', () => {
        showSearchOverlay();
        overlayInput.value = topInput.value;
        if (overlayInput.value.trim()) performSearch();
    });
    closeBtn.addEventListener('click', hideSearchOverlay);
    overlayInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
    overlayInput.addEventListener('input', () => {
        clearBtn.style.display = overlayInput.value ? 'block' : 'none';
    });
    clearBtn.addEventListener('click', () => {
        overlayInput.value = '';
        clearBtn.style.display = 'none';
        document.getElementById('search-results').innerHTML = '';
        overlayInput.focus();
    });
    document.querySelectorAll('.search-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSearchType = btn.dataset.type === 'anime' ? 'tv' : btn.dataset.type;
            if (overlayInput.value.trim()) performSearch();
        });
    });
}

function showSearchOverlay() {
    document.getElementById('search-overlay').style.display = 'block';
    setTimeout(() => document.getElementById('search-overlay-input').focus(), 100);
}

function hideSearchOverlay() {
    document.getElementById('search-overlay').style.display = 'none';
    document.getElementById('search-input').blur();
}

async function performSearch() {
    const query = document.getElementById('search-overlay-input').value.trim();
    if (!query) return;
    const container = document.getElementById('search-results');
    container.innerHTML = '<p class="empty-state">Searching...</p>';
    try {
        const type = currentSearchType === 'multi' ? 'multi' : currentSearchType;
        const data = await tmdbFetch(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
        let results = data.results || [];
        const isAnimeFilter = document.querySelector('.search-filter-btn.active')?.dataset.type === 'anime';
        if (isAnimeFilter) results = results.filter(r => r.media_type === 'tv' || currentSearchType === 'tv');
        displaySearchResults(results);
    } catch(e) { container.innerHTML = '<p class="empty-state">Search failed.</p>'; }
}

function displaySearchResults(results) {
    const container = document.getElementById('search-results');
    if (!results.length) { container.innerHTML = '<p class="empty-state">No results.</p>'; return; }
    container.innerHTML = results.map(item => {
        const title  = item.title || item.name || 'Unknown';
        const year   = (item.release_date || item.first_air_date || '').substring(0, 4);
        const type   = item.media_type || currentSearchType;
        if (type === 'person') return '';
        const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : PLACEHOLDER_POSTER;
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const isInList     = myList.some(li => li.tmdb_id === item.id);
        const safeTitle     = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safePosterUrl = poster.replace(/'/g, "\\'");
        return `
            <div class="media-card" onclick="openPreview(${item.id},'${type}','${safeTitle}','${year}','${safePosterUrl}')">
                <img src="${poster}" alt="${title}" onerror="this.src='${PLACEHOLDER_POSTER}'">
                <div class="info"><h3>${title}</h3><p class="year">${year} · ⭐${rating}</p></div>
                <button class="add-btn ${isInList ? 'in-list-btn' : ''}"
                    onclick="event.stopPropagation(); ${isInList
                        ? `removeFromListByTMDB(${item.id},'${type}')`
                        : `addToList(${item.id},'${type}','${safeTitle}','${year}','${safePosterUrl}')`}">
                    ${isInList ? '✓ In Library' : '+ Add'}
                </button>
            </div>`;
    }).filter(Boolean).join('');
}

// ===== LOAD MY LIST =====
async function loadMyList() {
    if (isLoading) return;
    isLoading = true;
    try {
        myList = [];
        const [moviesSnap, seriesSnap] = await Promise.all([
            getDocs(collection(db, 'movies')),
            getDocs(collection(db, 'series'))
        ]);
        moviesSnap.forEach(d => myList.push({ ...d.data(), docId: d.id, type: 'movie' }));
        seriesSnap.forEach(d => myList.push({ ...d.data(), docId: d.id, type: 'tv' }));
        myList.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        autoTagStatusesSilent();
        renderAllSections();
        updateProfilePage();
    } catch(e) { console.error('Load error:', e); }
    isLoading = false;
}

// ===== HELPERS =====
function getAnime()   { return myList.filter(i => i.type === 'tv' && i.is_anime); }
function getTVShows() { return myList.filter(i => i.type === 'tv' && !i.is_anime); }
function getMovies()  { return myList.filter(i => i.type === 'movie'); }

function getAiredEpisodesOnly(seasons) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const aired = [];
    (seasons || []).forEach(s => {
        if (s.number === 0) return;
        (s.episodes || []).forEach(ep => {
            if (ep.is_special) return;
            const airDate = ep.air_date ? new Date(ep.air_date) : null;
            if (!airDate || airDate <= today) aired.push({ ...ep, seasonNum: s.number });
        });
    });
    return aired;
}

function getShowProgressExcludingSpecials(show) {
    const aired = getAiredEpisodesOnly(show.seasons);
    if (!aired.length) return 0;
    return (aired.filter(ep => ep.is_watched).length / aired.length) * 100;
}

function getReWatchProgress(show) {
    const aired = getAiredEpisodesOnly(show.seasons);
    if (!aired.length) return 0;
    const maxRewatch = Math.max(...aired.map(ep => ep.rewatch_count || 0));
    if (maxRewatch === 0) return 0;
    return (aired.filter(ep => (ep.rewatch_count || 0) >= maxRewatch).length / aired.length) * 100;
}

function getNextEpisodeExcludingSpecials(show) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (!show.seasons) return null;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special) continue;
            const airDate = ep.air_date ? new Date(ep.air_date) : null;
            if (airDate && airDate > today) continue;
            if (!ep.is_watched) return { season: s.number, number: ep.number, name: ep.name || `Episode ${ep.number}` };
        }
    }
    return null;
}

function getNextReWatchEpisode(show) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (!show.seasons) return null;
    const aired = getAiredEpisodesOnly(show.seasons);
    const maxRewatch = Math.max(...aired.map(ep => ep.rewatch_count || 0), 0);
    const targetCount = maxRewatch === 0 ? 1 : maxRewatch;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special) continue;
            const airDate = ep.air_date ? new Date(ep.air_date) : null;
            if (airDate && airDate > today) continue;
            if ((ep.rewatch_count || 0) < targetCount) return { season: s.number, number: ep.number, name: ep.name || `Episode ${ep.number}` };
        }
    }
    return null;
}

function getRemainingEpisodes(show) {
    return getAiredEpisodesOnly(show.seasons).filter(ep => !ep.is_watched).length;
}

function getLastWatchedDate(show) {
    let last = null;
    show.seasons?.forEach(s => s.episodes?.forEach(ep => {
        if (ep.is_watched && ep.watched_at) {
            if (!last || new Date(ep.watched_at) > new Date(last)) last = ep.watched_at;
        }
    }));
    return last || show.created_at || '2000-01-01';
}

function isCurrentlyAiring(show) {
    if (!['Returning Series', 'In Production'].includes(show.tmdb_status)) return false;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7*24*60*60*1000);
    const oneWeekAhead = new Date(now.getTime() + 7*24*60*60*1000);
    for (const s of (show.seasons || [])) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (!ep.air_date || ep.is_special) continue;
            const airDate = new Date(ep.air_date);
            if (airDate >= sevenDaysAgo && airDate <= oneWeekAhead) return true;
        }
    }
    return false;
}

function getMostRecentAirDate(show) {
    const today = new Date();
    let mostRecent = null;
    (show.seasons || []).forEach(s => {
        if (s.number === 0) return;
        (s.episodes || []).forEach(ep => {
            if (!ep.air_date || ep.is_special) return;
            const d = new Date(ep.air_date);
            if (d <= today && (!mostRecent || d > mostRecent)) mostRecent = d;
        });
    });
    return mostRecent;
}

function getAllWatchedEpisodes(shows) {
    const eps = [];
    shows.forEach(show => {
        show.seasons?.forEach(s => {
            if (s.number === 0) return;
            s.episodes?.forEach(ep => {
                if (ep.is_watched && ep.watched_at) {
                    eps.push({
                        show: show.title, poster: show.poster, docId: show.docId,
                        season: s.number, episode: ep.number, name: ep.name,
                        watched_at: ep.watched_at, is_special: ep.is_special || false
                    });
                }
            });
        });
    });
    eps.sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));
    return eps;
}

function getPreviousUnwatchedEpisodes(show, targetSeason, targetEp) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const unwatched = [];
    if (!show.seasons) return unwatched;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        if (s.number > targetSeason) break;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special) continue;
            if (s.number === targetSeason && ep.number >= targetEp) break;
            const airDate = ep.air_date ? new Date(ep.air_date) : null;
            if (airDate && airDate > today) continue;
            if (!ep.is_watched) unwatched.push({ seasonNum: s.number, episodeNum: ep.number });
        }
    }
    return unwatched;
}

function getEpisodesNeedingRewatch(show, targetSeason, targetEp) {
    const needsRewatch = [];
    if (!show.seasons) return needsRewatch;
    const targetSe = show.seasons.find(s => s.number === targetSeason);
    const targetE  = targetSe?.episodes?.find(e => e.number === targetEp && !e.is_special);
    const targetRewatchCount = (targetE?.rewatch_count || 0) + 1;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        if (s.number > targetSeason) break;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special) continue;
            if (s.number === targetSeason && ep.number >= targetEp) break;
            if (!ep.is_watched) continue;
            if ((ep.rewatch_count || 0) < targetRewatchCount)
                needsRewatch.push({ seasonNum: s.number, episodeNum: ep.number });
        }
    }
    return needsRewatch;
}

function isAnimeShow(details) {
    const genres = details.genres || [];
    const isAnimation = genres.some(g => g.id === 16);
    const isJapanese  = details.original_language === 'ja';
    const isChinese   = details.original_language === 'zh';
    const animeNets   = ['Fuji TV','Tokyo MX','TBS','TV Tokyo','Crunchyroll','AT-X','BS11','MBS','NHK','Bilibili'];
    return (isAnimation && (isJapanese || isChinese)) || (details.networks || []).some(n => animeNets.includes(n.name));
}

function formatWatchTime(totalMinutes) {
    const years  = Math.floor(totalMinutes / 525600);
    const months = Math.floor((totalMinutes % 525600) / 43800);
    const days   = Math.floor((totalMinutes % 43800) / 1440);
    const hours  = Math.floor((totalMinutes % 1440) / 60);
    let parts = [];
    if (years  > 0) parts.push(`${years}y`);
    if (months > 0) parts.push(`${months}m`);
    if (days   > 0) parts.push(`${days}d`);
    parts.push(`${hours}h`);
    return parts.join(' ');
}

function getTimelineLabel(dateStr) {
    const date = new Date(dateStr);
    const now  = new Date();
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo   = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    if (date >= today)       return 'Today';
    if (date >= weekAgo)     return 'This Week';
    if (date >= twoWeeksAgo) return 'Last Week';
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function autoTagStatusesSilent() {
    myList.forEach(item => {
        if (item.type !== 'tv') return;
        if (item.user_status === 'Rewatching') return;
        const progress   = getShowProgressExcludingSpecials(item);
        const hasWatched = item.seasons?.some(s => s.number !== 0 && s.episodes?.some(e => e.is_watched && !e.is_special));
        const tmdb = item.tmdb_status || '';
        let newStatus = item.user_status;
        if (!hasWatched && !['Dropped','Paused'].includes(item.user_status)) newStatus = 'Planned';
        else if (progress >= 100 && (tmdb === 'Ended' || tmdb === 'Canceled')) newStatus = 'Finished';
        else if (progress >= 100 && tmdb === 'Returning Series') newStatus = 'Up to Date';
        else if (hasWatched && progress < 100 && !['Dropped','Paused','Finished'].includes(item.user_status)) newStatus = 'Watching';
        if (newStatus !== item.user_status) {
            item.user_status = newStatus;
            updateDoc(doc(db, 'series', item.docId), { user_status: newStatus }).catch(() => {});
        }
    });
}

function renderAllSections() {
    renderContinueWatching('anime');
    renderContinueWatching('tv');
    renderHistory('anime');
    renderHistory('tv');
    renderMoviesSection();
    renderLibrary('anime');
    renderLibrary('tv');
    renderLibrary('movies');
}
// ===== SECTION JUMP PILLS =====
function renderJumpPills(sectionType, sections) {
    const container = document.getElementById(`${sectionType}-jump-pills`);
    if (!container) return;

    const activeSections = sections.filter(s => s.count > 0);
    if (activeSections.length <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="section-jump-pills">
            ${activeSections.map(s => `
                <button class="section-pill" data-target="${s.id}"
                        onclick="jumpToSection('${sectionType}','${s.id}')">
                    ${s.icon} ${s.label} (${s.count})
                </button>
            `).join('')}
        </div>
    `;

    // Set up scroll spy to highlight active pill
    setupScrollSpy(sectionType, activeSections);
}

function jumpToSection(sectionType, targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;

    const topBarHeight = document.querySelector('.top-bar')?.offsetHeight || 60;
    const subTabHeight = document.querySelector(`#${sectionType}-sub-tabs, .section-sub-tabs`)?.offsetHeight || 40;
    const pillsHeight  = document.querySelector(`#${sectionType}-jump-pills .section-jump-pills`)?.offsetHeight || 40;
    const offset = topBarHeight + subTabHeight + pillsHeight + 10;

    window.scrollTo({
        top: el.offsetTop - offset,
        behavior: 'smooth'
    });

    // Highlight the active pill
    document.querySelectorAll(`#${sectionType}-jump-pills .section-pill`).forEach(p => {
        p.classList.toggle('active', p.dataset.target === targetId);
    });
}

function setupScrollSpy(sectionType, sections) {
    // Debounced scroll listener to update active pill
    let scrollTimer;
    const handler = () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const topBarHeight = document.querySelector('.top-bar')?.offsetHeight || 60;
            const subTabHeight = 50;
            const offset = topBarHeight + subTabHeight + 60;
            const scrollY = window.scrollY + offset;

            let activeId = sections[0]?.id;
            sections.forEach(s => {
                const el = document.getElementById(s.id);
                if (el && el.offsetTop <= scrollY) activeId = s.id;
            });

            document.querySelectorAll(`#${sectionType}-jump-pills .section-pill`).forEach(p => {
                p.classList.toggle('active', p.dataset.target === activeId);
            });
        }, 100);
    };

    window.addEventListener('scroll', handler, { passive: true });
}

// ===== CONTINUE WATCHING — 6 SECTIONS =====
function renderContinueWatching(sectionType) {
    const isAnime   = sectionType === 'anime';
    const container = document.getElementById(`${sectionType}-continue-list`);
    if (!container) return;

    const shows = isAnime ? getAnime() : getTVShows();
    const sixtyDaysAgo = new Date(Date.now() - 60*24*60*60*1000);

    const rewatching = shows.filter(s => s.user_status === 'Rewatching');

    const inProgress = shows.filter(item => {
        if (item.user_status === 'Rewatching') return false;
        if (item.user_status === 'Dropped') return false;
        if (item.user_status === 'Planned') return false;
        let hasWatched = false, hasUnwatched = false;
        const today = new Date(); today.setHours(23, 59, 59, 999);
        item.seasons?.forEach(s => {
            if (s.number === 0) return;
            s.episodes?.forEach(ep => {
                if (ep.is_special) return;
                const airDate = ep.air_date ? new Date(ep.air_date) : null;
                if (airDate && airDate > today) return;
                if (ep.is_watched) hasWatched = true;
                else hasUnwatched = true;
            });
        });
        return hasWatched && hasUnwatched;
    });

    const notStarted = shows.filter(item => {
        if (item.user_status !== 'Planned') return false;
        return !item.seasons?.some(s =>
            s.number !== 0 && s.episodes?.some(e => e.is_watched && !e.is_special)
        );
    });

    const currentlyAiring    = inProgress.filter(s => s.user_status !== 'Paused' && isCurrentlyAiring(s));
    const continueWatching   = inProgress.filter(s => {
        if (s.user_status === 'Paused' || isCurrentlyAiring(s)) return false;
        return new Date(getLastWatchedDate(s)) >= sixtyDaysAgo;
    });
    const notWatchedInAWhile = inProgress.filter(s => {
        if (s.user_status === 'Paused' || isCurrentlyAiring(s)) return false;
        return new Date(getLastWatchedDate(s)) < sixtyDaysAgo;
    });
    const paused = inProgress.filter(s => s.user_status === 'Paused');

    currentlyAiring.sort((a,b)    => { const aD=getMostRecentAirDate(a),bD=getMostRecentAirDate(b); return (bD||0)-(aD||0); });
    continueWatching.sort((a,b)   => new Date(getLastWatchedDate(b))-new Date(getLastWatchedDate(a)));
    rewatching.sort((a,b)         => new Date(getLastWatchedDate(b))-new Date(getLastWatchedDate(a)));
    notWatchedInAWhile.sort((a,b) => new Date(getLastWatchedDate(b))-new Date(getLastWatchedDate(a)));
    notStarted.sort((a,b)         => new Date(b.created_at||0)-new Date(a.created_at||0));
    paused.sort((a,b)             => new Date(getLastWatchedDate(b))-new Date(getLastWatchedDate(a)));

    // Build section IDs for jump pills
    const sectionDefs = [
        { id: `${sectionType}-sec-airing`,    icon: '📡', label: 'Airing',    count: currentlyAiring.length },
        { id: `${sectionType}-sec-continue`,  icon: '▶',  label: 'Continue',  count: continueWatching.length },
        { id: `${sectionType}-sec-rewatch`,   icon: '↺',  label: 'Rewatch',   count: rewatching.length },
        { id: `${sectionType}-sec-stale`,     icon: '💤', label: 'Stale',     count: notWatchedInAWhile.length },
        { id: `${sectionType}-sec-notstarted`,icon: '📋', label: 'New',       count: notStarted.length },
        { id: `${sectionType}-sec-paused`,    icon: '⏸',  label: 'Paused',    count: paused.length }
    ];

    // Render jump pills
    renderJumpPills(sectionType, sectionDefs);

    let html = '';

    if (currentlyAiring.length) {
        html += `<div class="continue-section-label" id="${sectionType}-sec-airing">📡 Currently Airing</div>`;
        html += currentlyAiring.map(s => createContinueCard(s)).join('');
    }
    if (continueWatching.length) {
        html += `<div class="continue-section-label" id="${sectionType}-sec-continue">▶ Continue Watching</div>`;
        html += continueWatching.map(s => createContinueCard(s)).join('');
    }
    if (rewatching.length) {
        html += `<div class="continue-section-label" id="${sectionType}-sec-rewatch">↺ Rewatching</div>`;
        html += rewatching.map(s => createContinueCard(s, false, true)).join('');
    }
    if (notWatchedInAWhile.length) {
        html += `<div class="continue-section-label" id="${sectionType}-sec-stale">💤 Haven't Watched in a While</div>`;
        html += notWatchedInAWhile.map(s => createContinueCard(s)).join('');
    }
    if (notStarted.length) {
        html += `<div class="continue-section-label" id="${sectionType}-sec-notstarted">📋 Haven't Started</div>`;
        html += notStarted.map(s => createContinueCard(s)).join('');
    }
    if (paused.length) {
        html += `<div class="continue-section-label" id="${sectionType}-sec-paused">⏸ Paused</div>`;
        html += paused.map(s => createContinueCard(s, true)).join('');
    }
    if (!html) html = '<p class="empty-state">No shows in progress!</p>';
    container.innerHTML = html;
}

function createContinueCard(show, forcefade = false, isRewatching = false) {
    const isRewatchMode = isRewatching || show.user_status === 'Rewatching';
    const nextEp   = isRewatchMode ? getNextReWatchEpisode(show) : getNextEpisodeExcludingSpecials(show);
    const progress = isRewatchMode ? getReWatchProgress(show) : getShowProgressExcludingSpecials(show);
    const remaining = isRewatchMode ? null : getRemainingEpisodes(show);
    const safeDocId = show.docId.replace(/'/g, "\\'");
    const poster    = safePoster(show.poster, 'thumb');
    const epCode    = nextEp
        ? `S${String(nextEp.season).padStart(2,'0')}E${String(nextEp.number).padStart(2,'0')}`
        : isRewatchMode ? 'Rewatch complete' : 'Up to date';
    const isPaused = show.user_status === 'Paused';
    const airing   = isCurrentlyAiring(show);

    let progressBarHTML;
    if (isRewatchMode) {
        progressBarHTML = `
            <div class="continue-progress rewatch-bar">
                <div class="continue-progress-fill" style="width:${progress}%;"></div>
            </div>`;
    } else {
        progressBarHTML = `
            <div class="continue-progress">
                <div class="continue-progress-fill ${progress >= 100 ? 'uptodate' : 'watching'}"
                     style="width:${progress}%;"></div>
            </div>`;
    }

    const remainingHTML = (remaining !== null && remaining > 0)
        ? `<span class="eps-remaining">· +${remaining}</span>` : '';

    return `
        <div class="continue-card ${(isPaused || forcefade) ? 'paused-card' : ''}">
            <img src="${poster}" alt="${show.title}"
                 onerror="this.src='${PLACEHOLDER_THUMB}'"
                 onclick="openDetails('${safeDocId}','tv')">
            <div class="continue-info">
                <h3 onclick="openDetails('${safeDocId}','tv')">${show.title}</h3>
                <div class="episode-code">
                    ${isPaused?'⏸ ':''}${airing?'🟢 ':''}${isRewatchMode?'↺ ':''}${epCode}${remainingHTML}
                </div>
                ${nextEp ? `<div class="episode-name">${nextEp.name}</div>` : ''}
                ${progressBarHTML}
            </div>
            ${nextEp && !isPaused
                ? `<button class="quick-check-btn" onclick="quickMarkWatched('${safeDocId}',${nextEp.season},${nextEp.number},${isRewatchMode})">✓</button>`
                : '<div style="width:40px;"></div>'}
        </div>
    `;
}

// ===== HISTORY =====
function renderHistory(sectionType) {
    const container = document.getElementById(`${sectionType}-history-list`);
    if (!container) return;
    const shows  = sectionType === 'anime' ? getAnime() : getTVShows();
    const allEps = getAllWatchedEpisodes(shows);
    if (!allEps.length) { container.innerHTML = '<p class="empty-state">No watch history yet.</p>'; return; }

    const groups = {};
    allEps.forEach(ep => {
        const label = getTimelineLabel(ep.watched_at);
        if (!groups[label]) groups[label] = [];
        groups[label].push(ep);
    });

    let html = '';
    Object.entries(groups).forEach(([label, eps]) => {
        html += `<div class="history-timeline-label">${label}</div>`;
        html += eps.map(ep => {
            const poster    = safePoster(ep.poster, 'small');
            const safeDocId = ep.docId.replace(/'/g, "\\'");
            const epCode    = ep.is_special ? 'Special'
                : `S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')}`;
            return `
                <div class="history-card">
                    <img src="${poster}" onerror="this.src='${PLACEHOLDER_SMALL}'"
                         onclick="openDetails('${safeDocId}','tv')">
                    <div class="history-info">
                        <h4 onclick="openDetails('${safeDocId}','tv')">${ep.show}</h4>
                        <div class="history-ep">${epCode} - ${ep.name||'Episode'}</div>
                        <div class="history-date">${new Date(ep.watched_at).toLocaleDateString()}</div>
                    </div>
                </div>`;
        }).join('');
    });
    container.innerHTML = html;
}

// ===== MOVIES / LIBRARY / CARDS =====
function renderMoviesSection() {
    const movies    = getMovies();
    const watchedEl   = document.getElementById('movies-watched-list');
    const unwatchedEl = document.getElementById('movies-unwatched-list');
    const watched   = movies.filter(m => m.is_watched);
    const unwatched = movies.filter(m => !m.is_watched);
    if (watchedEl)   watchedEl.innerHTML   = watched.length   ? watched.map(m=>createMediaCard(m)).join('')   : '<p class="empty-state">No watched movies.</p>';
    if (unwatchedEl) unwatchedEl.innerHTML = unwatched.length ? unwatched.map(m=>createMediaCard(m)).join('') : '<p class="empty-state">No unwatched movies.</p>';
}

function renderLibrary(section) {
    let items, gridId, sortId, filterId;
    if (section === 'anime')   { items=getAnime();   gridId='anime-library-grid';  sortId='anime-sort';  filterId='anime-filter'; }
    else if (section === 'tv') { items=getTVShows(); gridId='tv-library-grid';     sortId='tv-sort';     filterId='tv-filter'; }
    else                       { items=getMovies();  gridId='movies-library-grid'; sortId='movies-sort'; filterId='movies-filter'; }

    const grid = document.getElementById(gridId);
    if (!grid) return;
    const sort   = document.getElementById(sortId)?.value   || 'title';
    const filter = document.getElementById(filterId)?.value || 'all';

    let filtered = [...items];
    if (filter !== 'all') {
        if (filter === 'watched')        filtered = items.filter(i => i.is_watched);
        else if (filter === 'unwatched') filtered = items.filter(i => !i.is_watched);
        else if (filter === 'favorites') filtered = items.filter(i => i.is_favorite);
        else                             filtered = items.filter(i => i.user_status === filter);
    }

    if (sort === 'title')         filtered.sort((a,b) => (a.title||'').localeCompare(b.title||''));
    else if (sort === 'rating')   filtered.sort((a,b) => (b.tmdb_rating||0)-(a.tmdb_rating||0));
    else if (sort === 'recent')   filtered.sort((a,b) => new Date(b.created_at||0)-new Date(a.created_at||0));
    else if (sort === 'progress') filtered.sort((a,b) => getShowProgressExcludingSpecials(b)-getShowProgressExcludingSpecials(a));
    else if (sort === 'year')     filtered.sort((a,b) => (b.year||0)-(a.year||0));

    grid.innerHTML = filtered.length
        ? filtered.map(item => createMediaCard(item)).join('')
        : '<p class="empty-state">No items found.</p>';
}

function createMediaCard(item) {
    const poster = safePoster(item.poster);
    let statusLine = '';
    if (item.type === 'tv' && item.user_status) {
        const prog = getShowProgressExcludingSpecials(item);
        const map  = {'Watching':'watching','Up to Date':'uptodate','Finished':'finished','Dropped':'dropped','Paused':'paused','Rewatching':'rewatching'};
        const cls  = map[item.user_status] || '';
        if (cls) {
            const w = ['Watching','Dropped'].includes(item.user_status) ? `${prog}%` : '100%';
            statusLine = `<div class="status-line status-${cls}" style="width:${w};"></div>`;
        }
    }
    const rating    = item.tmdb_rating ? `⭐${item.tmdb_rating.toFixed(1)}` : '';
    const safeDocId = item.docId.replace(/'/g, "\\'");
    return `
        <div class="media-card" onclick="openDetails('${safeDocId}','${item.type}')">
            ${item.is_favorite ? '<div class="favorite-badge">⭐</div>' : ''}
            <img src="${poster}" alt="${item.title}" onerror="this.src='${PLACEHOLDER_POSTER}'">
            ${statusLine}
            <div class="info">
                <h3>${item.title||'Unknown'}</h3>
                <p class="year">${rating||item.year||''}</p>
            </div>
        </div>`;
}

// ===== PROFILE =====
function updateProfilePage() {
    const anime=getAnime(), tv=getTVShows(), movies=getMovies();
    function countEps(list) {
        let t=0;
        list.forEach(s => s.seasons?.forEach(season => {
            if (season.number===0) return;
            season.episodes?.forEach(ep => { if (ep.is_watched && !ep.is_special) t++; });
        }));
        return t;
    }
    const animeEps=countEps(anime), tvEps=countEps(tv);
    const moviesWatched   = movies.filter(m=>m.is_watched).length;
    const animeFinished   = anime.filter(a=>['Finished','Up to Date'].includes(a.user_status)).length;
    const tvFinished      = tv.filter(t=>['Finished','Up to Date'].includes(t.user_status)).length;
    const moviesRewatched = movies.reduce((s,m)=>s+(m.rewatch_count||0),0);

    const setEl  = (id,val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
    const setBar = (id,pct) => { const el=document.getElementById(id); if(el) el.style.width=`${pct}%`; };

    setEl('p-anime-watched',animeFinished); setEl('p-anime-total',anime.length);
    setEl('p-anime-eps',animeEps); setEl('p-anime-time',formatWatchTime(animeEps*24));
    setBar('p-anime-bar', anime.length?(animeFinished/anime.length)*100:0);
    setEl('p-tv-watched',tvFinished); setEl('p-tv-total',tv.length);
    setEl('p-tv-eps',tvEps); setEl('p-tv-time',formatWatchTime(tvEps*45));
    setBar('p-tv-bar', tv.length?(tvFinished/tv.length)*100:0);
    setEl('p-movies-watched',moviesWatched); setEl('p-movies-total',movies.length);
    setEl('p-movies-rewatched',moviesRewatched); setEl('p-movies-time',formatWatchTime(moviesWatched*100));
    setBar('p-movies-bar', movies.length?(moviesWatched/movies.length)*100:0);

    function recentPosters(list, elId) {
        const el=document.getElementById(elId); if(!el) return;
        const recent=[...list].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,6);
        el.innerHTML = recent.map(item => {
            const p=safePoster(item.poster,'thumb');
            const sd=item.docId.replace(/'/g,"\\'");
            return `<img src="${p}" onerror="this.src='${PLACEHOLDER_THUMB}'" onclick="openDetails('${sd}','${item.type}')">`;
        }).join('');
    }
    recentPosters(anime,'p-anime-posters');
    recentPosters(tv,'p-tv-posters');
    recentPosters(movies,'p-movies-posters');
}

// ===== QUICK MARK =====
async function quickMarkWatched(docId, seasonNum, episodeNum, isRewatchMode = false) {
    const item=myList.find(i=>i.docId===docId);
    if(!item) return;
    const season=item.seasons.find(s=>s.number===seasonNum);
    if(!season) return;
    const episode=season.episodes.find(e=>e.number===episodeNum && !e.is_special);
    if(!episode) return;

    if (isRewatchMode) {
        episode.rewatch_count = (episode.rewatch_count||0)+1;
        if (!episode.rewatch_history) episode.rewatch_history=[];
        episode.rewatch_history.push(new Date().toISOString());
        episode.watched_at = new Date().toISOString();
    } else {
        const prev=getPreviousUnwatchedEpisodes(item,seasonNum,episodeNum);
        if (prev.length>0) {
            const a=await showMarkPreviousConfirm(prev.length);
            if (a==='yes') {
                const timestamps=generateIncrementalTimestamps(prev.length+1, item.is_anime);
                prev.forEach(({seasonNum:sN,episodeNum:eN},idx)=>{
                    const s=item.seasons.find(s=>s.number===sN);
                    const e=s?.episodes.find(e=>e.number===eN&&!e.is_special);
                    if(e){e.is_watched=true;e.watched_at=timestamps[idx];}
                });
                episode.is_watched=true;
                episode.watched_at=timestamps[timestamps.length-1];
            } else if (a==='no') {
                episode.is_watched=true;
                episode.watched_at=new Date().toISOString();
            } else return;
        } else {
            episode.is_watched=true;
            episode.watched_at=new Date().toISOString();
        }
    }

    try {
        await updateDoc(doc(db,'series',docId),{seasons:item.seasons});
        const section=item.is_anime?'anime':'tv';
        renderContinueWatching(section);
        renderHistory(section);
    } catch(e){console.error(e);}
}

// ===== CONFIRM DIALOGS =====
function showConfirm(title, message, yesText='Yes', noText='No', showCancel=false) {
    return new Promise((resolve) => {
        const dialog=document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent   = title;
        document.getElementById('confirm-message').textContent = message;
        const yesBtn    = document.getElementById('confirm-yes');
        const noBtn     = document.getElementById('confirm-no');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn  = dialog.querySelector('.confirm-close');
        yesBtn.textContent    = yesText;
        noBtn.textContent     = noText;
        cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
        yesBtn.className    = 'confirm-btn confirm-yes';
        yesBtn.style.cssText = '';
        noBtn.className     = 'confirm-btn confirm-no';
        noBtn.style.cssText = '';
        cancelBtn.className = 'confirm-btn confirm-cancel-btn';
        cancelBtn.style.cssText = '';
        openModal('confirm-dialog');

        const cleanup = () => {
            closeModal('confirm-dialog');
            yesBtn.replaceWith(yesBtn.cloneNode(true));
            noBtn.replaceWith(noBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            if (closeBtn) closeBtn.replaceWith(closeBtn.cloneNode(true));
        };
        document.getElementById('confirm-yes').addEventListener('click',    ()=>{cleanup();resolve('yes');});
        document.getElementById('confirm-no').addEventListener('click',     ()=>{cleanup();resolve('no');});
        document.getElementById('confirm-cancel').addEventListener('click', ()=>{cleanup();resolve('cancel');});
        dialog.querySelector('.confirm-close')?.addEventListener('click',   ()=>{cleanup();resolve('cancel');});
    });
}

function showRewatchConfirm(episodeName) {
    return new Promise((resolve) => {
        const dialog=document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent   = 'Already Watched';
        document.getElementById('confirm-message').textContent = `"${episodeName}"`;
        const yesBtn    = document.getElementById('confirm-yes');
        const noBtn     = document.getElementById('confirm-no');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn  = dialog.querySelector('.confirm-close');

        yesBtn.textContent    = '↺ Rewatch from Start';
        noBtn.textContent     = '↺ Just This Episode';
        cancelBtn.textContent = '✗ Unmark';
        cancelBtn.style.display = 'inline-block';

        yesBtn.className = 'confirm-btn';
        yesBtn.style.cssText = 'background:var(--blue);color:white;';
        noBtn.className  = 'confirm-btn';
        noBtn.style.cssText  = 'background:var(--green);color:white;';
        cancelBtn.className  = 'confirm-btn confirm-cancel-btn';
        cancelBtn.style.cssText = '';

        openModal('confirm-dialog');

        const cleanup = () => {
            closeModal('confirm-dialog');
            yesBtn.style.cssText = '';
            noBtn.style.cssText = '';
            yesBtn.replaceWith(yesBtn.cloneNode(true));
            noBtn.replaceWith(noBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            if (closeBtn) closeBtn.replaceWith(closeBtn.cloneNode(true));
        };
        document.getElementById('confirm-yes').addEventListener('click',    ()=>{cleanup();resolve('from-start');});
        document.getElementById('confirm-no').addEventListener('click',     ()=>{cleanup();resolve('just-this');});
        document.getElementById('confirm-cancel').addEventListener('click', ()=>{cleanup();resolve('unmark');});
        dialog.querySelector('.confirm-close')?.addEventListener('click',   ()=>{cleanup();resolve('cancel');});
    });
}

function showMarkPreviousConfirm(count) {
    return new Promise((resolve) => {
        const dialog=document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent   = 'Mark Previous?';
        document.getElementById('confirm-message').textContent = `${count} unwatched before this.`;
        const yesBtn    = document.getElementById('confirm-yes');
        const noBtn     = document.getElementById('confirm-no');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn  = dialog.querySelector('.confirm-close');

        yesBtn.textContent    = 'Yes, all';
        noBtn.textContent     = 'Just this';
        cancelBtn.style.display = 'none';

        yesBtn.className = 'confirm-btn confirm-yes';
        yesBtn.style.cssText = '';
        noBtn.className  = 'confirm-btn';
        noBtn.style.cssText  = 'background:var(--blue);color:white;';

        openModal('confirm-dialog');

        const cleanup = () => {
            closeModal('confirm-dialog');
            noBtn.style.cssText = '';
            yesBtn.replaceWith(yesBtn.cloneNode(true));
            noBtn.replaceWith(noBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            if (closeBtn) closeBtn.replaceWith(closeBtn.cloneNode(true));
        };
        document.getElementById('confirm-yes').addEventListener('click',    ()=>{cleanup();resolve('yes');});
        document.getElementById('confirm-no').addEventListener('click',     ()=>{cleanup();resolve('no');});
        dialog.querySelector('.confirm-close')?.addEventListener('click',   ()=>{cleanup();resolve('cancel');});
    });
}
// ===== PREVIEW =====
async function openPreview(tmdbId, type, title, year, poster) {
    hideSearchOverlay();
    const body = document.getElementById('preview-modal-body');
    body.innerHTML = '<p class="empty-state">Loading...</p>';
    openModal('preview-modal');

    const libraryItem = myList.find(i => i.tmdb_id === tmdbId);
    if (libraryItem) {
        closeModal('preview-modal');
        openDetails(libraryItem.docId, libraryItem.type);
        return;
    }

    const safeTitle = (title||'').replace(/'/g, "\\'");
    let details, credits, similar, providers;
    try {
        const ep = type === 'movie' ? 'movie' : 'tv';
        [details, credits, similar, providers] = await Promise.all([
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}/credits?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}/similar?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`)
        ]);
    } catch(e) {}

    const synopsis     = details?.overview || 'No synopsis.';
    const rating       = details?.vote_average;
    const genres       = details?.genres || [];
    const cast         = credits?.cast?.slice(0,12) || [];
    const similarItems = similar?.results?.slice(0,10) || [];
    const providerList = providers?.results?.US?.flatrate || [];
    const networks     = details?.networks || [];
    const tmdbStatus   = details?.status || '';
    const statusColor  = {'Returning Series':'#4CAF50','In Production':'#2196F3','Ended':'#666','Canceled':'#f44336','Released':'#4CAF50'}[tmdbStatus] || '#666';
    const runtime = type==='movie'&&details?.runtime ? `${Math.floor(details.runtime/60)}h ${details.runtime%60}m` : null;

    const allItems = [...getAnime(),...getTVShows(),...getMovies()];
    const tasteProfile = buildTasteProfile(allItems);
    const similarWithScores = similarItems.map(item=>({...item,matchScore:calculateMatchScore(item,tasteProfile)}))
        .sort((a,b)=>(b.matchScore||0)-(a.matchScore||0));

    let contentHTML = '';
    if (type==='tv' && details?.number_of_seasons) {
        contentHTML = `
            <div class="detail-tabs" style="margin-top:20px;">
                <button class="detail-tab-btn active" onclick="switchDetailTab('preview-info-tab')">Info</button>
                <button class="detail-tab-btn" onclick="switchDetailTab('preview-episodes-tab')">Episodes</button>
            </div>
            <div class="detail-tab-content active" id="preview-info-tab">
                <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
                ${buildCastSection(cast)}${buildNetworksSection(providerList,networks)}${buildSimilarSection(similarWithScores,type)}
            </div>
            <div class="detail-tab-content" id="preview-episodes-tab">
                <p style="color:var(--text2);text-align:center;padding:20px;"><strong>Add to Library</strong> to track episodes.</p>
                <p style="color:var(--text3);text-align:center;font-size:13px;">${details.number_of_seasons} Season(s) · ${details.number_of_episodes||'?'} Episodes</p>
            </div>`;
    } else {
        contentHTML = `<div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>${buildCastSection(cast)}${buildNetworksSection(providerList,networks)}${buildSimilarSection(similarWithScores,type)}`;
    }

    const safePosterUrl = poster.replace(/'/g, "\\'");
    body.innerHTML = `
        <div class="detail-header">
            <img src="${poster}" onerror="this.src='${PLACEHOLDER_POSTER}'">
            <div class="detail-header-info">
                <h2><span>${title} ${year?`(${year})`:''}</span></h2>
                ${tmdbStatus?`<span class="status-badge" style="background:${statusColor};">${tmdbStatus}</span>`:''}
                ${rating?`<p style="margin:5px 0;color:var(--text2);">⭐ <strong>${rating.toFixed(1)}</strong>/10</p>`:''}
                ${runtime?`<p style="color:var(--text2);font-size:13px;">⏱ ${runtime}</p>`:''}
                <div class="genre-tags">${genres.map(g=>`<span class="genre-tag">${g.name}</span>`).join('')}</div>
                <div style="margin-top:12px;">
                    <button onclick="handlePreviewAdd(${tmdbId},'${type}','${safeTitle}','${year}','${safePosterUrl}')"
                            class="watch-btn mark-watched" style="padding:10px 20px;">+ Add to Library</button>
                </div>
            </div>
        </div>
        ${contentHTML}`;
}

async function handlePreviewAdd(tmdbId, type, title, year, poster) {
    await addToList(tmdbId, type, title, year, poster);
    closeModal('preview-modal');
    const item = myList.find(i => i.tmdb_id === tmdbId);
    if (item) openDetails(item.docId, item.type);
}

// ===== DETAIL PAGE =====
async function openDetails(docId, type, forceTab) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const body = document.getElementById('modal-body');
    body.innerHTML = '<p class="empty-state">Loading...</p>';
    openModal('modal');
    if (forceTab) activeDetailTab = forceTab;
    if (type === 'movie') await openMovieDetails(item, body, docId.replace(/'/g, "\\'"));
    else await openTVDetails(item, body, docId.replace(/'/g, "\\'"));
}

// ===== MY RATING WIDGET =====
function buildMyRatingWidget(item, safeDocId) {
    const current = item.my_rating || 0;
    const col = item.type === 'movie' ? 'movies' : 'series';
    return `
        <div style="margin:10px 0;">
            <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">My Rating</div>
            <div style="display:flex;gap:3px;flex-wrap:wrap;">
                ${[1,2,3,4,5,6,7,8,9,10].map(n=>`
                    <button onclick="setMyRating('${safeDocId}','${col}',${n})"
                            style="width:28px;height:28px;border-radius:6px;
                                   border:2px solid ${n<=current?'var(--accent)':'var(--border)'};
                                   background:${n<=current?'var(--accent)':'transparent'};
                                   color:${n<=current?'white':'var(--text2)'};
                                   font-size:11px;font-weight:700;cursor:pointer;transition:all 0.15s;padding:0;">
                        ${n}
                    </button>`).join('')}
                ${current?`<button onclick="setMyRating('${safeDocId}','${col}',0)"
                    style="width:28px;height:28px;border-radius:6px;border:2px solid var(--border);
                           background:transparent;color:var(--text3);font-size:11px;cursor:pointer;padding:0;"
                    title="Clear">✕</button>`:''}
            </div>
            ${current?`<div style="font-size:11px;color:var(--accent);margin-top:4px;">Your rating: ${current}/10</div>`:''}
        </div>`;
}

async function setMyRating(docId, col, rating) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    item.my_rating = rating || null;
    try {
        await updateDoc(doc(db, col, docId), { my_rating: rating || null });
        const body = document.getElementById('modal-body');
        if (body && document.getElementById('modal').style.display !== 'none') {
            if (item.type === 'movie') await openMovieDetails(item, body, docId.replace(/'/g,"'"));
            else await openTVDetails(item, body, docId.replace(/'/g,"'"));
        }
    } catch(e) { console.error(e); }
}

// ===== MOVIE DETAIL =====
async function openMovieDetails(item, body, safeDocId) {
    let details, credits, similar, providers;
    if (item.tmdb_id) {
        try {
            [details, credits, similar, providers] = await Promise.all([
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}/credits?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}/similar?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}/watch/providers?api_key=${TMDB_API_KEY}`)
            ]);
        } catch(e) {}
    }
    const synopsis=details?.overview||'No synopsis.';
    const rating=details?.vote_average||item.tmdb_rating;
    const genres=details?.genres||[];
    const runtime=details?.runtime?`${Math.floor(details.runtime/60)}h ${details.runtime%60}m`:'N/A';
    const cast=credits?.cast?.slice(0,15)||[];
    const director=credits?.crew?.find(c=>c.job==='Director');
    const similarItems=similar?.results?.slice(0,10)||[];
    const providerList=providers?.results?.US?.flatrate||[];

    const allItems=[...getAnime(),...getTVShows(),...getMovies()];
    const tasteProfile=buildTasteProfile(allItems);
    const similarWithScores=similarItems.map(si=>({...si,matchScore:calculateMatchScore(si,tasteProfile)}))
        .sort((a,b)=>(b.matchScore||0)-(a.matchScore||0));

    body.innerHTML = `
        <div class="detail-header">
            <img src="${safePoster(item.poster)}" onerror="this.src='${PLACEHOLDER_POSTER}'">
            <div class="detail-header-info">
                <h2>
                    <span>${item.title} ${item.year?`(${item.year})`:''}</span>
                    <div class="show-options">
                        <button class="options-btn" onclick="toggleOptionsMenu('m-opts')">⋯</button>
                        <div class="options-menu" id="m-opts">
                            <button onclick="toggleFavorite('${safeDocId}','movie')">${item.is_favorite?'⭐ Remove Fav':'☆ Favorite'}</button>
                            <button class="danger" onclick="removeFromList('${safeDocId}','movie')">🗑 Remove</button>
                        </div>
                    </div>
                </h2>
                ${rating?`<p style="margin:5px 0;color:var(--text2);">⭐ <strong>${rating.toFixed(1)}</strong>/10 <small style="color:var(--text3);">TMDB</small></p>`:''}
                ${director?`<p style="color:var(--text2);font-size:13px;">🎬 ${director.name}</p>`:''}
                <p style="color:var(--text2);font-size:13px;">⏱ ${runtime}</p>
                <div class="genre-tags">${genres.map(g=>`<span class="genre-tag">${g.name}</span>`).join('')}</div>
                ${buildMyRatingWidget(item,safeDocId)}
                <div style="margin-top:8px;">
                    <button onclick="toggleWatched('${safeDocId}','movie')" class="watch-btn ${item.is_watched?'watched':'mark-watched'}">
                        ${item.is_watched?'✓ Watched':'○ Mark Watched'}
                    </button>
                </div>
                ${item.watched_at?`<p style="margin-top:6px;color:var(--text3);font-size:12px;">Watched: ${new Date(item.watched_at).toLocaleDateString()}</p>`:''}
                ${item.rewatch_count>0?`<p style="color:var(--text3);font-size:12px;">↺ ${item.rewatch_count}x</p>`:''}
            </div>
        </div>
        <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
        ${buildCastSection(cast)}${buildNetworksSection(providerList,details?.production_companies||[])}${buildSimilarSection(similarWithScores,'movie')}`;
}

// ===== TV DETAIL =====
async function openTVDetails(item, body, safeDocId) {
    let details, credits, similar, providers;
    if (item.tmdb_id) {
        try {
            [details, credits, similar, providers] = await Promise.all([
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/credits?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/similar?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/watch/providers?api_key=${TMDB_API_KEY}`)
            ]);
        } catch(e) {}
    }

    const synopsis=details?.overview||'No synopsis.';
    const rating=details?.vote_average||item.tmdb_rating;
    const genres=details?.genres||[];
    const cast=credits?.cast?.slice(0,15)||[];
    const similarItems=similar?.results?.slice(0,10)||[];
    const providerList=providers?.results?.US?.flatrate||[];
    const networks=details?.networks||[];
    const tmdbStatus=details?.status||item.tmdb_status||'Unknown';
    const statusColor={'Returning Series':'#4CAF50','In Production':'#2196F3','Ended':'#666','Canceled':'#f44336'}[tmdbStatus]||'#666';

    const airedEps=getAiredEpisodesOnly(item.seasons);
    const watchedCount=airedEps.filter(e=>e.is_watched).length;
    const totalCount=airedEps.length;
    const progress=totalCount>0?(watchedCount/totalCount)*100:0;

    let episodeRatings=[];
    if(item.tmdb_id) episodeRatings=await fetchEpisodeRatings(item.tmdb_id,item.seasons||[]);

    const regularSeasons=(item.seasons||[]).filter(s=>s.number!==0);
    const season0=(item.seasons||[]).find(s=>s.number===0);
    const inlineSpecials=[];
    regularSeasons.forEach(s=>{s.episodes?.forEach(ep=>{if(ep.is_special)inlineSpecials.push({...ep,fromSeason:s.number});});});
    const allSpecialEps=[...(season0?.episodes||[]),...inlineSpecials];
    const seasonsHTML=regularSeasons.map(s=>buildSeasonHTML(s,safeDocId,item.docId)).join('');
    const specialsHTML=allSpecialEps.length?`
        <div class="season specials">
            <div class="season-header" onclick="toggleSeason(this,'${item.docId}',0)">
                <span>Specials (${allSpecialEps.filter(e=>e.is_watched).length}/${allSpecialEps.length})</span>
                <span class="toggle-icon ${expandedSeasons.has(seasonKey(item.docId,0))?'open':''}">▼</span>
            </div>
            <div class="season-body ${expandedSeasons.has(seasonKey(item.docId,0))?'open':''}">
                ${allSpecialEps.map(ep=>buildSpecialEpisodeHTML(ep,safeDocId,item.docId)).join('')}
            </div>
        </div>`:'';

    const allItems=[...getAnime(),...getTVShows(),...getMovies()];
    const tasteProfile=buildTasteProfile(allItems);
    const similarWithScores=similarItems.map(si=>({...si,matchScore:calculateMatchScore(si,tasteProfile)}))
        .sort((a,b)=>(b.matchScore||0)-(a.matchScore||0));

    const infoActive=activeDetailTab==='info-tab';
    const isRewatching=item.user_status==='Rewatching';

    body.innerHTML = `
        <div class="detail-header">
            <img src="${safePoster(item.poster)}" onerror="this.src='${PLACEHOLDER_POSTER}'">
            <div class="detail-header-info">
                <h2>
                    <span>${item.title}</span>
                    <div class="show-options">
                        <button class="options-btn" onclick="toggleOptionsMenu('t-opts')">⋯</button>
                        <div class="options-menu" id="t-opts">
                            <button onclick="toggleFavorite('${safeDocId}','tv')">${item.is_favorite?'⭐ Remove Fav':'☆ Favorite'}</button>
                            <button onclick="setUserStatus('${safeDocId}','Watching')">▶ Watching</button>
                            <button onclick="setUserStatus('${safeDocId}','Up to Date')">✅ Up to Date</button>
                            <button onclick="setUserStatus('${safeDocId}','Rewatching')">↺ Rewatching</button>
                            <button onclick="setUserStatus('${safeDocId}','Paused')">⏸ Paused</button>
                            <button onclick="setUserStatus('${safeDocId}','Dropped')">🚫 Dropped</button>
                            <button onclick="setUserStatus('${safeDocId}','Finished')">🏁 Finished</button>
                            <button onclick="setUserStatus('${safeDocId}','Planned')">📋 Planned</button>
                            <button onclick="toggleAnimeStatus('${safeDocId}')">${item.is_anime?'🎌 Remove Anime':'🎌 Mark Anime'}</button>
                            <button onclick="openTagSpecialsModal('${safeDocId}')">🎭 Tag Episodes as Special</button>
                            <button class="danger" onclick="removeFromList('${safeDocId}','tv')">🗑 Remove</button>
                        </div>
                    </div>
                </h2>
                <div>
                    <span class="status-badge" style="background:${statusColor};">${tmdbStatus}</span>
                    ${item.is_anime?'<span class="status-badge anime-badge">🎌 Anime</span>':''}
                    ${isRewatching?'<span class="status-badge" style="background:#9C27B0;">↺ Rewatching</span>':''}
                </div>
                ${rating?`<p style="margin:4px 0;color:var(--text2);">⭐ <strong>${rating.toFixed(1)}</strong>/10 <small style="color:var(--text3);">TMDB</small></p>`:''}
                <p style="color:var(--text2);font-size:13px;">Status: <strong>${item.user_status||'Watching'}</strong></p>
                <div class="genre-tags">${genres.map(g=>`<span class="genre-tag">${g.name}</span>`).join('')}</div>
                ${buildMyRatingWidget(item,safeDocId)}
                <div class="detail-progress">
                    <div class="detail-progress-label">${watchedCount}/${totalCount} aired (${progress.toFixed(0)}%)</div>
                    <div class="detail-progress-bar">
                        <div class="detail-progress-fill" style="width:${progress}%;background:${progress>=100?'#4CAF50':'#FFC107'};"></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="detail-tabs">
            <button class="detail-tab-btn ${infoActive?'active':''}" onclick="switchDetailTab('info-tab')">Info</button>
            <button class="detail-tab-btn ${!infoActive?'active':''}" onclick="switchDetailTab('episodes-tab')">Episodes</button>
        </div>
        <div class="swipe-container" id="detail-swipe">
            <div class="detail-tab-content ${infoActive?'active':''}" id="info-tab">
                <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
                ${buildEpisodeRatingsChart(episodeRatings)}
                ${buildCastSection(cast)}${buildNetworksSection(providerList,networks)}${buildSimilarSection(similarWithScores,'tv')}
            </div>
            <div class="detail-tab-content ${!infoActive?'active':''}" id="episodes-tab">
                ${seasonsHTML}${specialsHTML}
            </div>
        </div>`;

    setupDetailSwipe();
    if(episodeRatings.length) renderEpisodeRatingsChart(episodeRatings);
}

// ===== SEASON / EPISODE BUILD =====
function toggleSeason(header, docId, seasonNum) {
    const body=header.nextElementSibling;
    const icon=header.querySelector('.toggle-icon');
    const key=seasonKey(docId,seasonNum);
    body.classList.toggle('open'); icon.classList.toggle('open');
    if(body.classList.contains('open')) expandedSeasons.add(key);
    else expandedSeasons.delete(key);
}

function buildSeasonHTML(season, safeDocId, docId) {
    const regularEps=(season.episodes||[]).filter(ep=>!ep.is_special);
    const today=new Date(); today.setHours(23,59,59,999);
    const airedEps=regularEps.filter(ep=>!ep.air_date||new Date(ep.air_date)<=today);
    const watched=airedEps.filter(e=>e.is_watched).length;
    const total=airedEps.length;
    const allWatched=watched===total&&total>0;
    const key=seasonKey(docId,season.number);
    const isExpanded=expandedSeasons.has(key);

    return `
        <div class="season">
            <div class="season-header" onclick="toggleSeason(this,'${docId}',${season.number})">
                <span>Season ${season.number} <span style="font-size:12px;opacity:0.8;">(${watched}/${total} aired)</span></span>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button class="mark-all-btn" onclick="event.stopPropagation();markSeasonWatched('${safeDocId}',${season.number})">${allWatched?'Unmark':'Mark All'}</button>
                    <span class="toggle-icon ${isExpanded?'open':''}">▼</span>
                </div>
            </div>
            <div class="season-body ${isExpanded?'open':''}">
                ${regularEps.map(ep=>buildEpisodeHTML(ep,season.number,safeDocId)).join('')||'<p style="padding:10px;color:var(--text3);">No episodes</p>'}
                ${season.episodes?.filter(ep=>ep.is_special).length
                    ?`<p style="color:var(--text3);font-size:11px;padding:8px 12px;font-style:italic;">${season.episodes.filter(ep=>ep.is_special).length} special(s) moved to Specials section</p>`:''}
            </div>
        </div>`;
}

function buildEpisodeHTML(ep, seasonNum, safeDocId) {
    const today=new Date(); today.setHours(23,59,59,999);
    const airDate=ep.air_date?new Date(ep.air_date):null;
    const isUnaired=airDate&&airDate>today;
    const onclickStr=isUnaired?'':`openEpisodeDetail('${safeDocId}',${seasonNum},${ep.number},false)`;
    return `
        <div class="episode ${ep.is_watched?'watched':''}" onclick="${onclickStr}" style="${isUnaired?'opacity:0.5;cursor:default;':''}">
            <div class="episode-info">
                <span class="episode-number">E${String(ep.number).padStart(2,'0')}</span>
                - ${ep.name||'Episode '+ep.number}
                ${isUnaired?'<br><small style="color:var(--text3);">📅 Airs '+new Date(ep.air_date).toLocaleDateString()+'</small>':''}
                ${ep.watched_at&&!isUnaired?'<br><small style="color:var(--text3);">'+new Date(ep.watched_at).toLocaleDateString()+'</small>':''}
                ${ep.rewatch_count>0?'<br><small style="color:#2196F3;">↺ '+ep.rewatch_count+'x</small>':''}
            </div>
            ${!isUnaired?`
                <button class="watch-btn ${ep.is_watched?'watched':'mark-watched'}"
                        onclick="event.stopPropagation();toggleEpisode('${safeDocId}',${seasonNum},${ep.number},false)">
                    ${ep.is_watched?'✓':'○'}
                </button>`:'<div style="width:40px;"></div>'}
        </div>`;
}

function buildSpecialEpisodeHTML(ep, safeDocId, docId) {
    const fetchSeason=ep.fromSeason!==undefined?ep.fromSeason:0;
    const safeEpName=(ep.name||'').replace(/'/g,"\\'");
    return `
        <div class="episode ${ep.is_watched?'watched':''}"
             onclick="openEpisodeDetail('${safeDocId}',${fetchSeason},${ep.number},true,'${safeEpName}')">
            <div class="episode-info">
                <span class="special-tag">SPECIAL</span>
                ${ep.name||'Special Episode'}
                ${ep.watched_at?'<br><small style="color:var(--text3);">'+new Date(ep.watched_at).toLocaleDateString()+'</small>':''}
                ${ep.rewatch_count>0?'<br><small style="color:#2196F3;">↺ '+ep.rewatch_count+'x</small>':''}
            </div>
            <button class="watch-btn ${ep.is_watched?'watched':'mark-watched'}"
                    onclick="event.stopPropagation();toggleEpisode('${safeDocId}',${fetchSeason},${ep.number},true,'${safeEpName}')">
                ${ep.is_watched?'✓':'○'}
            </button>
        </div>`;
}

// ===== EPISODE RATINGS =====
async function fetchEpisodeRatings(tmdbId, localSeasons) {
    const ratings=[];
    const seasons=localSeasons.filter(s=>s.number!==0).slice(0,5);
    for(const s of seasons){
        try{
            const data=await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${s.number}?api_key=${TMDB_API_KEY}`);
            data.episodes?.forEach(ep=>{
                if(ep.vote_average>0) ratings.push({label:`S${s.number}E${ep.episode_number}`,rating:ep.vote_average,season:s.number,episode:ep.episode_number,name:ep.name});
            });
        }catch(e){}
    }
    return ratings;
}

function buildEpisodeRatingsChart(ratings) {
    if(!ratings.length) return '';
    return `<div class="chart-container"><h3>📊 Episode Ratings</h3><canvas id="episode-ratings-chart"></canvas></div>`;
}

function renderEpisodeRatingsChart(ratings) {
    const canvas=document.getElementById('episode-ratings-chart');
    if(!canvas) return;
    const colors=['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40'];
    new Chart(canvas.getContext('2d'),{type:'bar',
        data:{labels:ratings.map(r=>r.label),datasets:[{data:ratings.map(r=>r.rating),backgroundColor:ratings.map(r=>colors[(r.season-1)%colors.length]+'99'),borderColor:ratings.map(r=>colors[(r.season-1)%colors.length]),borderWidth:1}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:(i)=>`${ratings[i[0].dataIndex].label} - ${ratings[i[0].dataIndex].name}`,label:(i)=>`${i.raw.toFixed(1)}/10`}}},scales:{y:{min:0,max:10},x:{ticks:{maxRotation:90,font:{size:9}}}}}
    });
}

// ===== BUILD HELPERS =====
function buildCastSection(cast) {
    if(!cast.length) return '';
    return `<div class="cast-section"><h3>🎭 Cast</h3><div class="cast-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">${cast.map(p=>`<div class="cast-card"><img src="${p.profile_path?TMDB_IMG_BASE+p.profile_path:PLACEHOLDER_AVATAR}" alt="${p.name}" onerror="this.src='${PLACEHOLDER_AVATAR}'"><div class="cast-name">${p.name}</div><div class="cast-character">${p.character||''}</div></div>`).join('')}</div></div>`;
}

function buildNetworksSection(providers, networks) {
    const all=[...(networks||[]),...(providers||[])];
    if(!all.length) return '';
    return `<div class="networks-section"><h3>📺 Available On</h3><div class="network-logos">${all.map(n=>n.logo_path?`<img class="network-logo" src="${TMDB_IMG_BASE}${n.logo_path}" alt="${n.name||n.provider_name}">`:`<span class="network-name">${n.name||n.provider_name}</span>`).join('')}</div></div>`;
}

function buildSimilarSection(items, type) {
    if(!items.length) return '';
    return `<div class="similar-section"><h3>🎬 You Might Like</h3><div class="similar-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">${items.map(item=>{
        const t=item.title||item.name;const p=item.poster_path?TMDB_IMG_BASE+item.poster_path:PLACEHOLDER_SIMILAR;
        const r=item.vote_average?item.vote_average.toFixed(1):'N/A';const y=(item.release_date||item.first_air_date||'').substring(0,4);
        const st=(t||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');const sp=p.replace(/'/g,"\\'");
        return `<div class="similar-card" onclick="openPreview(${item.id},'${type}','${st}','${y}','${sp}')"><img src="${p}" alt="${t}" onerror="this.src='${PLACEHOLDER_SIMILAR}'"><div class="similar-title">${t}</div><div class="similar-rating">⭐${r}</div>${item.matchScore!=null?`<div class="similar-match">${item.matchScore}% match</div>`:''}</div>`;
    }).join('')}</div></div>`;
}

// ===== DETAIL TABS =====
function switchDetailTab(tabId) {
    activeDetailTab=tabId;
    document.querySelectorAll('.detail-tab-content').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.detail-tab-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    document.querySelectorAll('.detail-tab-btn').forEach(b=>{
        if(tabId.includes('info')&&b.textContent.trim()==='Info') b.classList.add('active');
        if(tabId.includes('episodes')&&b.textContent.trim()==='Episodes') b.classList.add('active');
    });
}

function setupDetailSwipe() {
    const c=document.getElementById('detail-swipe');
    if(!c) return;
    let sx=0;
    c.addEventListener('touchstart',(e)=>{sx=e.touches[0].clientX;},{passive:true});
    c.addEventListener('touchend',(e)=>{
        const d=sx-e.changedTouches[0].clientX;
        if(Math.abs(d)>60) switchDetailTab(d>0?'episodes-tab':'info-tab');
    });
}

function toggleOptionsMenu(id) {
    const m=document.getElementById(id);
    if(m) m.classList.toggle('show');
    document.querySelectorAll('.options-menu').forEach(x=>{if(x.id!==id)x.classList.remove('show');});
}

// ===== EPISODE DETAIL =====
async function openEpisodeDetail(docId, seasonNum, episodeNum, isSpecial=false, epName='') {
    const item=myList.find(i=>i.docId===docId);
    if(!item?.tmdb_id) return;
    const epBody=document.getElementById('episode-modal-body');
    epBody.innerHTML='<p class="empty-state">Loading...</p>';
    openModal('episode-modal');

    try {
        const data=await tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/season/${seasonNum}/episode/${episodeNum}?api_key=${TMDB_API_KEY}&append_to_response=credits`);
        let displayData=data;
        if(isSpecial&&epName&&data.name&&!titlesMatch(data.name,epName)){
            displayData={name:epName,overview:'Episode details not available.',vote_average:0,air_date:null,runtime:null,still_path:null,guest_stars:[],credits:{cast:[]}};
        }
        const still=displayData.still_path?`${TMDB_IMG_BASE}${displayData.still_path}`:'';
        const r=displayData.vote_average?displayData.vote_average.toFixed(1):'N/A';
        const air=displayData.air_date?new Date(displayData.air_date).toLocaleDateString():'N/A';
        const allCast=[...(displayData.guest_stars||[]),...(displayData.credits?.cast||[])].slice(0,12);

        const localSeason=item.seasons?.find(s=>s.number===seasonNum);
        let localEp;
        if(isSpecial&&epName) localEp=localSeason?.episodes?.find(e=>e.number===episodeNum&&e.is_special&&titlesMatch(e.name||'',epName));
        else localEp=localSeason?.episodes?.find(e=>e.number===episodeNum&&!e.is_special);

        const sd=docId.replace(/'/g,"\\'");
        const safeEpName=(epName||'').replace(/'/g,"\\'");

        epBody.innerHTML=`
            <div class="ep-detail-header">
                ${still?`<img src="${still}" onerror="this.style.display='none'">`:''}
                <div class="ep-detail-info">
                    <h3>${displayData.name||epName||`Episode ${episodeNum}`}</h3>
                    ${isSpecial?'<span style="background:#FF6B35;color:white;padding:2px 8px;border-radius:8px;font-size:11px;display:inline-block;margin-bottom:4px;">SPECIAL</span>':''}
                    <div class="ep-code">S${String(seasonNum).padStart(2,'0')}E${String(episodeNum).padStart(2,'0')}</div>
                    <div class="ep-rating">⭐ ${r}/10</div>
                    <p style="color:var(--text2);font-size:13px;">📅 ${air}</p>
                    ${displayData.runtime?`<p style="color:var(--text2);font-size:13px;">⏱ ${displayData.runtime}min</p>`:''}
                </div>
            </div>
            <div style="margin:15px 0;">
                <button onclick="toggleEpisode('${sd}',${seasonNum},${episodeNum},${isSpecial},'${safeEpName}');closeModal('episode-modal');"
                        class="watch-btn ${localEp?.is_watched?'watched':'mark-watched'}" style="padding:10px 24px;">
                    ${localEp?.is_watched?'✓ Watched':'○ Mark Watched'}
                </button>
                ${localEp?.rewatch_count>0?`<p style="margin-top:6px;color:#2196F3;font-size:12px;">↺ ${localEp.rewatch_count}x</p>`:''}
            </div>
            <div class="ep-detail-synopsis"><h4 style="color:var(--accent);margin-bottom:8px;">Synopsis</h4><p>${displayData.overview||'No synopsis.'}</p></div>
            ${allCast.length?`<div class="ep-guest-cast"><h4>Cast</h4><div class="cast-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">${allCast.map(p=>`<div class="cast-card"><img src="${p.profile_path?TMDB_IMG_BASE+p.profile_path:PLACEHOLDER_AVATAR}" onerror="this.src='${PLACEHOLDER_AVATAR}'"><div class="cast-name">${p.name}</div><div class="cast-character">${p.character||''}</div></div>`).join('')}</div></div>`:''}`;
    } catch(e) { epBody.innerHTML='<p class="empty-state">Failed to load.</p>'; }
}

// ===== TOGGLE EPISODE =====
async function toggleEpisode(docId, seasonNum, episodeNum, isSpecial=false, epName='') {
    const item=myList.find(i=>i.docId===docId);
    if(!item) return;
    const season=item.seasons.find(s=>s.number===seasonNum);
    if(!season) return;

    let episode;
    if(isSpecial&&epName){
        episode=season.episodes.find(e=>e.number===episodeNum&&e.is_special&&titlesMatch(e.name||'',epName));
        if(!episode) episode=season.episodes.find(e=>e.number===episodeNum&&e.is_special);
        if(!episode&&seasonNum===0) episode=season.episodes.find(e=>e.number===episodeNum);
    } else episode=season.episodes.find(e=>e.number===episodeNum&&!e.is_special);
    if(!episode) return;
    activeDetailTab='episodes-tab';

    if(episode.is_watched){
        const choice=await showRewatchConfirm(episode.name||'This episode');
        if(choice==='from-start'){
            const needsRewatch=getEpisodesNeedingRewatch(item,seasonNum,episodeNum);
            const totalToMark=needsRewatch.length+1;
            const timestamps=generateIncrementalTimestamps(totalToMark,item.is_anime);
            needsRewatch.forEach(({seasonNum:sN,episodeNum:eN},idx)=>{
                const s=item.seasons.find(s=>s.number===sN);
                const e=s?.episodes.find(e=>e.number===eN&&!e.is_special);
                if(e){e.rewatch_count=(e.rewatch_count||0)+1;if(!e.rewatch_history)e.rewatch_history=[];e.rewatch_history.push(timestamps[idx]);e.watched_at=timestamps[idx];}
            });
            episode.rewatch_count=(episode.rewatch_count||0)+1;
            if(!episode.rewatch_history)episode.rewatch_history=[];
            episode.rewatch_history.push(timestamps[timestamps.length-1]);
            episode.watched_at=timestamps[timestamps.length-1];
        } else if(choice==='just-this'){
            episode.rewatch_count=(episode.rewatch_count||0)+1;
            if(!episode.rewatch_history)episode.rewatch_history=[];
            episode.rewatch_history.push(new Date().toISOString());
            episode.watched_at=new Date().toISOString();
        } else if(choice==='unmark'){
            episode.is_watched=false;episode.watched_at=null;
        } else return;
    } else {
        if(!isSpecial&&seasonNum!==0){
            const prev=getPreviousUnwatchedEpisodes(item,seasonNum,episodeNum);
            if(prev.length>0){
                const a=await showMarkPreviousConfirm(prev.length);
                if(a==='yes'){
                    const timestamps=generateIncrementalTimestamps(prev.length+1,item.is_anime);
                    prev.forEach(({seasonNum:sN,episodeNum:eN},idx)=>{
                        const s=item.seasons.find(s=>s.number===sN);
                        const e=s?.episodes.find(e=>e.number===eN&&!e.is_special);
                        if(e){e.is_watched=true;e.watched_at=timestamps[idx];}
                    });
                    episode.is_watched=true;episode.watched_at=timestamps[timestamps.length-1];
                } else if(a==='no'){
                    episode.is_watched=true;episode.watched_at=new Date().toISOString();
                } else return;
            } else {episode.is_watched=true;episode.watched_at=new Date().toISOString();}
        } else {episode.is_watched=true;episode.watched_at=new Date().toISOString();}
    }

    try{
        await updateDoc(doc(db,'series',docId),{seasons:item.seasons});
        const local=myList.find(i=>i.docId===docId);
        if(local)local.seasons=item.seasons;
        const body=document.getElementById('modal-body');
        if(body&&document.getElementById('modal').style.display!=='none')
            await openTVDetails(item,body,docId.replace(/'/g,"\\'"));
        const section=item.is_anime?'anime':'tv';
        renderContinueWatching(section);renderHistory(section);
    }catch(e){console.error(e);}
}

// ===== MARK SEASON =====
async function markSeasonWatched(docId, seasonNum) {
    const item=myList.find(i=>i.docId===docId);if(!item)return;
    const season=item.seasons.find(s=>s.number===seasonNum);if(!season)return;
    const today=new Date();today.setHours(23,59,59,999);
    const regularEps=season.episodes.filter(ep=>{if(ep.is_special)return false;const airDate=ep.air_date?new Date(ep.air_date):null;return !airDate||airDate<=today;});
    const allWatched=regularEps.every(e=>e.is_watched)&&regularEps.length>0;
    activeDetailTab='episodes-tab';

    if(allWatched){
        const a=await showConfirm('All Watched','What to do?','↺ Rewatch All','✗ Unmark All');
        if(a==='yes'){
            const timestamps=generateIncrementalTimestamps(regularEps.length,item.is_anime);
            regularEps.forEach((ep,idx)=>{ep.rewatch_count=(ep.rewatch_count||0)+1;if(!ep.rewatch_history)ep.rewatch_history=[];ep.rewatch_history.push(timestamps[idx]);ep.watched_at=timestamps[idx];});
        }else if(a==='no'){regularEps.forEach(ep=>{ep.is_watched=false;ep.watched_at=null;});}
        else return;
    } else {
        if(seasonNum!==0){
            const prevSeasons=item.seasons.filter(s=>s.number!==0&&s.number<seasonNum&&s.episodes?.some(e=>!e.is_watched&&!e.is_special));
            if(prevSeasons.length>0){
                const a=await showConfirm('Previous Seasons?',`${prevSeasons.length} season(s) have unwatched eps.`,'Mark all prev','Just this');
                if(a==='yes'){
                    const allPrevEps=[];
                    prevSeasons.forEach(s=>s.episodes.filter(ep=>!ep.is_special&&!ep.is_watched).forEach(ep=>{allPrevEps.push({s,ep});}));
                    const unwatchedCurrent=regularEps.filter(ep=>!ep.is_watched);
                    const total=allPrevEps.length+unwatchedCurrent.length;
                    const timestamps=generateIncrementalTimestamps(total,item.is_anime);
                    let tsIdx=0;
                    allPrevEps.forEach(({ep})=>{ep.is_watched=true;ep.watched_at=timestamps[tsIdx++];});
                    unwatchedCurrent.forEach(ep=>{ep.is_watched=true;ep.watched_at=timestamps[tsIdx++];});
                } else {
                    const unwatched=regularEps.filter(ep=>!ep.is_watched);
                    const timestamps=generateIncrementalTimestamps(unwatched.length,item.is_anime);
                    unwatched.forEach((ep,idx)=>{ep.is_watched=true;ep.watched_at=timestamps[idx];});
                }
            } else {
                const unwatched=regularEps.filter(ep=>!ep.is_watched);
                const timestamps=generateIncrementalTimestamps(unwatched.length,item.is_anime);
                unwatched.forEach((ep,idx)=>{ep.is_watched=true;ep.watched_at=timestamps[idx];});
            }
        } else {
            const unwatched=regularEps.filter(ep=>!ep.is_watched);
            const timestamps=generateIncrementalTimestamps(unwatched.length,item.is_anime);
            unwatched.forEach((ep,idx)=>{ep.is_watched=true;ep.watched_at=timestamps[idx];});
        }
    }

    try{
        await updateDoc(doc(db,'series',docId),{seasons:item.seasons});
        const local=myList.find(i=>i.docId===docId);if(local)local.seasons=item.seasons;
        const body=document.getElementById('modal-body');
        if(body&&document.getElementById('modal').style.display!=='none')
            await openTVDetails(item,body,docId.replace(/'/g,"\\'"));
        const section=item.is_anime?'anime':'tv';
        renderContinueWatching(section);renderHistory(section);
    }catch(e){console.error(e);}
}

// ===== TOGGLE FAVORITE / WATCHED / STATUS =====
async function toggleFavorite(docId,type){const item=myList.find(i=>i.docId===docId);if(!item)return;item.is_favorite=!item.is_favorite;try{await updateDoc(doc(db,type==='movie'?'movies':'series',docId),{is_favorite:item.is_favorite});await loadMyList();openDetails(docId,type);}catch(e){console.error(e);}}

async function toggleWatched(docId,type){
    const item=myList.find(i=>i.docId===docId);if(!item)return;
    if(item.is_watched){
        const a=await showConfirm('Already Watched','What to do?','↺ Rewatch','✗ Unmark');
        if(a==='yes'){item.rewatch_count=(item.rewatch_count||0)+1;if(!item.rewatch_history)item.rewatch_history=[];item.rewatch_history.push(new Date().toISOString());item.watched_at=new Date().toISOString();}
        else if(a==='no'){item.is_watched=false;item.watched_at=null;}
        else return;
    }else{item.is_watched=true;item.watched_at=new Date().toISOString();}
    try{await updateDoc(doc(db,'movies',docId),{is_watched:item.is_watched,watched_at:item.watched_at,rewatch_count:item.rewatch_count||0,rewatch_history:item.rewatch_history||[]});await loadMyList();openDetails(docId,type);}catch(e){console.error(e);}
}

async function setUserStatus(docId,status){try{await updateDoc(doc(db,'series',docId),{user_status:status});const item=myList.find(i=>i.docId===docId);if(item)item.user_status=status;await loadMyList();openDetails(docId,'tv');}catch(e){console.error(e);}}

async function toggleAnimeStatus(docId){const item=myList.find(i=>i.docId===docId);if(!item)return;try{await updateDoc(doc(db,'series',docId),{is_anime:!item.is_anime});item.is_anime=!item.is_anime;await loadMyList();openDetails(docId,'tv');}catch(e){console.error(e);}}

// ===== ADD / REMOVE =====
async function addToList(tmdbId,type,title,year,poster){
    try{
        const col=type==='movie'?'movies':'series';const docId=`${type}_${tmdbId}`;
        let data={tmdb_id:tmdbId,title,year,poster,is_favorite:false,created_at:new Date().toISOString()};
        if(type==='tv'){
            const det=await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
            data.user_status='Planned';data.tmdb_status=det.status||'Unknown';
            data.last_status_check=new Date().toISOString();data.last_synced=new Date().toISOString();
            data.is_anime=isAnimeShow(det);data.tmdb_rating=det.vote_average||null;
            data.genres=(det.genres||[]).map(g=>g.name);data.original_language=det.original_language||null;
            data.networks=(det.networks||[]).map(n=>n.name);data.origin_country=det.origin_country||[];
            data.popularity=det.popularity||null;data.my_rating=null;
            data.year=det.first_air_date?parseInt(det.first_air_date.substring(0,4)):null;
            data.seasons=[];
            for(let i=0;i<=det.number_of_seasons;i++){
                try{const sd=await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${i}?api_key=${TMDB_API_KEY}`);
                if(!sd.episodes?.length)continue;const tmdbEpMap={};sd.episodes.forEach(ep=>{tmdbEpMap[ep.episode_number]=ep.name;});
                const episodes=sd.episodes.map(ep=>({number:ep.episode_number,name:ep.name||`Episode ${ep.episode_number}`,air_date:ep.air_date||null,is_watched:false,watched_at:null,rewatch_count:0,rewatch_history:[],is_special:i===0,my_rating:null}));
                const fixed=i===0?episodes:detectImposters(episodes,tmdbEpMap,null);
                data.seasons.push({number:i,is_specials:i===0,episodes:fixed});}catch(e){}
            }
        }else{
            const det=await tmdbFetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
            data.is_watched=false;data.watched_at=null;data.tmdb_rating=det.vote_average||null;
            data.rewatch_count=0;data.rewatch_history=[];
            data.genres=(det.genres||[]).map(g=>g.name);data.original_language=det.original_language||null;
            data.networks=(det.production_companies||[]).map(n=>n.name);
            data.origin_country=(det.production_countries||[]).map(c=>c.iso_3166_1);
            data.popularity=det.popularity||null;data.my_rating=null;
            data.year=det.release_date?parseInt(det.release_date.substring(0,4)):null;
        }
        await setDoc(doc(db,col,docId),data);await loadMyList();
    }catch(e){console.error(e);alert('Error adding.');}
}

async function removeFromList(docId,type){
    const a=await showConfirm('Remove?','Remove from library?','Remove','Cancel');
    if(a!=='yes')return;
    try{await deleteDoc(doc(db,type==='movie'?'movies':'series',docId));await loadMyList();closeModal('modal');}catch(e){console.error(e);}
}

async function removeFromListByTMDB(tmdbId,type){await removeFromList(`${type}_${tmdbId}`,type);}
// ===== TAG SPECIALS MODAL =====
function openTagSpecialsModal(docId) {
    const item=myList.find(i=>i.docId===docId);if(!item)return;
    document.querySelectorAll('.options-menu').forEach(m=>m.classList.remove('show'));

    let modal=document.getElementById('tag-specials-modal');
    if(!modal){
        modal=document.createElement('div');modal.id='tag-specials-modal';modal.className='modal';modal.style.zIndex='3000';
        modal.innerHTML=`<div class="modal-content" style="max-width:620px;"><span class="close" onclick="closeModal('tag-specials-modal')">&times;</span><div id="tag-specials-body"></div></div>`;
        document.body.appendChild(modal);
    }

    const body=document.getElementById('tag-specials-body');
    const seasonOptions=(item.seasons||[]).sort((a,b)=>a.number-b.number)
        .map(s=>`<option value="${s.number}">${s.number===0?'Specials (S00)':`Season ${s.number}`}</option>`).join('');

    body.innerHTML=`
        <h3 style="color:var(--accent);margin-bottom:12px;">🎭 Tag Episodes as Special</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:12px;">Check episodes that are specials/OVAs.</p>
        <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <label style="font-size:13px;color:var(--text2);">Filter:</label>
            <select id="tag-season-filter" onchange="filterTagSpecials('${docId}')"
                    style="padding:6px 10px;border:2px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;">
                <option value="all">All Seasons</option>${seasonOptions}
            </select>
        </div>
        <div id="tag-specials-list" style="max-height:420px;overflow-y:auto;">${buildTagSpecialsList(item,'all')}</div>
        <div style="margin-top:15px;display:flex;gap:10px;justify-content:flex-end;">
            <button onclick="closeModal('tag-specials-modal')" style="padding:10px 20px;border:2px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;cursor:pointer;">Cancel</button>
            <button onclick="applySpecialTags('${docId}')" style="padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Save</button>
        </div>`;
    openModal('tag-specials-modal');
}

function buildTagSpecialsList(item, filterSeason) {
    let rows='';
    (item.seasons||[]).forEach(s=>{
        if(filterSeason!=='all'&&s.number!==parseInt(filterSeason))return;
        (s.episodes||[]).forEach(ep=>{
            const isSpecial=ep.is_special||s.number===0;
            const label=s.number===0?`S00 · ${ep.name||'Special'}`:`S${String(s.number).padStart(2,'0')}E${String(ep.number).padStart(2,'0')} · ${ep.name||'Episode '+ep.number}`;
            rows+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border);">
                <input type="checkbox" class="tag-special-cb" ${isSpecial?'checked':''} data-season="${s.number}" data-ep="${ep.number}" data-name="${(ep.name||'').replace(/"/g,'&quot;')}">
                <label style="font-size:13px;color:var(--text);cursor:pointer;flex:1;">${label}${isSpecial?'<span style="background:#FF6B35;color:white;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:6px;">SPECIAL</span>':''}</label>
            </div>`;
        });
    });
    return rows||'<p class="empty-state">No episodes found.</p>';
}

function filterTagSpecials(docId) {
    const item=myList.find(i=>i.docId===docId);if(!item)return;
    const filter=document.getElementById('tag-season-filter')?.value||'all';
    const listEl=document.getElementById('tag-specials-list');
    if(listEl) listEl.innerHTML=buildTagSpecialsList(item,filter);
}

async function applySpecialTags(docId) {
    const item=myList.find(i=>i.docId===docId);if(!item)return;
    document.querySelectorAll('.tag-special-cb').forEach(cb=>{
        const seasonNum=parseInt(cb.dataset.season);const epNum=parseInt(cb.dataset.ep);const epName=cb.dataset.name||'';
        const season=item.seasons.find(s=>s.number===seasonNum);if(!season)return;
        const ep=season.episodes.find(e=>e.number===epNum&&(epName?titlesMatch(e.name||'',epName):true))||season.episodes.find(e=>e.number===epNum);
        if(ep) ep.is_special=cb.checked;
    });
    try{await updateDoc(doc(db,'series',docId),{seasons:item.seasons});closeModal('tag-specials-modal');await loadMyList();openDetails(docId,'tv',activeDetailTab);}catch(e){console.error(e);}
}

// ===== RATE YOUR SHOWS MODAL =====
function openRateShowsModal() {
    let modal=document.getElementById('rate-shows-modal');
    if(!modal){
        modal=document.createElement('div');modal.id='rate-shows-modal';modal.className='modal';modal.style.zIndex='3000';
        modal.innerHTML=`<div class="modal-content" style="max-width:700px;"><span class="close" onclick="closeModal('rate-shows-modal')">&times;</span><div id="rate-shows-body"></div></div>`;
        document.body.appendChild(modal);
    }
    const body=document.getElementById('rate-shows-body');
    const all=[...getAnime(),...getTVShows(),...getMovies()];

    body.innerHTML=`
        <h3 style="color:var(--accent);margin-bottom:8px;">⭐ Rate Your Shows</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:12px;">Tap a number to rate. Improves "You Might Like" recommendations.</p>
        <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <select id="rate-type-filter" onchange="filterRateList()" style="padding:6px 10px;border:2px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;">
                <option value="all">All</option><option value="anime">Anime</option><option value="tv">TV Shows</option><option value="movie">Movies</option>
            </select>
            <select id="rate-status-filter" onchange="filterRateList()" style="padding:6px 10px;border:2px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;">
                <option value="all">All Statuses</option><option value="watched">Watched / Finished</option><option value="unrated">Unrated Only</option>
            </select>
            <span style="font-size:12px;color:var(--text3);">${all.filter(i=>i.my_rating).length}/${all.length} rated</span>
        </div>
        <div id="rate-shows-list" style="max-height:480px;overflow-y:auto;">${buildRateShowsList(all,'all','all')}</div>
        <div style="margin-top:12px;text-align:right;">
            <button onclick="closeModal('rate-shows-modal')" style="padding:10px 24px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Done</button>
        </div>`;
    openModal('rate-shows-modal');
}

function buildRateShowsList(items, typeFilter, statusFilter) {
    let filtered=items;
    if(typeFilter==='anime') filtered=filtered.filter(i=>i.type==='tv'&&i.is_anime);
    else if(typeFilter==='tv') filtered=filtered.filter(i=>i.type==='tv'&&!i.is_anime);
    else if(typeFilter==='movie') filtered=filtered.filter(i=>i.type==='movie');
    if(statusFilter==='watched') filtered=filtered.filter(i=>i.is_watched||['Finished','Up to Date','Watching','Rewatching'].includes(i.user_status));
    else if(statusFilter==='unrated') filtered=filtered.filter(i=>!i.my_rating);
    if(!filtered.length) return '<p class="empty-state">No shows found.</p>';

    return filtered.map(item=>{
        const poster=safePoster(item.poster,'thumb');const current=item.my_rating||0;
        const col=item.type==='movie'?'movies':'series';const sd=item.docId.replace(/'/g,"\\'");
        const safeId=item.docId.replace(/[^a-zA-Z0-9]/g,'_');
        return `<div class="rate-show-item">
            <img src="${poster}" onerror="this.src='${PLACEHOLDER_THUMB}'">
            <div class="rate-show-info">
                <div class="rate-show-title">${item.title}</div>
                <div class="rate-show-meta">${item.is_anime?'Anime':item.type==='movie'?'Movie':'TV'} · ${item.user_status||(item.is_watched?'Watched':'—')}</div>
            </div>
            <div class="rate-show-buttons" id="rate-btns-${safeId}">
                ${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button onclick="rateShowInline('${sd}','${col}',${n})" class="rate-num-btn ${n<=current?'active':''}" data-num="${n}">${n}</button>`).join('')}
                ${current?`<button onclick="rateShowInline('${sd}','${col}',0)" class="rate-clear-btn" title="Clear">✕</button>`:''}
            </div>
        </div>`;
    }).join('');
}

function filterRateList() {
    const typeFilter=document.getElementById('rate-type-filter')?.value||'all';
    const statusFilter=document.getElementById('rate-status-filter')?.value||'all';
    const all=[...getAnime(),...getTVShows(),...getMovies()];
    const listEl=document.getElementById('rate-shows-list');
    if(listEl) listEl.innerHTML=buildRateShowsList(all,typeFilter,statusFilter);
}

async function rateShowInline(docId, col, rating) {
    const item=myList.find(i=>i.docId===docId);if(!item)return;
    item.my_rating=rating||null;
    try{
        await updateDoc(doc(db,col,docId),{my_rating:rating||null});
        const safeId=docId.replace(/[^a-zA-Z0-9]/g,'_');
        const container=document.getElementById(`rate-btns-${safeId}`);
        if(container){
            const current=rating||0;const sd=docId.replace(/'/g,"\\'");
            container.innerHTML=`${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button onclick="rateShowInline('${sd}','${col}',${n})" class="rate-num-btn ${n<=current?'active':''}" data-num="${n}">${n}</button>`).join('')}${current?`<button onclick="rateShowInline('${sd}','${col}',0)" class="rate-clear-btn" title="Clear">✕</button>`:''}`;
        }
    }catch(e){console.error(e);}
}

// ===== CALENDAR =====
async function loadSectionCalendar(section) {
    const isAnime=section==='anime';
    const shows=isAnime?getAnime():getTVShows();
    const todayEl=document.getElementById(`${section}-calendar-today`);
    const weekEl=document.getElementById(`${section}-calendar-week`);
    const upcomingEl=document.getElementById(`${section}-calendar-upcoming`);

    const today=new Date();const todayStr=today.toISOString().split('T')[0];
    const weekStr=new Date(today.getTime()+7*86400000).toISOString().split('T')[0];
    const monthStr=new Date(today.getTime()+30*86400000).toISOString().split('T')[0];

    const toCheck=shows.filter(s=>s.tmdb_id&&['Returning Series','In Production','Unknown'].includes(s.tmdb_status));
    todayEl.innerHTML=`<p class="empty-state">Checking ${toCheck.length} shows...</p>`;
    weekEl.innerHTML='';upcomingEl.innerHTML='';

    const tEps=[],wEps=[],uEps=[];let checked=0;

    for(const show of toCheck){
        try{
            checked++;
            todayEl.innerHTML=`<p class="empty-state">Checking ${checked}/${toCheck.length}...</p>`;
            const det=await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);

            if(det.status&&det.status!==show.tmdb_status){
                updateDoc(doc(db,'series',show.docId),{tmdb_status:det.status,last_status_check:new Date().toISOString()}).catch(()=>{});
            }

            if(['Returning Series','In Production'].includes(det.status)&&det.next_episode_to_air){
                const ad=det.next_episode_to_air.air_date;
                // Default air time: midnight local origin
                const airDateTime = new Date(ad + 'T00:00:00Z'); // Default midnight UTC

                // Try to get origin country timezone offset
                const originCountry = (show.origin_country || det.origin_country || [])[0];
                const tzOffsets = {
                    'JP': 9, 'KR': 9, 'CN': 8, 'US': -5, 'GB': 0, 'FR': 1,
                    'DE': 1, 'AU': 10, 'IN': 5.5, 'BR': -3, 'CA': -5
                };
                const originOffset = tzOffsets[originCountry] || 0;
                // Convert origin midnight to UTC, then to Ghana (GMT+0)
                const utcHour = (24 - originOffset) % 24;
                const ghanaTime = new Date(airDateTime);
                ghanaTime.setUTCHours(utcHour, 0, 0, 0);


                const ep={
                    show:show.title, poster:show.poster, docId:show.docId,
                    season:det.next_episode_to_air.season_number,
                    episode:det.next_episode_to_air.episode_number,
                    name:det.next_episode_to_air.name,
                    airDate:ad, airDateObj:new Date(ad),
                    airDateTime: ghanaTime
                };

                if(ad===todayStr) tEps.push(ep);
                else if(ad>todayStr&&ad<=weekStr) wEps.push(ep);
                else if(ad>weekStr&&ad<=monthStr) uEps.push(ep);
            }
            await new Promise(r=>setTimeout(r,300));
        }catch(e){}
    }

    const cacheKey=`upcomingCache_${section}`;
    localStorage.setItem(cacheKey,JSON.stringify({today:tEps,week:wEps,upcoming:uEps}));
    localStorage.setItem(`${cacheKey}_time`,Date.now().toString());

    displayCalItems(todayEl,tEps,true);
    displayCalItems(weekEl,wEps,false);
    displayCalItems(upcomingEl,uEps,false);
}

function displayCalendarFromCache(section, data) {
    const todayEl=document.getElementById(`${section}-calendar-today`);
    const weekEl=document.getElementById(`${section}-calendar-week`);
    const upcomingEl=document.getElementById(`${section}-calendar-upcoming`);
    if(todayEl) displayCalItems(todayEl,data.today||[],true);
    if(weekEl) displayCalItems(weekEl,data.week||[],false);
    if(upcomingEl) displayCalItems(upcomingEl,data.upcoming||[],false);
}

function displayCalItems(container, episodes, isToday) {
    if(!episodes.length){container.innerHTML='<p class="empty-state">No episodes.</p>';return;}
    episodes.sort((a,b)=>new Date(a.airDateObj)-new Date(b.airDateObj));
    container.innerHTML=episodes.map(ep=>{
        const p=safePoster(ep.poster,'thumb');
        return `
            <div class="calendar-item ${isToday?'airing-today':''}" onclick="openDetails('${ep.docId}','tv')">
                <img src="${p}" onerror="this.src='${PLACEHOLDER_THUMB}'">
                <div class="calendar-item-info">
                    <h4>${ep.show}</h4>
                    <div class="episode-title">S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')} - ${ep.name}</div>
                    <div class="air-date ${isToday?'today':''}">
                        📅 ${formatAirDate(new Date(ep.airDateObj))}
                    </div>
                </div>
            </div>`;
    }).join('');
}

function formatAirDate(date) {
    const t=new Date();t.setHours(0,0,0,0);
    const tm=new Date(t);tm.setDate(tm.getDate()+1);
    const c=new Date(date);c.setHours(0,0,0,0);
    if(c.getTime()===t.getTime()) return 'Today';
    if(c.getTime()===tm.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
}

// ===== RESCAN ANIME =====
async function rescanAnime(){
    const statusEl=document.getElementById('settings-action-status');
    const shows=myList.filter(i=>i.type==='tv'&&i.tmdb_id);
    statusEl.innerHTML=`<p style="color:var(--accent);">Scanning ${shows.length} shows...</p>`;
    let changed=0;
    for(let i=0;i<shows.length;i++){
        try{statusEl.innerHTML=`<p style="color:var(--accent);">Scanning ${i+1}/${shows.length}...</p>`;
        const det=await tmdbFetch(`${TMDB_BASE_URL}/tv/${shows[i].tmdb_id}?api_key=${TMDB_API_KEY}`);
        const shouldBe=isAnimeShow(det);
        if(shouldBe!==shows[i].is_anime){await updateDoc(doc(db,'series',shows[i].docId),{is_anime:shouldBe});shows[i].is_anime=shouldBe;changed++;}
        if(i%20===0)await new Promise(r=>setTimeout(r,500));}catch(e){}
    }
    statusEl.innerHTML=`<p style="color:var(--green);">✓ Done! ${changed} shows updated.</p>`;
    await loadMyList();
}

// ===== AUTO TAG STATUSES =====
async function autoTagStatuses(){
    const statusEl=document.getElementById('settings-action-status');
    statusEl.innerHTML='<p style="color:var(--accent);">Tagging...</p>';let changed=0;
    for(const item of myList){
        if(item.type!=='tv')continue;if(item.user_status==='Rewatching')continue;
        const progress=getShowProgressExcludingSpecials(item);
        const hasWatched=item.seasons?.some(s=>s.number!==0&&s.episodes?.some(e=>e.is_watched&&!e.is_special));
        const tmdb=item.tmdb_status||'';let newStatus=item.user_status;
        if(!hasWatched&&!['Dropped','Paused'].includes(item.user_status))newStatus='Planned';
        else if(progress>=100&&(tmdb==='Ended'||tmdb==='Canceled'))newStatus='Finished';
        else if(progress>=100&&tmdb==='Returning Series')newStatus='Up to Date';
        else if(hasWatched&&progress<100&&!['Dropped','Paused','Finished'].includes(item.user_status))newStatus='Watching';
        if(newStatus!==item.user_status){await updateDoc(doc(db,'series',item.docId),{user_status:newStatus});item.user_status=newStatus;changed++;}
    }
    statusEl.innerHTML=`<p style="color:var(--green);">✓ ${changed} shows updated.</p>`;await loadMyList();
}

// ===== BULK TAGGER =====
function openBulkTagger(){
    const modal=document.getElementById('bulk-modal');const body=document.getElementById('bulk-modal-body');
    const shows=myList.filter(i=>i.type==='tv');const movies=myList.filter(i=>i.type==='movie');
    body.innerHTML=`
        <h2 style="margin-bottom:15px;color:var(--accent);">📋 Bulk Tag</h2>
        <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <select id="bulk-type-filter" onchange="filterBulkList()"><option value="all">All</option><option value="anime">Anime</option><option value="tv">TV Shows</option><option value="movie">Movies</option></select>
            <button onclick="selectAllBulk()" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;">Select All</button>
        </div>
        <div class="bulk-list" id="bulk-list">${[...shows,...movies].map(item=>`
            <div class="bulk-item" data-type="${item.type}" data-anime="${item.is_anime||false}">
                <input type="checkbox" value="${item.docId}" data-item-type="${item.type}">
                <img src="${safePoster(item.poster,'thumb')}" onerror="this.src='${PLACEHOLDER_THUMB}'">
                <span class="bulk-item-title">${item.title}</span>
                <span class="bulk-item-status">${item.user_status||(item.is_watched?'Watched':'—')}</span>
            </div>`).join('')}</div>
        <div class="bulk-actions">
            <select id="bulk-action"><option value="">Choose action...</option><option value="Watching">Set: Watching</option><option value="Up to Date">Set: Up to Date</option><option value="Rewatching">Set: Rewatching</option><option value="Finished">Set: Finished</option><option value="Paused">Set: Paused</option><option value="Dropped">Set: Dropped</option><option value="Planned">Set: Planned</option><option value="anime-true">Tag Anime</option><option value="anime-false">Remove Anime</option><option value="fav-true">Mark Favorite</option><option value="fav-false">Remove Favorite</option></select>
            <button onclick="applyBulkAction()">Apply</button>
        </div>`;
    openModal('bulk-modal');
}

function filterBulkList(){const f=document.getElementById('bulk-type-filter').value;document.querySelectorAll('.bulk-item').forEach(item=>{const t=item.dataset.type,a=item.dataset.anime==='true';if(f==='all')item.style.display='flex';else if(f==='anime')item.style.display=a?'flex':'none';else if(f==='tv')item.style.display=(t==='tv'&&!a)?'flex':'none';else if(f==='movie')item.style.display=t==='movie'?'flex':'none';});}
function selectAllBulk(){const vis=document.querySelectorAll('.bulk-item:not([style*="none"]) input[type="checkbox"]');const all=[...vis].every(c=>c.checked);vis.forEach(c=>c.checked=!all);}

async function applyBulkAction(){
    const action=document.getElementById('bulk-action').value;if(!action)return;
    const checked=document.querySelectorAll('.bulk-item input:checked');if(!checked.length){alert('Select items first!');return;}
    for(const cb of checked){const docId=cb.value,itemType=cb.dataset.itemType;const col=itemType==='movie'?'movies':'series';
    try{if(action.startsWith('anime-'))await updateDoc(doc(db,col,docId),{is_anime:action==='anime-true'});
    else if(action.startsWith('fav-'))await updateDoc(doc(db,col,docId),{is_favorite:action==='fav-true'});
    else await updateDoc(doc(db,col,docId),{user_status:action});}catch(e){}}
    closeModal('bulk-modal');await loadMyList();
}

// ===== STATS =====
function openStatsPage(section){
    const body=document.getElementById('stats-modal-body');
    body.innerHTML=`<h2 style="margin-bottom:15px;color:var(--accent);">📊 Statistics</h2>
        <div class="stats-tabs">
            <button class="stats-tab-btn ${section==='anime'?'active':''}" onclick="renderStats('anime')">🎌 Anime</button>
            <button class="stats-tab-btn ${section==='tv'?'active':''}" onclick="renderStats('tv')">📺 TV</button>
            <button class="stats-tab-btn ${section==='movies'?'active':''}" onclick="renderStats('movies')">🎬 Movies</button>
        </div><div id="stats-body"></div>`;
    openModal('stats-modal');renderStats(section);
}

function renderStats(section){
    document.querySelectorAll('.stats-tab-btn').forEach(b=>{b.classList.remove('active');
    if((section==='anime'&&b.textContent.includes('Anime'))||(section==='tv'&&b.textContent.includes('TV'))||(section==='movies'&&b.textContent.includes('Movies')))b.classList.add('active');});
    const container=document.getElementById('stats-body');if(!container)return;
    if(section==='movies'){renderMovieStats(container);return;}

    const items=section==='anime'?getAnime():getTVShows();const epMin=section==='anime'?24:45;
    const excludeGenres=section==='anime'?new Set(['Animation']):new Set();
    let totalEps=0;const statusCounts={},monthCounts={},dayOfWeekCounts=[0,0,0,0,0,0,0],hourCounts=new Array(24).fill(0),bingeData={};
    const genreCounts={},networkCounts={},languageCounts={},decadeCounts={};const showSpeeds=[],longestShows=[];let totalRating=0,ratedCount=0;

    items.forEach(item=>{
        statusCounts[item.user_status||'Unknown']=(statusCounts[item.user_status||'Unknown']||0)+1;
        (item.genres||[]).forEach(g=>{if(excludeGenres.has(g))return;genreCounts[g]=(genreCounts[g]||0)+1;});
        (item.networks||[]).slice(0,1).forEach(n=>{networkCounts[n]=(networkCounts[n]||0)+1;});
        if(item.original_language){const lang=languageCodeToName(item.original_language);languageCounts[lang]=(languageCounts[lang]||0)+1;}
        const yr=item.year||null;if(yr&&yr>1900){const decade=`${Math.floor(yr/10)*10}s`;decadeCounts[decade]=(decadeCounts[decade]||0)+1;}
        if(item.tmdb_rating&&item.tmdb_rating>0){totalRating+=item.tmdb_rating;ratedCount++;}
        if(['Finished','Up to Date'].includes(item.user_status)&&item.created_at){
            const lastWatched=getLastWatchedDate(item);const days=Math.round((new Date(lastWatched)-new Date(item.created_at))/86400000);
            const aired=getAiredEpisodesOnly(item.seasons);
            if(days>0&&days<3650){showSpeeds.push({title:item.title,days,eps:aired.length});longestShows.push({title:item.title,days,eps:aired.length});}
        }
        item.seasons?.forEach(s=>{if(s.number===0)return;s.episodes?.forEach(ep=>{if(!ep.is_watched||ep.is_special)return;totalEps++;
        if(ep.watched_at){const d=new Date(ep.watched_at);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;monthCounts[key]=(monthCounts[key]||0)+1;dayOfWeekCounts[d.getDay()]++;hourCounts[d.getHours()]++;const dayKey=d.toISOString().split('T')[0];bingeData[dayKey]=(bingeData[dayKey]||0)+1;}});});
    });

    const filteredBinge=Object.fromEntries(Object.entries(bingeData).filter(([,c])=>c<=25));
    let longestStreak=0,currentStreak=0;const watchDays=Object.keys(filteredBinge).sort();
    watchDays.forEach((day,i)=>{if(i===0)currentStreak=1;else{const diff=(new Date(day)-new Date(watchDays[i-1]))/86400000;currentStreak=diff===1?currentStreak+1:1;}if(currentStreak>longestStreak)longestStreak=currentStreak;});
    const topBingeDays=Object.entries(filteredBinge).sort((a,b)=>b[1]-a[1]).slice(0,5);
    showSpeeds.sort((a,b)=>(b.eps/Math.max(b.days,1))-(a.eps/Math.max(a.days,1)));longestShows.sort((a,b)=>b.days-a.days);
    const monthKeys=Object.keys(monthCounts).sort();const avgPerMonth=monthKeys.length?Math.round(totalEps/monthKeys.length):0;const avgPerWeek=Math.round(avgPerMonth/4.3);
    const remaining=items.reduce((sum,item)=>sum+getAiredEpisodesOnly(item.seasons).filter(ep=>!ep.is_watched).length,0);
    const twoMonthsAgo=new Date(Date.now()-60*24*60*60*1000);let recentEps=0;
    items.forEach(item=>{item.seasons?.forEach(s=>{if(s.number===0)return;s.episodes?.forEach(ep=>{if(ep.is_watched&&ep.watched_at&&!ep.is_special&&new Date(ep.watched_at)>=twoMonthsAgo)recentEps++;});});});
    const recentPerWeek=Math.round(recentEps/8);const weeksToFinish=recentPerWeek>0?Math.ceil(remaining/recentPerWeek):null;
    const finishDate=weeksToFinish?new Date(Date.now()+weeksToFinish*7*24*60*60*1000).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}):null;
    const finishedCount=(statusCounts['Finished']||0)+(statusCounts['Up to Date']||0);const totalStarted=items.filter(i=>i.user_status!=='Planned').length;
    const dropRate=totalStarted>0?Math.round(((statusCounts['Dropped']||0)/totalStarted)*100):0;const completeRate=totalStarted>0?Math.round((finishedCount/totalStarted)*100):0;
    const peakHour=hourCounts.indexOf(Math.max(...hourCounts));const peakPeriod=peakHour<6?'Late Night 🌙':peakHour<12?'Morning ☀️':peakHour<17?'Afternoon 🌤':peakHour<21?'Evening 🌆':'Night 🌃';
    const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const peakDay=dayNames[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))];
    const weekendEps=dayOfWeekCounts[0]+dayOfWeekCounts[6];const weekdayEps=dayOfWeekCounts.slice(1,6).reduce((a,b)=>a+b,0);
    const watcherType=weekendEps>weekdayEps?'Weekend Watcher 📅':'Weekday Watcher 💼';
    const activeDays=Object.keys(filteredBinge).length;const avgBinge=activeDays>0?(totalEps/activeDays).toFixed(1):0;
    const bingeType=avgBinge>=5?'Binge Watcher 🍿':avgBinge>=2?'Casual Watcher 📺':'Light Watcher ☕';
    const topGenres=Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);const topNetworks=Object.entries(networkCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const topLanguages=Object.entries(languageCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);const topDecades=Object.entries(decadeCounts).sort((a,b)=>b[1]-a[1]);
    const topGenreShare=topGenres.length&&items.length?Math.round((topGenres[0][1]/items.length)*100):0;
    const genreLoyalty=topGenreShare>=60?'Genre Loyalist 🎯':topGenreShare>=40?'Genre Curious 🔍':'Genre Explorer 🌍';
    const avgRating=ratedCount>0?(totalRating/ratedCount).toFixed(1):'N/A';
    const seasonCounts={Spring:0,Summer:0,Autumn:0,Winter:0};
    Object.entries(monthCounts).forEach(([key,count])=>{const month=parseInt(key.split('-')[1]);if(month>=3&&month<=5)seasonCounts.Spring+=count;else if(month>=6&&month<=8)seasonCounts.Summer+=count;else if(month>=9&&month<=11)seasonCounts.Autumn+=count;else seasonCounts.Winter+=count;});
    const topSeason=Object.entries(seasonCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
    const completedWithPop=items.filter(i=>['Finished','Up to Date'].includes(i.user_status)&&i.popularity).sort((a,b)=>a.popularity-b.popularity);
    const rarestWatch=completedWithPop[0]?.title||'—';
    const simultaneouslyWatching=items.filter(i=>i.user_status==='Watching'||(i.user_status==='Up to Date'&&isCurrentlyAiring(i))).length;

    container.innerHTML=`
        <div class="stats-card"><h4>📈 Overview</h4>
        <div class="stats-row"><span class="stats-label">Total Shows</span><span class="stats-value">${items.length}</span></div>
        <div class="stats-row"><span class="stats-label">Episodes Watched</span><span class="stats-value">${totalEps.toLocaleString()}</span></div>
        <div class="stats-row"><span class="stats-label">Total Watch Time</span><span class="stats-value">${formatWatchTime(totalEps*epMin)}</span></div>
        <div class="stats-row"><span class="stats-label">Completed</span><span class="stats-value">${finishedCount}</span></div>
        <div class="stats-row"><span class="stats-label">In Progress</span><span class="stats-value">${statusCounts['Watching']||0}</span></div>
        <div class="stats-row"><span class="stats-label">Simultaneously</span><span class="stats-value">${simultaneouslyWatching}</span></div>
        <div class="stats-row"><span class="stats-label">Completion Rate</span><span class="stats-value">${completeRate}%</span></div>
        <div class="stats-row"><span class="stats-label">Drop Rate</span><span class="stats-value">${dropRate}%</span></div>
        <div class="stats-row"><span class="stats-label">Avg TMDB Rating</span><span class="stats-value">⭐ ${avgRating}/10</span></div></div>
        <div class="stats-card"><h4>⚡ Speed</h4>
        <div class="stats-row"><span class="stats-label">Avg Eps/Month</span><span class="stats-value">${avgPerMonth}</span></div>
        <div class="stats-row"><span class="stats-label">Avg Eps/Week</span><span class="stats-value">${avgPerWeek}</span></div>
        <div class="stats-row"><span class="stats-label">Recent (2mo)</span><span class="stats-value">${recentPerWeek}/week</span></div>
        <div class="stats-row"><span class="stats-label">Longest Streak</span><span class="stats-value">${longestStreak} days</span></div></div>
        <div class="stats-card"><h4>📋 Backlog</h4>
        <div class="stats-row"><span class="stats-label">Remaining Eps</span><span class="stats-value">${remaining.toLocaleString()}</span></div>
        <div class="stats-row"><span class="stats-label">Remaining Time</span><span class="stats-value">${formatWatchTime(remaining*epMin)}</span></div>
        <div class="stats-row"><span class="stats-label">At Current Pace</span><span class="stats-value">${recentPerWeek>0?`${weeksToFinish} weeks`:'∞'}</span></div>
        <div class="stats-row"><span class="stats-label">Catch-Up Date</span><span class="stats-value">${finishDate||'—'}</span></div></div>
        <div class="stats-card"><h4>🧠 Habits</h4>
        <div class="stats-row"><span class="stats-label">Type</span><span class="stats-value">${watcherType}</span></div>
        <div class="stats-row"><span class="stats-label">Style</span><span class="stats-value">${bingeType}</span></div>
        <div class="stats-row"><span class="stats-label">Avg/Active Day</span><span class="stats-value">${avgBinge}</span></div>
        <div class="stats-row"><span class="stats-label">Peak Time</span><span class="stats-value">${peakPeriod}</span></div>
        <div class="stats-row"><span class="stats-label">Active Day</span><span class="stats-value">${peakDay}</span></div>
        <div class="stats-row"><span class="stats-label">Season</span><span class="stats-value">${topSeason} 📅</span></div>
        <div class="stats-row"><span class="stats-label">Weekend</span><span class="stats-value">${weekendEps.toLocaleString()}</span></div>
        <div class="stats-row"><span class="stats-label">Weekday</span><span class="stats-value">${weekdayEps.toLocaleString()}</span></div></div>
        <div class="stats-card"><h4>🎭 Content</h4>
        <div class="stats-row"><span class="stats-label">Genre Style</span><span class="stats-value">${genreLoyalty}</span></div>
        <div class="stats-row"><span class="stats-label">Rarest</span><span class="stats-value" style="font-size:11px;max-width:160px;text-align:right;">${rarestWatch}</span></div>
        ${topGenres.map(([g,c])=>`<div class="stats-row"><span class="stats-label">🎬 ${g}</span><span class="stats-value">${c}</span></div>`).join('')}</div>
        ${topNetworks.length?`<div class="stats-card"><h4>📺 Networks</h4>${topNetworks.map(([n,c])=>`<div class="stats-row"><span class="stats-label">${n}</span><span class="stats-value">${c}</span></div>`).join('')}</div>`:''}
        ${topLanguages.length?`<div class="stats-card"><h4>🌍 Languages</h4>${topLanguages.map(([l,c])=>`<div class="stats-row"><span class="stats-label">${l}</span><span class="stats-value">${c}</span></div>`).join('')}</div>`:''}
        ${topDecades.length?`<div class="stats-card"><h4>📅 Decades</h4>${topDecades.map(([d,c])=>`<div class="stats-row"><span class="stats-label">${d}</span><span class="stats-value">${c}</span></div>`).join('')}</div>`:''}
        ${topBingeDays.length?`<div class="stats-card"><h4>🍿 Binge Days</h4>${topBingeDays.map(([date,count],i)=>`<div class="stats-row"><span class="stats-label">${i+1}. ${new Date(date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</span><span class="stats-value">${count} eps</span></div>`).join('')}</div>`:''}
        ${showSpeeds.length?`<div class="stats-card"><h4>🏎 Fastest</h4>${showSpeeds.slice(0,5).map((s,i)=>`<div class="stats-row"><span class="stats-label" style="font-size:12px;">${i+1}. ${s.title}</span><span class="stats-value">${s.eps}ep/${s.days}d</span></div>`).join('')}</div>`:''}
        ${longestShows.length?`<div class="stats-card"><h4>🐢 Slowest</h4>${longestShows.slice(0,5).map((s,i)=>`<div class="stats-row"><span class="stats-label" style="font-size:12px;">${i+1}. ${s.title}</span><span class="stats-value">${Math.round(s.days/30)}mo</span></div>`).join('')}</div>`:''}
        <div class="stats-chart-container"><h4>📊 Status</h4><canvas id="stats-status-chart"></canvas></div>
        <div class="stats-chart-container"><h4>📅 Monthly</h4><canvas id="stats-monthly-chart"></canvas></div>
        <div class="stats-chart-container"><h4>📆 Day of Week</h4><canvas id="stats-dow-chart"></canvas></div>
        ${topGenres.length?`<div class="stats-chart-container"><h4>🎭 Genres</h4><canvas id="stats-genre-chart"></canvas></div>`:''}`;

    const sc=document.getElementById('stats-status-chart');
    if(sc){const colorMap={'Watching':'#FFC107','Up to Date':'#4CAF50','Finished':'#2196F3','Dropped':'#f44336','Paused':'#FF9800','Planned':'#9E9E9E','Rewatching':'#9C27B0'};new Chart(sc.getContext('2d'),{type:'doughnut',data:{labels:Object.keys(statusCounts),datasets:[{data:Object.values(statusCounts),backgroundColor:Object.keys(statusCounts).map(s=>colorMap[s]||'#666')}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11}}}}}});}
    const mc=document.getElementById('stats-monthly-chart');
    if(mc&&monthKeys.length){const last12=monthKeys.slice(-12);const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];new Chart(mc.getContext('2d'),{type:'bar',data:{labels:last12.map(k=>{const[y,m]=k.split('-');return`${months[parseInt(m)-1]} ${y.slice(2)}`;}),datasets:[{label:'Eps',data:last12.map(k=>monthCounts[k]||0),backgroundColor:'rgba(30,60,114,0.6)',borderColor:'rgba(30,60,114,1)',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});}
    const dc=document.getElementById('stats-dow-chart');
    if(dc){new Chart(dc.getContext('2d'),{type:'bar',data:{labels:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],datasets:[{label:'Eps',data:dayOfWeekCounts,backgroundColor:['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40','#FF6384'],borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});}
    const gc=document.getElementById('stats-genre-chart');
    if(gc&&topGenres.length){new Chart(gc.getContext('2d'),{type:'bar',data:{labels:topGenres.map(([g])=>g),datasets:[{label:'Shows',data:topGenres.map(([,c])=>c),backgroundColor:'rgba(255,107,53,0.7)',borderColor:'rgba(255,107,53,1)',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}},indexAxis:'y'}});}
}

function renderMovieStats(container){
    const movies=getMovies();const twoMonthsAgo=new Date(Date.now()-60*24*60*60*1000);
    const watched=movies.filter(m=>m.is_watched);const rewatched=movies.reduce((s,m)=>s+(m.rewatch_count||0),0);
    const monthCounts={},dayOfWeekCounts=[0,0,0,0,0,0,0],genreCounts={},languageCounts={},decadeCounts={};
    let totalRating=0,ratedCount=0;
    movies.forEach(m=>{(m.genres||[]).forEach(g=>{genreCounts[g]=(genreCounts[g]||0)+1;});if(m.original_language){languageCounts[languageCodeToName(m.original_language)]=(languageCounts[languageCodeToName(m.original_language)]||0)+1;}const yr=m.year;if(yr&&yr>1900){decadeCounts[`${Math.floor(yr/10)*10}s`]=(decadeCounts[`${Math.floor(yr/10)*10}s`]||0)+1;}if(m.tmdb_rating&&m.tmdb_rating>0){totalRating+=m.tmdb_rating;ratedCount++;}});
    watched.forEach(m=>{if(m.watched_at){const d=new Date(m.watched_at);monthCounts[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`]=(monthCounts[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`]||0)+1;dayOfWeekCounts[d.getDay()]++;}});
    const monthKeys=Object.keys(monthCounts).sort();const avgPerMonth=monthKeys.length?(watched.length/monthKeys.length).toFixed(1):0;
    const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const peakDay=dayNames[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))];
    const unwatched=movies.filter(m=>!m.is_watched).length;const avgRating=ratedCount>0?(totalRating/ratedCount).toFixed(1):'N/A';
    const topGenres=Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);const topLanguages=Object.entries(languageCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);const topDecades=Object.entries(decadeCounts).sort((a,b)=>b[1]-a[1]);
    const recentWatched=movies.filter(m=>m.is_watched&&m.watched_at&&new Date(m.watched_at)>=twoMonthsAgo).length;
    const recentPerWeek=(recentWatched/8).toFixed(1);const weeksToFinish=recentWatched>0?Math.ceil(unwatched/(recentWatched/8)):null;
    const finishDate=weeksToFinish?new Date(Date.now()+weeksToFinish*7*24*60*60*1000).toLocaleDateString('en-US',{year:'numeric',month:'long'}):null;

    container.innerHTML=`
        <div class="stats-card"><h4>📈 Overview</h4>
        <div class="stats-row"><span class="stats-label">Total</span><span class="stats-value">${movies.length}</span></div>
        <div class="stats-row"><span class="stats-label">Watched</span><span class="stats-value">${watched.length}</span></div>
        <div class="stats-row"><span class="stats-label">Unwatched</span><span class="stats-value">${unwatched}</span></div>
        <div class="stats-row"><span class="stats-label">Rewatched</span><span class="stats-value">${rewatched}</span></div>
        <div class="stats-row"><span class="stats-label">Watch Time</span><span class="stats-value">${formatWatchTime(watched.length*100)}</span></div>
        <div class="stats-row"><span class="stats-label">Avg/Month</span><span class="stats-value">${avgPerMonth}</span></div>
        <div class="stats-row"><span class="stats-label">Active Day</span><span class="stats-value">${peakDay}</span></div>
        <div class="stats-row"><span class="stats-label">Avg Rating</span><span class="stats-value">⭐ ${avgRating}/10</span></div></div>
        <div class="stats-card"><h4>📋 Backlog</h4>
        <div class="stats-row"><span class="stats-label">Unwatched</span><span class="stats-value">${unwatched}</span></div>
        <div class="stats-row"><span class="stats-label">Pace</span><span class="stats-value">${recentPerWeek}/week</span></div>
        <div class="stats-row"><span class="stats-label">Catch-Up</span><span class="stats-value">${finishDate||'—'}</span></div></div>
        ${topGenres.length?`<div class="stats-card"><h4>🎭 Genres</h4>${topGenres.map(([g,c])=>`<div class="stats-row"><span class="stats-label">${g}</span><span class="stats-value">${c}</span></div>`).join('')}</div>`:''}
        ${topLanguages.length?`<div class="stats-card"><h4>🌍 Languages</h4>${topLanguages.map(([l,c])=>`<div class="stats-row"><span class="stats-label">${l}</span><span class="stats-value">${c}</span></div>`).join('')}</div>`:''}
        ${topDecades.length?`<div class="stats-card"><h4>📅 Decades</h4>${topDecades.map(([d,c])=>`<div class="stats-row"><span class="stats-label">${d}</span><span class="stats-value">${c}</span></div>`).join('')}</div>`:''}
        <div class="stats-chart-container"><h4>📅 Monthly</h4><canvas id="stats-monthly-chart"></canvas></div>
        <div class="stats-chart-container"><h4>📆 Day of Week</h4><canvas id="stats-dow-chart"></canvas></div>
        ${topGenres.length?`<div class="stats-chart-container"><h4>🎭 Genres</h4><canvas id="stats-genre-chart"></canvas></div>`:''}`;

    const mc=document.getElementById('stats-monthly-chart');
    if(mc&&monthKeys.length){const last12=monthKeys.slice(-12);const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];new Chart(mc.getContext('2d'),{type:'bar',data:{labels:last12.map(k=>{const[y,m]=k.split('-');return`${months[parseInt(m)-1]} ${y.slice(2)}`;}),datasets:[{label:'Movies',data:last12.map(k=>monthCounts[k]||0),backgroundColor:'rgba(156,39,176,0.6)',borderColor:'rgba(156,39,176,1)',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});}
    const dc=document.getElementById('stats-dow-chart');
    if(dc){new Chart(dc.getContext('2d'),{type:'bar',data:{labels:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],datasets:[{label:'Movies',data:dayOfWeekCounts,backgroundColor:'rgba(156,39,176,0.4)',borderColor:'rgba(156,39,176,1)',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});}
    const gc=document.getElementById('stats-genre-chart');
    if(gc&&topGenres.length){new Chart(gc.getContext('2d'),{type:'bar',data:{labels:topGenres.map(([g])=>g),datasets:[{label:'Movies',data:topGenres.map(([,c])=>c),backgroundColor:'rgba(156,39,176,0.6)',borderColor:'rgba(156,39,176,1)',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}},indexAxis:'y'}});}
}

function languageCodeToName(code){const map={'en':'English','ja':'Japanese','ko':'Korean','zh':'Chinese','fr':'French','es':'Spanish','de':'German','it':'Italian','pt':'Portuguese','hi':'Hindi','ar':'Arabic','ru':'Russian','tr':'Turkish','th':'Thai','id':'Indonesian','nl':'Dutch','sv':'Swedish','da':'Danish','no':'Norwegian','fi':'Finnish'};return map[code]||code?.toUpperCase()||'Unknown';}

// ===== EXPORTS / PERSONAL LIST =====
async function exportData(format){
    const movies=getMovies(),tv=getTVShows(),anime=getAnime();
    if(format==='json') downloadFile('my-cinema-export.json',JSON.stringify({movies,tv_shows:tv,anime,exported_at:new Date().toISOString()},null,2),'application/json');
    else if(format==='csv'){let csv='Type,Title,Year,Status,Rating,MyRating,Watched,Favorite\n';movies.forEach(m=>csv+=`Movie,"${m.title}",${m.year||''},${m.is_watched?'Watched':'Unwatched'},${m.tmdb_rating||''},${m.my_rating||''},${m.is_watched?'Yes':'No'},${m.is_favorite?'Yes':'No'}\n`);[...tv,...anime].forEach(s=>csv+=`${s.is_anime?'Anime':'TV'},"${s.title}",${s.year||''},${s.user_status||''},${s.tmdb_rating||''},${s.my_rating||''},-,${s.is_favorite?'Yes':'No'}\n`);downloadFile('my-cinema-export.csv',csv,'text/csv');}
    else if(format==='txt'){let txt=`MY CINEMA TRACKER\n${new Date().toLocaleDateString()}\n\n=== ANIME (${anime.length}) ===\n`;anime.forEach(s=>txt+=`[${s.user_status||'?'}] ${s.title} (${s.year||'?'})\n`);txt+=`\n=== TV (${tv.length}) ===\n`;tv.forEach(s=>txt+=`[${s.user_status||'?'}] ${s.title} (${s.year||'?'})\n`);txt+=`\n=== MOVIES (${movies.length}) ===\n`;movies.forEach(m=>txt+=`${m.is_watched?'✓':'○'} ${m.title} (${m.year||'?'})\n`);downloadFile('my-cinema-export.txt',txt,'text/plain');}
}

function openPersonalListModal(){
    let modal=document.getElementById('personal-list-modal');
    if(!modal){modal=document.createElement('div');modal.id='personal-list-modal';modal.className='modal';modal.style.zIndex='2000';
    modal.innerHTML=`<div class="modal-content" style="max-width:480px;"><span class="close" onclick="closeModal('personal-list-modal')">&times;</span><div id="personal-list-body"></div></div>`;document.body.appendChild(modal);}
    document.getElementById('personal-list-body').innerHTML=`
        <h3 style="color:var(--accent);margin-bottom:16px;">📃 Personal List Export</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:12px;">Select what to export:</p>
        <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-anime" checked> Anime</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-tv" checked> TV Shows</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-movies"> Movies</label>
        </div>
        <p style="color:var(--text2);font-size:13px;margin-bottom:10px;">Filter by status:</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-watched" checked> Watched (Watching + Up to Date + Finished + Rewatching)</label>
            <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-planned"> Planned</label>
            <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-paused"> Paused</label>
            <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-dropped"> Dropped</label>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button onclick="closeModal('personal-list-modal')" style="padding:10px 20px;border:2px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;cursor:pointer;">Cancel</button>
            <button onclick="generatePersonalList()" style="padding:10px 24px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Export</button>
        </div>`;
    openModal('personal-list-modal');
}

function generatePersonalList(){
    const includeAnime=document.getElementById('pl-anime')?.checked;const includeTv=document.getElementById('pl-tv')?.checked;const includeMovies=document.getElementById('pl-movies')?.checked;
    const inclWatched=document.getElementById('pl-watched')?.checked;const inclPlanned=document.getElementById('pl-planned')?.checked;const inclPaused=document.getElementById('pl-paused')?.checked;const inclDropped=document.getElementById('pl-dropped')?.checked;
    if(!includeAnime&&!includeTv&&!includeMovies){alert('Select at least one type.');return;}
    if(!inclWatched&&!inclPlanned&&!inclPaused&&!inclDropped){alert('Select at least one status.');return;}
    const watchedStatuses=new Set(['Watching','Up to Date','Finished','Rewatching']);
    function filterByStatus(items,isMovie=false){const groups={};
    if(isMovie){if(inclWatched){const w=items.filter(i=>i.is_watched);if(w.length)groups['Watched']=w;}const uw=items.filter(i=>!i.is_watched);if(inclPlanned&&uw.length)groups['Planned / Unwatched']=uw;}
    else{if(inclWatched){const w=items.filter(i=>watchedStatuses.has(i.user_status));if(w.length)groups['Watched']=w;}if(inclPlanned){const p=items.filter(i=>i.user_status==='Planned');if(p.length)groups['Planned']=p;}if(inclPaused){const p=items.filter(i=>i.user_status==='Paused');if(p.length)groups['Paused']=p;}if(inclDropped){const d=items.filter(i=>i.user_status==='Dropped');if(d.length)groups['Dropped']=d;}}return groups;}

    let txt=`MY CINEMA — PERSONAL LIST\n${new Date().toLocaleDateString()}\n${'='.repeat(30)}\n\n`;let totalCount=0;
    if(includeAnime){const items=getAnime().sort((a,b)=>(a.title||'').localeCompare(b.title||''));const groups=filterByStatus(items);if(Object.keys(groups).length){txt+=`🎌 ANIME\n${'─'.repeat(20)}\n\n`;Object.entries(groups).forEach(([status,items])=>{txt+=`[ ${status.toUpperCase()} — ${items.length} ]\n`;items.forEach((item,i)=>{txt+=`${i+1}. ${item.title}${item.year?` (${item.year})`:''}${item.my_rating?` ★${item.my_rating}/10`:''}\n`;totalCount++;});txt+='\n';});}}
    if(includeTv){const items=getTVShows().sort((a,b)=>(a.title||'').localeCompare(b.title||''));const groups=filterByStatus(items);if(Object.keys(groups).length){txt+=`📺 TV SHOWS\n${'─'.repeat(20)}\n\n`;Object.entries(groups).forEach(([status,items])=>{txt+=`[ ${status.toUpperCase()} — ${items.length} ]\n`;items.forEach((item,i)=>{txt+=`${i+1}. ${item.title}${item.year?` (${item.year})`:''}${item.my_rating?` ★${item.my_rating}/10`:''}\n`;totalCount++;});txt+='\n';});}}
    if(includeMovies){const items=getMovies().sort((a,b)=>(a.title||'').localeCompare(b.title||''));const groups=filterByStatus(items,true);if(Object.keys(groups).length){txt+=`🎬 MOVIES\n${'─'.repeat(20)}\n\n`;Object.entries(groups).forEach(([status,items])=>{txt+=`[ ${status.toUpperCase()} — ${items.length} ]\n`;items.forEach((item,i)=>{txt+=`${i+1}. ${item.title}${item.year?` (${item.year})`:''}${item.my_rating?` ★${item.my_rating}/10`:''}\n`;totalCount++;});txt+='\n';});}}
    txt+=`${'='.repeat(30)}\nTotal: ${totalCount} titles\n`;
    downloadFile('my-cinema-personal-list.txt',txt,'text/plain');closeModal('personal-list-modal');
}

function downloadFile(name,content,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();}

// ===== IMPORT =====
async function importMovies(){const jsonText=document.getElementById('movies-json').value;const st=document.getElementById('import-status');try{const movies=JSON.parse(jsonText);let imp=0,fail=0;st.className='success';st.textContent=`Importing... 0/${movies.length}`;for(const movie of movies){try{const docId=`movie_${movie.id.tvdb||movie.id.imdb}`;let poster=PLACEHOLDER_POSTER,tmdbId=null,tmdbRating=null;if(movie.id.imdb){try{const d=await tmdbFetch(`${TMDB_BASE_URL}/find/${movie.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);if(d.movie_results?.length){tmdbId=d.movie_results[0].id;poster=d.movie_results[0].poster_path?TMDB_IMG_BASE+d.movie_results[0].poster_path:poster;tmdbRating=d.movie_results[0].vote_average||null;}}catch(e){}}if(!tmdbId&&movie.title){try{const d=await tmdbFetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year}`);if(d.results?.length){tmdbId=d.results[0].id;poster=d.results[0].poster_path?TMDB_IMG_BASE+d.results[0].poster_path:poster;tmdbRating=d.results[0].vote_average||null;}}catch(e){}}await setDoc(doc(db,'movies',docId),{tmdb_id:tmdbId,imdb_id:movie.id.imdb,tvdb_id:movie.id.tvdb,title:movie.title,year:movie.year,poster,tmdb_rating:tmdbRating,is_watched:movie.is_watched||false,watched_at:movie.watched_at||null,is_favorite:movie.is_favorite||false,rewatch_count:movie.rewatch_count||0,rewatch_history:[],my_rating:null,created_at:movie.created_at||new Date().toISOString()});imp++;st.textContent=`Importing... ${imp}/${movies.length} (${fail} failed)`;if(imp%30===0)await new Promise(r=>setTimeout(r,1000));}catch(e){fail++;}}st.textContent=`✓ ${imp} imported! (${fail} failed)`;await loadMyList();}catch(e){st.className='error';st.textContent=`✗ ${e.message}`;}}

async function importSeries(){const jsonText=document.getElementById('series-json').value;const st=document.getElementById('import-status');try{const series=JSON.parse(jsonText);let imp=0,fail=0;st.className='success';st.textContent=`Importing... 0/${series.length}`;for(const show of series){try{const docId=`tv_${show.id.tvdb||show.id.imdb}`;let poster=PLACEHOLDER_POSTER,tmdbId=null,tmdbStatus='Unknown',tmdbRating=null,anime=false;if(show.id.imdb){try{const d=await tmdbFetch(`${TMDB_BASE_URL}/find/${show.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);if(d.tv_results?.length){tmdbId=d.tv_results[0].id;poster=d.tv_results[0].poster_path?TMDB_IMG_BASE+d.tv_results[0].poster_path:poster;tmdbRating=d.tv_results[0].vote_average||null;}}catch(e){}}if(!tmdbId&&show.title){try{const clean=show.title.replace(/\s*\(\d{4}\)\s*$/,'');const d=await tmdbFetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(clean)}`);if(d.results?.length){tmdbId=d.results[0].id;poster=d.results[0].poster_path?TMDB_IMG_BASE+d.results[0].poster_path:poster;tmdbRating=d.results[0].vote_average||null;}}catch(e){}}if(tmdbId){try{const det=await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);tmdbStatus=det.status||'Unknown';anime=isAnimeShow(det);if(!tmdbRating)tmdbRating=det.vote_average||null;}catch(e){}}const statusMap={'up_to_date':'Up to Date','watching':'Watching','watched':'Finished','dropped':'Dropped','on_hold':'Paused','plan_to_watch':'Planned'};const seasons=(show.seasons||[]).map(s=>({number:s.number,is_specials:s.number===0,episodes:(s.episodes||[]).map(ep=>({number:ep.number,name:ep.name||`Episode ${ep.number}`,air_date:ep.air_date||null,is_watched:ep.is_watched||false,watched_at:ep.watched_at||null,rewatch_count:ep.rewatch_count||0,rewatch_history:[],is_special:s.number===0,my_rating:null}))}));await setDoc(doc(db,'series',docId),{tmdb_id:tmdbId,imdb_id:show.id.imdb,tvdb_id:show.id.tvdb,title:show.title,year:show.year||null,poster,tmdb_rating:tmdbRating,user_status:statusMap[show.status]||'Watching',tmdb_status:tmdbStatus,last_status_check:new Date().toISOString(),last_synced:new Date().toISOString(),is_favorite:show.is_favorite||false,is_anime:anime,seasons,my_rating:null,created_at:show.created_at||new Date().toISOString()});imp++;st.textContent=`Importing... ${imp}/${series.length} (${fail} failed)`;if(imp%20===0)await new Promise(r=>setTimeout(r,1500));}catch(e){fail++;console.error('Failed:',show.title,e);}}st.textContent=`✓ ${imp} imported! (${fail} failed)`;await loadMyList();}catch(e){st.className='error';st.textContent=`✗ ${e.message}`;}}

// ===== CLOSE MODALS =====
window.addEventListener('click',(e)=>{
    [...MODAL_IDS,'tag-specials-modal','rate-shows-modal','personal-list-modal'].forEach(id=>{if(e.target===document.getElementById(id))closeModal(id);});
    if(!e.target.closest('.show-options'))document.querySelectorAll('.options-menu').forEach(m=>m.classList.remove('show'));
});

document.querySelector('#modal .close').addEventListener('click',()=>{closeModal('modal');});
document.getElementById('import-movies-btn').addEventListener('click',importMovies);
document.getElementById('import-series-btn').addEventListener('click',importSeries);

// ===== GLOBALS =====
window.openDetails=openDetails;window.openPreview=openPreview;window.openEpisodeDetail=openEpisodeDetail;
window.addToList=addToList;window.removeFromList=removeFromList;window.removeFromListByTMDB=removeFromListByTMDB;
window.toggleEpisode=toggleEpisode;window.toggleFavorite=toggleFavorite;window.toggleWatched=toggleWatched;
window.markSeasonWatched=markSeasonWatched;window.quickMarkWatched=quickMarkWatched;
window.setUserStatus=setUserStatus;window.toggleAnimeStatus=toggleAnimeStatus;
window.toggleOptionsMenu=toggleOptionsMenu;window.toggleSeason=toggleSeason;
window.switchDetailTab=switchDetailTab;window.switchSection=switchSection;window.switchSubTab=switchSubTab;
window.renderLibrary=renderLibrary;window.loadSectionCalendar=loadSectionCalendar;
window.exportData=exportData;window.openPersonalListModal=openPersonalListModal;window.generatePersonalList=generatePersonalList;
window.handlePreviewAdd=handlePreviewAdd;window.openStatsPage=openStatsPage;window.renderStats=renderStats;
window.rescanAnime=rescanAnime;window.autoTagStatuses=autoTagStatuses;
window.openBulkTagger=openBulkTagger;window.filterBulkList=filterBulkList;window.selectAllBulk=selectAllBulk;window.applyBulkAction=applyBulkAction;
window.openTagSpecialsModal=openTagSpecialsModal;window.applySpecialTags=applySpecialTags;window.filterTagSpecials=filterTagSpecials;
window.syncAllAiringShows=syncAllAiringShows;window.enrichLibrary=enrichLibrary;
window.openRateShowsModal=openRateShowsModal;window.filterRateList=filterRateList;window.rateShowInline=rateShowInline;window.setMyRating=setMyRating;
window.closeModal=closeModal;window.refreshApp=refreshApp;
window.setAccentColor=setAccentColor;window.setRewatchColor=setRewatchColor;
window.setCardStyle=setCardStyle;window.setPosterSize=setPosterSize;window.setFontSize=setFontSize;
window.toggleSettingsGroup=toggleSettingsGroup;window.toggleImportSection=toggleImportSection;
window.jumpToSection=jumpToSection;
