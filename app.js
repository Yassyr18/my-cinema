// ===== FIREBASE =====
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc, updateDoc, onSnapshot }
    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyBPP2z4q90HhlQBrTLHaxxNnubMy1IrqI4",
    authDomain: "my-cinema-e5a0d.firebaseapp.com",
    projectId: "my-cinema-e5a0d",
    storageBucket: "my-cinema-e5a0d.firebasestorage.app",
    messagingSenderId: "260887036992",
    appId: "1:260887036992:web:5e6412e21622fc254c4ba5"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ===== API CONSTANTS =====
const TMDB_API_KEY  = '73ae67fa40ec16ffe7a242b6d2a4e1d9';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TVMAZE_BASE   = 'https://api.tvmaze.com';
const JIKAN_BASE    = 'https://api.jikan.moe/v4';

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

// ===== STATE =====
let myList = [];
let currentSearchType       = 'multi';
let currentSection          = 'anime';
let isLoading               = false;
let isSyncing               = false;   // G2: pause listener during sync
let activeDetailTab         = 'info-tab';
let expandedSeasons         = new Set();
let scrollPosition          = 0;
let currentCollectionFilter = 'all';
const lastScrolledEpisode   = new Map();
let actionInProgress        = false;   // G1: double-tap protection
let activeCharts            = {};      // Chart.js instance tracking

function seasonKey(docId, seasonNum) { return `${docId}_season_${seasonNum}`; }

// ===== EPISODE CAPS PER DAY =====
const ANIME_EPS_PER_DAY = 25;
const ANIME_EP_MINUTES  = 24;
const TV_EPS_PER_DAY    = 13;
const TV_EP_MINUTES     = 45;

// ===== HISTORY CAP =====
const HISTORY_CAP = 100; // G9: max episodes shown in history tab

// ===== ERROR LOGGING — ENHANCED =====
const errorLog = [];
function logError(context, error, meta = {}) {
    const entry = {
        time: new Date().toISOString(),
        context,
        message: error?.message || String(error),
        stack: error?.stack || null,
        // Enhanced context fields
        show: meta.show || null,
        operation: meta.operation || null,
        episode: meta.episode || null,
        seasonNum: meta.seasonNum || null,
        docId: meta.docId || null,
        firebaseCode: error?.code || null,
        httpStatus: meta.httpStatus || null,
        url: meta.url || null
    };
    errorLog.push(entry);
    if (errorLog.length > 200) errorLog.shift();
    console.error(`[${context}]`, error, meta);
}

function generateErrorLog() {
    if (!errorLog.length) { alert('No errors logged! Everything is working fine.'); return; }
    const lines = errorLog.map(e => {
        const parts = [
            `[${e.time}] ${e.context}`,
            `  Message: ${e.message}`
        ];
        if (e.show)        parts.push(`  Show: ${e.show}`);
        if (e.docId)       parts.push(`  DocId: ${e.docId}`);
        if (e.operation)   parts.push(`  Operation: ${e.operation}`);
        if (e.episode)     parts.push(`  Episode: ${e.episode}`);
        if (e.seasonNum !== null && e.seasonNum !== undefined) parts.push(`  Season: ${e.seasonNum}`);
        if (e.firebaseCode) parts.push(`  Firebase Code: ${e.firebaseCode}`);
        if (e.httpStatus)  parts.push(`  HTTP Status: ${e.httpStatus}`);
        if (e.url)         parts.push(`  URL: ${e.url}`);
        if (e.stack)       parts.push(`  Stack: ${e.stack.split('\n').slice(0, 4).join('\n  ')}`);
        return parts.join('\n');
    });
    const full = [
        'MY CINEMA TRACKER — ERROR LOG',
        `Generated: ${new Date().toISOString()}`,
        `App Version: v5.6`,
        `Library size: ${myList.length} items`,
        `Errors logged: ${errorLog.length}`,
        `Episode source: ${getEpisodeSource()}`,
        `Dark mode: ${localStorage.getItem('darkMode')}`,
        `=`.repeat(50),
        '',
        ...lines
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([full], { type: 'text/plain' }));
    a.download = `my-cinema-error-log-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
}

// ===== SAVE FEEDBACK TOAST — G13 =====
let saveToastTimer = null;
function showSaveToast(message = 'Saving...', isError = false) {
    if (!getSetting('saveFeedback')) return;
    let toast = document.getElementById('save-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'save-toast';
        toast.style.cssText = `
            position:fixed; bottom:calc(var(--nav-height) + 12px); left:50%;
            transform:translateX(-50%); background:var(--surface);
            border:2px solid var(--border); border-radius:20px;
            padding:8px 20px; font-size:13px; font-weight:600;
            color:var(--text); box-shadow:var(--shadow-lg);
            z-index:5000; transition:opacity 0.3s; opacity:0;
            white-space:nowrap; pointer-events:none;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.borderColor = isError ? 'var(--red)' : 'var(--green)';
    toast.style.color = isError ? 'var(--red)' : 'var(--text)';
    toast.style.opacity = '1';
    clearTimeout(saveToastTimer);
    if (!isError) {
        saveToastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    }
}
function hideSaveToast() {
    const toast = document.getElementById('save-toast');
    if (toast) toast.style.opacity = '0';
}

// ===== SETTINGS STATE — G24 =====
function loadSettingsState() {
    try {
        const saved = localStorage.getItem('settingsGroupsOpen');
        return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
}
function saveSettingsState(groupName, isOpen) {
    try {
        const state = loadSettingsState();
        state[groupName] = isOpen;
        localStorage.setItem('settingsGroupsOpen', JSON.stringify(state));
    } catch (e) {}
}

// ===== SETTINGS HELPERS =====
// Central place to read boolean settings from localStorage
function getSetting(key) {
    const defaults = {
        saveFeedback: true,
        showIdBadges: false,
        offlineIndicator: true,
        refreshStatus: true,
        hideUpToDateFromContinue: true,
        pullToRefresh: true
    };
    const saved = localStorage.getItem(`setting_${key}`);
    if (saved === null) return defaults[key] ?? false;
    return saved === 'true';
}
function setSetting(key, value) {
    localStorage.setItem(`setting_${key}`, String(value));
}

// ===== DATE FORMATTING =====
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ===== TMDB CACHE =====
let tmdbCache = {};
function loadTmdbCache() {
    try {
        const saved = localStorage.getItem('tmdbCache');
        if (!saved) return;
        const parsed = JSON.parse(saved);
        const sixH = 6 * 3600000;
        const now = Date.now();
        Object.keys(parsed).forEach(k => { if (now - parsed[k].time < sixH) tmdbCache[k] = parsed[k]; });
    } catch (e) { tmdbCache = {}; }
}
function saveTmdbCache() {
    try {
        const keys = Object.keys(tmdbCache);
        if (keys.length > 300) {
            const keep = {};
            keys.sort((a, b) => tmdbCache[b].time - tmdbCache[a].time).slice(0, 300).forEach(k => keep[k] = tmdbCache[k]);
            tmdbCache = keep;
        }
        localStorage.setItem('tmdbCache', JSON.stringify(tmdbCache));
    } catch (e) {}
}
async function tmdbFetch(url) {
    if (tmdbCache[url] && Date.now() - tmdbCache[url].time < 3600000) return tmdbCache[url].data;
    const res = await fetch(url);
    if (!res.ok) {
        // Don't throw on 404 — just return null silently
        if (res.status === 404) return null;
        logError('TMDB fetch', new Error(`HTTP ${res.status}`), { url, httpStatus: res.status });
        return null;
    }
    const data = await res.json();
    tmdbCache[url] = { data, time: Date.now() };
    if (Object.keys(tmdbCache).length % 15 === 0) saveTmdbCache();
    return data;
}

// ===== TVMAZE CACHE — G6: persisted to localStorage =====
let tvmazeCache = {};
function loadTVMazeCache() {
    try {
        const saved = localStorage.getItem('tvmazeCache');
        if (!saved) return;
        const parsed = JSON.parse(saved);
        const oneHour = 3600000;
        const now = Date.now();
        // Only restore entries less than 1 hour old
        Object.keys(parsed).forEach(k => {
            if (parsed[k].time && now - parsed[k].time < oneHour) {
                tvmazeCache[k] = parsed[k].data;
            }
        });
    } catch (e) { tvmazeCache = {}; }
}
function saveTVMazeCache() {
    try {
        const keys = Object.keys(tvmazeCache);
        const toSave = {};
        // Cap at 200 entries — keep most recently added
        const limited = keys.slice(-200);
        limited.forEach(k => { toSave[k] = { data: tvmazeCache[k], time: Date.now() }; });
        localStorage.setItem('tvmazeCache', JSON.stringify(toSave));
    } catch (e) {}
}
async function tvmazeFetch(url) {
    if (tvmazeCache[url]) return tvmazeCache[url];
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        // Cap at 200 entries
        const keys = Object.keys(tvmazeCache);
        if (keys.length >= 200) delete tvmazeCache[keys[0]];
        tvmazeCache[url] = data;
        // Save to localStorage periodically
        if (keys.length % 10 === 0) saveTVMazeCache();
        return data;
    } catch (e) { logError('TVMaze fetch', e, { url }); return null; }
}

// ===== EPISODE SOURCE =====
function getEpisodeSource() { return localStorage.getItem('episodeSource') || 'tvmaze'; }
function setEpisodeSource(src) {
    localStorage.setItem('episodeSource', src);
    updateSegmentedControl('episode-source-control', src);
    myList.forEach(item => {
        if (item.type !== 'tv') return;
        swapActiveSeasons(item, src);
    });
    renderAllSections();
}

// ===== DUAL SEASON STRUCTURE — CORE =====
function getActiveSeasons(item) { return item.seasons || []; }

function swapActiveSeasons(item, source) {
    if (source === 'tvmaze' && item.seasons_tvmaze && item.seasons_tvmaze.length > 0) {
        item.seasons = item.seasons_tvmaze;
    } else if (source === 'tmdb' && item.seasons_tmdb && item.seasons_tmdb.length > 0) {
        item.seasons = item.seasons_tmdb;
    }
}

// ===== WATCH DATA SNAPSHOT — D1/A1 =====
// Before any sync, snapshot all watch data keyed by "S{n}E{n}_{name}"
function snapshotWatchData(seasons) {
    const snap = {};
    (seasons || []).forEach(s => {
        (s.episodes || []).forEach(ep => {
            if (!ep.is_watched && !ep.my_rating && !ep.note) return; // skip empty episodes

            const data = {
                is_watched: ep.is_watched || false,
                watched_at: ep.watched_at || null,
                rewatch_count: ep.rewatch_count || 0,
                rewatch_history: ep.rewatch_history ? [...ep.rewatch_history] : [],
                my_rating: ep.my_rating || null,
                note: ep.note || null
            };

            // Key 1: Season + Episode + Name (most specific)
            const nameLower = (ep.name || '').toLowerCase().trim();
            if (nameLower) {
                snap[`S${s.number}E${ep.number}_${nameLower}`] = data;
            }

            // Key 2: Season + Episode number only (fallback — always set)
            const numKey = `S${s.number}E${ep.number}`;
            // Only set number-only key if it doesn't already exist (avoid overwriting with a different episode)
            if (!snap[numKey]) snap[numKey] = data;

            // Key 3: Just episode number globally (for shows where season mapping changes)
            const globalKey = `E${ep.number}_${nameLower}`;
            if (nameLower && !snap[globalKey]) snap[globalKey] = data;
        });
    });
    return snap;
}

// After rebuilding, restore watch data from snapshot
function restoreWatchData(seasons, snap) {
    if (!snap || !Object.keys(snap).length) return;
    (seasons || []).forEach(s => {
        (s.episodes || []).forEach(ep => {
            const nameLower = (ep.name || '').toLowerCase().trim();

            // Try all three key types
            const key1 = nameLower ? `S${s.number}E${ep.number}_${nameLower}` : null;
            const key2 = `S${s.number}E${ep.number}`;
            const key3 = nameLower ? `E${ep.number}_${nameLower}` : null;

            const data = (key1 && snap[key1]) || snap[key2] || (key3 && snap[key3]);
            if (!data) return;

            // Always restore watch data — never lose it
            if (data.is_watched) {
                ep.is_watched = true;
                // Preserve original watched_at — don't overwrite with newer date
                if (!ep.watched_at || (data.watched_at && new Date(data.watched_at) < new Date(ep.watched_at))) {
                    ep.watched_at = data.watched_at;
                }
                // Keep higher rewatch count
                ep.rewatch_count = Math.max(ep.rewatch_count || 0, data.rewatch_count || 0);
                // Keep longer rewatch history
                if (data.rewatch_history && data.rewatch_history.length > (ep.rewatch_history || []).length) {
                    ep.rewatch_history = [...data.rewatch_history];
                }
            }
            if (!ep.my_rating && data.my_rating) ep.my_rating = data.my_rating;
            if (!ep.note && data.note) ep.note = data.note;
        });
    });
}

// ===== BUILD EPISODE MAP =====
function buildEpisodeMap(tmdbSeasons, tvmazeSeasons) {
    const map = [];
    if (!tmdbSeasons || !tvmazeSeasons) return map;
    const tmdbFlat = [];
    tmdbSeasons.forEach(s => {
        if (s.number === 0) return;
        (s.episodes || []).forEach(ep => {
            if (ep.is_special) return;
            tmdbFlat.push({ s: s.number, e: ep.number, name: ep.name || '', air_date: ep.air_date || '', ep });
        });
    });
    const tvmazeFlat = [];
    Object.entries(tvmazeSeasons).forEach(([sNum, eps]) => {
        const sn = parseInt(sNum);
        eps.forEach(ep => {
            tvmazeFlat.push({ s: sn, e: ep.number, name: ep.name || '', air_date: ep.air_date || '', ep });
        });
    });
    const tvmazeMatched = new Set();
    // Pass 1: air date match
    tmdbFlat.forEach(tmdbEp => {
        if (!tmdbEp.air_date) return;
        const sameDayTmdb = tmdbFlat.filter(e => e.air_date === tmdbEp.air_date).length;
        const match = tvmazeFlat.find((tvEp, idx) => {
            if (tvmazeMatched.has(idx)) return false;
            const sameDayCount = tvmazeFlat.filter(e => e.air_date === tmdbEp.air_date).length;
            return tvEp.air_date === tmdbEp.air_date && sameDayCount === 1 && sameDayTmdb === 1;
        });
        if (match) {
            const idx = tvmazeFlat.indexOf(match);
            map.push({ tmdb_s: tmdbEp.s, tmdb_e: tmdbEp.e, tvmaze_s: match.s, tvmaze_e: match.e, matched_by: 'airdate' });
            tvmazeMatched.add(idx);
        }
    });
    // Pass 2: name similarity
    tmdbFlat.forEach(tmdbEp => {
        if (map.some(m => m.tmdb_s === tmdbEp.s && m.tmdb_e === tmdbEp.e)) return;
        let bestIdx = -1, bestScore = 0;
        tvmazeFlat.forEach((tvEp, idx) => {
            if (tvmazeMatched.has(idx)) return;
            const score = titleSimilarity(tmdbEp.name, tvEp.name);
            if (score > bestScore && score > 0.4) { bestScore = score; bestIdx = idx; }
        });
        if (bestIdx >= 0) {
            const match = tvmazeFlat[bestIdx];
            map.push({ tmdb_s: tmdbEp.s, tmdb_e: tmdbEp.e, tvmaze_s: match.s, tvmaze_e: match.e, matched_by: 'name' });
            tvmazeMatched.add(bestIdx);
        }
    });
    // Pass 3: position
    const unmatchedTmdb = tmdbFlat.filter(t => !map.some(m => m.tmdb_s === t.s && m.tmdb_e === t.e));
    const unmatchedTvmaze = tvmazeFlat.filter((_, idx) => !tvmazeMatched.has(idx));
    unmatchedTmdb.forEach((tmdbEp, i) => {
        if (i < unmatchedTvmaze.length) {
            map.push({ tmdb_s: tmdbEp.s, tmdb_e: tmdbEp.e, tvmaze_s: unmatchedTvmaze[i].s, tvmaze_e: unmatchedTvmaze[i].e, matched_by: 'position' });
        }
    });
    return map;
}

// ===== SYNC WATCH DATA ACROSS STRUCTURES =====
function syncWatchDataAcross(fromSeasons, toSeasons, episodeMap, fromSource) {
    if (!fromSeasons || !toSeasons) return;
    fromSeasons.forEach(fromSeason => {
        if (fromSeason.number === 0) return;
        (fromSeason.episodes || []).forEach(fromEp => {
            // Specials — sync by name
            if (fromEp.is_special || fromEp.is_significant_special || fromEp.is_insignificant_special) {
                toSeasons.forEach(toSeason => {
                    const matchingSpecial = toSeason.episodes?.find(e =>
                        (e.is_special || e.is_significant_special || e.is_insignificant_special) &&
                        titlesMatch(e.name || '', fromEp.name || '')
                    );
                    if (matchingSpecial) {
                        matchingSpecial.is_watched = fromEp.is_watched;
                        matchingSpecial.watched_at = fromEp.watched_at;
                        matchingSpecial.rewatch_count = fromEp.rewatch_count || 0;
                        matchingSpecial.rewatch_history = fromEp.rewatch_history || [];
                        matchingSpecial.my_rating = fromEp.my_rating;
                        matchingSpecial.note = fromEp.note;
                    }
                });
                return;
            }
            // Regular episodes — use map
            if (!episodeMap) return;
            let mapping;
            if (fromSource === 'tmdb') {
                mapping = episodeMap.find(m => m.tmdb_s === fromSeason.number && m.tmdb_e === fromEp.number);
            } else {
                mapping = episodeMap.find(m => m.tvmaze_s === fromSeason.number && m.tvmaze_e === fromEp.number);
            }
            if (!mapping) return;
            const targetS = fromSource === 'tmdb' ? mapping.tvmaze_s : mapping.tmdb_s;
            const targetE = fromSource === 'tmdb' ? mapping.tvmaze_e : mapping.tmdb_e;
            const targetSeason = toSeasons.find(s => s.number === targetS);
            if (!targetSeason) return;
            const targetEp = targetSeason.episodes?.find(e => e.number === targetE && !e.is_special);
            if (!targetEp) return;
            targetEp.is_watched = fromEp.is_watched;
            targetEp.watched_at = fromEp.watched_at;
            targetEp.rewatch_count = fromEp.rewatch_count || 0;
            targetEp.rewatch_history = fromEp.rewatch_history || [];
            targetEp.my_rating = fromEp.my_rating;
            targetEp.note = fromEp.note;
        });
    });
}

async function syncMarkToOtherStructure(item, source) {
    if (!item.episode_map || !item.episode_map.length) return;
    if (source === 'tmdb') {
        if (item.seasons_tvmaze && item.seasons_tvmaze.length) {
            syncWatchDataAcross(item.seasons_tmdb || item.seasons, item.seasons_tvmaze, item.episode_map, 'tmdb');
        }
    } else {
        if (item.seasons_tmdb && item.seasons_tmdb.length) {
            syncWatchDataAcross(item.seasons_tvmaze || item.seasons, item.seasons_tmdb, item.episode_map, 'tvmaze');
        }
    }
}

async function saveDualSeasons(item) {
    const source = getEpisodeSource();
    const updateData = { seasons: item.seasons };
    if (source === 'tmdb') {
        updateData.seasons_tmdb = item.seasons;
        if (item.seasons_tvmaze) updateData.seasons_tvmaze = item.seasons_tvmaze;
    } else {
        updateData.seasons_tvmaze = item.seasons;
        if (item.seasons_tmdb) updateData.seasons_tmdb = item.seasons_tmdb;
    }
    if (item.episode_map) updateData.episode_map = item.episode_map;
    await updateDoc(doc(db, 'series', item.docId), updateData);
}

// ===== INCREMENTAL TIMESTAMPS =====
function generateIncrementalTimestamps(count, isAnime, baseDate) {
    const base = baseDate ? new Date(baseDate) : new Date();
    const gapMinutes = isAnime ? ANIME_EP_MINUTES : TV_EP_MINUTES;
    const maxPerDay = isAnime ? ANIME_EPS_PER_DAY : TV_EPS_PER_DAY;
    const ts = [];
    for (let i = 0; i < count; i++) {
        const dayOffset = Math.floor(i / maxPerDay);
        const posInDay = i % maxPerDay;
        const dayBase = new Date(base);
        dayBase.setDate(dayBase.getDate() - dayOffset);
        const minutesBackInDay = posInDay * gapMinutes;
        const epTime = new Date(dayBase.getTime() - minutesBackInDay * 60000);
        ts.push(epTime.toISOString());
    }
    ts.reverse();
    return ts;
}

// ===== TIMEZONE / AIR TIME =====
const TZ_OFFSETS = {
    'Asia/Tokyo': 9, 'Asia/Seoul': 9, 'Asia/Shanghai': 8, 'Asia/Hong_Kong': 8,
    'America/New_York': -4, 'America/Chicago': -5, 'America/Denver': -6,
    'America/Los_Angeles': -7, 'Europe/London': 1, 'Europe/Paris': 2,
    'Europe/Berlin': 2, 'Australia/Sydney': 10, 'Asia/Kolkata': 5.5,
    'America/Sao_Paulo': -3, 'Pacific/Auckland': 12, 'UTC': 0
};
function getUtcOffset(tz) {
    if (!tz) return 0;
    if (TZ_OFFSETS[tz] !== undefined) return TZ_OFFSETS[tz];
    try {
        const now = new Date();
        const utc = now.toLocaleString('en-US', { timeZone: 'UTC' });
        const loc = now.toLocaleString('en-US', { timeZone: tz });
        return (new Date(loc) - new Date(utc)) / 3600000;
    } catch (e) { return 0; }
}
function convertToGhanaTime(timeStr, tz) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    let gh = h - getUtcOffset(tz);
    if (gh < 0) gh += 24; if (gh >= 24) gh -= 24;
    const h12 = gh % 12 || 12;
    const ampm = gh >= 12 ? 'pm' : 'am';
    const mins = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
    return `${h12}${mins}${ampm}`;
}
function getGhanaAirHour(timeStr, tz) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    let gh = h - getUtcOffset(tz) + (m || 0) / 60;
    if (gh < 0) gh += 24; if (gh >= 24) gh -= 24;
    return gh;
}

// ===== TVMAZE HELPERS =====
async function tvmazeLookupByTVDB(tvdbId) {
    if (!tvdbId) return null;
    return await tvmazeFetch(`${TVMAZE_BASE}/lookup/shows?thetvdb=${tvdbId}`);
}

// G15: Year-aware title search to avoid same-name show conflicts
async function tvmazeSearchByTitle(title, year = null) {
    const cleaned = title.replace(/\s*\(\d{4}\)\s*$/, '').replace(/[!:]/g, '').trim();
    const results = await tvmazeFetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(cleaned)}`);
    if (results && results.length) {
        // If we have a year, prefer the result that matches the year
        if (year) {
            const yearMatch = results.find(r => {
                const premiered = r.show?.premiered;
                if (!premiered) return false;
                return parseInt(premiered.substring(0, 4)) === parseInt(year);
            });
            if (yearMatch) return yearMatch.show;
        }
        return results[0].show;
    }
    if (cleaned !== title) {
        const results2 = await tvmazeFetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(title)}`);
        if (results2 && results2.length) {
            if (year) {
                const yearMatch = results2.find(r => {
                    const premiered = r.show?.premiered;
                    if (!premiered) return false;
                    return parseInt(premiered.substring(0, 4)) === parseInt(year);
                });
                if (yearMatch) return yearMatch.show;
            }
            return results2[0].show;
        }
    }
    return null;
}

async function tvmazeGetShow(item) {
    // Priority: TVMaze ID → TVDB ID → title+year search
    if (item.tvmaze_id) {
        const show = await tvmazeFetch(`${TVMAZE_BASE}/shows/${item.tvmaze_id}`);
        if (show) return show;
    }
    if (item.tvdb_id) {
        const show = await tvmazeLookupByTVDB(item.tvdb_id);
        if (show) return show;
    }
    return await tvmazeSearchByTitle(item.title, item.year);
}

async function tvmazeGetEpisodes(tvmazeId) {
    return await tvmazeFetch(`${TVMAZE_BASE}/shows/${tvmazeId}/episodes?specials=1`);
}

async function tvmazeGetEpisodeDetail(tvmazeId, season, episode, tvmazeEpId) {
    if (tvmazeEpId) {
        const ep = await tvmazeFetch(`${TVMAZE_BASE}/episodes/${tvmazeEpId}`);
        if (ep) return ep;
    }
    const episodes = await tvmazeFetch(`${TVMAZE_BASE}/shows/${tvmazeId}/episodes?specials=1`);
    if (!episodes) return null;
    return episodes.find(ep => ep.season === season && ep.number === episode) || null;
}

function tvmazePoster(show) { return show?.image?.original || show?.image?.medium || null; }

function tvmazeMapShowData(tvShow) {
    if (!tvShow) return null;
    return {
        title: tvShow.name,
        year: tvShow.premiered ? parseInt(tvShow.premiered.substring(0, 4)) : null,
        poster: tvmazePoster(tvShow),
        synopsis: tvShow.summary ? tvShow.summary.replace(/<[^>]+>/g, '').trim() : '',
        genres: tvShow.genres || [],
        status: tvShow.status,
        networks: tvShow.network ? [tvShow.network.name] : (tvShow.webChannel ? [tvShow.webChannel.name] : []),
        original_language: tvShow.language ? tvShow.language.toLowerCase().substring(0, 2) : null,
        tvmaze_id: tvShow.id,
        tvdb_id: tvShow.externals?.thetvdb || null,
        tmdb_id_from_maze: tvShow.externals?.themoviedb || null,
        air_time: tvShow.schedule?.time || null,
        air_timezone: tvShow.network?.country?.timezone || tvShow.webChannel?.country?.timezone || 'UTC',
        air_days: tvShow.schedule?.days || [],
        popularity: tvShow.weight || null
    };
}

function tvmazeMapCast(castArr) {
    if (!castArr) return [];
    return castArr.map(c => ({
        name: c.person?.name || '',
        character: c.character?.name || '',
        profile_path: null,
        profile_url: c.person?.image?.medium || c.person?.image?.original || null
    }));
}

function tvmazeGroupEpisodes(episodes) {
    const seasons = {};
    let specialCounter = 900;
    (episodes || []).forEach(ep => {
        const hasNullNumber = ep.number === null || ep.number === undefined;
        const epType = ep.type || 'regular';
        let s = ep.season || 0;
        const epNumber = hasNullNumber ? specialCounter++ : ep.number;
        const isInsignificant = epType === 'insignificant_special';
        const isSignificant = epType === 'significant_special';
        if (isInsignificant) s = 0;
        if (!seasons[s]) seasons[s] = [];
        seasons[s].push({
            number: epNumber,
            name: ep.name || 'Special',
            air_date: ep.airdate || null,
            air_time: ep.airtime || null,
            runtime: ep.runtime || null,
            tvmaze_ep_id: ep.id,
            is_special: isInsignificant || isSignificant || s === 0,
            is_significant_special: isSignificant,
            is_insignificant_special: isInsignificant,
            original_number: ep.number
        });
    });
    return seasons;
}

// ===== FETCH AIR TIME DATA — G5: skip ended shows =====
async function fetchAirTimeData(show) {
    // G5: Don't fetch air time for ended or cancelled shows
    if (['Ended', 'Canceled', 'Cancelled'].includes(show.tmdb_status)) {
        return show.air_time_data || { time: '00:00', timezone: 'UTC', day: null, source: 'default', fetched_at: new Date().toISOString() };
    }
    if (show.air_time_data && show.air_time_data.source && show.air_time_data.source !== 'default' && show.air_time_data.fetched_at) {
        const age = Date.now() - new Date(show.air_time_data.fetched_at).getTime();
        if (age < 30 * 86400000) return show.air_time_data;
    }
    let airData = null;
    try {
        const tvShow = await tvmazeGetShow(show);
        if (tvShow?.schedule?.time) {
            airData = {
                time: tvShow.schedule.time,
                timezone: tvShow.network?.country?.timezone || tvShow.webChannel?.country?.timezone || 'UTC',
                day: tvShow.schedule.days?.[0] || null,
                source: 'tvmaze',
                fetched_at: new Date().toISOString()
            };
            if (tvShow.id && !show.tvmaze_id) {
                show.tvmaze_id = tvShow.id;
                updateDoc(doc(db, 'series', show.docId), { tvmaze_id: tvShow.id }).catch(() => {});
            }
        }
    } catch (e) { logError('TVMaze air time', e, { show: show.title }); }
    if (!airData && show.is_anime) {
        try {
            await new Promise(r => setTimeout(r, 500));
            const res = await fetch(`${JIKAN_BASE}/anime?q=${encodeURIComponent(show.title)}&limit=1`);
            if (res.ok) {
                const d = await res.json();
                const a = d.data?.[0];
                if (a?.broadcast?.time) {
                    airData = { time: a.broadcast.time, timezone: a.broadcast.timezone || 'Asia/Tokyo', day: a.broadcast.day?.replace(/s$/, '') || null, source: 'jikan', fetched_at: new Date().toISOString() };
                }
            }
        } catch (e) { logError('Jikan air time', e, { show: show.title }); }
    }
    if (!airData) airData = { time: '00:00', timezone: 'UTC', day: null, source: 'default', fetched_at: new Date().toISOString() };
    try {
        await updateDoc(doc(db, 'series', show.docId), { air_time_data: airData });
        show.air_time_data = airData;
    } catch (e) { logError('Save air time', e, { show: show.title, docId: show.docId }); }
    return airData;
}

// ===== TVMAZE EPISODE SYNC =====
async function fetchTVMazeEpisodes(show) {
    try {
        const tvShow = await tvmazeGetShow(show);
        if (!tvShow) return null;
        if (tvShow.id && tvShow.id !== show.tvmaze_id) {
            show.tvmaze_id = tvShow.id;
            const upd = { tvmaze_id: tvShow.id };
            if (!show.tvdb_id && tvShow.externals?.thetvdb) { upd.tvdb_id = tvShow.externals.thetvdb; show.tvdb_id = tvShow.externals.thetvdb; }
            if (!show.tmdb_id && tvShow.externals?.themoviedb) { upd.tmdb_id = tvShow.externals.themoviedb; }
            updateDoc(doc(db, 'series', show.docId), upd).catch(() => {});
        }
        if (tvShow.schedule?.time && (!show.air_time_data || show.air_time_data.source === 'default')) {
            const airData = { time: tvShow.schedule.time, timezone: tvShow.network?.country?.timezone || 'UTC', day: tvShow.schedule.days?.[0] || null, source: 'tvmaze', fetched_at: new Date().toISOString() };
            updateDoc(doc(db, 'series', show.docId), { air_time_data: airData }).catch(() => {});
            show.air_time_data = airData;
        }
        const episodes = await tvmazeGetEpisodes(tvShow.id);
        if (!episodes || !episodes.length) return null;
        return tvmazeGroupEpisodes(episodes);
    } catch (e) { logError('TVMaze episode fetch', e, { show: show.title, docId: show.docId }); return null; }
}

// ===== MERGE TVMAZE SEASONS WITH WATCH DATA =====
function buildTVMazeSeasonsWithWatchData(tvmazeGrouped, existingSeasons, episodeMap) {
    const result = [];
    Object.entries(tvmazeGrouped).forEach(([sNumStr, tvEps]) => {
        const sNum = parseInt(sNumStr);
        const isSpecials = sNum === 0;
        const episodes = tvEps.map(tvEp => {
            let existing = null;
            if (episodeMap && !isSpecials) {
                const mapping = episodeMap.find(m => m.tvmaze_s === sNum && m.tvmaze_e === tvEp.number);
                if (mapping && existingSeasons) {
                    const tmdbSeason = existingSeasons.find(s => s.number === mapping.tmdb_s);
                    existing = tmdbSeason?.episodes?.find(e => e.number === mapping.tmdb_e && !e.is_special);
                }
            }
            if (!existing && existingSeasons) {
                const directSeason = existingSeasons.find(s => s.number === sNum);
                existing = directSeason?.episodes?.find(e => e.number === tvEp.number && e.is_special === (tvEp.is_special || false));
            }
            return {
                number: tvEp.number,
                name: tvEp.name || `Episode ${tvEp.number}`,
                air_date: tvEp.air_date || null,
                is_watched: existing?.is_watched || false,
                watched_at: existing?.watched_at || null,
                rewatch_count: existing?.rewatch_count || 0,
                rewatch_history: existing?.rewatch_history || [],
                is_special: tvEp.is_special || isSpecials,
                is_significant_special: tvEp.is_significant_special || false,
                is_insignificant_special: tvEp.is_insignificant_special || false,
                my_rating: existing?.my_rating || null,
                note: existing?.note || null,
                tvmaze_ep_id: tvEp.tvmaze_ep_id || null,
                unconfirmed: false
            };
        });
        result.push({ number: sNum, is_specials: isSpecials, episodes });
    });
    result.sort((a, b) => a.number - b.number);
    return result;
}

// ===== PLACEHOLDER EPISODE DETECTION =====
function isPlaceholderEpisode(ep) {
    if (ep.air_date) return false;
    const name = (ep.name || '').trim();
    return !name || /^episode\s+\d+$/i.test(name);
}

// ===== MODAL MANAGEMENT =====
const MODAL_IDS = [
    'modal', 'episode-modal', 'preview-modal', 'confirm-dialog',
    'stats-modal', 'bulk-modal', 'tag-specials-modal',
    'rate-shows-modal', 'personal-list-modal', 'collection-modal',
    'edit-dates-modal', 'fix-show-modal', 'tvmaze-notfound-modal',
    'tvdb-fetch-modal', 'season-mismatch-modal', 'import-conflict-modal',
    'id-manager-modal', 'manual-airtime-modal'
];
function openModal(id) {
    const el = document.getElementById(id); if (!el) return;
    scrollPosition = window.scrollY;
    document.body.classList.add('modal-open');
    document.body.style.top = `-${scrollPosition}px`;
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
}
function closeModal(id) {
    const el = document.getElementById(id); if (!el) return;
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
        const el = document.getElementById(id); if (!el) return;
        el.addEventListener('click', e => { if (e.target === el) closeModal(id); });
        el.addEventListener('touchend', e => { if (e.target === el) { e.preventDefault(); closeModal(id); } }, { passive: false });
    });
}

// ===== APPEARANCE =====
function setupAppearance() {
    const html = document.documentElement;
    // Theme
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
    // Accent
    const accent = localStorage.getItem('accentColor') || 'blue';
    html.setAttribute('data-accent', accent);
    updateColorPresets('accent-color-presets', accent);
    // Rewatch color
    const rewatch = localStorage.getItem('rewatchColor') || '#FFC107';
    html.style.setProperty('--rewatch-color', rewatch);
    updateColorPresets('rewatch-color-presets', rewatch);
    // Card style
    const cardStyle = localStorage.getItem('cardStyle') || 'normal';
    html.setAttribute('data-card-style', cardStyle);
    updateSegmentedControl('card-style-control', cardStyle);
    // Poster size
    const posterSize = localStorage.getItem('posterSize') || 'medium';
    html.setAttribute('data-poster-size', posterSize);
    updateSegmentedControl('poster-size-control', posterSize);
    // Font size
    const fontSize = localStorage.getItem('fontSize') || 'normal';
    html.setAttribute('data-font-size', fontSize);
    updateSegmentedControl('font-size-control', fontSize);
    // Episode source
    const src = getEpisodeSource();
    updateSegmentedControl('episode-source-control', src);
    // G13: Save feedback toggle
    updateToggle('save-feedback-toggle', getSetting('saveFeedback'));
    // G15: ID badges toggle
    updateToggle('id-badges-toggle', getSetting('showIdBadges'));
    // G19: Refresh status toggle
    updateToggle('refresh-status-toggle', getSetting('refreshStatus'));
    updateToggle('hide-uptodate-toggle', getSetting('hideUpToDateFromContinue'));
    // G20: Offline indicator toggle
    updateToggle('offline-indicator-toggle', getSetting('offlineIndicator'));
    // G24: Restore settings groups open state
    restoreSettingsGroups();
}

function toggleHideUpToDate(val) { setSetting('hideUpToDateFromContinue', val); renderAllSections(); }

function updateToggle(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = value;
}

function updateColorPresets(containerId, activeValue) {
    const c = document.getElementById(containerId); if (!c) return;
    c.querySelectorAll('.color-preset').forEach(p => p.classList.toggle('active', p.dataset.color === activeValue));
}
function updateSegmentedControl(controlId, activeValue) {
    const c = document.getElementById(controlId); if (!c) return;
    c.querySelectorAll('.segment-btn').forEach(b => b.classList.toggle('active', b.dataset.val === activeValue));
}
function setAccentColor(color) { document.documentElement.setAttribute('data-accent', color); localStorage.setItem('accentColor', color); updateColorPresets('accent-color-presets', color); }
function setRewatchColor(color) { document.documentElement.style.setProperty('--rewatch-color', color); localStorage.setItem('rewatchColor', color); updateColorPresets('rewatch-color-presets', color); }
function setCardStyle(style) { document.documentElement.setAttribute('data-card-style', style); localStorage.setItem('cardStyle', style); updateSegmentedControl('card-style-control', style); }
function setPosterSize(size) { document.documentElement.setAttribute('data-poster-size', size); localStorage.setItem('posterSize', size); updateSegmentedControl('poster-size-control', size); }
function setFontSize(size) { document.documentElement.setAttribute('data-font-size', size); localStorage.setItem('fontSize', size); updateSegmentedControl('font-size-control', size); }

// ===== SETTINGS TOGGLES =====
function toggleSaveFeedback(val) { setSetting('saveFeedback', val); }
function toggleIdBadges(val) { setSetting('showIdBadges', val); renderAllSections(); }
function toggleRefreshStatus(val) { setSetting('refreshStatus', val); }
function toggleOfflineIndicator(val) {
    setSetting('offlineIndicator', val);
    const banner = document.getElementById('offline-banner');
    if (banner) banner.style.display = (!navigator.onLine && val) ? 'flex' : 'none';
}

// ===== G24: SETTINGS GROUPS STATE =====
function toggleSettingsGroup(header) {
    const content = header.nextElementSibling;
    const arrow = header.querySelector('.settings-arrow');
    const groupName = header.querySelector('h3')?.textContent?.trim() || '';
    content.classList.toggle('open');
    arrow.classList.toggle('open');
    saveSettingsState(groupName, content.classList.contains('open'));
}
function restoreSettingsGroups() {
    const state = loadSettingsState();
    document.querySelectorAll('.settings-group-header').forEach(header => {
        const groupName = header.querySelector('h3')?.textContent?.trim() || '';
        if (state[groupName]) {
            const content = header.nextElementSibling;
            const arrow = header.querySelector('.settings-arrow');
            if (content) content.classList.add('open');
            if (arrow) arrow.classList.add('open');
        }
    });
}

function toggleImportSection() {
    const content = document.getElementById('import-content');
    const arrow = document.getElementById('import-arrow');
    if (!content) return;
    const open = content.style.display !== 'none';
    content.style.display = open ? 'none' : 'block';
    if (arrow) arrow.textContent = open ? '▶' : '▼';
}

// ===== G19: REFRESH WITH STATUS =====
async function refreshApp() {
    const btn = document.getElementById('refresh-btn-top');
    const showStatus = getSetting('refreshStatus');
    if (btn) {
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
        if (showStatus) btn.title = 'Refreshing...';
    }
    await loadMyList();
    checkAndRefreshUpcoming();
    if (btn) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        if (showStatus) {
            btn.title = `Last refreshed: ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
        }
    }
}

function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function checkAndRefreshUpcoming() {
    const today = getTodayString();
    ['anime', 'tv'].forEach(section => {
        const cacheDay = localStorage.getItem(`upcomingCache_${section}_day`);
        if (cacheDay !== today) loadSectionCalendar(section);
    });
}

// ===== G20: OFFLINE INDICATOR =====
function setupOfflineDetector() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    const update = () => {
        if (!getSetting('offlineIndicator')) { banner.style.display = 'none'; return; }
        banner.style.display = navigator.onLine ? 'none' : 'flex';
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
}

// ===== G19: PULL TO REFRESH =====
let pullStartY = 0, pulling = false;
function setupPullToRefresh() {
    const container = document.getElementById('main-container');
    const indicator = document.getElementById('pull-refresh-indicator');
    if (!container || !indicator) return;
    container.addEventListener('touchstart', e => {
        if (!getSetting('pullToRefresh')) return;
        if (window.scrollY === 0 && !document.body.classList.contains('modal-open')) {
            pullStartY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });
    container.addEventListener('touchmove', e => {
        if (!pulling || !getSetting('pullToRefresh') || document.body.classList.contains('modal-open')) return;
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
            checkAndRefreshUpcoming();
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
    loadTVMazeCache();
    setupAppearance();
    setupBottomNav();
    setupSearch();
    setupSubTabSwipe();
    setupPullToRefresh();
    setupModalClosing();
    setupOfflineDetector();
    await loadMyList();
    setupRealtimeListeners();
    setupAutoSync();
    setupUpcomingAutoRefresh();
    checkAndRefreshUpcoming();
});
// ===== REALTIME & AUTO SYNC =====
function setupRealtimeListeners() {
    let timer;
    const debounced = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            // G2: Don't trigger reload if sync is in progress
            if (!isLoading && !isSyncing) loadMyList();
        }, 5000);
    };
    onSnapshot(collection(db, 'movies'), debounced);
    onSnapshot(collection(db, 'series'), debounced);
}

function setupAutoSync() {
    const last = localStorage.getItem('lastEpisodeSync');
    const day = 24 * 3600000;
    if (!last || Date.now() - parseInt(last) > day) {
        setTimeout(() => syncAiringShows(true), 8000);
    }
    setInterval(() => {
        const l = localStorage.getItem('lastEpisodeSync');
        if (!l || Date.now() - parseInt(l) > day) syncAiringShows(true);
    }, 3600000);
}

function setupUpcomingAutoRefresh() {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.subtab;
            if (tabId === 'anime-upcoming' || tabId === 'tv-upcoming') {
                const section = tabId.includes('anime') ? 'anime' : 'tv';
                const today = getTodayString();
                const cacheDay = localStorage.getItem(`upcomingCache_${section}_day`);
                if (cacheDay !== today) {
                    loadSectionCalendar(section);
                } else {
                    const cached = localStorage.getItem(`upcomingCache_${section}`);
                    if (cached) {
                        try { displayCalendarFromCache(section, JSON.parse(cached)); }
                        catch (e) { loadSectionCalendar(section); }
                    } else {
                        loadSectionCalendar(section);
                    }
                }
            }
        });
    });
}

// ===== G3: LAST SYNCED DISPLAY =====
function updateLastSyncedDisplay() {
    const el = document.getElementById('last-synced-display');
    if (!el) return;
    const last = localStorage.getItem('lastEpisodeSync');
    if (!last) { el.textContent = 'Never synced'; return; }
    const d = new Date(parseInt(last));
    el.textContent = `Last synced: ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

// ===== G10: CONFIRM FULL SYNC =====
async function confirmFullSync() {
    const airingCount = myList.filter(i => i.type === 'tv' && i.tmdb_id).length;
    const answer = await showConfirm(
        'Full Library Sync',
        `This will sync all ${airingCount} TV shows and enrich missing data.\n\nThis can take several minutes and uses many API calls.\n\nContinue?`,
        'Yes, Sync All',
        'Cancel'
    );
    if (answer === 'yes') fullLibrarySync();
}

// ===== SYNC — AIRING SHOWS =====
async function syncAiringShows(silent = false) {
    if (isSyncing) return; // G2: prevent concurrent syncs
    isSyncing = true;

    const statusEl = document.getElementById('settings-action-status');
    const source = getEpisodeSource();
    const shows = myList.filter(i => i.type === 'tv' && i.tmdb_id && ['Returning Series', 'In Production'].includes(i.tmdb_status));

    if (!silent && statusEl) statusEl.innerHTML = `<p style="color:var(--accent);">Syncing ${shows.length} shows (${source.toUpperCase()})...</p>`;

    let updated = 0;
    const notFoundOnTVMaze = [];

    for (let i = 0; i < shows.length; i++) {
        const show = shows[i];
        try {
            if (!silent && statusEl) statusEl.innerHTML = `<p style="color:var(--accent);">Syncing ${i + 1}/${shows.length}: ${show.title}</p>`;

            // D1/A1: Snapshot existing watch data BEFORE rebuilding
            const watchSnap = snapshotWatchData(show.seasons);

            // Get TMDB details
            const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);
            const newStatus = det.status || show.tmdb_status;

            // Sync TMDB structure
            const tmdbSeasons = await syncShowWithTMDB(show, det, watchSnap);
            if (tmdbSeasons) {
                show.seasons_tmdb = tmdbSeasons;
            }

            // Sync TVMaze structure
            if (!show.force_tmdb_source) {
                const tvmazeGrouped = await fetchTVMazeEpisodes(show);
                if (tvmazeGrouped) {
                    const tvmazeSeasons = buildTVMazeSeasonsWithWatchData(
                        tvmazeGrouped,
                        show.seasons_tmdb || show.seasons,
                        show.episode_map
                    );
                    // D1: Restore watch data into TVMaze structure too
                    restoreWatchData(tvmazeSeasons, watchSnap);
                    show.seasons_tvmaze = tvmazeSeasons;

                    // Rebuild episode map
                    show.episode_map = buildEpisodeMap(
                        show.seasons_tmdb || tmdbSeasons || show.seasons,
                        tvmazeGrouped
                    );

                    // Sync watch data across
                    if (show.seasons_tmdb && show.seasons_tvmaze) {
                        syncWatchDataAcross(show.seasons_tmdb, show.seasons_tvmaze, show.episode_map, 'tmdb');
                    }
                } else {
                    notFoundOnTVMaze.push(show);
                }
                await new Promise(r => setTimeout(r, 300));
            }

            // Set active seasons based on current source
            swapActiveSeasons(show, source);

            // Save to Firebase
            const updateData = {
                seasons: show.seasons,
                tmdb_status: newStatus,
                last_synced: new Date().toISOString()
            };
            if (show.seasons_tmdb) updateData.seasons_tmdb = show.seasons_tmdb;
            if (show.seasons_tvmaze) updateData.seasons_tvmaze = show.seasons_tvmaze;
            if (show.episode_map) updateData.episode_map = show.episode_map;

            // Save all three IDs if we have them
            if (show.tvmaze_id) updateData.tvmaze_id = show.tvmaze_id;
            if (show.tvdb_id) updateData.tvdb_id = show.tvdb_id;

            await updateDoc(doc(db, 'series', show.docId), updateData);
            show.tmdb_status = newStatus;
            updated++;

            await new Promise(r => setTimeout(r, 400));
            // Pause every 10 shows
            if (updated % 10 === 0) await new Promise(r => setTimeout(r, 2000));

        } catch (e) {
            logError(`Sync airing show`, e, { show: show.title, docId: show.docId, operation: 'syncAiringShows' });
        }
    }

    localStorage.setItem('lastEpisodeSync', Date.now().toString());
    updateLastSyncedDisplay();
    saveTmdbCache();
    saveTVMazeCache();

    if (!silent && statusEl) {
        statusEl.innerHTML = `<p style="color:var(--green);">✓ Synced ${updated} shows!</p>`;
    }
    if (!silent && source === 'tvmaze' && notFoundOnTVMaze.length > 0) {
        showTVMazeNotFoundDialog(notFoundOnTVMaze);
    }
    if (updated > 0) await loadMyList();

    isSyncing = false;
}

// ===== SYNC ONE SHOW WITH TMDB — D1: uses watch snapshot =====
async function syncShowWithTMDB(show, det, watchSnap = null) {
    const newSeasons = [];

    for (let s = 0; s <= det.number_of_seasons; s++) {
        if (!det.seasons?.some(se => se.season_number === s)) continue;
        try {
            const sd = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}/season/${s}?api_key=${TMDB_API_KEY}`);
            if (!sd || !sd.episodes?.length) continue;

            const tmdbEpMap = {};
            sd.episodes.forEach(ep => { tmdbEpMap[ep.episode_number] = ep.name; });

            const existingSeason = (show.seasons_tmdb || show.seasons)?.find(es => es.number === s);

            const episodes = sd.episodes.map(ep => {
                const existing = findExistingEpisode(existingSeason, ep.episode_number, ep.name, s === 0);
                return {
                    number: ep.episode_number,
                    name: ep.name || `Episode ${ep.episode_number}`,
                    air_date: ep.air_date || null,
                    is_watched: existing?.is_watched || false,
                    watched_at: existing?.watched_at || null,
                    rewatch_count: existing?.rewatch_count || 0,
                    rewatch_history: existing?.rewatch_history || [],
                    is_special: existing?.is_special || (s === 0),
                    my_rating: existing?.my_rating || null,
                    note: existing?.note || null
                };
            });

            const fixed = s === 0 ? episodes : detectImposters(episodes, tmdbEpMap, existingSeason);

            // D1: Restore watch data from snapshot after building
            if (watchSnap) restoreWatchData([{ number: s, episodes: fixed }], watchSnap);

            newSeasons.push({ number: s, is_specials: s === 0, episodes: fixed });
        } catch (e) {
            logError('Sync TMDB season', e, { show: show.title, seasonNum: s, operation: 'syncShowWithTMDB' });
        }
    }

    return newSeasons.length > 0 ? newSeasons : null;
}

// ===== FULL LIBRARY SYNC =====
async function fullLibrarySync() {
    if (isSyncing) return; // G2
    isSyncing = true;

    const statusEl = document.getElementById('settings-action-status');
    if (statusEl) statusEl.innerHTML = `<p style="color:var(--accent);">Starting full sync...</p>`;

    const allShows = myList.filter(i => i.type === 'tv' && i.tmdb_id);
    let synced = 0;

    for (let i = 0; i < allShows.length; i++) {
        const show = allShows[i];
        try {
            if (statusEl) statusEl.innerHTML = `<p style="color:var(--accent);">Syncing ${i + 1}/${allShows.length}: ${show.title}</p>`;

            // D1: Snapshot before rebuild
            const watchSnap = snapshotWatchData(show.seasons);

            const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);

            // Sync TMDB
            const tmdbSeasons = await syncShowWithTMDB(show, det, watchSnap);
            if (tmdbSeasons) show.seasons_tmdb = tmdbSeasons;

            // Sync TVMaze
            if (!show.force_tmdb_source) {
                const tvmazeGrouped = await fetchTVMazeEpisodes(show);
                if (tvmazeGrouped) {
                    show.episode_map = buildEpisodeMap(show.seasons_tmdb || show.seasons, tvmazeGrouped);
                    show.seasons_tvmaze = buildTVMazeSeasonsWithWatchData(tvmazeGrouped, show.seasons_tmdb || show.seasons, show.episode_map);
                    // D1: Restore into TVMaze structure too
                    restoreWatchData(show.seasons_tvmaze, watchSnap);
                    if (show.seasons_tmdb) syncWatchDataAcross(show.seasons_tmdb, show.seasons_tvmaze, show.episode_map, 'tmdb');
                }
            }

            swapActiveSeasons(show, getEpisodeSource());

            // Enrich missing metadata
            const enrichData = {};
            if (!show.genres || !show.genres.length) enrichData.genres = (det.genres || []).map(g => g.name);
            if (!show.original_language) enrichData.original_language = det.original_language || null;
            if (!show.networks || !show.networks.length) enrichData.networks = (det.networks || []).map(n => n.name);
            if (!show.origin_country || !show.origin_country.length) enrichData.origin_country = det.origin_country || [];
            if (!show.popularity) enrichData.popularity = det.popularity || null;
            if (!show.year && det.first_air_date) enrichData.year = parseInt(det.first_air_date.substring(0, 4));
            if (!show.tmdb_rating && det.vote_average) enrichData.tmdb_rating = det.vote_average;

            const updateData = {
                ...enrichData,
                seasons: show.seasons,
                tmdb_status: det.status || show.tmdb_status,
                last_synced: new Date().toISOString()
            };
            if (show.seasons_tmdb) updateData.seasons_tmdb = show.seasons_tmdb;
            if (show.seasons_tvmaze) updateData.seasons_tvmaze = show.seasons_tvmaze;
            if (show.episode_map) updateData.episode_map = show.episode_map;
            if (show.tvmaze_id) updateData.tvmaze_id = show.tvmaze_id;
            if (show.tvdb_id) updateData.tvdb_id = show.tvdb_id;

            await updateDoc(doc(db, 'series', show.docId), updateData);
            Object.assign(show, enrichData);
            synced++;

            await new Promise(r => setTimeout(r, 400));
        } catch (e) {
            logError('Full sync', e, { show: show.title, docId: show.docId, operation: 'fullLibrarySync' });
        }
    }

    // Enrich movies missing data
    const movies = myList.filter(i => i.type === 'movie' && i.tmdb_id && (!i.genres || !i.genres.length || !i.year));
    for (let i = 0; i < movies.length; i++) {
        const movie = movies[i];
        try {
            if (statusEl) statusEl.innerHTML = `<p style="color:var(--accent);">Enriching movie ${i + 1}/${movies.length}: ${movie.title}</p>`;
            const det = await tmdbFetch(`${TMDB_BASE_URL}/movie/${movie.tmdb_id}?api_key=${TMDB_API_KEY}`);
            const enrichData = {};
            if (!movie.genres || !movie.genres.length) enrichData.genres = (det.genres || []).map(g => g.name);
            if (!movie.year && det.release_date) enrichData.year = parseInt(det.release_date.substring(0, 4));
            if (!movie.original_language) enrichData.original_language = det.original_language || null;
            if (!movie.popularity) enrichData.popularity = det.popularity || null;
            if (Object.keys(enrichData).length) {
                await updateDoc(doc(db, 'movies', movie.docId), enrichData);
                Object.assign(movie, enrichData);
            }
            await new Promise(r => setTimeout(r, 250));
        } catch (e) {
            logError('Enrich movie', e, { show: movie.title, docId: movie.docId });
        }
    }

    saveTmdbCache();
    saveTVMazeCache();
    localStorage.setItem('lastEpisodeSync', Date.now().toString());
    updateLastSyncedDisplay();

    if (statusEl) statusEl.innerHTML = `<p style="color:var(--green);">✓ Full sync complete! ${synced} shows synced.</p>`;

    isSyncing = false;
    await loadMyList();
}

// ===== FETCH MISSING TVDB/TVMAZE IDS — C2 =====
async function fetchMissingTVDBIds() {
    const statusEl = document.getElementById('settings-action-status');
    const missing = myList.filter(i => i.type === 'tv' && (!i.tvdb_id || !i.tvmaze_id));
    if (!missing.length) {
        if (statusEl) statusEl.innerHTML = `<p style="color:var(--green);">✓ All shows have IDs!</p>`;
        return;
    }
    if (statusEl) statusEl.innerHTML = `<p style="color:var(--accent);">Fetching IDs for ${missing.length} shows...</p>`;

    const got = [], failed = [], unverified = [];

    for (let i = 0; i < missing.length; i++) {
        const show = missing[i];
        try {
            if (statusEl) statusEl.innerHTML = `<p style="color:var(--accent);">Fetching ${i + 1}/${missing.length}: ${show.title}</p>`;

            let tvShow = null;
            let confidence = 'verified'; // found by ID = verified

            // Try TVDB lookup first (most reliable)
            if (show.tvdb_id) {
                tvShow = await tvmazeLookupByTVDB(show.tvdb_id);
            }
            // Try TVMaze ID direct
            if (!tvShow && show.tvmaze_id) {
                tvShow = await tvmazeFetch(`${TVMAZE_BASE}/shows/${show.tvmaze_id}`);
            }
            // Fall back to title+year search (less reliable — mark as unverified)
            if (!tvShow) {
                tvShow = await tvmazeSearchByTitle(show.title, show.year);
                if (tvShow) confidence = 'unverified';
            }

            if (tvShow) {
                const updateData = {};
                if (!show.tvmaze_id && tvShow.id) {
                    updateData.tvmaze_id = tvShow.id;
                    show.tvmaze_id = tvShow.id;
                }
                if (!show.tvdb_id && tvShow.externals?.thetvdb) {
                    updateData.tvdb_id = tvShow.externals.thetvdb;
                    show.tvdb_id = tvShow.externals.thetvdb;
                }
                if (!show.tmdb_id && tvShow.externals?.themoviedb) {
                    updateData.tmdb_id = tvShow.externals.themoviedb;
                    show.tmdb_id = tvShow.externals.themoviedb;
                }
                // Save confidence level
                updateData.id_confidence = confidence;
                show.id_confidence = confidence;

                if (Object.keys(updateData).length) {
                    await updateDoc(doc(db, 'series', show.docId), updateData);
                }

                const result = {
                    title: show.title,
                    docId: show.docId,
                    tvmaze_id: show.tvmaze_id,
                    tvdb_id: show.tvdb_id,
                    tmdb_id: show.tmdb_id,
                    confidence
                };

                if (confidence === 'unverified') {
                    unverified.push({ ...result, show });
                } else {
                    got.push(result);
                }
            } else {
                failed.push({ show, title: show.title });
            }

            await new Promise(r => setTimeout(r, 400));
        } catch (e) {
            logError('Fetch IDs', e, { show: show.title, docId: show.docId });
            failed.push({ show, title: show.title });
        }
    }

    if (statusEl) statusEl.innerHTML = `<p style="color:var(--green);">✓ Got IDs for ${got.length + unverified.length} shows. ${failed.length} not found. ${unverified.length} need verification.</p>`;

    showTVDBFetchResultDialog(got, failed, unverified);
}

// ===== TVDB FETCH RESULT DIALOG — C2: with unverified section =====
function showTVDBFetchResultDialog(got, failed, unverified = []) {
    let modal = document.getElementById('tvdb-fetch-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tvdb-fetch-modal';
        modal.className = 'modal';
        modal.style.cssText = 'z-index:3000;';
        modal.innerHTML = `<div class="modal-content" style="max-width:640px;"><span class="close" onclick="closeModal('tvdb-fetch-modal')">&times;</span><div id="tvdb-fetch-body"></div></div>`;
        document.body.appendChild(modal);
        if (!MODAL_IDS.includes('tvdb-fetch-modal')) MODAL_IDS.push('tvdb-fetch-modal');
        modal.addEventListener('click', e => { if (e.target === modal) closeModal('tvdb-fetch-modal'); });
    }

    let html = `<h3 style="color:var(--accent);margin-bottom:16px;">🔑 ID Fetch Results</h3>`;

    if (unverified.length) {
        html += `<div class="tvdb-result-section">
            <h4 style="color:var(--orange);">⚠️ Needs Verification (${unverified.length})</h4>
            <p style="font-size:12px;color:var(--text2);margin-bottom:8px;">Found by title search — may not be correct. Please verify in ID Manager.</p>
            ${unverified.map(g => `<div class="tvdb-result-item">
                <span class="result-icon">⚠️</span>
                <span class="result-title">${g.title}</span>
                <span class="result-id">TVMaze:${g.tvmaze_id || '—'}</span>
                <button class="tvdb-fix-btn" onclick="openIDManager('${g.docId}');closeModal('tvdb-fetch-modal');">Verify</button>
            </div>`).join('')}
        </div>`;
    }

    if (got.length) {
        html += `<div class="tvdb-result-section">
            <h4 style="color:var(--green);">✅ Got IDs (${got.length})</h4>
            ${got.map(g => `<div class="tvdb-result-item">
                <span class="result-icon">✅</span>
                <span class="result-title">${g.title}</span>
                <span class="result-id">TVMaze:${g.tvmaze_id || '—'} TVDB:${g.tvdb_id || '—'}</span>
            </div>`).join('')}
        </div>`;
    }

    if (failed.length) {
        html += `<div class="tvdb-result-section">
            <h4 style="color:var(--red);">❌ Not Found (${failed.length})</h4>
            <p style="font-size:12px;color:var(--text3);margin-bottom:8px;">Use ID Manager to manually enter IDs.</p>
            ${failed.map(f => `<div class="tvdb-result-item">
                <span class="result-icon">❌</span>
                <span class="result-title">${f.title}</span>
                <button class="tvdb-fix-btn" onclick="openIDManager('${f.show.docId}');closeModal('tvdb-fetch-modal');">Fix</button>
            </div>`).join('')}
        </div>`;
    }

    html += `<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
        <button onclick="openIDManager();closeModal('tvdb-fetch-modal');" style="flex:1;padding:10px 16px;background:var(--surface2);border:2px solid var(--border);border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text);">Open ID Manager</button>
        <button onclick="closeModal('tvdb-fetch-modal')" style="flex:1;padding:10px 16px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Done</button>
    </div>`;

    document.getElementById('tvdb-fetch-body').innerHTML = html;
    openModal('tvdb-fetch-modal');
}

// ===== C1: ID MANAGER =====
function openIDManager(highlightDocId = null) {
    let modal = document.getElementById('id-manager-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'id-manager-modal';
        modal.className = 'modal';
        modal.style.cssText = 'z-index:3000;';
        modal.innerHTML = `<div class="modal-content" style="max-width:800px;"><span class="close" onclick="closeModal('id-manager-modal')">&times;</span><div id="id-manager-body"></div></div>`;
        document.body.appendChild(modal);
        if (!MODAL_IDS.includes('id-manager-modal')) MODAL_IDS.push('id-manager-modal');
        modal.addEventListener('click', e => { if (e.target === modal) closeModal('id-manager-modal'); });
    }

    renderIDManager(highlightDocId);
    openModal('id-manager-modal');
}

function renderIDManager(highlightDocId = null) {
    const body = document.getElementById('id-manager-body');
    if (!body) return;

    const shows = myList.filter(i => i.type === 'tv').sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    body.innerHTML = `
        <h3 style="color:var(--accent);margin-bottom:12px;">🔑 ID Manager</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:12px;">Edit TVMaze, TVDB, and TMDB IDs for your shows. Changes are saved immediately.</p>

        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            <input type="text" id="id-manager-search" placeholder="Search shows..." onInput="filterIDManager()"
                style="flex:1;padding:8px 12px;border:2px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;min-width:150px;">
            <select id="id-manager-filter" onchange="filterIDManager()"
                style="padding:8px 12px;border:2px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;">
                <option value="all">All Shows</option>
                <option value="missing-tvmaze">Missing TVMaze ID</option>
                <option value="missing-tvdb">Missing TVDB ID</option>
                <option value="unverified">Unverified</option>
                <option value="anime">Anime Only</option>
                <option value="tv">TV Only</option>
            </select>
        </div>

        <div id="id-manager-list" style="max-height:500px;overflow-y:auto;">
            ${shows.map(show => buildIDManagerRow(show, show.docId === highlightDocId)).join('')}
        </div>

        <div style="margin-top:14px;text-align:right;">
            <button onclick="closeModal('id-manager-modal')" style="padding:10px 24px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Done</button>
        </div>`;
}

function buildIDManagerRow(show, highlight = false) {
    const safeDocId = show.docId.replace(/'/g, "\\'");
    const confidence = show.id_confidence || 'verified';
    const confidenceBadge = confidence === 'unverified'
        ? `<span style="background:var(--orange);color:white;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700;">UNVERIFIED</span>`
        : '';

    return `<div class="id-manager-row ${highlight ? 'id-manager-highlight' : ''}" data-title="${(show.title || '').toLowerCase()}" data-anime="${show.is_anime}" data-confidence="${confidence}" data-missing-tvmaze="${!show.tvmaze_id}" data-missing-tvdb="${!show.tvdb_id}">
        <div style="display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);">
            <img src="${safePoster(show.poster, 'thumb')}" style="width:36px;height:54px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.src='${PLACEHOLDER_THUMB}'">
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${show.title}${show.year ? ` (${show.year})` : ''} ${confidenceBadge}</div>
                <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center;">
                    <label style="font-size:11px;color:var(--text3);">TVMaze:</label>
                    <input type="number" class="id-input" value="${show.tvmaze_id || ''}" placeholder="—"
                        onchange="saveShowID('${safeDocId}','tvmaze_id',this.value)"
                        style="width:80px;padding:3px 6px;border:1.5px solid ${!show.tvmaze_id ? 'var(--red)' : 'var(--border)'};border-radius:5px;background:var(--surface2);color:var(--text);font-size:12px;">
                    <label style="font-size:11px;color:var(--text3);">TVDB:</label>
                    <input type="number" class="id-input" value="${show.tvdb_id || ''}" placeholder="—"
                        onchange="saveShowID('${safeDocId}','tvdb_id',this.value)"
                        style="width:80px;padding:3px 6px;border:1.5px solid ${!show.tvdb_id ? 'var(--orange)' : 'var(--border)'};border-radius:5px;background:var(--surface2);color:var(--text);font-size:12px;">
                    <label style="font-size:11px;color:var(--text3);">TMDB:</label>
                    <input type="number" class="id-input" value="${show.tmdb_id || ''}" placeholder="—"
                        onchange="saveShowID('${safeDocId}','tmdb_id',this.value)"
                        style="width:80px;padding:3px 6px;border:1.5px solid var(--border);border-radius:5px;background:var(--surface2);color:var(--text);font-size:12px;">
                    ${confidence === 'unverified' ? `<button onclick="verifyShowID('${safeDocId}')" style="padding:3px 8px;background:var(--green);color:white;border:none;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600;">✓ Verify</button>` : ''}
                </div>
            </div>
        </div>
    </div>`;
}

async function saveShowID(docId, field, value) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const parsed = value ? parseInt(value) : null;
    if (value && isNaN(parsed)) return;
    item[field] = parsed;
    try {
        await updateDoc(doc(db, 'series', docId), { [field]: parsed });
        // Update border color
        logError !== undefined && console.log(`Saved ${field}=${parsed} for ${item.title}`);
    } catch (e) {
        logError('Save show ID', e, { show: item.title, docId, field });
        showSaveToast('Save failed', true);
    }
}

async function verifyShowID(docId) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    item.id_confidence = 'verified';
    try {
        await updateDoc(doc(db, 'series', docId), { id_confidence: 'verified' });
        // Re-render the row
        renderIDManager();
    } catch (e) {
        logError('Verify ID', e, { show: item.title, docId });
    }
}

function filterIDManager() {
    const search = document.getElementById('id-manager-search')?.value?.toLowerCase() || '';
    const filter = document.getElementById('id-manager-filter')?.value || 'all';

    document.querySelectorAll('.id-manager-row').forEach(row => {
        const title = row.dataset.title || '';
        const isAnime = row.dataset.anime === 'true';
        const confidence = row.dataset.confidence || 'verified';
        const missingTvmaze = row.dataset.missingTvmaze === 'true';
        const missingTvdb = row.dataset.missingTvdb === 'true';

        let show = true;
        if (search && !title.includes(search)) show = false;
        if (filter === 'missing-tvmaze' && !missingTvmaze) show = false;
        if (filter === 'missing-tvdb' && !missingTvdb) show = false;
        if (filter === 'unverified' && confidence !== 'unverified') show = false;
        if (filter === 'anime' && !isAnime) show = false;
        if (filter === 'tv' && isAnime) show = false;

        row.style.display = show ? 'block' : 'none';
    });
}

// ===== G16: MANUAL AIR TIME MODAL =====
function openManualAirTimeModal() {
    let modal = document.getElementById('manual-airtime-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'manual-airtime-modal';
        modal.className = 'modal';
        modal.style.cssText = 'z-index:3000;';
        modal.innerHTML = `<div class="modal-content" style="max-width:560px;"><span class="close" onclick="closeModal('manual-airtime-modal')">&times;</span><div id="manual-airtime-body"></div></div>`;
        document.body.appendChild(modal);
        if (!MODAL_IDS.includes('manual-airtime-modal')) MODAL_IDS.push('manual-airtime-modal');
        modal.addEventListener('click', e => { if (e.target === modal) closeModal('manual-airtime-modal'); });
    }

    const shows = myList.filter(i => i.type === 'tv').sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const tzOptions = Object.keys(TZ_OFFSETS).map(tz => `<option value="${tz}">${tz}</option>`).join('');

    document.getElementById('manual-airtime-body').innerHTML = `
        <h3 style="color:var(--accent);margin-bottom:12px;">⏰ Manual Air Time</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:16px;">Set a custom air time for a show when it can't be found automatically.</p>

        <div style="margin-bottom:12px;">
            <label style="font-size:13px;color:var(--text2);display:block;margin-bottom:6px;">Show:</label>
            <input type="text" id="airtime-show-search" placeholder="Type to search..." onInput="filterAirtimeShows()"
                style="width:100%;padding:8px 12px;border:2px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;">
            <select id="airtime-show-select" size="5"
                style="width:100%;margin-top:6px;border:2px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;padding:4px;">
                ${shows.map(s => `<option value="${s.docId}">${s.title}${s.year ? ` (${s.year})` : ''}</option>`).join('')}
            </select>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
            <div style="flex:1;min-width:120px;">
                <label style="font-size:13px;color:var(--text2);display:block;margin-bottom:6px;">Air Time (local):</label>
                <input type="time" id="airtime-time" value="21:00"
                    style="width:100%;padding:8px 12px;border:2px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;">
            </div>
            <div style="flex:1;min-width:120px;">
                <label style="font-size:13px;color:var(--text2);display:block;margin-bottom:6px;">Day:</label>
                <select id="airtime-day"
                    style="width:100%;padding:8px 12px;border:2px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;">
                    <option value="">Unknown</option>
                    ${days.map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
            </div>
        </div>

        <div style="margin-bottom:16px;">
            <label style="font-size:13px;color:var(--text2);display:block;margin-bottom:6px;">Timezone:</label>
            <select id="airtime-timezone"
                style="width:100%;padding:8px 12px;border:2px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;">
                ${tzOptions}
            </select>
        </div>

        <div id="airtime-preview" style="padding:10px;background:var(--surface2);border-radius:8px;margin-bottom:16px;font-size:13px;color:var(--text2);">
            Ghana time: —
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button onclick="closeModal('manual-airtime-modal')" style="padding:10px 20px;border:2px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;cursor:pointer;">Cancel</button>
            <button onclick="applyManualAirTime()" style="padding:10px 24px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Save Air Time</button>
        </div>`;

    // Live preview
    ['airtime-time', 'airtime-timezone'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', updateAirtimePreview);
    });

    openModal('manual-airtime-modal');
}

function updateAirtimePreview() {
    const time = document.getElementById('airtime-time')?.value;
    const tz = document.getElementById('airtime-timezone')?.value;
    const preview = document.getElementById('airtime-preview');
    if (!preview) return;
    if (time && tz) {
        const ghanaTime = convertToGhanaTime(time, tz);
        preview.textContent = `Ghana time: ${ghanaTime || '—'}`;
    }
}

function filterAirtimeShows() {
    const search = document.getElementById('airtime-show-search')?.value?.toLowerCase() || '';
    const select = document.getElementById('airtime-show-select');
    if (!select) return;
    Array.from(select.options).forEach(opt => {
        opt.style.display = opt.text.toLowerCase().includes(search) ? '' : 'none';
    });
}

async function applyManualAirTime() {
    const select = document.getElementById('airtime-show-select');
    const time = document.getElementById('airtime-time')?.value;
    const tz = document.getElementById('airtime-timezone')?.value;
    const day = document.getElementById('airtime-day')?.value;

    if (!select?.value) { alert('Please select a show.'); return; }
    if (!time) { alert('Please enter an air time.'); return; }

    const docId = select.value;
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const airData = {
        time,
        timezone: tz || 'UTC',
        day: day || null,
        source: 'manual',
        fetched_at: new Date().toISOString()
    };

    try {
        await updateDoc(doc(db, 'series', docId), { air_time_data: airData });
        item.air_time_data = airData;
        closeModal('manual-airtime-modal');
        showSaveToast('Air time saved ✓');
    } catch (e) {
        logError('Manual air time', e, { show: item.title, docId });
        showSaveToast('Save failed', true);
    }
}

// ===== TVMAZE NOT FOUND DIALOG =====
function showTVMazeNotFoundDialog(shows) {
    let modal = document.getElementById('tvmaze-notfound-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tvmaze-notfound-modal';
        modal.className = 'modal';
        modal.style.cssText = 'z-index:3000;';
        modal.innerHTML = `<div class="modal-content" style="max-width:560px;"><span class="close" onclick="closeModal('tvmaze-notfound-modal')">&times;</span><div id="tvmaze-notfound-body"></div></div>`;
        document.body.appendChild(modal);
        if (!MODAL_IDS.includes('tvmaze-notfound-modal')) MODAL_IDS.push('tvmaze-notfound-modal');
        modal.addEventListener('click', e => { if (e.target === modal) closeModal('tvmaze-notfound-modal'); });
    }

    document.getElementById('tvmaze-notfound-body').innerHTML = `
        <h3 style="color:var(--accent);margin-bottom:12px;">⚠️ TVMaze: ${shows.length} Show${shows.length > 1 ? 's' : ''} Not Found</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:16px;">These shows were synced using TMDB as a fallback.</p>
        <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:20px;">
            ${shows.map(s => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);">
                <img src="${safePoster(s.poster, 'thumb')}" style="width:32px;height:48px;object-fit:cover;border-radius:4px;" onerror="this.src='${PLACEHOLDER_THUMB}'">
                <div style="flex:1;"><div style="font-size:13px;font-weight:600;color:var(--text);">${s.title}</div></div>
                <button onclick="openFixShowModal('${s.docId}');closeModal('tvmaze-notfound-modal');" style="padding:4px 10px;background:var(--accent);color:white;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;">Fix</button>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button onclick="applyTVMazeFallback('tmdb','${shows.map(s => s.docId).join(',')}')" style="flex:1;padding:10px 16px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;">Use TMDB for All</button>
            <button onclick="closeModal('tvmaze-notfound-modal')" style="flex:1;padding:10px 16px;background:var(--surface2);border:2px solid var(--border);border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text);">Skip All</button>
        </div>`;
    openModal('tvmaze-notfound-modal');
}

async function applyTVMazeFallback(action, docIdsStr) {
    if (action === 'tmdb') {
        const docIds = docIdsStr.split(',');
        for (const docId of docIds) {
            try {
                await updateDoc(doc(db, 'series', docId), { force_tmdb_source: true });
                const item = myList.find(i => i.docId === docId);
                if (item) item.force_tmdb_source = true;
            } catch (e) { logError('Apply TMDB fallback', e, { docId }); }
        }
    }
    closeModal('tvmaze-notfound-modal');
}

// ===== HELPER: FIND EXISTING EPISODE =====
function findExistingEpisode(existingSeason, epNum, tmdbName, isS0) {
    if (!existingSeason) return null;
    const eps = existingSeason.episodes || [];
    if (isS0) return eps.find(e => e.number === epNum) || null;
    return eps.find(e => e.number === epNum && !e.is_special) || eps.find(e => e.number === epNum) || null;
}

// ===== IMPOSTER DETECTION =====
function detectImposters(episodes, tmdbEpMap, existingSeason) {
    const byNum = {};
    episodes.forEach((ep, idx) => {
        if (!byNum[ep.number]) byNum[ep.number] = [];
        byNum[ep.number].push({ ep, idx });
    });
    const result = [...episodes];
    Object.entries(byNum).forEach(([numStr, group]) => {
        if (group.length < 2) return;
        const official = tmdbEpMap[parseInt(numStr)] || '';
        let bestIdx = -1, bestScore = -1;
        group.forEach(({ ep, idx }) => {
            const score = titleSimilarity(ep.name || '', official);
            if (score > bestScore) { bestScore = score; bestIdx = idx; }
        });
        group.forEach(({ ep, idx }) => {
            if (idx !== bestIdx) {
                const existing = existingSeason?.episodes?.find(e => e.number === ep.number && e.name === ep.name);
                result[idx] = {
                    ...result[idx], is_special: true,
                    ...(existing ? {
                        is_watched: existing.is_watched,
                        watched_at: existing.watched_at,
                        rewatch_count: existing.rewatch_count || 0,
                        rewatch_history: existing.rewatch_history || [],
                        my_rating: existing.my_rating || null,
                        note: existing.note || null
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
    const p = { genres: {}, networks: {}, languages: {}, decades: {}, totalRated: 0, avgRating: 0 };
    let total = 0;
    items.forEach(item => {
        const r = item.my_rating;
        if (!r || r < 1) return;
        p.totalRated++;
        total += r;
        const w = r / 10;
        (item.genres || []).forEach(g => { if (g === 'Animation' && item.is_anime) return; p.genres[g] = (p.genres[g] || 0) + w; });
        (item.networks || []).slice(0, 1).forEach(n => { p.networks[n] = (p.networks[n] || 0) + w; });
        if (item.original_language) p.languages[item.original_language] = (p.languages[item.original_language] || 0) + w;
        if (item.year) { const decade = `${Math.floor(item.year / 10) * 10}s`; p.decades[decade] = (p.decades[decade] || 0) + w; }
    });
    p.avgRating = p.totalRated > 0 ? total / p.totalRated : 5;
    return p;
}

function calculateMatchScore(showDetails, profile) {
    if (profile.totalRated < 3) return null;
    let score = 0, max = 0;
    const genres = (showDetails.genres || []).map(g => typeof g === 'object' ? g.name : g);
    if (genres.length) {
        max += 60;
        const top = new Set(Object.entries(profile.genres).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g));
        score += (genres.filter(g => top.has(g)).length / Math.max(genres.length, 1)) * 60;
    }
    if (showDetails.original_language && Object.keys(profile.languages).length) {
        max += 15;
        const topLang = Object.entries(profile.languages).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (showDetails.original_language === topLang) score += 15;
        else if (profile.languages[showDetails.original_language]) score += 7;
    }
    if (showDetails.vote_average) {
        max += 15;
        score += Math.max(0, 15 - Math.abs(showDetails.vote_average - profile.avgRating) * 3);
    }
    if (showDetails.first_air_date || showDetails.release_date) {
        const yr = parseInt((showDetails.first_air_date || showDetails.release_date || '').substring(0, 4));
        if (yr) {
            const decade = `${Math.floor(yr / 10) * 10}s`;
            if (profile.decades[decade]) { max += 10; score += Math.min(10, profile.decades[decade] * 5); }
        }
    }
    return max > 0 ? Math.round((score / max) * 100) : null;
}

// ===== NAV / TABS =====
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
    if (section === 'profile') { updateProfilePage(); renderCollections(); }
    window.scrollTo(0, 0);
}

function switchSubTab(tabId) {
    const el = document.getElementById(tabId);
    if (!el) return;
    const page = el.closest('.section-page');
    if (!page) return;
    page.querySelectorAll('.sub-tab-content').forEach(t => t.classList.remove('active'));
    page.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    page.querySelector(`.sub-tab-btn[data-subtab="${tabId}"]`)?.classList.add('active');
}

document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSubTab(btn.dataset.subtab));
});

function setupSubTabSwipe() {
    document.querySelectorAll('.swipeable-tabs').forEach(container => {
        let sx = 0;
        container.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
        container.addEventListener('touchend', e => {
            const diff = sx - e.changedTouches[0].clientX;
            if (Math.abs(diff) < 60) return;
            const page = container.closest('.section-page');
            const tabs = page.querySelectorAll('.sub-tab-btn');
            const active = page.querySelector('.sub-tab-btn.active');
            const cur = parseInt(active?.dataset.index || '0');
            const next = diff > 0 ? Math.min(cur + 1, tabs.length - 1) : Math.max(cur - 1, 0);
            if (next !== cur) switchSubTab(tabs[next].dataset.subtab);
        });
    });
}

// ===== SEARCH =====
function setupSearch() {
    const topInput = document.getElementById('search-input');
    const overlayInput = document.getElementById('search-overlay-input');
    const btn = document.getElementById('search-btn');
    const closeBtn = document.getElementById('close-search-btn');
    const clearBtn = document.getElementById('search-clear-btn');

    topInput.addEventListener('focus', e => { e.preventDefault(); showSearchOverlay(); });
    topInput.addEventListener('click', e => { e.preventDefault(); showSearchOverlay(); });
    btn.addEventListener('click', () => {
        showSearchOverlay();
        overlayInput.value = topInput.value;
        if (overlayInput.value.trim()) performSearch();
    });
    closeBtn.addEventListener('click', hideSearchOverlay);
    overlayInput.addEventListener('keypress', e => { if (e.key === 'Enter') performSearch(); });
    overlayInput.addEventListener('input', () => {
        clearBtn.style.display = overlayInput.value ? 'block' : 'none';
    });
    clearBtn.addEventListener('click', () => {
        overlayInput.value = '';
        clearBtn.style.display = 'none';
        document.getElementById('search-results').innerHTML = '';
        overlayInput.focus();
    });
    document.querySelectorAll('.search-filter-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.search-filter-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            currentSearchType = b.dataset.type === 'anime' ? 'tv' : b.dataset.type;
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
    const source = getEpisodeSource();
    const activeFilter = document.querySelector('.search-filter-btn.active')?.dataset.type;
    try {
        if (source === 'tvmaze' && (currentSearchType === 'tv' || activeFilter === 'anime' || activeFilter === 'tv')) {
            await performTVMazeSearch(query, activeFilter);
        } else {
            await performTMDBSearch(query, activeFilter);
        }
    } catch (e) {
        container.innerHTML = '<p class="empty-state">Search failed.</p>';
        logError('Search', e);
    }
}

// B4: TVMaze search matches by TVMaze ID, G15: ID badges
async function performTVMazeSearch(query, activeFilter) {
    const container = document.getElementById('search-results');
    const results = await tvmazeFetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(query)}`);
    if (!results || !results.length) { container.innerHTML = '<p class="empty-state">No results.</p>'; return; }

    let shows = results.map(r => r.show);
    if (activeFilter === 'anime') {
        shows = shows.filter(s => {
            const lang = s.language?.toLowerCase();
            return lang === 'japanese' || lang === 'chinese' ||
                ['Fuji TV', 'Tokyo MX', 'TBS', 'TV Tokyo', 'Crunchyroll', 'AT-X', 'BS11', 'MBS', 'NHK', 'Bilibili'].some(n => s.network?.name === n || s.webChannel?.name === n);
        });
    }

    const showIdBadges = getSetting('showIdBadges');

    container.innerHTML = shows.map(show => {
        const title = show.name || 'Unknown';
        const year = show.premiered ? show.premiered.substring(0, 4) : '';
        const poster = tvmazePoster(show) || PLACEHOLDER_POSTER;
        const rating = show.rating?.average ? show.rating.average.toFixed(1) : 'N/A';

        // B4: Match by TVMaze ID first, then title+type
        const inList = myList.some(li => li.tvmaze_id === show.id);
        const libraryItem = myList.find(li => li.tvmaze_id === show.id);

        const st = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const sp = poster.replace(/'/g, "\\'");
        const tvdbId = show.externals?.thetvdb || null;
        const tmdbIdFromMaze = show.externals?.themoviedb || null;

        const idBadge = showIdBadges ? `<div style="font-size:9px;color:var(--text3);margin-top:2px;">TVMaze: ${show.id}${tmdbIdFromMaze ? ` · TMDB: ${tmdbIdFromMaze}` : ''}</div>` : '';

        return `<div class="media-card" onclick="${inList ? `openDetails('${libraryItem?.docId}','tv')` : `openPreviewFromTVMaze(${show.id},${tvdbId || 'null'},${tmdbIdFromMaze || 'null'},'${st}','${year}','${sp}')`}">
            <img src="${poster}" alt="${title}" onerror="this.src='${PLACEHOLDER_POSTER}'">
            <div class="info">
                <h3>${title}</h3>
                <p class="year">${year} · ⭐${rating}</p>
                ${idBadge}
            </div>
            <button class="add-btn ${inList ? 'in-list-btn' : ''}" onclick="event.stopPropagation();${inList ? `openDetails('${libraryItem?.docId}','tv')` : `addToListFromTVMaze(${show.id},${tvdbId || 'null'},${tmdbIdFromMaze || 'null'},'${st}','${year}','${sp}')`}">${inList ? '✓ In Library' : '+ Add'}</button>
        </div>`;
    }).filter(Boolean).join('');
}

async function performTMDBSearch(query, activeFilter) {
    const container = document.getElementById('search-results');
    const type = currentSearchType === 'multi' ? 'multi' : currentSearchType;
    const data = await tmdbFetch(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
    let results = data.results || [];
    if (activeFilter === 'anime') results = results.filter(r => r.media_type === 'tv' || currentSearchType === 'tv');
    displaySearchResults(results);
}

function displaySearchResults(results) {
    const container = document.getElementById('search-results');
    if (!results.length) { container.innerHTML = '<p class="empty-state">No results.</p>'; return; }
    const showIdBadges = getSetting('showIdBadges');
    container.innerHTML = results.map(item => {
        const title = item.title || item.name || 'Unknown';
        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
        const type = item.media_type || currentSearchType;
        if (type === 'person') return '';
        const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : PLACEHOLDER_POSTER;
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        // A3: Match by tmdb_id, not title
        const inList = myList.some(li => li.tmdb_id === item.id);
        const libraryItem = myList.find(li => li.tmdb_id === item.id);
        const st = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const sp = poster.replace(/'/g, "\\'");
        const idBadge = showIdBadges ? `<div style="font-size:9px;color:var(--text3);margin-top:2px;">TMDB: ${item.id}${year ? ` · ${year}` : ''}</div>` : '';
        return `<div class="media-card" onclick="${inList ? `openDetails('${libraryItem?.docId}','${type}')` : `openPreview(${item.id},'${type}','${st}','${year}','${sp}')`}">
            <img src="${poster}" alt="${title}" onerror="this.src='${PLACEHOLDER_POSTER}'">
            <div class="info">
                <h3>${title}</h3>
                <p class="year">${year} · ⭐${rating}</p>
                ${idBadge}
            </div>
            <button class="add-btn ${inList ? 'in-list-btn' : ''}" onclick="event.stopPropagation();${inList ? `openDetails('${libraryItem?.docId}','${type}')` : `addToList(${item.id},'${type}','${st}','${year}','${sp}')`}">${inList ? '✓ In Library' : '+ Add'}</button>
        </div>`;
    }).filter(Boolean).join('');
}

// ===== LOAD MY LIST =====
async function loadMyList() {
    if (isLoading) return;
    isLoading = true;
    try {
        myList = [];
        const [movSnap, serSnap] = await Promise.all([
            getDocs(collection(db, 'movies')),
            getDocs(collection(db, 'series'))
        ]);
        movSnap.forEach(d => myList.push({ ...d.data(), docId: d.id, type: 'movie' }));
        serSnap.forEach(d => myList.push({ ...d.data(), docId: d.id, type: 'tv' }));
        myList.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

        const source = getEpisodeSource();
        myList.forEach(item => { if (item.type === 'tv') swapActiveSeasons(item, source); });

        autoTagStatusesSilent();
        renderAllSections();
        updateProfilePage();
        updateNavBadges();
        updateLastSyncedDisplay();
    } catch (e) {
        logError('Load list', e);
        showSaveToast('Failed to load library', true);
    }
    isLoading = false;
}
// ===== HELPERS =====
function getAnime() { return myList.filter(i => i.type === 'tv' && i.is_anime); }
function getTVShows() { return myList.filter(i => i.type === 'tv' && !i.is_anime); }
function getMovies() { return myList.filter(i => i.type === 'movie'); }

function getAiredEpisodesOnly(seasons) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const aired = [];
    (seasons || []).forEach(s => {
        if (s.number === 0) return;
        (s.episodes || []).forEach(ep => {
            if (ep.is_special || ep.is_significant_special || ep.is_insignificant_special || isPlaceholderEpisode(ep)) return;
            const air = ep.air_date ? new Date(ep.air_date) : null;
            if (!air || air <= today) aired.push({ ...ep, seasonNum: s.number });
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
    const max = Math.max(...aired.map(ep => ep.rewatch_count || 0));
    if (max === 0) return 0;
    return (aired.filter(ep => (ep.rewatch_count || 0) >= max).length / aired.length) * 100;
}

// A5: Fixed — only counts episodes AFTER the next one
function getNextEpisodeExcludingSpecials(show) {
    const now = new Date();
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (!show.seasons) return null;

    const atd = show.air_time_data;
    const hasAirTime = atd && atd.source && atd.source !== 'default' && atd.time;
    const ghanaAirHour = hasAirTime ? getGhanaAirHour(atd.time, atd.timezone) : null;
    const currentGhanaHour = now.getHours() + now.getMinutes() / 60;

    for (const s of show.seasons) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special || ep.is_significant_special || ep.is_insignificant_special || isPlaceholderEpisode(ep)) continue;
            const air = ep.air_date ? new Date(ep.air_date) : null;
            if (air) {
                if (air > today) continue;
                const airDateStr = air.toISOString().split('T')[0];
                const todayStr = now.toISOString().split('T')[0];
                if (airDateStr === todayStr && ghanaAirHour !== null) {
                    if (currentGhanaHour < ghanaAirHour) continue;
                }
            }
            if (!ep.is_watched) return { season: s.number, number: ep.number, name: ep.name || `Episode ${ep.number}` };
        }
    }
    return null;
}

function getNextReWatchEpisode(show) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (!show.seasons) return null;
    const aired = getAiredEpisodesOnly(show.seasons);
    const max = Math.max(...aired.map(ep => ep.rewatch_count || 0), 0);
    const target = max === 0 ? 1 : max;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special || isPlaceholderEpisode(ep)) continue;
            const air = ep.air_date ? new Date(ep.air_date) : null;
            if (air && air > today) continue;
            if ((ep.rewatch_count || 0) < target) return { season: s.number, number: ep.number, name: ep.name || `Episode ${ep.number}` };
        }
    }
    return null;
}

// A5: Fixed — only counts episodes AFTER the next unwatched one
function getRemainingEpisodes(show) {
    const now = new Date();
    const today = new Date(); today.setHours(23, 59, 59, 999);

    const atd = show.air_time_data;
    const hasAirTime = atd && atd.source && atd.source !== 'default' && atd.time;
    const ghanaAirHour = hasAirTime ? getGhanaAirHour(atd.time, atd.timezone) : null;
    const currentGhanaHour = now.getHours() + now.getMinutes() / 60;

    // Find the next unwatched episode first
    let foundFirst = false;
    let count = 0;

    for (const s of (show.seasons || [])) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special || ep.is_significant_special || ep.is_insignificant_special || isPlaceholderEpisode(ep)) continue;
            const air = ep.air_date ? new Date(ep.air_date) : null;
            if (air) {
                if (air > today) continue;
                const airDateStr = air.toISOString().split('T')[0];
                const todayStr = now.toISOString().split('T')[0];
                if (airDateStr === todayStr && ghanaAirHour !== null) {
                    if (currentGhanaHour < ghanaAirHour) continue;
                }
            }
            if (!ep.is_watched) {
                if (!foundFirst) {
                    foundFirst = true;
                    // Don't count the first unwatched (that's the "next" ep shown in the card)
                    continue;
                }
                count++;
            }
        }
    }
    return count;
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
    const ago7 = new Date(now.getTime() - 7 * 86400000);
    const fwd7 = new Date(now.getTime() + 7 * 86400000);
    for (const s of (show.seasons || [])) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (!ep.air_date || ep.is_special) continue;
            const air = new Date(ep.air_date);
            if (air.toDateString() === now.toDateString() && show.air_time_data?.source && show.air_time_data.source !== 'default' && show.air_time_data.time) {
                const ghHour = getGhanaAirHour(show.air_time_data.time, show.air_time_data.timezone);
                if (now.getHours() + now.getMinutes() / 60 < ghHour) continue;
            }
            if (air >= ago7 && air <= fwd7) return true;
        }
    }
    return false;
}

function getMostRecentAirDate(show) {
    const today = new Date();
    let recent = null;
    (show.seasons || []).forEach(s => {
        if (s.number === 0) return;
        (s.episodes || []).forEach(ep => {
            if (!ep.air_date || ep.is_special) return;
            const d = new Date(ep.air_date);
            if (d <= today && (!recent || d > recent)) recent = d;
        });
    });
    return recent;
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
                        watched_at: ep.watched_at, is_special: ep.is_special || false,
                        note: ep.note || null
                    });
                }
            });
        });
    });
    eps.sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));
    return eps;
}

function getPreviousUnwatchedEpisodes(show, targetSeason, targetEp) {
    const unwatched = [];
    if (!show.seasons) return unwatched;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        if (s.number > targetSeason) break;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special || isPlaceholderEpisode(ep)) continue;
            if (s.number === targetSeason && ep.number >= targetEp) break;
            if (!ep.is_watched) unwatched.push({ seasonNum: s.number, episodeNum: ep.number });
        }
    }
    return unwatched;
}

function getEpisodesNeedingRewatch(show, targetSeason, targetEp) {
    const needs = [];
    if (!show.seasons) return needs;
    const tSe = show.seasons.find(s => s.number === targetSeason);
    const tEp = tSe?.episodes?.find(e => e.number === targetEp && !e.is_special);
    const targetCount = (tEp?.rewatch_count || 0) + 1;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        if (s.number > targetSeason) break;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special || isPlaceholderEpisode(ep)) continue;
            if (s.number === targetSeason && ep.number >= targetEp) break;
            if (!ep.is_watched) continue;
            if ((ep.rewatch_count || 0) < targetCount) needs.push({ seasonNum: s.number, episodeNum: ep.number });
        }
    }
    return needs;
}

function isAnimeShow(details) {
    const genres = details.genres || [];
    const isAnim = genres.some(g => g.id === 16);
    const nets = ['Fuji TV', 'Tokyo MX', 'TBS', 'TV Tokyo', 'Crunchyroll', 'AT-X', 'BS11', 'MBS', 'NHK', 'Bilibili'];
    return (isAnim && (details.original_language === 'ja' || details.original_language === 'zh')) ||
        (details.networks || []).some(n => nets.includes(n.name));
}

function formatWatchTime(totalMinutes) {
    const y = Math.floor(totalMinutes / 525600);
    const mo = Math.floor((totalMinutes % 525600) / 43800);
    const d = Math.floor((totalMinutes % 43800) / 1440);
    const h = Math.floor((totalMinutes % 1440) / 60);
    const parts = [];
    if (y > 0) parts.push(`${y}y`);
    if (mo > 0) parts.push(`${mo}m`);
    if (d > 0) parts.push(`${d}d`);
    parts.push(`${h}h`);
    return parts.join(' ');
}

function getTimelineLabel(dateStr) {
    const date = new Date(dateStr), now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    if (date >= today) return 'Today';
    if (date >= weekAgo) return 'This Week';
    if (date >= twoWeeksAgo) return 'Last Week';
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function languageCodeToName(code) {
    const map = {
        'en': 'English', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
        'fr': 'French', 'es': 'Spanish', 'de': 'German', 'it': 'Italian',
        'pt': 'Portuguese', 'hi': 'Hindi', 'ar': 'Arabic', 'ru': 'Russian',
        'tr': 'Turkish', 'th': 'Thai', 'id': 'Indonesian', 'nl': 'Dutch',
        'sv': 'Swedish', 'da': 'Danish', 'no': 'Norwegian', 'fi': 'Finnish'
    };
    return map[code] || code?.toUpperCase() || 'Unknown';
}

// ===== AUTO-TAG =====
function autoTagStatusesSilent() {
    let changed = false;
    myList.forEach(item => {
        if (item.type !== 'tv' || item.user_status === 'Rewatching') return;
        const progress = getShowProgressExcludingSpecials(item);
        const hasWatched = item.seasons?.some(s => s.number !== 0 && s.episodes?.some(e => e.is_watched && !e.is_special));
        const tmdb = item.tmdb_status || '';
        let newStatus = item.user_status;
        if (!hasWatched && !['Dropped', 'Paused'].includes(item.user_status)) newStatus = 'Planned';
        else if (progress >= 100 && (tmdb === 'Ended' || tmdb === 'Canceled')) newStatus = 'Finished';
        else if (progress >= 100 && tmdb === 'Returning Series') newStatus = 'Up to Date';
        else if (hasWatched && progress < 100 && !['Dropped', 'Paused', 'Finished'].includes(item.user_status)) newStatus = 'Watching';
        if (newStatus !== item.user_status) {
            item.user_status = newStatus;
            updateDoc(doc(db, 'series', item.docId), { user_status: newStatus }).catch(() => {});
            changed = true;
        }
    });
    // G21: Update collections if statuses changed
    if (changed) renderCollections();
}

// ===== NAV BADGES =====
function updateNavBadges() {
    ['anime', 'tv'].forEach(type => {
        const shows = type === 'anime' ? getAnime() : getTVShows();
        const badge = document.getElementById(`${type}-nav-badge`);
        if (!badge) return;
        const hasAiring = shows.some(show => isCurrentlyAiring(show) && !allAiredWatched(show));
        badge.classList.toggle('visible', hasAiring);
    });
}

function allAiredWatched(show) {
    const now = new Date();
    const today = new Date(); today.setHours(23, 59, 59, 999);

    const atd = show.air_time_data;
    const hasAirTime = atd && atd.source && atd.source !== 'default' && atd.time;
    const ghanaAirHour = hasAirTime ? getGhanaAirHour(atd.time, atd.timezone) : null;
    const currentGhanaHour = now.getHours() + now.getMinutes() / 60;

    let airedCount = 0, allWatched = true;
    (show.seasons || []).forEach(s => {
        if (s.number === 0) return;
        (s.episodes || []).forEach(ep => {
            if (ep.is_special || ep.is_significant_special || ep.is_insignificant_special || isPlaceholderEpisode(ep)) return;
            const air = ep.air_date ? new Date(ep.air_date) : null;
            if (air) {
                if (air > today) return;
                const airDateStr = air.toISOString().split('T')[0];
                const todayStr = now.toISOString().split('T')[0];
                if (airDateStr === todayStr && ghanaAirHour !== null) {
                    if (currentGhanaHour < ghanaAirHour) return;
                }
            }
            airedCount++;
            if (!ep.is_watched) allWatched = false;
        });
    });
    return airedCount > 0 && allWatched;
}

// G8: Debounced render
let renderAllTimer = null;
function renderAllSections() {
    clearTimeout(renderAllTimer);
    renderAllTimer = setTimeout(() => {
        renderContinueWatching('anime');
        renderContinueWatching('tv');
        renderHistory('anime');
        renderHistory('tv');
        renderMoviesSection();
        renderLibrary('anime');
        renderLibrary('tv');
        renderLibrary('movies');
    }, 50);
}

// ===== SECTION JUMP PILLS =====
function renderJumpPills(sectionType, sections) {
    const container = document.getElementById(`${sectionType}-jump-pills`);
    if (!container) return;
    const active = sections.filter(s => s.count > 0);
    if (active.length <= 1) { container.innerHTML = ''; return; }
    container.innerHTML = `<div class="section-jump-pills">${active.map(s =>
        `<button class="section-pill" data-target="${s.id}" onclick="jumpToSection('${sectionType}','${s.id}')">${s.icon} ${s.label} (${s.count})</button>`
    ).join('')}</div>`;
    setupScrollSpy(sectionType, active);
}

function jumpToSection(sectionType, targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const topH = document.querySelector('.top-bar')?.offsetHeight || 60;
    window.scrollTo({ top: el.offsetTop - topH - 44 - 40 - 10, behavior: 'smooth' });
    document.querySelectorAll(`#${sectionType}-jump-pills .section-pill`).forEach(p =>
        p.classList.toggle('active', p.dataset.target === targetId)
    );
}

function setupScrollSpy(sectionType, sections) {
    let timer;
    const handler = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const offset = (document.querySelector('.top-bar')?.offsetHeight || 60) + 100;
            const scrollY = window.scrollY + offset;
            let activeId = sections[0]?.id;
            sections.forEach(s => { const el = document.getElementById(s.id); if (el && el.offsetTop <= scrollY) activeId = s.id; });
            document.querySelectorAll(`#${sectionType}-jump-pills .section-pill`).forEach(p =>
                p.classList.toggle('active', p.dataset.target === activeId)
            );
        }, 100);
    };
    window.addEventListener('scroll', handler, { passive: true });
}

// ===== CONTINUE WATCHING =====
function renderContinueWatching(sectionType) {
    const isAnime = sectionType === 'anime';
    const container = document.getElementById(`${sectionType}-continue-list`);
    if (!container) return;
    const shows = isAnime ? getAnime() : getTVShows();
    const sixtyAgo = new Date(Date.now() - 60 * 86400000);

    const rewatching = shows.filter(s => {
        if (s.user_status !== 'Rewatching') return false;
        // Issue 3: If hiding caught-up, only show if there's a rewatch episode to watch
        if (hideUpToDate && !getNextReWatchEpisode(s)) return false;
        return true;
    });    
    const inProgress = shows.filter(item => {
        if (['Rewatching', 'Dropped', 'Planned'].includes(item.user_status)) return false;
        if (item.user_status === 'Up to Date' && !isCurrentlyAiring(item)) return false;
        let hasW = false, hasUw = false;
        item.seasons?.forEach(s => {
            if (s.number === 0) return;
            s.episodes?.forEach(ep => {
                if (ep.is_special || isPlaceholderEpisode(ep)) return;
                if (ep.is_watched) hasW = true; else hasUw = true;
            });
        });
        return hasW && hasUw;
    });
    const notStarted = shows.filter(item => {
        if (item.user_status !== 'Planned') return false;
        return !item.seasons?.some(s => s.number !== 0 && s.episodes?.some(e => e.is_watched && !e.is_special));
    });

    const hideUpToDate = getSetting('hideUpToDateFromContinue');
    const airing    = inProgress.filter(s => {
        if (s.user_status === 'Paused') return false;
        if (!isCurrentlyAiring(s)) return false;
        // Issue 2: If hiding up-to-date, only show if there's something to watch
        if (hideUpToDate && !getNextEpisodeExcludingSpecials(s)) return false;
        return true;
    });
    const continueW = inProgress.filter(s => !isCurrentlyAiring(s) && s.user_status !== 'Paused' && new Date(getLastWatchedDate(s)) >= sixtyAgo);
    const stale     = inProgress.filter(s => !isCurrentlyAiring(s) && s.user_status !== 'Paused' && new Date(getLastWatchedDate(s)) < sixtyAgo);
    const paused    = inProgress.filter(s => s.user_status === 'Paused');

    airing.sort((a, b) => (getMostRecentAirDate(b) || 0) - (getMostRecentAirDate(a) || 0));
    continueW.sort((a, b) => new Date(getLastWatchedDate(b)) - new Date(getLastWatchedDate(a)));
    rewatching.sort((a, b) => new Date(getLastWatchedDate(b)) - new Date(getLastWatchedDate(a)));
    stale.sort((a, b) => new Date(getLastWatchedDate(b)) - new Date(getLastWatchedDate(a)));
    notStarted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    paused.sort((a, b) => new Date(getLastWatchedDate(b)) - new Date(getLastWatchedDate(a)));

    const sectionDefs = [
        { id: `${sectionType}-sec-airing`,     icon: '📡', label: 'Airing',    count: airing.length },
        { id: `${sectionType}-sec-continue`,   icon: '▶',  label: 'Continue',  count: continueW.length },
        { id: `${sectionType}-sec-rewatch`,    icon: '↺',  label: 'Rewatch',   count: rewatching.length },
        { id: `${sectionType}-sec-stale`,      icon: '💤', label: 'Stale',     count: stale.length },
        { id: `${sectionType}-sec-notstarted`, icon: '📋', label: 'New',       count: notStarted.length },
        { id: `${sectionType}-sec-paused`,     icon: '⏸', label: 'Paused',    count: paused.length }
    ];
    renderJumpPills(sectionType, sectionDefs);

    let html = '';
    if (airing.length)    html += `<div class="continue-section-label" id="${sectionType}-sec-airing">📡 Currently Airing</div>${airing.map(s => createContinueCard(s)).join('')}`;
    if (continueW.length) html += `<div class="continue-section-label" id="${sectionType}-sec-continue">▶ Continue Watching</div>${continueW.map(s => createContinueCard(s)).join('')}`;
    if (rewatching.length)html += `<div class="continue-section-label" id="${sectionType}-sec-rewatch">↺ Rewatching</div>${rewatching.map(s => createContinueCard(s, false, true)).join('')}`;
    if (stale.length)     html += `<div class="continue-section-label" id="${sectionType}-sec-stale">💤 Haven't Watched in a While</div>${stale.map(s => createContinueCard(s)).join('')}`;
    if (notStarted.length)html += `<div class="continue-section-label" id="${sectionType}-sec-notstarted">📋 Haven't Started</div>${notStarted.map(s => createContinueCard(s)).join('')}`;
    if (paused.length)    html += `<div class="continue-section-label" id="${sectionType}-sec-paused">⏸ Paused</div>${paused.map(s => createContinueCard(s, true)).join('')}`;
    if (!html) html = '<p class="empty-state">No shows in progress!</p>';
    container.innerHTML = html;
}

// A5: Fixed +N remaining — only counts episodes after the next one
function createContinueCard(show, forceFade = false, isRewatching = false) {
    const rwMode = isRewatching || show.user_status === 'Rewatching';
    const nextEp = rwMode ? getNextReWatchEpisode(show) : getNextEpisodeExcludingSpecials(show);
    const progress = rwMode ? getReWatchProgress(show) : getShowProgressExcludingSpecials(show);
    const remaining = rwMode ? null : getRemainingEpisodes(show); // now excludes the next ep itself
    const sd = show.docId.replace(/'/g, "\\'");
    const poster = safePoster(show.poster, 'thumb');
    const epCode = nextEp
        ? `S${String(nextEp.season).padStart(2, '0')}E${String(nextEp.number).padStart(2, '0')}`
        : rwMode ? 'Rewatch complete' : 'Up to date';
    const isPaused = show.user_status === 'Paused';
    const airing = isCurrentlyAiring(show);

    const progressBar = rwMode
        ? `<div class="continue-progress rewatch-bar"><div class="continue-progress-fill" style="width:${progress}%;"></div></div>`
        : `<div class="continue-progress"><div class="continue-progress-fill ${progress >= 100 ? 'uptodate' : 'watching'}" style="width:${progress}%;"></div></div>`;

    // A5: Only show +N if there are episodes AFTER the next one
    const remainingHTML = (remaining !== null && remaining > 0)
        ? `<span class="eps-remaining">· +${remaining}</span>`
        : '';

    return `<div class="continue-card ${(isPaused || forceFade) ? 'paused-card' : ''}">
        <img src="${poster}" alt="${show.title}" onerror="this.src='${PLACEHOLDER_THUMB}'" onclick="openDetails('${sd}','tv')">
        <div class="continue-info">
            <h3 onclick="openDetails('${sd}','tv')">${show.title}</h3>
            <div class="episode-code">${isPaused ? '⏸ ' : ''}${airing ? '🟢 ' : ''}${rwMode ? '↺ ' : ''}${epCode}${remainingHTML}</div>
            ${nextEp ? `<div class="episode-name">${nextEp.name}</div>` : ''}
            ${progressBar}
        </div>
        ${nextEp && !isPaused
            ? `<button class="quick-check-btn" onclick="quickMarkWatched('${sd}',${nextEp.season},${nextEp.number},${rwMode})">✓</button>`
            : '<div style="width:40px;"></div>'}
    </div>`;
}

// ===== HISTORY — G9: capped at HISTORY_CAP =====
function renderHistory(sectionType) {
    const container = document.getElementById(`${sectionType}-history-list`);
    if (!container) return;
    const shows = sectionType === 'anime' ? getAnime() : getTVShows();
    const allEps = getAllWatchedEpisodes(shows);
    if (!allEps.length) { container.innerHTML = '<p class="empty-state">No watch history yet.</p>'; return; }

    // Cap at HISTORY_CAP
    const capped = allEps.slice(0, HISTORY_CAP);
    const hasMore = allEps.length > HISTORY_CAP;

    const groups = {};
    capped.forEach(ep => {
        const label = getTimelineLabel(ep.watched_at);
        if (!groups[label]) groups[label] = [];
        groups[label].push(ep);
    });

    let html = '';
    Object.entries(groups).forEach(([label, eps]) => {
        html += `<div class="history-timeline-label">${label}</div>`;
        html += eps.map(ep => {
            const poster = safePoster(ep.poster, 'small');
            const sd = ep.docId.replace(/'/g, "\\'");
            const epCode = ep.is_special ? 'Special' : `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}`;
            return `<div class="history-card">
                <img src="${poster}" onerror="this.src='${PLACEHOLDER_SMALL}'" onclick="openDetails('${sd}','tv')">
                <div class="history-info">
                    <h4 onclick="openDetails('${sd}','tv')">${ep.show}</h4>
                    <div class="history-ep">${epCode} - ${ep.name || 'Episode'}</div>
                    <div class="history-date">${formatDate(ep.watched_at)}</div>
                    ${ep.note ? `<div class="history-note">📝 ${ep.note}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    });

    if (hasMore) {
        html += `<p style="text-align:center;color:var(--text3);font-size:12px;padding:12px;">Showing ${HISTORY_CAP} most recent episodes. Open a show's detail page to see full history.</p>`;
    }

    container.innerHTML = html;
}

// ===== MOVIES / LIBRARY / CARDS =====
function renderMoviesSection() {
    const movies = getMovies();
    const watchedEl = document.getElementById('movies-watched-list');
    const unwatchedEl = document.getElementById('movies-unwatched-list');
    const watched = movies.filter(m => m.is_watched);
    const unwatched = movies.filter(m => !m.is_watched);
    if (watchedEl) watchedEl.innerHTML = watched.length ? watched.map(m => createMediaCard(m)).join('') : '<p class="empty-state">No watched movies.</p>';
    if (unwatchedEl) unwatchedEl.innerHTML = unwatched.length ? unwatched.map(m => createMediaCard(m)).join('') : '<p class="empty-state">No unwatched movies.</p>';
}

function renderLibrary(section) {
    let items, gridId, sortId, filterId;
    if (section === 'anime') { items = getAnime(); gridId = 'anime-library-grid'; sortId = 'anime-sort'; filterId = 'anime-filter'; }
    else if (section === 'tv') { items = getTVShows(); gridId = 'tv-library-grid'; sortId = 'tv-sort'; filterId = 'tv-filter'; }
    else { items = getMovies(); gridId = 'movies-library-grid'; sortId = 'movies-sort'; filterId = 'movies-filter'; }

    const grid = document.getElementById(gridId);
    if (!grid) return;
    const sort = document.getElementById(sortId)?.value || 'title';
    const filter = document.getElementById(filterId)?.value || 'all';

    let filtered = [...items];
    if (filter === 'hidden') filtered = items.filter(i => i.hide_from_list);
    else if (filter === 'watched') filtered = items.filter(i => i.is_watched);
    else if (filter === 'unwatched') filtered = items.filter(i => !i.is_watched);
    else if (filter === 'favorites') filtered = items.filter(i => i.is_favorite);
    else if (filter !== 'all') filtered = items.filter(i => i.user_status === filter);

    if (sort === 'title') filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (sort === 'rating') filtered.sort((a, b) => (b.tmdb_rating || 0) - (a.tmdb_rating || 0));
    else if (sort === 'recent') filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sort === 'progress') filtered.sort((a, b) => getShowProgressExcludingSpecials(b) - getShowProgressExcludingSpecials(a));
    else if (sort === 'year') filtered.sort((a, b) => (b.year || 0) - (a.year || 0)); // G22: null years = 0, sort consistently

    grid.innerHTML = filtered.length ? filtered.map(item => createMediaCard(item)).join('') : '<p class="empty-state">No items found.</p>';
}

function createMediaCard(item) {
    const poster = safePoster(item.poster);
    const rating = item.tmdb_rating ? `⭐${item.tmdb_rating.toFixed(1)}` : '';
    const sd = item.docId.replace(/'/g, "\\'");
    let statusLine = '';
    if (item.type === 'tv' && item.user_status) {
        const prog = getShowProgressExcludingSpecials(item);
        const map = { 'Watching': 'watching', 'Up to Date': 'uptodate', 'Finished': 'finished', 'Dropped': 'dropped', 'Paused': 'paused', 'Rewatching': 'rewatching' };
        const cls = map[item.user_status] || '';
        if (cls) {
            const w = ['Watching', 'Dropped'].includes(item.user_status) ? `${prog}%` : '100%';
            statusLine = `<div class="status-line status-${cls}" style="width:${w};"></div>`;
        }
    }
    return `<div class="media-card" onclick="openDetails('${sd}','${item.type}')">
        ${item.hide_from_list ? '<div class="restricted-badge">R+</div>' : ''}
        ${item.is_favorite ? '<div class="favorite-badge">⭐</div>' : ''}
        <img src="${poster}" alt="${item.title}" onerror="this.src='${PLACEHOLDER_POSTER}'">${statusLine}
        <div class="info"><h3>${item.title || 'Unknown'}</h3><p class="year">${rating || item.year || ''}</p></div>
    </div>`;
}

// ===== PROFILE =====
function updateProfilePage() {
    const anime = getAnime(), tv = getTVShows(), movies = getMovies();
    function countEps(list) {
        let t = 0;
        list.forEach(s => s.seasons?.forEach(season => {
            if (season.number === 0) return;
            season.episodes?.forEach(ep => { if (ep.is_watched && !ep.is_special && !isPlaceholderEpisode(ep)) t++; });
        }));
        return t;
    }
    const animeEps = countEps(anime), tvEps = countEps(tv), moviesWatched = movies.filter(m => m.is_watched).length;
    const animeFinished = anime.filter(a => ['Finished', 'Up to Date'].includes(a.user_status)).length;
    const tvFinished = tv.filter(t => ['Finished', 'Up to Date'].includes(t.user_status)).length;
    const moviesRew = movies.reduce((s, m) => s + (m.rewatch_count || 0), 0);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const bar = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = `${pct}%`; };
    set('p-anime-watched', animeFinished); set('p-anime-total', anime.length); set('p-anime-eps', animeEps); set('p-anime-time', formatWatchTime(animeEps * 24));
    bar('p-anime-bar', anime.length ? (animeFinished / anime.length) * 100 : 0);
    set('p-tv-watched', tvFinished); set('p-tv-total', tv.length); set('p-tv-eps', tvEps); set('p-tv-time', formatWatchTime(tvEps * 45));
    bar('p-tv-bar', tv.length ? (tvFinished / tv.length) * 100 : 0);
    set('p-movies-watched', moviesWatched); set('p-movies-total', movies.length); set('p-movies-rewatched', moviesRew); set('p-movies-time', formatWatchTime(moviesWatched * 100));
    bar('p-movies-bar', movies.length ? (moviesWatched / movies.length) * 100 : 0);
    function recentPosters(list, elId) {
        const el = document.getElementById(elId); if (!el) return;
        const recent = [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6);
        el.innerHTML = recent.map(item => {
            const p = safePoster(item.poster, 'thumb');
            const sd = item.docId.replace(/'/g, "\\'");
            return `<img src="${p}" onerror="this.src='${PLACEHOLDER_THUMB}'" onclick="openDetails('${sd}','${item.type}')">`;
        }).join('');
    }
    recentPosters(anime, 'p-anime-posters');
    recentPosters(tv, 'p-tv-posters');
    recentPosters(movies, 'p-movies-posters');
}

// ===== SMART COLLECTIONS =====
const COLLECTIONS = [
    { id: 'completed-month', icon: '✅', label: 'Completed This Month', types: ['anime', 'tv'], allowedTabs: ['anime', 'tv'] },
    { id: 'highest-rated', icon: '⭐', label: 'Highest Rated', types: ['anime', 'tv', 'movie'], allowedTabs: ['anime', 'tv', 'movie'] },
    { id: 'recently-dropped', icon: '🚫', label: 'Recently Dropped', types: ['anime', 'tv'], allowedTabs: ['anime', 'tv'] },
    { id: 'recently-rewatched', icon: '↺', label: 'Recently Rewatched', types: ['anime', 'tv', 'movie'], allowedTabs: ['anime', 'tv', 'movie'] },
    { id: 'longest-running', icon: '📺', label: 'Longest Running', types: ['anime', 'tv'], allowedTabs: ['anime', 'tv'] },
    { id: 'indian', icon: '🇮🇳', label: 'Indian', types: ['tv', 'movie'], allowedTabs: ['tv', 'movie'] },
    { id: 'chinese', icon: '🇨🇳', label: 'Chinese', types: ['anime', 'tv', 'movie'], allowedTabs: ['anime', 'tv', 'movie'] },
    { id: 'korean', icon: '🇰🇷', label: 'Korean', types: ['tv', 'movie'], allowedTabs: ['tv', 'movie'] },
    { id: 'japanese', icon: '🇯🇵', label: 'Japanese', types: ['tv', 'movie'], allowedTabs: ['tv', 'movie'] }
];

function getCollectionItems(collectionId, typeFilter) {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    let pool = [];
    if (typeFilter === 'all' || typeFilter === 'anime') pool = [...pool, ...getAnime().map(i => ({ ...i, _collType: 'anime' }))];
    if (typeFilter === 'all' || typeFilter === 'tv') pool = [...pool, ...getTVShows().map(i => ({ ...i, _collType: 'tv' }))];
    if (typeFilter === 'all' || typeFilter === 'movie') pool = [...pool, ...getMovies().map(i => ({ ...i, _collType: 'movie' }))];
    const collDef = COLLECTIONS.find(c => c.id === collectionId);
    if (collDef) pool = pool.filter(i => collDef.types.includes(i._collType));
    pool = pool.filter(i => i.user_status !== 'Planned' && !(i.type === 'movie' && !i.is_watched));
    switch (collectionId) {
        case 'completed-month': return pool.filter(i => { if (i.type === 'movie') return i.is_watched && i.watched_at && new Date(i.watched_at) >= thisMonthStart; return ['Finished', 'Up to Date'].includes(i.user_status) && new Date(getLastWatchedDate(i)) >= thisMonthStart; });
        case 'highest-rated': return pool.filter(i => i.my_rating && i.my_rating >= 8).sort((a, b) => (b.my_rating || 0) - (a.my_rating || 0)).slice(0, 20);
        case 'recently-dropped': return pool.filter(i => i.user_status === 'Dropped' && new Date(getLastWatchedDate(i)) >= thirtyDaysAgo);
        case 'recently-rewatched': return pool.filter(i => { if (i.type === 'movie') return (i.rewatch_count || 0) > 0 && i.watched_at && new Date(i.watched_at) >= thirtyDaysAgo; return i.seasons?.some(s => s.episodes?.some(ep => ep.rewatch_history?.some(rw => new Date(rw) >= thirtyDaysAgo))); });
        case 'longest-running': return pool.filter(i => i.seasons && i.seasons.length > 1).sort((a, b) => getAiredEpisodesOnly(b.seasons).length - getAiredEpisodesOnly(a.seasons).length).slice(0, 20);
        case 'indian': return pool.filter(i => (i.origin_country || []).includes('IN'));
        case 'chinese': return pool.filter(i => (i.origin_country || []).includes('CN') || i.original_language === 'zh');
        case 'korean': return pool.filter(i => (i.origin_country || []).includes('KR') || i.original_language === 'ko');
        case 'japanese': return pool.filter(i => ((i.origin_country || []).includes('JP') || i.original_language === 'ja') && !i.is_anime);
        default: return [];
    }
}

function renderCollections() {
    const container = document.getElementById('collections-list');
    if (!container) return;
    let html = '';
    COLLECTIONS.forEach(coll => {
        const items = getCollectionItems(coll.id, currentCollectionFilter);
        if (!items.length) return;
        html += `<div class="collection-row">
            <div class="collection-row-header" onclick="openCollection('${coll.id}','${coll.icon} ${coll.label}')">
                <h4>${coll.icon} ${coll.label} <span style="color:var(--text3);font-size:12px;">(${items.length})</span></h4>
                <span>See All →</span>
            </div>
            <div class="collection-carousel">${items.slice(0, 10).map(item => {
                const p = safePoster(item.poster);
                const sd = item.docId.replace(/'/g, "\\'");
                return `<img src="${p}" alt="${item.title}" title="${item.title}" onerror="this.src='${PLACEHOLDER_POSTER}'" onclick="openDetails('${sd}','${item.type}')">`;
            }).join('')}</div>
        </div>`;
    });
    container.innerHTML = html || '<p class="empty-state">No collections yet.</p>';
}

function filterCollections(type) {
    currentCollectionFilter = type;
    document.querySelectorAll('.collection-filter-pill').forEach(p => {
        const txt = p.textContent.trim().toLowerCase();
        p.classList.toggle('active', type === 'all' ? txt === 'all' : txt.includes(type));
    });
    renderCollections();
}

function openCollection(id, label) {
    const body = document.getElementById('collection-modal-body');
    if (!body) return;
    const collDef = COLLECTIONS.find(c => c.id === id);
    const allowedTabs = collDef?.allowedTabs || ['anime', 'tv', 'movie'];
    body.innerHTML = `<h3>${label}</h3>
        <div class="collection-modal-tabs" id="coll-modal-tabs">
            <button class="collection-modal-tab-btn active" data-ctype="all" onclick="filterCollectionModal('${id}','all',this)">All</button>
            ${allowedTabs.includes('anime') ? `<button class="collection-modal-tab-btn" data-ctype="anime" onclick="filterCollectionModal('${id}','anime',this)">🎌 Anime</button>` : ''}
            ${allowedTabs.includes('tv') ? `<button class="collection-modal-tab-btn" data-ctype="tv" onclick="filterCollectionModal('${id}','tv',this)">📺 TV</button>` : ''}
            ${allowedTabs.includes('movie') ? `<button class="collection-modal-tab-btn" data-ctype="movie" onclick="filterCollectionModal('${id}','movie',this)">🎬 Movies</button>` : ''}
        </div>
        <div id="coll-modal-grid" class="media-grid" style="margin-top:12px;"></div>`;
    filterCollectionModal(id, 'all', null);
    openModal('collection-modal');
}

function filterCollectionModal(collId, typeFilter, btn) {
    if (btn) {
        document.querySelectorAll('#coll-modal-tabs .collection-modal-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    const items = getCollectionItems(collId, typeFilter);
    const grid = document.getElementById('coll-modal-grid');
    if (!grid) return;
    grid.innerHTML = items.length ? items.map(item => createMediaCard(item)).join('') : '<p class="empty-state">No items.</p>';
}

// ===== WATCH DATE PROMPT FOR SEASON MARK =====
async function promptSeasonWatchDate(episodes, isAnime) {
    const missingAirDates = episodes.filter(ep => !ep.air_date);
    const allHaveAirDates = missingAirDates.length === 0;
    const someHaveAirDates = episodes.some(ep => ep.air_date);

    return new Promise(resolve => {
        const dialog = document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent = 'When did you watch?';

        let warningHTML = '';
        if (!allHaveAirDates && someHaveAirDates) {
            warningHTML = `<p style="color:var(--orange);font-size:12px;margin-bottom:12px;">⚠️ ${missingAirDates.length} episode(s) have no air date — those will use incremental timing from the base date.</p>`;
        } else if (!someHaveAirDates) {
            warningHTML = `<p style="color:var(--orange);font-size:12px;margin-bottom:12px;">⚠️ No air dates available — only "Now" and "Custom" options apply.</p>`;
        }

        document.getElementById('confirm-message').innerHTML = warningHTML + 'Choose how to set watch dates for these episodes.';

        const yesBtn = document.getElementById('confirm-yes');
        const btnContainer = yesBtn.parentElement;

        btnContainer.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;width:100%;">
                ${someHaveAirDates ? `
                <button id="wd-airdate" class="confirm-btn" style="background:var(--accent);color:white;width:100%;">
                    📅 Air Dates<br><small style="font-weight:400;font-size:11px;">Each episode marked on the day it aired</small>
                </button>
                <button id="wd-days-after" class="confirm-btn" style="background:var(--accent2);color:white;width:100%;">
                    📅 + X Days After Air Date<br><small style="font-weight:400;font-size:11px;">You choose how many days after each air date</small>
                </button>` : ''}
                <button id="wd-now" class="confirm-btn" style="background:var(--green);color:white;width:100%;">
                    ⏱ Now (Incremental)<br><small style="font-weight:400;font-size:11px;">Last episode = now, earlier ones go back in time</small>
                </button>
                <button id="wd-custom" class="confirm-btn" style="background:var(--blue);color:white;width:100%;">
                    📆 Custom Date<br><small style="font-weight:400;font-size:11px;">You pick the date for the last episode</small>
                </button>
                <button id="wd-cancel" class="confirm-btn" style="background:var(--surface2);color:var(--text);border:2px solid var(--border);width:100%;">
                    ✕ Cancel
                </button>
            </div>`;

        openModal('confirm-dialog');

        const cleanup = () => {
            closeModal('confirm-dialog');
            btnContainer.innerHTML = `
                <button id="confirm-yes" class="confirm-btn confirm-yes">Yes</button>
                <button id="confirm-no" class="confirm-btn confirm-no">No</button>
                <button id="confirm-cancel" class="confirm-btn confirm-cancel-btn" style="display:none;">Cancel</button>`;
        };

        document.getElementById('wd-airdate')?.addEventListener('click', () => { cleanup(); resolve({ type: 'airdate' }); });
        document.getElementById('wd-days-after')?.addEventListener('click', async () => {
            cleanup();
            const days = prompt('How many days after each air date?\n(Enter 0 for same day as air date)', '0');
            if (days === null) { resolve({ type: 'cancel' }); return; }
            const d = parseInt(days);
            if (isNaN(d) || d < 0) { alert('Please enter a valid number (0 or more).'); resolve({ type: 'cancel' }); return; }
            resolve({ type: 'days-after', days: d });
        });
        document.getElementById('wd-now')?.addEventListener('click', () => { cleanup(); resolve({ type: 'now' }); });
        document.getElementById('wd-custom')?.addEventListener('click', async () => {
            cleanup();
            const dateStr = prompt('Enter the date for the LAST episode:\n(Format: YYYY-MM-DD, e.g. 2025-08-06)', new Date().toISOString().split('T')[0]);
            if (!dateStr) { resolve({ type: 'cancel' }); return; }
            const timeStr = prompt('Enter the time for the last episode:\n(24-hour format HH:MM, e.g. 23:00)', '23:00');
            if (!timeStr) { resolve({ type: 'cancel' }); return; }
            const baseDate = new Date(`${dateStr}T${timeStr}:00`);
            if (isNaN(baseDate.getTime())) { alert('Invalid date or time entered.'); resolve({ type: 'cancel' }); return; }
            resolve({ type: 'custom', baseDate: baseDate.toISOString() });
        });
        document.getElementById('wd-cancel')?.addEventListener('click', () => { cleanup(); resolve({ type: 'cancel' }); });
        dialog.querySelector('.confirm-close')?.addEventListener('click', () => { cleanup(); resolve({ type: 'cancel' }); });
    });
}

function applyWatchDateChoice(episodes, dateChoice, isAnime, isRewatch = false) {
    const count = episodes.length;

    if (dateChoice.type === 'airdate') {
        episodes.forEach(ep => {
            const newDate = ep.air_date
                ? new Date(ep.air_date + 'T23:00:00').toISOString()
                : new Date().toISOString();
            if (isRewatch) {
                ep._rewatch_date = newDate;
            } else {
                ep.watched_at = newDate;
            }
        });
        return;
    }
    if (dateChoice.type === 'days-after') {
        const daysAfter = dateChoice.days || 0;
        episodes.forEach(ep => {
            let newDate;
            if (ep.air_date) {
                const d = new Date(ep.air_date);
                d.setDate(d.getDate() + daysAfter);
                d.setHours(23, 0, 0, 0);
                newDate = d.toISOString();
            } else {
                newDate = new Date().toISOString();
            }
            if (isRewatch) {
                ep._rewatch_date = newDate;
            } else {
                ep.watched_at = newDate;
            }
        });
        return;
    }
    if (dateChoice.type === 'now' || dateChoice.type === 'custom') {
        const baseDate = dateChoice.type === 'custom' ? dateChoice.baseDate : null;
        const timestamps = generateIncrementalTimestamps(count, isAnime, baseDate ? new Date(baseDate) : new Date());
        episodes.forEach((ep, idx) => {
            if (isRewatch) {
                ep._rewatch_date = timestamps[idx];
            } else {
                ep.watched_at = timestamps[idx];
            }
        });
        return;
    }
}

// ===== QUICK MARK — G1: double-tap protection =====
async function quickMarkWatched(docId, seasonNum, episodeNum, isRewatchMode = false) {
    if (actionInProgress) return;
    actionInProgress = true;
    showSaveToast('Saving...');

    const item = myList.find(i => i.docId === docId);
    if (!item) { actionInProgress = false; hideSaveToast(); return; }
    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) { actionInProgress = false; hideSaveToast(); return; }
    const ep = season.episodes.find(e => e.number === episodeNum && !e.is_special);
    if (!ep) { actionInProgress = false; hideSaveToast(); return; }

    try {
        if (isRewatchMode) {
            ep.rewatch_count = (ep.rewatch_count || 0) + 1;
            if (!ep.rewatch_history) ep.rewatch_history = [];
            ep.rewatch_history.push(new Date().toISOString());
            ep.watched_at = new Date().toISOString();
        } else {
            const prev = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);
            if (prev.length > 0) {
                actionInProgress = false;
                const a = await showMarkPreviousConfirm(prev.length);
                actionInProgress = true;
                if (a === 'cancel') { actionInProgress = false; hideSaveToast(); return; }
                if (a === 'yes') {
                    const allEps = [];
                    prev.forEach(({ seasonNum: sN, episodeNum: eN }) => {
                        const s = item.seasons.find(s => s.number === sN);
                        const e = s?.episodes.find(e => e.number === eN && !e.is_special);
                        if (e) allEps.push(e);
                    });
                    allEps.push(ep);
                    const dateChoice = await promptSeasonWatchDate(allEps, item.is_anime);
                    if (dateChoice.type === 'cancel') { actionInProgress = false; hideSaveToast(); return; }
                    allEps.forEach(e => { e.is_watched = true; });
                    applyWatchDateChoice(allEps, dateChoice, item.is_anime);
                } else if (a === 'no') {
                    ep.is_watched = true;
                    ep.watched_at = new Date().toISOString();
                }
            } else {
                ep.is_watched = true;
                ep.watched_at = new Date().toISOString();
            }
        }

        await syncMarkToOtherStructure(item, getEpisodeSource());
        await saveDualSeasons(item);
        showSaveToast('Saved ✓');
        const section = item.is_anime ? 'anime' : 'tv';
        renderContinueWatching(section);
        renderHistory(section);
        updateNavBadges();
    } catch (e) {
        logError('Quick mark', e, { show: item.title, docId, seasonNum, episodeNum });
        showSaveToast('Save failed', true);
    }

    actionInProgress = false;
}

// ===== CONFIRM DIALOGS — B3: fixed double cancel buttons =====
function showConfirm(title, message, yesText = 'Yes', noText = 'No', showCancel = false) {
    return new Promise(resolve => {
        const dialog = document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn = dialog.querySelector('.confirm-close');

        yesBtn.textContent = yesText;
        noBtn.textContent = noText;
        cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
        yesBtn.className = 'confirm-btn confirm-yes'; yesBtn.style.cssText = '';
        noBtn.className = 'confirm-btn confirm-no'; noBtn.style.cssText = '';
        cancelBtn.className = 'confirm-btn confirm-cancel-btn'; cancelBtn.style.cssText = '';

        // B3: Hide close X — the No button serves as dismiss
        if (closeBtn) closeBtn.style.display = 'none';

        openModal('confirm-dialog');

        const cleanup = () => {
            closeModal('confirm-dialog');
            if (closeBtn) closeBtn.style.display = '';
            [yesBtn, noBtn, cancelBtn].forEach(b => { const c = b.cloneNode(true); b.replaceWith(c); });
            const closeBtnAfter = dialog.querySelector('.confirm-close');
            if (closeBtnAfter) { const c = closeBtnAfter.cloneNode(true); closeBtnAfter.replaceWith(c); }
        };

        document.getElementById('confirm-yes').addEventListener('click', () => { cleanup(); resolve('yes'); });
        document.getElementById('confirm-no').addEventListener('click', () => { cleanup(); resolve('no'); });
        document.getElementById('confirm-cancel').addEventListener('click', () => { cleanup(); resolve('cancel'); });
        dialog.querySelector('.confirm-close')?.addEventListener('click', () => { cleanup(); resolve('cancel'); });
    });
}

function showRewatchConfirm(episodeName) {
    return new Promise(resolve => {
        const dialog = document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent = 'Already Watched';
        document.getElementById('confirm-message').textContent = `"${episodeName}"`;
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn = dialog.querySelector('.confirm-close');
        const btnContainer = yesBtn.parentElement;

        // Build custom buttons
        btnContainer.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;width:100%;">
                <button id="rw-from-start" class="confirm-btn" style="background:var(--blue);color:white;width:100%;">
                    ↺ Rewatch from Start
                </button>
                <button id="rw-just-this" class="confirm-btn" style="background:var(--green);color:white;width:100%;">
                    ↺ Just This Episode
                </button>
                <button id="rw-unmark" class="confirm-btn" style="background:var(--red);color:white;width:100%;">
                    ✗ Unmark...
                </button>
                <button id="rw-dismiss" class="confirm-btn" style="background:var(--surface2);color:var(--text);border:2px solid var(--border);width:100%;">
                    Back
                </button>
            </div>`;

        if (closeBtn) closeBtn.style.display = 'none';
        openModal('confirm-dialog');

        const cleanup = () => {
            closeModal('confirm-dialog');
            if (closeBtn) closeBtn.style.display = '';
            btnContainer.innerHTML = `
                <button id="confirm-yes" class="confirm-btn confirm-yes">Yes</button>
                <button id="confirm-no" class="confirm-btn confirm-no">No</button>
                <button id="confirm-cancel" class="confirm-btn confirm-cancel-btn" style="display:none;">Cancel</button>`;
        };

        document.getElementById('rw-from-start')?.addEventListener('click', () => { cleanup(); resolve('from-start'); });
        document.getElementById('rw-just-this')?.addEventListener('click', () => { cleanup(); resolve('just-this'); });
        document.getElementById('rw-unmark')?.addEventListener('click', () => { cleanup(); resolve('unmark'); });
        document.getElementById('rw-dismiss')?.addEventListener('click', () => { cleanup(); resolve('cancel'); });
    });
}

async function showUnmarkOptionsConfirm(episodeName, hasRewatches) {
    return new Promise(resolve => {
        const dialog = document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent = 'Unmark Options';
        document.getElementById('confirm-message').textContent = `"${episodeName}"`;
        const yesBtn = document.getElementById('confirm-yes');
        const btnContainer = yesBtn.parentElement;
        const closeBtn = dialog.querySelector('.confirm-close');

        let buttonsHTML = `<div style="display:flex;flex-direction:column;gap:8px;width:100%;">`;

        if (hasRewatches) {
            buttonsHTML += `
                <button id="um-last-rewatch" class="confirm-btn" style="background:var(--orange);color:white;width:100%;">
                    Remove Last Rewatch Only
                </button>`;
        }

        buttonsHTML += `
            <button id="um-first-watch" class="confirm-btn" style="background:var(--blue);color:white;width:100%;">
                Remove First Watch Only
            </button>
            <button id="um-everything" class="confirm-btn" style="background:var(--red);color:white;width:100%;">
                Remove Everything
            </button>
            <button id="um-cancel" class="confirm-btn" style="background:var(--surface2);color:var(--text);border:2px solid var(--border);width:100%;">
                Back
            </button>
        </div>`;

        btnContainer.innerHTML = buttonsHTML;
        if (closeBtn) closeBtn.style.display = 'none';
        openModal('confirm-dialog');

        const cleanup = () => {
            closeModal('confirm-dialog');
            if (closeBtn) closeBtn.style.display = '';
            btnContainer.innerHTML = `
                <button id="confirm-yes" class="confirm-btn confirm-yes">Yes</button>
                <button id="confirm-no" class="confirm-btn confirm-no">No</button>
                <button id="confirm-cancel" class="confirm-btn confirm-cancel-btn" style="display:none;">Cancel</button>`;
        };

        document.getElementById('um-last-rewatch')?.addEventListener('click', () => { cleanup(); resolve('remove-last-rewatch'); });
        document.getElementById('um-first-watch')?.addEventListener('click', () => { cleanup(); resolve('remove-first-watch'); });
        document.getElementById('um-everything')?.addEventListener('click', () => { cleanup(); resolve('remove-everything'); });
        document.getElementById('um-cancel')?.addEventListener('click', () => { cleanup(); resolve('cancel'); });
    });
}

function showMarkPreviousConfirm(count) {
    return new Promise(resolve => {
        const dialog = document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent = 'Mark Previous?';
        document.getElementById('confirm-message').textContent = `${count} unwatched episode${count > 1 ? 's' : ''} before this.`;
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn = dialog.querySelector('.confirm-close');

        yesBtn.textContent = 'Yes, all';
        noBtn.textContent = 'Just this';
        cancelBtn.style.display = 'none';
        yesBtn.className = 'confirm-btn confirm-yes'; yesBtn.style.cssText = '';
        noBtn.className = 'confirm-btn'; noBtn.style.cssText = 'background:var(--blue);color:white;';
        if (closeBtn) closeBtn.style.display = 'none';

        openModal('confirm-dialog');

        const cleanup = () => {
            closeModal('confirm-dialog');
            noBtn.style.cssText = '';
            if (closeBtn) closeBtn.style.display = '';
            [yesBtn, noBtn, cancelBtn].forEach(b => { const c = b.cloneNode(true); b.replaceWith(c); });
            const closeBtnAfter = dialog.querySelector('.confirm-close');
            if (closeBtnAfter) { const c = closeBtnAfter.cloneNode(true); closeBtnAfter.replaceWith(c); }
        };

        document.getElementById('confirm-yes').addEventListener('click', () => { cleanup(); resolve('yes'); });
        document.getElementById('confirm-no').addEventListener('click', () => { cleanup(); resolve('no'); });
    });
}

function showRewatchSeasonConfirm() {
    return new Promise(resolve => {
        const dialog = document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent = 'All Watched';
        document.getElementById('confirm-message').textContent = 'This season has been rewatched. What to do?';
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn = dialog.querySelector('.confirm-close');

        yesBtn.textContent = '↺ Rewatch Again';
        noBtn.textContent = '✗ Unmark All';
        cancelBtn.textContent = '↺ Undo Last Rewatch';
        cancelBtn.style.display = 'inline-block';
        yesBtn.className = 'confirm-btn'; yesBtn.style.cssText = 'background:var(--blue);color:white;';
        noBtn.className = 'confirm-btn'; noBtn.style.cssText = 'background:var(--red);color:white;';
        cancelBtn.className = 'confirm-btn'; cancelBtn.style.cssText = 'background:var(--orange);color:white;';
        if (closeBtn) closeBtn.style.display = 'none';

        openModal('confirm-dialog');

        const cleanup = () => {
            closeModal('confirm-dialog');
            yesBtn.style.cssText = ''; noBtn.style.cssText = ''; cancelBtn.style.cssText = '';
            if (closeBtn) closeBtn.style.display = '';
            [yesBtn, noBtn, cancelBtn].forEach(b => { const c = b.cloneNode(true); b.replaceWith(c); });
            const closeBtnAfter = dialog.querySelector('.confirm-close');
            if (closeBtnAfter) { const c = closeBtnAfter.cloneNode(true); closeBtnAfter.replaceWith(c); }
        };

        document.getElementById('confirm-yes').addEventListener('click', () => { cleanup(); resolve('rewatch'); });
        document.getElementById('confirm-no').addEventListener('click', () => { cleanup(); resolve('unmark'); });
        document.getElementById('confirm-cancel').addEventListener('click', () => { cleanup(); resolve('undo-rewatch'); });
    });
}

// ===== PREVIEW FROM TVMAZE =====
async function openPreviewFromTVMaze(tvmazeId, tvdbId, tmdbId, title, year, poster) {
    hideSearchOverlay();
    const body = document.getElementById('preview-modal-body');
    body.innerHTML = '<p class="empty-state">Loading...</p>';
    openModal('preview-modal');

    // A3: Match by TVMaze ID first
    const libraryItem = myList.find(i =>
        i.tvmaze_id === tvmazeId ||
        (tmdbId && i.tmdb_id === tmdbId)
    );
    if (libraryItem) { closeModal('preview-modal'); openDetails(libraryItem.docId, libraryItem.type); return; }

    try {
        const tvShow = await tvmazeFetch(`${TVMAZE_BASE}/shows/${tvmazeId}?embed[]=cast`);
        if (!tvShow) { body.innerHTML = '<p class="empty-state">Show not found.</p>'; return; }
        const mapped = tvmazeMapShowData(tvShow);
        const synopsis = mapped.synopsis || 'No synopsis available.';
        const genres = mapped.genres || [];
        const networks = mapped.networks || [];
        const cast = tvShow._embedded?.cast ? tvmazeMapCast(tvShow._embedded.cast).slice(0, 12) : [];
        const status = mapped.status || 'Unknown';
        const statusColor = { 'Running': '#4CAF50', 'To Be Determined': '#FF9800', 'Ended': '#666', 'In Development': '#2196F3' }[status] || '#666';

        const showIdBadges = getSetting('showIdBadges');
        const idBadgeHTML = showIdBadges
            ? `<div style="font-size:10px;color:var(--text3);margin-top:4px;">TVMaze: ${tvmazeId}${tmdbId ? ` · TMDB: ${tmdbId}` : ''}${tvdbId ? ` · TVDB: ${tvdbId}` : ''}</div>`
            : '';

        let similarHTML = '';
        const actualTmdbId = tmdbId || mapped.tmdb_id_from_maze;
        if (actualTmdbId) {
            try {
                const recData = await tmdbFetch(`${TMDB_BASE_URL}/tv/${actualTmdbId}/recommendations?api_key=${TMDB_API_KEY}`);
                const allItems = [...getAnime(), ...getTVShows(), ...getMovies()];
                const profile = buildTasteProfile(allItems);
                const simScored = (recData.results || []).slice(0, 10)
                    .map(s => ({ ...s, matchScore: calculateMatchScore(s, profile) }))
                    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
                similarHTML = buildSimilarSection(simScored, 'tv');
            } catch (e) {}
        }

        const st = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const sp = (poster || '').replace(/'/g, "\\'");

        body.innerHTML = `<div class="detail-header">
            <img src="${poster || PLACEHOLDER_POSTER}" onerror="this.src='${PLACEHOLDER_POSTER}'">
            <div class="detail-header-info">
                <h2><span>${title}${year ? ` (${year})` : ''}</span></h2>
                <span class="status-badge" style="background:${statusColor};">${status}</span>
                <span class="source-badge">TVMaze</span>
                ${idBadgeHTML}
                <div class="genre-tags">${genres.map(g => `<span class="genre-tag">${g}</span>`).join('')}</div>
                <p style="color:var(--text2);font-size:13px;">${networks.join(', ') || '—'}</p>
                <div style="margin-top:12px;">
                    <button onclick="addToListFromTVMaze(${tvmazeId},${tvdbId || 'null'},${actualTmdbId || 'null'},'${st}','${year}','${sp}')" class="watch-btn mark-watched" style="padding:10px 20px;">+ Add to Library</button>
                </div>
            </div>
        </div>
        <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
        ${buildCastSectionFromTVMaze(cast)}${similarHTML}`;
    } catch (e) {
        body.innerHTML = '<p class="empty-state">Failed to load.</p>';
        logError('TVMaze preview', e, { show: title });
    }
}

function buildCastSectionFromTVMaze(cast) {
    if (!cast.length) return '';
    return `<div class="cast-section"><h3>🎭 Cast</h3><div class="cast-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">${cast.map(p => `<div class="cast-card"><img src="${p.profile_url || PLACEHOLDER_AVATAR}" alt="${p.name}" onerror="this.src='${PLACEHOLDER_AVATAR}'"><div class="cast-name">${p.name}</div><div class="cast-character">${p.character || ''}</div></div>`).join('')}</div></div>`;
}

// ===== ADD TO LIST FROM TVMAZE — G14: use TVMaze ID in docId =====
async function addToListFromTVMaze(tvmazeId, tvdbId, tmdbId, title, year, poster) {
    try {
        let actualTmdbId = tmdbId;

        // Try to resolve TMDB ID if not provided
        if (!actualTmdbId || actualTmdbId === 'null') {
            try {
                const tvShow = await tvmazeFetch(`${TVMAZE_BASE}/shows/${tvmazeId}`);
                actualTmdbId = tvShow?.externals?.themoviedb || null;
            } catch (e) {}
        }
        if (!actualTmdbId) {
            try {
                const cleanTitle = title.replace(/\s*\(\d{4}\)\s*$/, '');
                const d = await tmdbFetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`);
                if (d.results?.length) actualTmdbId = d.results[0].id;
            } catch (e) {}
        }

        if (actualTmdbId) {
            // Has TMDB ID — use standard addToList but also save TVMaze/TVDB IDs
            await addToList(actualTmdbId, 'tv', title, year, poster, {
                tvmaze_id: tvmazeId,
                tvdb_id: tvdbId && tvdbId !== 'null' ? parseInt(tvdbId) : null
            });
        } else {
            // TVMaze-only — G14: docId uses TVMaze ID
            const docId = `tv_tmaze_${tvmazeId}`;
            const tvShow = await tvmazeFetch(`${TVMAZE_BASE}/shows/${tvmazeId}?embed=episodes`);
            const mapped = tvmazeMapShowData(tvShow);
            const episodes = tvShow?._embedded?.episodes || [];
            const grouped = tvmazeGroupEpisodes(episodes);
            const seasons = Object.entries(grouped).map(([sNum, eps]) => ({
                number: parseInt(sNum),
                is_specials: parseInt(sNum) === 0,
                episodes: eps.map(ep => ({
                    number: ep.number, name: ep.name, air_date: ep.air_date,
                    is_watched: false, watched_at: null, rewatch_count: 0,
                    rewatch_history: [], is_special: ep.is_special || parseInt(sNum) === 0,
                    my_rating: null, note: null, tvmaze_ep_id: ep.tvmaze_ep_id || null
                }))
            }));

            await setDoc(doc(db, 'series', docId), {
                tmdb_id: null,
                tvmaze_id: tvmazeId,
                tvdb_id: tvdbId && tvdbId !== 'null' ? parseInt(tvdbId) : null,
                title: mapped.title || title,
                year: mapped.year || (year ? parseInt(year) : null),
                poster: mapped.poster || poster || PLACEHOLDER_POSTER,
                tmdb_rating: null, my_rating: null,
                user_status: 'Planned', tmdb_status: mapped.status || 'Unknown',
                is_anime: false, is_favorite: false, hide_from_list: false,
                force_tmdb_source: false,
                genres: mapped.genres || [],
                original_language: mapped.original_language,
                networks: mapped.networks || [],
                origin_country: [], popularity: mapped.popularity,
                seasons, seasons_tvmaze: seasons, seasons_tmdb: null, episode_map: [],
                air_time_data: mapped.air_time ? {
                    time: mapped.air_time, timezone: mapped.air_timezone,
                    day: mapped.air_days?.[0] || null, source: 'tvmaze',
                    fetched_at: new Date().toISOString()
                } : null,
                id_confidence: 'verified',
                last_synced: new Date().toISOString(),
                last_status_check: new Date().toISOString(),
                created_at: new Date().toISOString()
            });
            await loadMyList();
            alert(`Added "${title}" (TVMaze only — no TMDB data available)`);
        }

        closeModal('preview-modal');
        // A3: Find by TVMaze ID
        const item = myList.find(i => i.tvmaze_id === tvmazeId || i.tmdb_id === actualTmdbId);
        if (item) openDetails(item.docId, 'tv');
    } catch (e) {
        logError('Add from TVMaze', e, { show: title });
        alert('Error adding show.');
    }
}

// ===== PREVIEW (TMDB) =====
async function openPreview(tmdbId, type, title, year, poster) {
    hideSearchOverlay();
    const body = document.getElementById('preview-modal-body');
    body.innerHTML = '<p class="empty-state">Loading...</p>';
    openModal('preview-modal');

    // A3: Match by tmdb_id
    const libraryItem = myList.find(i => i.tmdb_id === tmdbId);
    if (libraryItem) { closeModal('preview-modal'); openDetails(libraryItem.docId, libraryItem.type); return; }

    const safeTitle = (title || '').replace(/'/g, "\\'");
    let details, credits, similar, providers;
    try {
        const ep = type === 'movie' ? 'movie' : 'tv';
        [details, credits, similar, providers] = await Promise.all([
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}/credits?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}/recommendations?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`)
        ]);
    } catch (e) { logError('Preview fetch', e, { show: title }); }

    const synopsis = details?.overview || 'No synopsis.';
    const rating = details?.vote_average;
    const genres = details?.genres || [];
    const cast = credits?.cast?.slice(0, 12) || [];
    const similarItems = similar?.results?.slice(0, 10) || [];
    const providers_ = providers?.results?.US?.flatrate || [];
    const networks = details?.networks || [];
    const tmdbStatus = details?.status || '';
    const statusColor = { 'Returning Series': '#4CAF50', 'In Production': '#2196F3', 'Ended': '#666', 'Canceled': '#f44336', 'Released': '#4CAF50' }[tmdbStatus] || '#666';
    const runtime = type === 'movie' && details?.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : null;

    const allItems = [...getAnime(), ...getTVShows(), ...getMovies()];
    const profile = buildTasteProfile(allItems);
    const simScored = similarItems
        .map(s => ({ ...s, matchScore: calculateMatchScore(s, profile) }))
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    const showIdBadges = getSetting('showIdBadges');
    const idBadgeHTML = showIdBadges
        ? `<div style="font-size:10px;color:var(--text3);margin-top:4px;">TMDB: ${tmdbId}</div>`
        : '';

    const safePosterUrl = poster.replace(/'/g, "\\'");
    let contentHTML = '';
    if (type === 'tv' && details?.number_of_seasons) {
        contentHTML = `<div class="detail-tabs" style="margin-top:20px;">
            <button class="detail-tab-btn active" onclick="switchDetailTab('preview-info-tab')">Info</button>
            <button class="detail-tab-btn" onclick="switchDetailTab('preview-episodes-tab')">Episodes</button>
        </div>
        <div class="detail-tab-content active" id="preview-info-tab">
            <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
            ${buildCastSection(cast)}${buildNetworksSection(providers_, networks)}${buildSimilarSection(simScored, type)}
        </div>
        <div class="detail-tab-content" id="preview-episodes-tab">
            <p style="color:var(--text2);text-align:center;padding:20px;"><strong>Add to Library</strong> to track episodes.</p>
        </div>`;
    } else {
        contentHTML = `<div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>${buildCastSection(cast)}${buildNetworksSection(providers_, networks)}${buildSimilarSection(simScored, type)}`;
    }

    body.innerHTML = `<div class="detail-header">
        <img src="${poster}" onerror="this.src='${PLACEHOLDER_POSTER}'">
        <div class="detail-header-info">
            <h2><span>${title}${year ? ` (${year})` : ''}</span></h2>
            ${tmdbStatus ? `<span class="status-badge" style="background:${statusColor};">${tmdbStatus}</span>` : ''}
            <span class="source-badge">TMDB</span>
            ${idBadgeHTML}
            ${rating ? `<p style="margin:5px 0;color:var(--text2);">⭐ <strong>${rating.toFixed(1)}</strong>/10</p>` : ''}
            ${runtime ? `<p style="color:var(--text2);font-size:13px;">⏱ ${runtime}</p>` : ''}
            <div class="genre-tags">${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}</div>
            <div style="margin-top:12px;">
                <button onclick="handlePreviewAdd(${tmdbId},'${type}','${safeTitle}','${year}','${safePosterUrl}')" class="watch-btn mark-watched" style="padding:10px 20px;">+ Add to Library</button>
            </div>
        </div>
    </div>${contentHTML}`;
}

async function handlePreviewAdd(tmdbId, type, title, year, poster) {
    await addToList(tmdbId, type, title, year, poster);
    closeModal('preview-modal');
    const item = myList.find(i => i.tmdb_id === tmdbId);
    if (item) openDetails(item.docId, item.type);
}

// ===== DETAIL PAGE =====
async function openDetails(docId, type, forceTab) {
    if (actionInProgress) return; // G1
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
    return `<div style="margin:10px 0;">
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">My Rating</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button onclick="setMyRating('${safeDocId}','${col}',${n})" style="width:28px;height:28px;border-radius:6px;border:2px solid ${n <= current ? 'var(--accent)' : 'var(--border)'};background:${n <= current ? 'var(--accent)' : 'transparent'};color:${n <= current ? 'white' : 'var(--text2)'};font-size:11px;font-weight:700;cursor:pointer;transition:all 0.15s;padding:0;">${n}</button>`).join('')}
            ${current ? `<button onclick="setMyRating('${safeDocId}','${col}',0)" style="width:28px;height:28px;border-radius:6px;border:2px solid var(--border);background:transparent;color:var(--text3);font-size:11px;cursor:pointer;padding:0;" title="Clear">✕</button>` : ''}
        </div>
        ${current ? `<div style="font-size:11px;color:var(--accent);margin-top:4px;">Your rating: ${current}/10</div>` : ''}
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
            if (item.type === 'movie') await openMovieDetails(item, body, docId.replace(/'/g, "\\'"));
            else await openTVDetails(item, body, docId.replace(/'/g, "\\'"));
        }
    } catch (e) { logError('Set rating', e, { show: item.title, docId }); }
}

// ===== MOVIE DETAIL =====
async function openMovieDetails(item, body, safeDocId) {
    let details, credits, similar, providers;
    if (item.tmdb_id) {
        try {
            [details, credits, similar, providers] = await Promise.all([
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}/credits?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}/recommendations?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}/watch/providers?api_key=${TMDB_API_KEY}`)
            ]);
        } catch (e) { logError('Movie detail', e, { show: item.title, docId: item.docId }); }
    }

    const synopsis = details?.overview || 'No synopsis.';
    const rating = details?.vote_average || item.tmdb_rating;
    const genres = details?.genres || [];
    const runtime = details?.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : 'N/A';
    const cast = credits?.cast?.slice(0, 15) || [];
    const director = credits?.crew?.find(c => c.job === 'Director');
    const similarItems = similar?.results?.slice(0, 10) || [];
    const providerList = providers?.results?.US?.flatrate || [];
    const allItems = [...getAnime(), ...getTVShows(), ...getMovies()];
    const profile = buildTasteProfile(allItems);
    const simScored = similarItems
        .map(s => ({ ...s, matchScore: calculateMatchScore(s, profile) }))
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    body.innerHTML = `<div class="detail-header">
        <img src="${safePoster(item.poster)}" onerror="this.src='${PLACEHOLDER_POSTER}'">
        <div class="detail-header-info">
            <h2><span>${item.title}${item.year ? ` (${item.year})` : ''}</span>
                <div class="show-options"><button class="options-btn" onclick="toggleOptionsMenu('m-opts')">⋯</button>
                <div class="options-menu" id="m-opts">
                    <button onclick="toggleFavorite('${safeDocId}','movie')">${item.is_favorite ? '⭐ Remove Fav' : '☆ Favorite'}</button>
                    <button onclick="toggleHideFromList('${safeDocId}','movie')">${item.hide_from_list ? '👁 Show in List' : '👁 Hide from List'}</button>
                    <button onclick="openFixShowModal('${safeDocId}')">🔗 Fix Show Data</button>
                    <button class="danger" onclick="removeFromList('${safeDocId}','movie')">🗑 Remove</button>
                </div></div>
            </h2>
            ${item.hide_from_list ? '<span class="restricted-inline-badge">R+</span>' : ''}
            ${rating ? `<p style="margin:5px 0;color:var(--text2);">⭐ <strong>${rating.toFixed(1)}</strong>/10 <small style="color:var(--text3);">TMDB</small></p>` : ''}
            ${director ? `<p style="color:var(--text2);font-size:13px;">🎬 ${director.name}</p>` : ''}
            <p style="color:var(--text2);font-size:13px;">⏱ ${runtime}</p>
            <div class="genre-tags">${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}</div>
            ${buildMyRatingWidget(item, safeDocId)}
            <div style="margin-top:8px;">
                <button onclick="toggleWatched('${safeDocId}','movie')" class="watch-btn ${item.is_watched ? 'watched' : 'mark-watched'}">${item.is_watched ? '✓ Watched' : '○ Mark Watched'}</button>
            </div>
            ${item.watched_at ? `<p style="margin-top:6px;color:var(--text3);font-size:12px;">Watched: ${formatDate(item.watched_at)}</p>` : ''}
            ${item.rewatch_count > 0 ? `<p style="color:var(--text3);font-size:12px;">↺ ${item.rewatch_count}x rewatched</p>` : ''}
        </div>
    </div>
    <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
    ${buildCastSection(cast)}${buildNetworksSection(providerList, details?.production_companies || [])}${buildSimilarSection(simScored, 'movie')}`;

    const detailPoster = details?.poster_path ? TMDB_IMG_BASE + details.poster_path : null;
    if (detailPoster && detailPoster !== item.poster) {
        item.poster = detailPoster;
        updateDoc(doc(db, 'movies', item.docId), { poster: detailPoster }).catch(() => {});
    }
}

// ===== TV DETAIL =====
async function openTVDetails(item, body, safeDocId) {
    const source = getEpisodeSource();
    const useTVMaze = source === 'tvmaze' && !item.force_tmdb_source;
    let tvShowData = null, details, credits, providers;

    if (item.tmdb_id) {
        try {
            [details, credits, providers] = await Promise.all([
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/credits?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/watch/providers?api_key=${TMDB_API_KEY}`)
            ]);
        } catch (e) { logError('TV detail TMDB', e, { show: item.title, docId: item.docId }); }
    }

    // A3: Use TVMaze ID to fetch TVMaze data — not title
    if (useTVMaze && item.tvmaze_id) {
        try {
            tvShowData = await tvmazeFetch(`${TVMAZE_BASE}/shows/${item.tvmaze_id}?embed[]=cast`);
        } catch (e) { logError('TV detail TVMaze', e, { show: item.title, docId: item.docId }); }
    } else if (useTVMaze && !item.tvmaze_id && item.tvdb_id) {
        // Try TVDB lookup as fallback
        try {
            const found = await tvmazeLookupByTVDB(item.tvdb_id);
            if (found) {
                tvShowData = await tvmazeFetch(`${TVMAZE_BASE}/shows/${found.id}?embed[]=cast`);
                // Save the found TVMaze ID
                if (found.id) {
                    item.tvmaze_id = found.id;
                    updateDoc(doc(db, 'series', item.docId), { tvmaze_id: found.id }).catch(() => {});
                }
            }
        } catch (e) { logError('TV detail TVMaze TVDB lookup', e, { show: item.title }); }
    }

    let synopsis, genres, networks, cast, tmdbStatus, poster;
    if (useTVMaze && tvShowData) {
        const mapped = tvmazeMapShowData(tvShowData);
        synopsis = mapped.synopsis || details?.overview || 'No synopsis.';
        genres = mapped.genres || (details?.genres || []).map(g => g.name);
        networks = mapped.networks || (details?.networks || []).map(n => n.name);
        cast = tvmazeMapCast(tvShowData._embedded?.cast || []).slice(0, 15);
        tmdbStatus = mapped.status || details?.status || item.tmdb_status || 'Unknown';
        poster = mapped.poster || item.poster;
    } else {
        synopsis = details?.overview || 'No synopsis.';
        genres = (details?.genres || []).map(g => g.name);
        networks = (details?.networks || []).map(n => n.name);
        cast = (credits?.cast || []).slice(0, 15);
        tmdbStatus = details?.status || item.tmdb_status || 'Unknown';
        poster = item.poster;
    }

    const providerList = providers?.results?.US?.flatrate || [];
    const rating = details?.vote_average || item.tmdb_rating;
    const statusColor = { 'Returning Series': '#4CAF50', 'Running': '#4CAF50', 'In Production': '#2196F3', 'Ended': '#666', 'Canceled': '#f44336', 'To Be Determined': '#FF9800' }[tmdbStatus] || '#666';

    let simScored = [];
    if (item.tmdb_id) {
        try {
            const recData = await tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/recommendations?api_key=${TMDB_API_KEY}`);
            const allItems = [...getAnime(), ...getTVShows(), ...getMovies()];
            const profile = buildTasteProfile(allItems);
            simScored = (recData.results || []).slice(0, 10)
                .map(s => ({ ...s, matchScore: calculateMatchScore(s, profile) }))
                .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        } catch (e) { logError('TV recommendations', e, { show: item.title }); }
    }

    const airedEps = getAiredEpisodesOnly(item.seasons);
    const watched = airedEps.filter(e => e.is_watched).length;
    const total = airedEps.length;
    const progress = total > 0 ? (watched / total) * 100 : 0;

    let epRatings = [];
    if (item.tmdb_id) epRatings = await fetchEpisodeRatings(item.tmdb_id, item.seasons || []);

    const regularSeasons = (item.seasons || []).filter(s => s.number !== 0);
    const season0 = (item.seasons || []).find(s => s.number === 0);
    const inlineSpecials = [];
    regularSeasons.forEach(s => {
        s.episodes?.forEach(ep => {
            if (ep.is_insignificant_special) inlineSpecials.push({ ...ep, fromSeason: s.number });
        });
    });
    const allSpecials = [...(season0?.episodes || []), ...inlineSpecials];
    const seasonsHTML = regularSeasons.map(s => buildSeasonHTML(s, safeDocId, item.docId, item)).join('');
    const specialsHTML = allSpecials.length ? `<div class="season specials">
        <div class="season-header" onclick="toggleSeason(this,'${item.docId}',0)">
            <span>Specials (${allSpecials.filter(e => e.is_watched).length}/${allSpecials.length})</span>
            <span class="toggle-icon ${expandedSeasons.has(seasonKey(item.docId, 0)) ? 'open' : ''}">▼</span>
        </div>
        <div class="season-body ${expandedSeasons.has(seasonKey(item.docId, 0)) ? 'open' : ''}">
            ${allSpecials.map(ep => buildSpecialEpisodeHTML(ep, safeDocId, item.docId)).join('')}
        </div>
    </div>` : '';

    const infoActive = activeDetailTab === 'info-tab';
    const isRewatching = item.user_status === 'Rewatching';
    const castHTML = (useTVMaze && tvShowData) ? buildCastSectionFromTVMaze(cast) : buildCastSection(cast);
    const genreTagsHTML = genres.map(g => `<span class="genre-tag">${typeof g === 'object' ? g.name : g}</span>`).join('');
    const sourceLabel = useTVMaze && tvShowData ? 'TVMaze' : 'TMDB';

    const showIdBadges = getSetting('showIdBadges');
    const idBadgeHTML = showIdBadges
        ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">TVMaze: ${item.tvmaze_id || '—'} · TMDB: ${item.tmdb_id || '—'} · TVDB: ${item.tvdb_id || '—'}</div>`
        : '';

    body.innerHTML = `<div class="detail-header">
        <img src="${safePoster(poster)}" onerror="this.src='${PLACEHOLDER_POSTER}'">
        <div class="detail-header-info">
            <h2><span>${item.title}</span>
                <div class="show-options"><button class="options-btn" onclick="toggleOptionsMenu('t-opts')">⋯</button>
                <div class="options-menu" id="t-opts">
                    <button onclick="toggleFavorite('${safeDocId}','tv')">${item.is_favorite ? '⭐ Remove Fav' : '☆ Favorite'}</button>
                    <button onclick="setUserStatus('${safeDocId}','Watching')">▶ Watching</button>
                    <button onclick="setUserStatus('${safeDocId}','Up to Date')">✅ Up to Date</button>
                    <button onclick="setUserStatus('${safeDocId}','Rewatching')">↺ Rewatching</button>
                    <button onclick="setUserStatus('${safeDocId}','Paused')">⏸ Paused</button>
                    <button onclick="setUserStatus('${safeDocId}','Dropped')">🚫 Dropped</button>
                    <button onclick="setUserStatus('${safeDocId}','Finished')">🏁 Finished</button>
                    <button onclick="setUserStatus('${safeDocId}','Planned')">📋 Planned</button>
                    <button onclick="toggleAnimeStatus('${safeDocId}')">${item.is_anime ? '🎌 Remove Anime Tag' : '🎌 Mark as Anime'}</button>
                    <button onclick="toggleHideFromList('${safeDocId}','tv')">${item.hide_from_list ? '👁 Show in List' : '👁 Hide from List'}</button>
                    <button onclick="openTagSpecialsModal('${safeDocId}')">🎭 Tag as Special</button>
                    <button onclick="openEditDatesModal('${safeDocId}')">✏️ Edit Watch Dates</button>
                    <button onclick="openFixShowModal('${safeDocId}')">🔗 Fix Show Data</button>
                    <button onclick="openIDManager('${safeDocId}')">🔑 Edit IDs</button>
                    <button class="danger" onclick="removeFromList('${safeDocId}','tv')">🗑 Remove</button>
                </div></div>
            </h2>
            <div>
                <span class="status-badge" style="background:${statusColor};">${tmdbStatus}</span>
                ${item.is_anime ? '<span class="status-badge anime-badge">🎌 Anime</span>' : ''}
                ${isRewatching ? '<span class="status-badge" style="background:#9C27B0;">↺ Rewatching</span>' : ''}
                ${item.hide_from_list ? '<span class="restricted-inline-badge">R+</span>' : ''}
                ${item.is_favorite ? '<span class="status-badge" style="background:#FFD700;color:#000;">⭐ Favorite</span>' : ''}
                <span class="source-badge">${sourceLabel}</span>
            </div>
            ${idBadgeHTML}
            ${rating ? `<p style="margin:4px 0;color:var(--text2);">⭐ <strong>${rating.toFixed(1)}</strong>/10 <small style="color:var(--text3);">TMDB</small></p>` : ''}
            <p style="color:var(--text2);font-size:13px;">Status: <strong>${item.user_status || 'Watching'}</strong></p>
            <div class="genre-tags">${genreTagsHTML}</div>
            ${buildMyRatingWidget(item, safeDocId)}
            <div class="detail-progress">
                <div class="detail-progress-label">${watched}/${total} aired (${progress.toFixed(0)}%)</div>
                <div class="detail-progress-bar"><div class="detail-progress-fill" style="width:${progress}%;background:${progress >= 100 ? '#4CAF50' : '#FFC107'};"></div></div>
            </div>
        </div>
    </div>
    <div class="detail-tabs">
        <button class="detail-tab-btn ${infoActive ? 'active' : ''}" onclick="switchDetailTab('info-tab')">Info</button>
        <button class="detail-tab-btn ${!infoActive ? 'active' : ''}" onclick="switchDetailTab('episodes-tab')">Episodes</button>
    </div>
    <div class="swipe-container" id="detail-swipe">
        <div class="detail-tab-content ${infoActive ? 'active' : ''}" id="info-tab">
            <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
            ${buildEpisodeRatingsChart(epRatings)}
            ${castHTML}
            ${networks.length ? `<div class="networks-section"><h3>📺 Networks</h3><div class="network-logos">${networks.map(n => `<span class="network-name">${n}</span>`).join('')}</div></div>` : ''}
            ${providerList.length ? buildNetworksSection(providerList, []) : ''}
            ${buildSimilarSection(simScored, 'tv')}
        </div>
        <div class="detail-tab-content ${!infoActive ? 'active' : ''}" id="episodes-tab">
            ${seasonsHTML}${specialsHTML}
        </div>
    </div>`;

    setupDetailSwipe();
    if (epRatings.length) renderEpisodeRatingsChart(epRatings);
    if (['Watching', 'Rewatching'].includes(item.user_status)) {
        setTimeout(() => autoScrollToLastWatched(item), 150);
    }

    // Save poster if better one found
    if (poster && poster !== item.poster && !poster.startsWith('data:')) {
        item.poster = poster;
        updateDoc(doc(db, 'series', item.docId), { poster }).catch(() => {});
    }
}

// ===== AUTO-SCROLL =====
function autoScrollToLastWatched(item) {
    if (!['Watching', 'Rewatching'].includes(item.user_status)) return;
    let lastSeason = -1, lastEp = -1;
    if (item.user_status === 'Rewatching') {
        const aired = getAiredEpisodesOnly(item.seasons);
        const maxRew = Math.max(...aired.map(ep => ep.rewatch_count || 0), 0);
        item.seasons?.forEach(s => {
            if (s.number === 0) return;
            s.episodes?.forEach(ep => {
                if (ep.is_special || isPlaceholderEpisode(ep)) return;
                if ((ep.rewatch_count || 0) >= maxRew && maxRew > 0) {
                    if (s.number > lastSeason || (s.number === lastSeason && ep.number > lastEp)) {
                        lastSeason = s.number; lastEp = ep.number;
                    }
                }
            });
        });
    } else {
        item.seasons?.forEach(s => {
            if (s.number === 0) return;
            s.episodes?.forEach(ep => {
                if (ep.is_special || isPlaceholderEpisode(ep) || !ep.is_watched) return;
                if (s.number > lastSeason || (s.number === lastSeason && ep.number > lastEp)) {
                    lastSeason = s.number; lastEp = ep.number;
                }
            });
        });
    }
    if (lastSeason < 0) return;
    const remembered = lastScrolledEpisode.get(item.docId);
    if (remembered && remembered.seasonNum === lastSeason && remembered.episodeNum === lastEp) return;
    lastScrolledEpisode.set(item.docId, { seasonNum: lastSeason, episodeNum: lastEp });
    activeDetailTab = 'episodes-tab';
    switchDetailTab('episodes-tab');
    expandedSeasons.add(seasonKey(item.docId, lastSeason));
    const modal = document.getElementById('modal');
    if (!modal) return;
    modal.querySelectorAll('.season-header').forEach(header => {
        if ((header.querySelector('span')?.textContent || '').includes(`Season ${lastSeason}`)) {
            const bd = header.nextElementSibling, icon = header.querySelector('.toggle-icon');
            if (bd && !bd.classList.contains('open')) { bd.classList.add('open'); if (icon) icon.classList.add('open'); }
        }
    });
    setTimeout(() => {
        modal.querySelectorAll('.episode').forEach(el => {
            const numEl = el.querySelector('.episode-number');
            if (numEl && numEl.textContent.trim() === `E${String(lastEp).padStart(2, '0')}`) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.transition = 'background 0.3s';
                el.style.background = 'var(--surface2)';
                setTimeout(() => { el.style.background = ''; }, 1000);
            }
        });
    }, 200);
}

// ===== EPISODE RATINGS =====
async function fetchEpisodeRatings(tmdbId, localSeasons) {
    const ratings = [];
    // Only fetch real season numbers (< 100) — skip year-based seasons
    const seasons = localSeasons.filter(s => s.number !== 0 && s.number < 100).slice(0, 5);
    for (const s of seasons) {
        try {
            const data = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${s.number}?api_key=${TMDB_API_KEY}`);
            if (!data || !data.episodes) continue; // silently skip 404s
            data.episodes.forEach(ep => {
                if (ep.vote_average > 0) ratings.push({
                    label: `S${s.number}E${ep.episode_number}`,
                    rating: ep.vote_average,
                    season: s.number,
                    episode: ep.episode_number,
                    name: ep.name
                });
            });
        } catch (e) { /* silently skip */ }
    }
    return ratings;
}

function buildEpisodeRatingsChart(ratings) {
    if (!ratings.length) return '';
    return `<div class="chart-container"><h3>📊 Episode Ratings</h3><canvas id="episode-ratings-chart"></canvas></div>`;
}

function renderEpisodeRatingsChart(ratings) {
    const canvas = document.getElementById('episode-ratings-chart');
    if (!canvas) return;
    if (activeCharts['episode-ratings']) { activeCharts['episode-ratings'].destroy(); delete activeCharts['episode-ratings']; }
    const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
    activeCharts['episode-ratings'] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ratings.map(r => r.label),
            datasets: [{ data: ratings.map(r => r.rating), backgroundColor: ratings.map(r => colors[(r.season - 1) % colors.length] + '99'), borderColor: ratings.map(r => colors[(r.season - 1) % colors.length]), borderWidth: 1 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => `${ratings[i[0].dataIndex].label} - ${ratings[i[0].dataIndex].name}`, label: i => `${i.raw.toFixed(1)}/10` } } }, scales: { y: { min: 0, max: 10 }, x: { ticks: { maxRotation: 90, font: { size: 9 } } } } }
    });
}

// ===== BUILD HELPERS =====
function buildCastSection(cast) {
    if (!cast.length) return '';
    return `<div class="cast-section"><h3>🎭 Cast</h3><div class="cast-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">${cast.map(p => `<div class="cast-card"><img src="${p.profile_path ? TMDB_IMG_BASE + p.profile_path : PLACEHOLDER_AVATAR}" alt="${p.name}" onerror="this.src='${PLACEHOLDER_AVATAR}'"><div class="cast-name">${p.name}</div><div class="cast-character">${p.character || ''}</div></div>`).join('')}</div></div>`;
}

function buildNetworksSection(providers, networks) {
    const all = [...(networks || []), ...(providers || [])];
    if (!all.length) return '';
    return `<div class="networks-section"><h3>📺 Available On</h3><div class="network-logos">${all.map(n => n.logo_path ? `<img class="network-logo" src="${TMDB_IMG_BASE}${n.logo_path}" alt="${n.name || n.provider_name}">` : `<span class="network-name">${n.name || n.provider_name}</span>`).join('')}</div></div>`;
}

function buildSimilarSection(items, type) {
    if (!items.length) return '';
    return `<div class="similar-section"><h3>🎬 You Might Like</h3><div class="similar-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">${items.map(item => {
        const t = item.title || item.name;
        const p = item.poster_path ? TMDB_IMG_BASE + item.poster_path : PLACEHOLDER_SIMILAR;
        const r = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const y = (item.release_date || item.first_air_date || '').substring(0, 4);
        const st = (t || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const sp = p.replace(/'/g, "\\'");
        return `<div class="similar-card" onclick="openPreview(${item.id},'${type}','${st}','${y}','${sp}')">
            <img src="${p}" alt="${t}" onerror="this.src='${PLACEHOLDER_SIMILAR}'">
            <div class="similar-title">${t}</div>
            <div class="similar-rating">⭐${r}</div>
            ${item.matchScore != null ? `<div class="similar-match">${item.matchScore}% match</div>` : ''}
        </div>`;
    }).join('')}</div></div>`;
}

// ===== DETAIL TABS =====
function switchDetailTab(tabId) {
    activeDetailTab = tabId;
    document.querySelectorAll('.detail-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    document.querySelectorAll('.detail-tab-btn').forEach(b => {
        if (tabId.includes('info') && b.textContent.trim() === 'Info') b.classList.add('active');
        if (tabId.includes('episodes') && b.textContent.trim() === 'Episodes') b.classList.add('active');
    });
}

function setupDetailSwipe() {
    const c = document.getElementById('detail-swipe');
    if (!c) return;
    let sx = 0;
    c.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    c.addEventListener('touchend', e => {
        const d = sx - e.changedTouches[0].clientX;
        if (Math.abs(d) > 60) switchDetailTab(d > 0 ? 'episodes-tab' : 'info-tab');
    });
}

function toggleOptionsMenu(id) {
    const m = document.getElementById(id);
    if (m) m.classList.toggle('show');
    document.querySelectorAll('.options-menu').forEach(x => { if (x.id !== id) x.classList.remove('show'); });
}

// ===== EPISODE DETAIL MODAL — G12: stays open after marking =====
async function openEpisodeDetail(docId, seasonNum, episodeNum, isSpecial = false, epName = '') {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const epBody = document.getElementById('episode-modal-body');
    epBody.innerHTML = '<p class="empty-state">Loading...</p>';
    openModal('episode-modal');

    const source = getEpisodeSource();
    const useTVMaze = source === 'tvmaze' && !item.force_tmdb_source && item.tvmaze_id;

    try {
        let displayData = { name: epName, overview: 'No synopsis.', vote_average: 0, air_date: null, runtime: null, still_url: null, still_path: null, guest_stars: [], credits: { cast: [] } };

        if (useTVMaze && item.tvmaze_id) {
            const localSeason2 = item.seasons?.find(s => s.number === seasonNum);
            let localEp2;
            if (isSpecial && epName) localEp2 = localSeason2?.episodes?.find(e => e.number === episodeNum && e.is_special && titlesMatch(e.name || '', epName));
            else localEp2 = localSeason2?.episodes?.find(e => e.number === episodeNum && !e.is_special);
            const tvmazeEpId = localEp2?.tvmaze_ep_id || null;
            const tvEp = await tvmazeGetEpisodeDetail(item.tvmaze_id, seasonNum, episodeNum, tvmazeEpId);
            if (tvEp) {
                displayData = {
                    name: tvEp.name || epName,
                    overview: tvEp.summary ? tvEp.summary.replace(/<[^>]+>/g, '').trim() : 'No synopsis.',
                    vote_average: tvEp.rating?.average || 0,
                    air_date: tvEp.airdate || null,
                    runtime: tvEp.runtime || null,
                    still_url: tvEp.image?.original || tvEp.image?.medium || null,
                    guest_stars: [], credits: { cast: [] }
                };
            }
        } else if (item.tmdb_id) {
            const data = await tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/season/${seasonNum}/episode/${episodeNum}?api_key=${TMDB_API_KEY}&append_to_response=credits`);
            if (!(isSpecial && epName && data.name && !titlesMatch(data.name, epName))) {
                displayData = {
                    name: data.name || epName,
                    overview: data.overview || 'No synopsis.',
                    vote_average: data.vote_average || 0,
                    air_date: data.air_date || null,
                    runtime: data.runtime || null,
                    still_path: data.still_path || null,
                    guest_stars: data.guest_stars || [],
                    credits: data.credits || { cast: [] }
                };
            }
        }

        const still = displayData.still_url || (displayData.still_path ? `${TMDB_IMG_BASE}${displayData.still_path}` : '');
        const r = displayData.vote_average ? displayData.vote_average.toFixed(1) : 'N/A';
        const air = displayData.air_date ? formatDate(displayData.air_date) : 'N/A';
        const allCast = [...(displayData.guest_stars || []), ...(displayData.credits?.cast || [])].slice(0, 12);

        const localSeason = item.seasons?.find(s => s.number === seasonNum);
        let localEp;
        if (isSpecial && epName) localEp = localSeason?.episodes?.find(e => e.number === episodeNum && e.is_special && titlesMatch(e.name || '', epName));
        else localEp = localSeason?.episodes?.find(e => e.number === episodeNum && !e.is_special);

        const sd = docId.replace(/'/g, "\\'");
        const safeEpName = (epName || '').replace(/'/g, "\\'");
        const currentNote = localEp?.note || '';

        let watchedDateHTML = '';
        if (localEp?.is_watched && localEp?.watched_at) {
            const allDates = [{ date: localEp.watched_at, label: 'First watch', cycle: 0 }];
            (localEp.rewatch_history || []).forEach((rw, idx) => {
                allDates.push({ date: rw, label: `Rewatch ${idx + 1}`, cycle: idx + 1 });
            });
            watchedDateHTML = `<div style="margin-top:8px;">
                ${allDates.map(wd => `
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                        <span style="color:var(--text3);font-size:12px;">${wd.label}: ${formatDate(wd.date)}</span>
                        <button class="edit-date-btn" onclick="showEditWatchDateInline('${sd}',${seasonNum},${episodeNum},${isSpecial},'${safeEpName}',${wd.cycle})" title="Edit date">✏️</button>
                    </div>`).join('')}
            </div>`;
        }

        epBody.innerHTML = `<div class="ep-detail-header">
            ${still ? `<img src="${still}" onerror="this.style.display='none'">` : ''}
            <div class="ep-detail-info">
                <h3>${displayData.name || `Episode ${episodeNum}`}</h3>
                ${isSpecial ? '<span style="background:#FF6B35;color:white;padding:2px 8px;border-radius:8px;font-size:11px;display:inline-block;margin-bottom:4px;">SPECIAL</span>' : ''}
                <div class="ep-code">S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}</div>
                <div class="ep-rating">⭐ ${r}/10</div>
                <p style="color:var(--text2);font-size:13px;">📅 ${air}</p>
                ${displayData.runtime ? `<p style="color:var(--text2);font-size:13px;">⏱ ${displayData.runtime}min</p>` : ''}
                <span class="source-badge" style="margin-top:4px;">${useTVMaze && item.tvmaze_id ? 'TVMaze' : 'TMDB'}</span>
            </div>
        </div>
        <div style="margin:15px 0;">
            <button onclick="toggleEpisode('${sd}',${seasonNum},${episodeNum},${isSpecial},'${safeEpName}')" class="watch-btn ${localEp?.is_watched ? 'watched' : 'mark-watched'}" style="padding:10px 24px;">${localEp?.is_watched ? '✓ Watched' : '○ Mark Watched'}</button>
            ${localEp?.rewatch_count > 0 ? `<p style="margin-top:6px;color:#2196F3;font-size:12px;">↺ ${localEp.rewatch_count}x rewatched</p>` : ''}
            ${watchedDateHTML}
        </div>
        <div id="edit-date-inline-area"></div>
        <div class="ep-detail-synopsis"><h4 style="color:var(--accent);margin-bottom:8px;">Synopsis</h4><p>${displayData.overview}</p></div>
        <div class="ep-note-section"><h4>📝 Note</h4>
            <textarea class="ep-note-input" id="ep-note-textarea" placeholder="Add a note...">${currentNote}</textarea>
            <button class="ep-note-save-btn" onclick="saveEpisodeNote('${sd}',${seasonNum},${episodeNum},${isSpecial},'${safeEpName}')">Save Note</button>
        </div>
        ${allCast.length ? `<div class="ep-guest-cast"><h4>Cast</h4><div class="cast-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">${allCast.map(p => `<div class="cast-card"><img src="${p.profile_path ? TMDB_IMG_BASE + p.profile_path : (p.profile_url || PLACEHOLDER_AVATAR)}" onerror="this.src='${PLACEHOLDER_AVATAR}'"><div class="cast-name">${p.name}</div><div class="cast-character">${p.character || ''}</div></div>`).join('')}</div></div>` : ''}`;
    } catch (e) {
        epBody.innerHTML = '<p class="empty-state">Failed to load.</p>';
        logError('Episode detail', e, { show: item.title, docId, seasonNum, episodeNum });
    }
}

// ===== EPISODE NOTE =====
async function saveEpisodeNote(docId, seasonNum, episodeNum, isSpecial, epName) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    const season = item.seasons.find(s => s.number === seasonNum); if (!season) return;
    let ep;
    if (isSpecial && epName) ep = season.episodes.find(e => e.number === episodeNum && e.is_special && titlesMatch(e.name || '', epName));
    else ep = season.episodes.find(e => e.number === episodeNum && !e.is_special);
    if (!ep) return;
    ep.note = document.getElementById('ep-note-textarea')?.value?.trim() || null;
    try {
        await syncMarkToOtherStructure(item, getEpisodeSource());
        await saveDualSeasons(item);
        const btn = document.querySelector('.ep-note-save-btn');
        if (btn) { btn.textContent = '✓ Saved!'; btn.style.background = 'var(--green)'; setTimeout(() => { btn.textContent = 'Save Note'; btn.style.background = ''; }, 1500); }
    } catch (e) { logError('Save note', e, { show: item.title, docId, seasonNum, episodeNum }); }
}

// ===== EDIT WATCH DATE — SINGLE =====
function showEditWatchDateInline(docId, seasonNum, episodeNum, isSpecial, epName, cycle = 0) {
    const area = document.getElementById('edit-date-inline-area'); if (!area) return;
    const item = myList.find(i => i.docId === docId); if (!item) return;
    const season = item.seasons.find(s => s.number === seasonNum); if (!season) return;
    let ep;
    if (isSpecial && epName) ep = season.episodes.find(e => e.number === episodeNum && e.is_special && titlesMatch(e.name || '', epName));
    else ep = season.episodes.find(e => e.number === episodeNum && !e.is_special);
    if (!ep) return;

    let currentDateStr;
    if (cycle === 0) currentDateStr = ep.watched_at;
    else currentDateStr = ep.rewatch_history?.[cycle - 1] || ep.watched_at;

    const currentDate = currentDateStr ? new Date(currentDateStr).toISOString().split('T')[0] : '';
    const currentTime = currentDateStr ? new Date(currentDateStr).toTimeString().substring(0, 5) : '23:00';
    const sd = docId.replace(/'/g, "\\'");
    const safeEpName2 = (epName || '').replace(/'/g, "\\'");
    const cycleLabel = cycle === 0 ? 'First Watch' : `Rewatch ${cycle}`;

    area.innerHTML = `<div style="margin:10px 0;padding:12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">
        <div style="font-size:13px;color:var(--text2);margin-bottom:8px;">Edit Date — ${cycleLabel}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input type="date" id="edit-date-picker" class="edit-date-input" value="${currentDate}">
            <input type="time" id="edit-time-picker" class="edit-time-input" value="${currentTime}">
            <input type="hidden" id="edit-date-cycle" value="${cycle}">
            <button onclick="applyEditWatchDate('${sd}',${seasonNum},${episodeNum},${isSpecial},'${safeEpName2}')"
                style="padding:8px 14px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">Apply</button>
            <button onclick="document.getElementById('edit-date-inline-area').innerHTML=''"
                style="padding:8px 14px;background:var(--surface);border:2px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;color:var(--text);">Cancel</button>
        </div>
    </div>`;
}

async function applyEditWatchDate(docId, seasonNum, episodeNum, isSpecial, epName) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    const season = item.seasons.find(s => s.number === seasonNum); if (!season) return;
    let ep;
    if (isSpecial && epName) ep = season.episodes.find(e => e.number === episodeNum && e.is_special && titlesMatch(e.name || '', epName));
    else ep = season.episodes.find(e => e.number === episodeNum && !e.is_special);
    if (!ep) return;

    const dp = document.getElementById('edit-date-picker'), tp = document.getElementById('edit-time-picker');
    const cycleInput = document.getElementById('edit-date-cycle');
    if (!dp?.value) return;
    const newDate = new Date(`${dp.value}T${tp?.value || '23:00'}:00`).toISOString();
    const cycle = parseInt(cycleInput?.value || '0');

    if (cycle === 0) ep.watched_at = newDate;
    else { if (ep.rewatch_history && ep.rewatch_history.length >= cycle) ep.rewatch_history[cycle - 1] = newDate; }

    try {
        await syncMarkToOtherStructure(item, getEpisodeSource());
        await saveDualSeasons(item);
        document.getElementById('edit-date-inline-area').innerHTML = '';
        // G12: Refresh episode detail in place
        await openEpisodeDetail(docId, seasonNum, episodeNum, isSpecial, epName);
    } catch (e) { logError('Edit watch date', e, { show: item.title, docId, seasonNum, episodeNum }); }
}

// ===== EDIT WATCH DATES — BULK MODAL =====
function openEditDatesModal(docId) {
    document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
    const item = myList.find(i => i.docId === docId); if (!item) return;
    let modal = document.getElementById('edit-dates-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'edit-dates-modal'; modal.className = 'modal'; modal.style.cssText = 'z-index:3000;';
        modal.innerHTML = `<div class="modal-content" style="max-width:640px;"><span class="close" onclick="closeModal('edit-dates-modal')">&times;</span><div id="edit-dates-body"></div></div>`;
        document.body.appendChild(modal);
        if (!MODAL_IDS.includes('edit-dates-modal')) MODAL_IDS.push('edit-dates-modal');
        modal.addEventListener('click', e => { if (e.target === modal) closeModal('edit-dates-modal'); });
    }

    const seasonOptions = (item.seasons || []).filter(s => s.number !== 0).map(s => `<option value="${s.number}">Season ${s.number}</option>`).join('');
    const gap = item.is_anime ? ANIME_EP_MINUTES : TV_EP_MINUTES;
    const maxPerDay = item.is_anime ? ANIME_EPS_PER_DAY : TV_EPS_PER_DAY;

    document.getElementById('edit-dates-body').innerHTML = `
        <h3 style="color:var(--accent);margin-bottom:12px;">✏️ Edit Watch Dates</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:6px;">Select episodes and set a new date/time for the <strong>last selected</strong> episode. Earlier episodes get timestamps ${gap}min apart, max ${maxPerDay} per day.</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
            <label style="font-size:13px;color:var(--text2);">Season:</label>
            <select id="edit-dates-season-filter" onchange="filterEditDatesList('${docId}')" style="padding:6px 10px;border:2px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;">
                <option value="all">All Seasons</option>${seasonOptions}
            </select>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
            <input type="date" id="edit-dates-picker" class="edit-date-input" value="${new Date().toISOString().split('T')[0]}">
            <input type="time" id="edit-dates-time-picker" class="edit-time-input" value="23:00">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text2);cursor:pointer;">
                <input type="checkbox" id="edit-dates-rewatch-mode"> Rewatch mode
            </label>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
            <button onclick="selectAllEditDates(true)" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text);">Select All Watched</button>
            <button onclick="selectAllEditDates(false)" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text);">Clear Selection</button>
        </div>
        <div class="edit-dates-list" id="edit-dates-list">${buildEditDatesList(item, 'all')}</div>
        <div id="edit-dates-status" style="margin-top:8px;"></div>
        <div style="margin-top:15px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button onclick="closeModal('edit-dates-modal')" style="padding:10px 20px;border:2px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;cursor:pointer;">Close</button>
            <button onclick="applyBulkEditDates('${docId}')" style="padding:10px 24px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Apply Dates</button>
        </div>`;
    openModal('edit-dates-modal');
}

function buildEditDatesList(item, filterSeason) {
    let rows = '';
    (item.seasons || []).forEach(s => {
        if (s.number === 0) return;
        if (filterSeason !== 'all' && s.number !== parseInt(filterSeason)) return;
        (s.episodes || []).forEach(ep => {
            if (ep.is_special || isPlaceholderEpisode(ep)) return;
            const epCode = `S${String(s.number).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`;
            const dateStr = ep.watched_at ? formatDate(ep.watched_at) : '—';
            rows += `<div class="edit-dates-item">
                <input type="checkbox" class="edit-date-cb" ${ep.is_watched ? 'checked' : ''} data-season="${s.number}" data-ep="${ep.number}">
                <span class="ep-label">${epCode} — ${ep.name || 'Episode ' + ep.number}</span>
                <span class="ep-date">${ep.is_watched ? dateStr : 'unwatched'}</span>
            </div>`;
        });
    });
    return rows || '<p class="empty-state">No episodes found.</p>';
}

function filterEditDatesList(docId) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    const filter = document.getElementById('edit-dates-season-filter')?.value || 'all';
    const list = document.getElementById('edit-dates-list');
    if (list) list.innerHTML = buildEditDatesList(item, filter);
}
function selectAllEditDates(selectWatched) {
    document.querySelectorAll('.edit-date-cb').forEach(cb => { cb.checked = selectWatched; });
}

async function applyBulkEditDates(docId) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    const dp = document.getElementById('edit-dates-picker'), tp = document.getElementById('edit-dates-time-picker');
    const statusEl = document.getElementById('edit-dates-status');
    const isRewatchMode = document.getElementById('edit-dates-rewatch-mode')?.checked || false;
    if (!dp?.value) { alert('Please select a date.'); return; }
    const timeVal = tp?.value || '23:00';
    const checked = [...document.querySelectorAll('.edit-date-cb:checked')];
    if (!checked.length) { alert('Select at least one episode.'); return; }

    checked.sort((a, b) => {
        const aSn = parseInt(a.dataset.season), bSn = parseInt(b.dataset.season);
        if (aSn !== bSn) return aSn - bSn;
        return parseInt(a.dataset.ep) - parseInt(b.dataset.ep);
    });

    const firstSeason = parseInt(checked[0].dataset.season), firstEp = parseInt(checked[0].dataset.ep);
    const prevUnwatched = getPreviousUnwatchedEpisodes(item, firstSeason, firstEp);
    let proceedWithPrev = false;

    if (prevUnwatched.length > 0 && !isRewatchMode) {
        const answer = await showMarkPreviousConfirm(prevUnwatched.length);
        if (answer === 'cancel') return;
        proceedWithPrev = answer === 'yes';
    }

    const baseDate = new Date(`${dp.value}T${timeVal}:00`);
    const totalToChange = checked.length + (proceedWithPrev ? prevUnwatched.length : 0);

    const lastEpLabel = checked[checked.length - 1].closest('.edit-dates-item')?.querySelector('.ep-label')?.textContent || '';
    const gap = item.is_anime ? ANIME_EP_MINUTES : TV_EP_MINUTES;
    const maxPerDay = item.is_anime ? ANIME_EPS_PER_DAY : TV_EPS_PER_DAY;
    const daysNeeded = Math.ceil(totalToChange / maxPerDay);
    const confirmMsg = `Change dates for ${totalToChange} episode${totalToChange !== 1 ? 's' : ''}.\n\nLast episode: ${lastEpLabel}\nDate: ${formatDate(baseDate.toISOString())} at ${timeVal}\n${gap}min apart, max ${maxPerDay}/day\n${daysNeeded > 1 ? `Spanning ${daysNeeded} days backwards.\n` : ''}\n${isRewatchMode ? '↺ REWATCH MODE — will increment rewatch count.\n' : ''}Continue?`;
    const confirm = await showConfirm('Confirm Date Change', confirmMsg, 'Apply', 'Cancel');
    if (confirm !== 'yes') return;

    const allTimestamps = generateIncrementalTimestamps(totalToChange, item.is_anime, baseDate);

    if (proceedWithPrev) {
        prevUnwatched.forEach(({ seasonNum: sN, episodeNum: eN }, idx) => {
            const s = item.seasons.find(s => s.number === sN);
            const e = s?.episodes.find(e => e.number === eN && !e.is_special);
            if (e) {
                if (isRewatchMode) { e.rewatch_count = (e.rewatch_count || 0) + 1; if (!e.rewatch_history) e.rewatch_history = []; e.rewatch_history.push(allTimestamps[idx]); }
                else { e.is_watched = true; }
                e.watched_at = allTimestamps[idx];
            }
        });
    }

    const tsOffset = proceedWithPrev ? prevUnwatched.length : 0;
    checked.forEach((cb, idx) => {
        const sN = parseInt(cb.dataset.season), eN = parseInt(cb.dataset.ep);
        const s = item.seasons.find(s => s.number === sN);
        const e = s?.episodes.find(e => e.number === eN && !e.is_special);
        if (e) {
            if (isRewatchMode) { e.rewatch_count = (e.rewatch_count || 0) + 1; if (!e.rewatch_history) e.rewatch_history = []; e.rewatch_history.push(allTimestamps[tsOffset + idx]); }
            e.watched_at = allTimestamps[tsOffset + idx];
        }
    });

    try {
        await syncMarkToOtherStructure(item, getEpisodeSource());
        await saveDualSeasons(item);
        if (statusEl) statusEl.innerHTML = `<p style="color:var(--green);font-size:13px;">✓ Dates updated for ${totalToChange} episode${totalToChange !== 1 ? 's' : ''}!${isRewatchMode ? ' (rewatch)' : ''}</p>`;
        const filter = document.getElementById('edit-dates-season-filter')?.value || 'all';
        const list = document.getElementById('edit-dates-list');
        if (list) list.innerHTML = buildEditDatesList(item, filter);
        renderHistory(item.is_anime ? 'anime' : 'tv');
    } catch (e) {
        logError('Bulk edit dates', e, { show: item.title, docId });
        if (statusEl) statusEl.innerHTML = `<p style="color:var(--red);font-size:13px;">✗ Failed to save.</p>`;
    }
}

// ===== TOGGLE HIDE =====
async function toggleHideFromList(docId, type) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    item.hide_from_list = !item.hide_from_list;
    try {
        await updateDoc(doc(db, type === 'movie' ? 'movies' : 'series', docId), { hide_from_list: item.hide_from_list });
        const body = document.getElementById('modal-body');
        if (body && document.getElementById('modal').style.display !== 'none') {
            if (type === 'movie') await openMovieDetails(item, body, docId.replace(/'/g, "\\'"));
            else await openTVDetails(item, body, docId.replace(/'/g, "\\'"));
        }
    } catch (e) { logError('Toggle hide', e, { show: item.title, docId }); }
}

// ===== SEASON / EPISODE BUILD =====
function toggleSeason(header, docId, seasonNum) {
    const body = header.nextElementSibling, icon = header.querySelector('.toggle-icon'), key = seasonKey(docId, seasonNum);
    body.classList.toggle('open'); icon.classList.toggle('open');
    if (body.classList.contains('open')) expandedSeasons.add(key); else expandedSeasons.delete(key);
}

function buildSeasonHTML(season, safeDocId, docId, item) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const regularEps = (season.episodes || []).filter(ep => {
        if (isPlaceholderEpisode(ep)) return false;
        if (ep.is_insignificant_special) return false;
        return !ep.is_special || ep.is_significant_special;
    });
    const airedEps = regularEps.filter(ep => !ep.air_date || new Date(ep.air_date) <= today);
    const watched = airedEps.filter(e => e.is_watched).length, total = airedEps.length;
    const allWatched = watched === total && total > 0;
    const key = seasonKey(docId, season.number), isExpanded = expandedSeasons.has(key);

    return `<div class="season">
        <div class="season-header" onclick="toggleSeason(this,'${docId}',${season.number})">
            <span>Season ${season.number} <span style="font-size:12px;opacity:0.8;">(${watched}/${total} aired)</span></span>
            <div style="display:flex;gap:8px;align-items:center;">
                <button class="mark-all-btn" onclick="event.stopPropagation();markSeasonWatched('${safeDocId}',${season.number})">${allWatched ? 'Unmark' : 'Mark All'}</button>
                <span class="toggle-icon ${isExpanded ? 'open' : ''}">▼</span>
            </div>
        </div>
        <div class="season-body ${isExpanded ? 'open' : ''}">
            ${regularEps.map(ep => buildEpisodeHTML(ep, season.number, safeDocId, item)).join('') || '<p style="padding:10px;color:var(--text3);">No episodes</p>'}
            ${(season.episodes || []).filter(ep => ep.is_insignificant_special).length ? `<p style="color:var(--text3);font-size:11px;padding:8px 12px;font-style:italic;">${(season.episodes || []).filter(ep => ep.is_insignificant_special).length} special(s) in Specials section</p>` : ''}
        </div>
    </div>`;
}

function buildEpisodeHTML(ep, seasonNum, safeDocId, item) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const air = ep.air_date ? new Date(ep.air_date) : null;
    const isUnaired = air && air > today;
    const hasNote = ep.note && ep.note.trim().length > 0;
    const isSignificantSpecial = ep.is_significant_special || false;
    const safeEpName = (ep.name || '').replace(/'/g, "\\'");

    const epLabel = isSignificantSpecial
        ? `<span class="special-tag">SPECIAL</span>`
        : `<span class="episode-number">E${String(ep.number).padStart(2, '0')}</span> —`;

    const onclickStr = isSignificantSpecial
        ? `openEpisodeDetail('${safeDocId}',${seasonNum},${ep.number},true,'${safeEpName}')`
        : `openEpisodeDetail('${safeDocId}',${seasonNum},${ep.number},false)`;

    const showWatchBtn = !isUnaired;

    const toggleStr = isSignificantSpecial
        ? `toggleEpisode('${safeDocId}',${seasonNum},${ep.number},true,'${safeEpName}')`
        : `toggleEpisode('${safeDocId}',${seasonNum},${ep.number},false)`;

    return `<div class="episode ${ep.is_watched ? 'watched' : ''}" onclick="${onclickStr}" style="${isUnaired ? 'opacity:0.5;' : ''}">
        <div class="episode-info">
            ${epLabel} ${ep.name || 'Episode ' + ep.number}
            ${hasNote ? '<span class="episode-note-icon">📝</span>' : ''}
            ${isUnaired ? `<br><small style="color:var(--text3);">📅 Airs ${formatDate(ep.air_date)}</small>` : ''}
            ${ep.watched_at && !isUnaired ? `<br><small style="color:var(--text3);">${formatDate(ep.watched_at)}</small>` : ''}
            ${ep.is_watched && isUnaired ? '<br><small style="color:var(--green);">✓ Marked early</small>' : ''}
            ${ep.rewatch_count > 0 ? `<br><small style="color:#2196F3;">↺ ${ep.rewatch_count}x</small>` : ''}
        </div>
        ${showWatchBtn
            ? `<button class="watch-btn ${ep.is_watched ? 'watched' : 'mark-watched'}" onclick="event.stopPropagation();${toggleStr}">${ep.is_watched ? '✓' : '○'}</button>`
            : '<div style="width:40px;"></div>'}
    </div>`;
}

function buildSpecialEpisodeHTML(ep, safeDocId, docId) {
    const fetchSeason = ep.fromSeason !== undefined ? ep.fromSeason : 0;
    const safeEpName = (ep.name || '').replace(/'/g, "\\'");
    const hasNote = ep.note && ep.note.trim().length > 0;
    return `<div class="episode ${ep.is_watched ? 'watched' : ''}" onclick="openEpisodeDetail('${safeDocId}',${fetchSeason},${ep.number},true,'${safeEpName}')">
        <div class="episode-info">
            <span class="special-tag">SPECIAL</span>${ep.name || 'Special Episode'}
            ${hasNote ? '<span class="episode-note-icon">📝</span>' : ''}
            ${ep.watched_at ? `<br><small style="color:var(--text3);">${formatDate(ep.watched_at)}</small>` : ''}
            ${ep.rewatch_count > 0 ? `<br><small style="color:#2196F3;">↺ ${ep.rewatch_count}x</small>` : ''}
        </div>
        <button class="watch-btn ${ep.is_watched ? 'watched' : 'mark-watched'}" onclick="event.stopPropagation();toggleEpisode('${safeDocId}',${fetchSeason},${ep.number},true,'${safeEpName}')">${ep.is_watched ? '✓' : '○'}</button>
    </div>`;
}

// ===== TOGGLE EPISODE — G1: double-tap protection =====
async function toggleEpisode(docId, seasonNum, episodeNum, isSpecial = false, epName = '') {
    if (actionInProgress) return;
    actionInProgress = true;

    const item = myList.find(i => i.docId === docId);
    if (!item) { actionInProgress = false; return; }
    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) { actionInProgress = false; return; }

    let ep;
    if (isSpecial && epName) {
        ep = season.episodes.find(e => e.number === episodeNum && e.is_special && titlesMatch(e.name || '', epName));
        if (!ep) ep = season.episodes.find(e => e.number === episodeNum && e.is_special);
        if (!ep && seasonNum === 0) ep = season.episodes.find(e => e.number === episodeNum);
    } else {
        ep = season.episodes.find(e => e.number === episodeNum && !e.is_special);
    }
    if (!ep) { actionInProgress = false; return; }

    activeDetailTab = 'episodes-tab';

    if (ep.is_watched) {
        actionInProgress = false;
        const choice = await showRewatchConfirm(ep.name || 'This episode');
        actionInProgress = true;

        if (choice === 'from-start') {
            const needs = getEpisodesNeedingRewatch(item, seasonNum, episodeNum);
            const allEps = [];
            needs.forEach(({ seasonNum: sN, episodeNum: eN }) => {
                const s = item.seasons.find(s => s.number === sN);
                const e = s?.episodes.find(e => e.number === eN && !e.is_special);
                if (e) allEps.push(e);
            });
            allEps.push(ep);

            actionInProgress = false;
            const dateChoice = await promptSeasonWatchDate(allEps, item.is_anime);
            actionInProgress = true;
            if (dateChoice.type === 'cancel') { actionInProgress = false; return; }

            allEps.forEach(e => {
                e.rewatch_count = (e.rewatch_count || 0) + 1;
                if (!e.rewatch_history) e.rewatch_history = [];
            });
            applyWatchDateChoice(allEps, dateChoice, item.is_anime, true);
            allEps.forEach(e => {
                e.rewatch_history.push(e._rewatch_date || new Date().toISOString());
                delete e._rewatch_date;
                // Don't touch ep.watched_at — keep original first watch date
            });

        } else if (choice === 'just-this') {
            ep.rewatch_count = (ep.rewatch_count || 0) + 1;
            if (!ep.rewatch_history) ep.rewatch_history = [];
            ep.rewatch_history.push(new Date().toISOString());
            ep.watched_at = new Date().toISOString();

        } else if (choice === 'unmark') {
            actionInProgress = false;
            const hasRewatches = (ep.rewatch_count || 0) > 0;
            const unmarkChoice = await showUnmarkOptionsConfirm(ep.name || 'This episode', hasRewatches);
            actionInProgress = true;

            if (unmarkChoice === 'remove-last-rewatch') {
                if ((ep.rewatch_count || 0) > 0) {
                    ep.rewatch_count--;
                    if (ep.rewatch_history?.length) ep.rewatch_history.pop();
                }
            } else if (unmarkChoice === 'remove-first-watch') {
                ep.is_watched = false;
                ep.watched_at = null;
                // Keep rewatch data if any
            } else if (unmarkChoice === 'remove-everything') {
                ep.is_watched = false;
                ep.watched_at = null;
                ep.rewatch_count = 0;
                ep.rewatch_history = [];
            } else {
                actionInProgress = false;
                return;
            }

            // Ask about previous episodes
            if (!isSpecial && seasonNum !== 0) {
                actionInProgress = false;
                const applyPrev = await showConfirm(
                    'Apply to Previous?',
                    'Apply the same unmark action to all previous episodes in this season?',
                    'Yes, all previous',
                    'Just this one'
                );
                actionInProgress = true;

                if (applyPrev === 'yes') {
                    const prevEps = [];
                    for (const s of item.seasons) {
                        if (s.number === 0 || s.number > seasonNum) continue;
                        for (const e of (s.episodes || [])) {
                            if (e.is_special || isPlaceholderEpisode(e)) continue;
                            if (s.number === seasonNum && e.number >= episodeNum) break;
                            if (e.is_watched) prevEps.push(e);
                        }
                    }
                    prevEps.forEach(e => {
                        if (unmarkChoice === 'remove-last-rewatch') {
                            if ((e.rewatch_count || 0) > 0) { e.rewatch_count--; if (e.rewatch_history?.length) e.rewatch_history.pop(); }
                        } else if (unmarkChoice === 'remove-first-watch') {
                            e.is_watched = false; e.watched_at = null;
                        } else if (unmarkChoice === 'remove-everything') {
                            e.is_watched = false; e.watched_at = null; e.rewatch_count = 0; e.rewatch_history = [];
                        }
                    });
                }
            }

        } else {
            actionInProgress = false;
            return;
        }

    } else {
        if (!isSpecial && seasonNum !== 0) {
            const prev = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);
            if (prev.length > 0) {
                actionInProgress = false;
                const a = await showMarkPreviousConfirm(prev.length);
                actionInProgress = true;
                if (a === 'cancel') { actionInProgress = false; return; }

                if (a === 'yes') {
                    const allEps = [];
                    prev.forEach(({ seasonNum: sN, episodeNum: eN }) => {
                        const s = item.seasons.find(s => s.number === sN);
                        const e = s?.episodes.find(e => e.number === eN && !e.is_special);
                        if (e) allEps.push(e);
                    });
                    allEps.push(ep);

                    actionInProgress = false;
                    const dateChoice = await promptSeasonWatchDate(allEps, item.is_anime);
                    actionInProgress = true;
                    if (dateChoice.type === 'cancel') { actionInProgress = false; return; }

                    allEps.forEach(e => { e.is_watched = true; });
                    applyWatchDateChoice(allEps, dateChoice, item.is_anime);

                } else if (a === 'no') {
                    ep.is_watched = true;
                    ep.watched_at = new Date().toISOString();
                }
            } else {
                ep.is_watched = true;
                ep.watched_at = new Date().toISOString();
            }
        } else {
            ep.is_watched = true;
            ep.watched_at = new Date().toISOString();
        }
    }

    try {
        showSaveToast('Saving...');
        await syncMarkToOtherStructure(item, getEpisodeSource());
        await saveDualSeasons(item);
        showSaveToast('Saved ✓');

        const body = document.getElementById('modal-body');
        if (body && document.getElementById('modal').style.display !== 'none') {
            await openTVDetails(item, body, docId.replace(/'/g, "\\'"));
        }
        const section = item.is_anime ? 'anime' : 'tv';
        renderContinueWatching(section);
        renderHistory(section);
        updateNavBadges();
        // G21: Update collections if status changed
        renderCollections();
    } catch (e) {
        logError('Toggle episode', e, { show: item.title, docId, seasonNum, episodeNum });
        showSaveToast('Save failed', true);
    }

    actionInProgress = false;
}

// ===== MARK SEASON =====
async function markSeasonWatched(docId, seasonNum) {
    if (actionInProgress) return; // G1
    actionInProgress = true;

    const item = myList.find(i => i.docId === docId);
    if (!item) { actionInProgress = false; return; }
    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) { actionInProgress = false; return; }

    const today = new Date(); today.setHours(23, 59, 59, 999);
    const regularEps = (season.episodes || []).filter(ep => {
        if (ep.is_special || isPlaceholderEpisode(ep)) return false;
        const air = ep.air_date ? new Date(ep.air_date) : null;
        if (air && air > today) return false;
        return true;
    });

    if (regularEps.length === 0) { actionInProgress = false; return; }
    const allWatched = regularEps.every(e => e.is_watched);
    activeDetailTab = 'episodes-tab';

    if (allWatched) {
        const hasRewatches = regularEps.some(ep => (ep.rewatch_count || 0) > 0);
        actionInProgress = false;
        const a = hasRewatches
            ? await showRewatchSeasonConfirm()
            : await showConfirm('All Watched', 'What to do?', '↺ Rewatch All', '✗ Unmark All');
        actionInProgress = true;

        if (a === 'cancel') { actionInProgress = false; return; }

        if (a === 'yes' || a === 'rewatch') {
            actionInProgress = false;
            const dateChoice = await promptSeasonWatchDate(regularEps, item.is_anime);
            actionInProgress = true;
            if (dateChoice.type === 'cancel') { actionInProgress = false; return; }
            const rewatchEps = [...regularEps];
            rewatchEps.forEach(ep => { ep.rewatch_count = (ep.rewatch_count || 0) + 1; if (!ep.rewatch_history) ep.rewatch_history = []; });
            applyWatchDateChoice(rewatchEps, dateChoice, item.is_anime, true);
            rewatchEps.forEach(ep => {
                ep.rewatch_history.push(ep._rewatch_date || new Date().toISOString());
                delete ep._rewatch_date;
            });

        } else if (a === 'no' || a === 'unmark') {
            regularEps.forEach(ep => { ep.is_watched = false; ep.watched_at = null; });

        } else if (a === 'undo-rewatch') {
            regularEps.forEach(ep => {
                if ((ep.rewatch_count || 0) > 0) {
                    ep.rewatch_count--;
                    if (ep.rewatch_history?.length) ep.rewatch_history.pop();
                    ep.watched_at = ep.rewatch_history?.length
                        ? ep.rewatch_history[ep.rewatch_history.length - 1]
                        : ep.watched_at;
                }
            });
        }

    } else {
        const unwatchedEps = regularEps.filter(ep => !ep.is_watched);

        actionInProgress = false;
        const confirm = await showConfirm(
            'Mark Season Watched?',
            `Mark all ${unwatchedEps.length} unwatched episode${unwatchedEps.length !== 1 ? 's' : ''} in Season ${seasonNum} as watched?`,
            'Yes', 'Cancel'
        );
        actionInProgress = true;
        if (confirm !== 'yes') { actionInProgress = false; return; }

        const prevUnwatchedSeasons = item.seasons.filter(s =>
            s.number !== 0 && s.number < seasonNum &&
            s.episodes?.some(e => !e.is_watched && !e.is_special && !isPlaceholderEpisode(e))
        );

        let markPrevious = false;
        if (prevUnwatchedSeasons.length > 0) {
            const prevCount = prevUnwatchedSeasons.reduce((sum, s) =>
                sum + s.episodes.filter(e => !e.is_watched && !e.is_special && !isPlaceholderEpisode(e)).length, 0);
            actionInProgress = false;
            const prevAnswer = await showConfirm('Previous Seasons?', `${prevCount} unwatched episode(s) in earlier seasons. Mark those too?`, 'Yes, all', 'Just this season');
            actionInProgress = true;
            if (prevAnswer === 'cancel') { actionInProgress = false; return; }
            markPrevious = prevAnswer === 'yes';
        }

        const allToMark = [];
        if (markPrevious) {
            prevUnwatchedSeasons.forEach(s => {
                s.episodes.filter(e => !e.is_watched && !e.is_special && !isPlaceholderEpisode(e)).forEach(e => allToMark.push(e));
            });
        }
        unwatchedEps.forEach(e => allToMark.push(e));

        actionInProgress = false;
        const dateChoice = await promptSeasonWatchDate(allToMark, item.is_anime);
        actionInProgress = true;
        if (dateChoice.type === 'cancel') { actionInProgress = false; return; }

        allToMark.forEach(ep => { ep.is_watched = true; });
        applyWatchDateChoice(allToMark, dateChoice, item.is_anime);
    }

    try {
        showSaveToast('Saving...');
        await syncMarkToOtherStructure(item, getEpisodeSource());
        await saveDualSeasons(item);
        showSaveToast('Saved ✓');
        const body = document.getElementById('modal-body');
        if (body && document.getElementById('modal').style.display !== 'none') {
            await openTVDetails(item, body, docId.replace(/'/g, "\\'"));
        }
        const section = item.is_anime ? 'anime' : 'tv';
        renderContinueWatching(section);
        renderHistory(section);
        updateNavBadges();
        renderCollections(); // G21
    } catch (e) {
        logError('Mark season', e, { show: item.title, docId, seasonNum });
        showSaveToast('Save failed', true);
    }

    actionInProgress = false;
}

// ===== TOGGLE FAVORITE / WATCHED / STATUS =====
async function toggleFavorite(docId, type) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    item.is_favorite = !item.is_favorite;
    try {
        showSaveToast('Saving...');
        await updateDoc(doc(db, type === 'movie' ? 'movies' : 'series', docId), { is_favorite: item.is_favorite });
        showSaveToast('Saved ✓');
        await loadMyList();
        openDetails(docId, type);
    } catch (e) { logError('Favorite', e, { show: item.title, docId }); showSaveToast('Save failed', true); }
}

async function toggleWatched(docId, type) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    if (item.is_watched) {
        const a = await showConfirm('Already Watched', 'What to do?', '↺ Rewatch', '✗ Unmark');
        if (a === 'yes') {
            item.rewatch_count = (item.rewatch_count || 0) + 1;
            if (!item.rewatch_history) item.rewatch_history = [];
            item.rewatch_history.push(new Date().toISOString());
            item.watched_at = new Date().toISOString();
        } else if (a === 'no') {
            item.is_watched = false; item.watched_at = null;
        } else return;
    } else {
        item.is_watched = true; item.watched_at = new Date().toISOString();
    }
    try {
        showSaveToast('Saving...');
        await updateDoc(doc(db, 'movies', docId), { is_watched: item.is_watched, watched_at: item.watched_at, rewatch_count: item.rewatch_count || 0, rewatch_history: item.rewatch_history || [] });
        showSaveToast('Saved ✓');
        await loadMyList();
        openDetails(docId, type);
    } catch (e) { logError('Watched', e, { show: item.title, docId }); showSaveToast('Save failed', true); }
}

async function setUserStatus(docId, status) {
    try {
        showSaveToast('Saving...');
        await updateDoc(doc(db, 'series', docId), { user_status: status });
        const item = myList.find(i => i.docId === docId);
        if (item) item.user_status = status;
        if (['Finished', 'Dropped', 'Planned'].includes(status)) lastScrolledEpisode.delete(docId);
        showSaveToast('Saved ✓');
        await loadMyList();
        openDetails(docId, 'tv');
        renderCollections(); // G21
    } catch (e) { logError('Status', e, { docId }); showSaveToast('Save failed', true); }
}

async function toggleAnimeStatus(docId) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    try {
        await updateDoc(doc(db, 'series', docId), { is_anime: !item.is_anime });
        item.is_anime = !item.is_anime;
        await loadMyList();
        openDetails(docId, 'tv');
    } catch (e) { logError('Anime toggle', e, { show: item.title, docId }); }
}

// ===== ADD TO LIST — G14: TVMaze ID in docId, save all IDs =====
async function addToList(tmdbId, type, title, year, poster, extraIds = {}) {
    try {
        const col = type === 'movie' ? 'movies' : 'series';
        // G14: For TV shows, prefer TVMaze-based docId if we have it
        const tvmazeId = extraIds.tvmaze_id || null;
        const docId = type === 'tv' && tvmazeId
            ? `tv_tmaze_${tvmazeId}`
            : `${type}_${tmdbId}`;

        let data = {
            tmdb_id: tmdbId,
            title, year, poster,
            is_favorite: false,
            hide_from_list: false,
            created_at: new Date().toISOString()
        };

        if (type === 'tv') {
            const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
            data.user_status = 'Planned';
            data.tmdb_status = det.status || 'Unknown';
            data.last_status_check = new Date().toISOString();
            data.last_synced = new Date().toISOString();
            data.is_anime = isAnimeShow(det);
            data.tmdb_rating = det.vote_average || null;
            data.genres = (det.genres || []).map(g => g.name);
            data.original_language = det.original_language || null;
            data.networks = (det.networks || []).map(n => n.name);
            data.origin_country = det.origin_country || [];
            data.popularity = det.popularity || null;
            data.my_rating = null;
            data.force_tmdb_source = false;
            data.year = det.first_air_date ? parseInt(det.first_air_date.substring(0, 4)) : null;
            // Save all IDs
            data.tvmaze_id = extraIds.tvmaze_id || null;
            data.tvdb_id = extraIds.tvdb_id || null;
            data.id_confidence = extraIds.tvmaze_id ? 'verified' : 'unverified';
            data.seasons = [];
            data.seasons_tmdb = null;
            data.seasons_tvmaze = null;
            data.episode_map = [];

            // Fetch TMDB seasons
            const tmdbSeasons = [];
            for (let i = 0; i <= det.number_of_seasons; i++) {
                try {
                    const sd = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${i}?api_key=${TMDB_API_KEY}`);
                    if (!sd.episodes?.length) continue;
                    const tmdbEpMap = {};
                    sd.episodes.forEach(ep => { tmdbEpMap[ep.episode_number] = ep.name; });
                    const episodes = sd.episodes.map(ep => ({
                        number: ep.episode_number, name: ep.name || `Episode ${ep.episode_number}`,
                        air_date: ep.air_date || null, is_watched: false, watched_at: null,
                        rewatch_count: 0, rewatch_history: [], is_special: i === 0,
                        my_rating: null, note: null
                    }));
                    const fixed = i === 0 ? episodes : detectImposters(episodes, tmdbEpMap, null);
                    tmdbSeasons.push({ number: i, is_specials: i === 0, episodes: fixed });
                } catch (e) { logError('Add season', e, { show: title, seasonNum: i }); }
            }

            data.seasons_tmdb = tmdbSeasons;
            data.seasons = tmdbSeasons;

            // Fetch TVMaze in background
            setTimeout(async () => {
                const show = myList.find(i => i.docId === docId);
                if (!show) return;
                try {
                    const tvShow = await tvmazeGetShow(show);
                    if (tvShow) {
                        const updateData = { tvmaze_id: tvShow.id, id_confidence: 'verified' };
                        if (tvShow.externals?.thetvdb) { updateData.tvdb_id = tvShow.externals.thetvdb; show.tvdb_id = tvShow.externals.thetvdb; }
                        show.tvmaze_id = tvShow.id;

                        const tvmazeGrouped = await fetchTVMazeEpisodes(show);
                        if (tvmazeGrouped) {
                            const epMap = buildEpisodeMap(show.seasons_tmdb, tvmazeGrouped);
                            const tvmazeSeasons = buildTVMazeSeasonsWithWatchData(tvmazeGrouped, show.seasons_tmdb, epMap);
                            updateData.seasons_tvmaze = tvmazeSeasons;
                            updateData.episode_map = epMap;
                            show.seasons_tvmaze = tvmazeSeasons;
                            show.episode_map = epMap;
                            if (getEpisodeSource() === 'tvmaze') {
                                updateData.seasons = tvmazeSeasons;
                                show.seasons = tvmazeSeasons;
                            }
                        }

                        await updateDoc(doc(db, 'series', docId), updateData);
                        await fetchAirTimeData(show);
                        renderAllSections();
                    }
                } catch (e) { logError('Fetch TVMaze on add', e, { show: title, docId }); }
            }, 2000);

        } else {
            const det = await tmdbFetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
            data.is_watched = false; data.watched_at = null;
            data.tmdb_rating = det.vote_average || null;
            data.rewatch_count = 0; data.rewatch_history = [];
            data.genres = (det.genres || []).map(g => g.name);
            data.original_language = det.original_language || null;
            data.networks = (det.production_companies || []).map(n => n.name);
            data.origin_country = (det.production_countries || []).map(c => c.iso_3166_1);
            data.popularity = det.popularity || null;
            data.my_rating = null;
            data.year = det.release_date ? parseInt(det.release_date.substring(0, 4)) : null;
        }

        await setDoc(doc(db, col, docId), data);
        await loadMyList();
    } catch (e) { logError('Add to list', e, { show: title }); alert('Error adding to library.'); }
}

async function removeFromList(docId, type) {
    const a = await showConfirm('Remove?', 'Remove from library?', 'Remove', 'Cancel');
    if (a !== 'yes') return;
    try {
        await deleteDoc(doc(db, type === 'movie' ? 'movies' : 'series', docId));
        lastScrolledEpisode.delete(docId);
        await loadMyList();
        closeModal('modal');
    } catch (e) { logError('Remove', e, { docId }); }
}

async function removeFromListByTMDB(tmdbId, type) {
    await removeFromList(`${type}_${tmdbId}`, type);
}
// ===== FIX SHOW DATA MODAL — A3/A4: use IDs not title =====
let fixShowSelection = null;

function openFixShowModal(docId) {
    document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
    const item = myList.find(i => i.docId === docId); if (!item) return;
    let modal = document.getElementById('fix-show-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fix-show-modal';
        modal.className = 'modal';
        modal.style.cssText = 'z-index:3500;';
        modal.innerHTML = `<div class="modal-content" style="max-width:700px;"><span class="close" onclick="closeModal('fix-show-modal')">&times;</span><div id="fix-show-body"></div></div>`;
        document.body.appendChild(modal);
        if (!MODAL_IDS.includes('fix-show-modal')) MODAL_IDS.push('fix-show-modal');
        modal.addEventListener('click', e => { if (e.target === modal) closeModal('fix-show-modal'); });
    }

    document.getElementById('fix-show-body').innerHTML = `
        <h3 style="color:var(--accent);margin-bottom:8px;">🔗 Fix Show Data</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:16px;">Current: <strong>${item.title}</strong>${item.year ? ` (${item.year})` : ''}</p>
        <div class="fix-show-search-bar">
            <input type="text" id="fix-show-search-input" value="${item.title}" placeholder="Search...">
            <button onclick="runFixShowSearch('${docId}')">🔍 Search</button>
        </div>
        <div id="fix-show-results-container"></div>
        <div id="fix-show-selected" style="display:none;margin-top:16px;padding:12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">
            <div id="fix-show-selected-info"></div>
            <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
                <button onclick="applyFixShowData('${docId}')" style="padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">✓ Apply Changes</button>
                <button onclick="document.getElementById('fix-show-selected').style.display='none'" style="padding:10px 20px;border:2px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;cursor:pointer;">Cancel</button>
            </div>
        </div>`;
    setTimeout(() => runFixShowSearch(docId), 100);
    openModal('fix-show-modal');
}

async function runFixShowSearch(docId) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    const query = document.getElementById('fix-show-search-input')?.value?.trim(); if (!query) return;
    const container = document.getElementById('fix-show-results-container');
    container.innerHTML = '<p class="empty-state">Searching...</p>';
    fixShowSelection = null;
    document.getElementById('fix-show-selected').style.display = 'none';

    const isMovie = item.type === 'movie';
    const results = [];

    if (!isMovie) {
        try {
            const data = await tvmazeFetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(query)}`);
            if (data && data.length) {
                data.slice(0, 12).forEach(r => {
                    const s = r.show;
                    results.push({
                        id: s.id, type: 'tvmaze',
                        title: s.name,
                        year: s.premiered ? s.premiered.substring(0, 4) : '',
                        poster: tvmazePoster(s) || PLACEHOLDER_POSTER,
                        network: s.network?.name || s.webChannel?.name || '',
                        tvdb_id: s.externals?.thetvdb || null,
                        tmdb_id: s.externals?.themoviedb || null,
                        tvmaze_id: s.id
                    });
                });
            }
        } catch (e) { logError('Fix show TVMaze', e); }
    }

    try {
        const endpoint = isMovie ? 'movie' : 'tv';
        const data = await tmdbFetch(`${TMDB_BASE_URL}/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
        (data.results || []).slice(0, 12).forEach(r => {
            results.push({
                id: r.id, type: 'tmdb',
                title: r.title || r.name,
                year: (r.release_date || r.first_air_date || '').substring(0, 4),
                poster: r.poster_path ? TMDB_IMG_BASE + r.poster_path : PLACEHOLDER_POSTER,
                network: '', tmdb_id: r.id, tvdb_id: null, tvmaze_id: null
            });
        });
    } catch (e) { logError('Fix show TMDB', e); }

    if (!results.length) { container.innerHTML = '<p class="empty-state">No results found.</p>'; return; }

    container.innerHTML = `<div class="fix-show-results">${results.map((r, idx) => `
        <div class="fix-show-result-card" onclick="selectFixShowResult(${idx},'${docId}')" data-idx="${idx}">
            <img src="${r.poster}" onerror="this.src='${PLACEHOLDER_POSTER}'">
            <div class="fix-show-result-info">
                <div class="fix-show-result-title">${r.title}</div>
                <div class="fix-show-result-meta">${r.year}${r.network ? ' · ' + r.network : ''}</div>
                <div class="fix-show-result-meta" style="color:var(--accent);font-size:9px;">${r.type.toUpperCase()}${r.tvmaze_id ? ` · TVMaze:${r.tvmaze_id}` : ''}${r.tmdb_id ? ` · TMDB:${r.tmdb_id}` : ''}</div>
            </div>
        </div>`).join('')}</div>`;
    container.dataset.results = JSON.stringify(results);
}

function selectFixShowResult(idx, docId) {
    const container = document.getElementById('fix-show-results-container');
    const results = JSON.parse(container.dataset.results || '[]');
    const result = results[idx]; if (!result) return;
    fixShowSelection = result;
    container.querySelectorAll('.fix-show-result-card').forEach(c => c.classList.remove('selected'));
    container.querySelector(`[data-idx="${idx}"]`)?.classList.add('selected');
    const selectedDiv = document.getElementById('fix-show-selected');
    document.getElementById('fix-show-selected-info').innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;">
            <img src="${result.poster}" style="width:50px;height:75px;object-fit:cover;border-radius:6px;" onerror="this.src='${PLACEHOLDER_POSTER}'">
            <div>
                <div style="font-size:15px;font-weight:700;color:var(--text);">${result.title}${result.year ? ` (${result.year})` : ''}</div>
                <div style="font-size:12px;color:var(--text3);">Source: ${result.type.toUpperCase()} · TVMaze: ${result.tvmaze_id || '—'} · TMDB: ${result.tmdb_id || '—'} · TVDB: ${result.tvdb_id || '—'}</div>
            </div>
        </div>
        <p style="font-size:12px;color:var(--text3);margin-top:8px;">Poster, synopsis, genres, networks, and IDs will be updated. Watch history preserved by episode number.</p>`;
    selectedDiv.style.display = 'block';
}

async function applyFixShowData(docId) {
    if (!fixShowSelection) { alert('No show selected.'); return; }
    const item = myList.find(i => i.docId === docId); if (!item) return;
    const sel = fixShowSelection;
    const confirmMsg = `Re-link "${item.title}" to "${sel.title}${sel.year ? ` (${sel.year})` : ''}"?\n\nChanges: poster, synopsis, genres, networks, IDs\nWatch history: preserved by episode number`;
    const confirm = await showConfirm('Confirm Re-link', confirmMsg, 'Yes, Re-link', 'Cancel');
    if (confirm !== 'yes') return;

    try {
        let updateData = {};

        if (item.type === 'movie') {
            const det = await tmdbFetch(`${TMDB_BASE_URL}/movie/${sel.tmdb_id}?api_key=${TMDB_API_KEY}`);
            updateData = {
                tmdb_id: sel.tmdb_id,
                poster: det.poster_path ? TMDB_IMG_BASE + det.poster_path : item.poster,
                title: det.title || sel.title,
                year: det.release_date ? parseInt(det.release_date.substring(0, 4)) : item.year,
                genres: (det.genres || []).map(g => g.name),
                original_language: det.original_language || null,
                networks: (det.production_companies || []).map(n => n.name),
                origin_country: (det.production_countries || []).map(c => c.iso_3166_1),
                popularity: det.popularity || null,
                tmdb_rating: det.vote_average || null
            };
        } else {
            // A3/A4: Save all IDs properly — never undefined
            const newTmdbId = sel.tmdb_id || item.tmdb_id || null;
            const newTvmazeId = sel.tvmaze_id || item.tvmaze_id || null;
            const newTvdbId = sel.tvdb_id || item.tvdb_id || null;

            let newTmdbSeasons = item.seasons_tmdb;
            if (newTmdbId) {
                const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${newTmdbId}?api_key=${TMDB_API_KEY}`);
                updateData.poster = det.poster_path ? TMDB_IMG_BASE + det.poster_path : item.poster;
                updateData.genres = (det.genres || []).map(g => g.name);
                updateData.networks = (det.networks || []).map(n => n.name);
                updateData.tmdb_status = det.status || item.tmdb_status;
                updateData.year = det.first_air_date ? parseInt(det.first_air_date.substring(0, 4)) : item.year;
                updateData.tmdb_rating = det.vote_average || item.tmdb_rating;

                // D1: Snapshot watch data before rebuild
                const watchSnap = snapshotWatchData(item.seasons);
                newTmdbSeasons = await syncShowWithTMDB({ ...item, tmdb_id: newTmdbId }, det, watchSnap) || item.seasons_tmdb;
            }

            let newTvmazeSeasons = item.seasons_tvmaze;
            let newEpMap = item.episode_map || [];

            if (newTvmazeId) {
                const tvmazeGrouped = await fetchTVMazeEpisodes({ ...item, tvmaze_id: newTvmazeId, tvdb_id: newTvdbId });
                if (tvmazeGrouped && newTmdbSeasons) {
                    newEpMap = buildEpisodeMap(newTmdbSeasons, tvmazeGrouped);
                    newTvmazeSeasons = buildTVMazeSeasonsWithWatchData(tvmazeGrouped, newTmdbSeasons, newEpMap);
                    // Restore watch data
                    const watchSnap = snapshotWatchData(item.seasons);
                    restoreWatchData(newTvmazeSeasons, watchSnap);
                }
            }

            // A4: Never save undefined — use null as fallback
            updateData.tmdb_id = newTmdbId;
            updateData.tvmaze_id = newTvmazeId;
            updateData.tvdb_id = newTvdbId;
            updateData.id_confidence = 'verified';
            updateData.seasons_tmdb = newTmdbSeasons || null;
            updateData.seasons_tvmaze = newTvmazeSeasons || null;
            updateData.episode_map = newEpMap;

            const source = getEpisodeSource();
            if (source === 'tvmaze' && newTvmazeSeasons?.length) updateData.seasons = newTvmazeSeasons;
            else if (newTmdbSeasons?.length) updateData.seasons = newTmdbSeasons;
            updateData.last_synced = new Date().toISOString();
        }

        // A4: Final safety — remove any undefined values
        Object.keys(updateData).forEach(k => { if (updateData[k] === undefined) updateData[k] = null; });

        await updateDoc(doc(db, item.type === 'movie' ? 'movies' : 'series', docId), updateData);
        Object.assign(item, updateData);
        closeModal('fix-show-modal');
        await loadMyList();
        openDetails(docId, item.type);
    } catch (e) {
        logError('Apply fix show', e, { show: item.title, docId });
        alert('Error applying changes.');
    }
}

// ===== TAG SPECIALS MODAL =====
function openTagSpecialsModal(docId) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
    let modal = document.getElementById('tag-specials-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'tag-specials-modal'; modal.className = 'modal'; modal.style.cssText = 'z-index:3000;';
        modal.innerHTML = `<div class="modal-content" style="max-width:620px;"><span class="close" onclick="closeModal('tag-specials-modal')">&times;</span><div id="tag-specials-body"></div></div>`;
        document.body.appendChild(modal);
        if (!MODAL_IDS.includes('tag-specials-modal')) MODAL_IDS.push('tag-specials-modal');
        modal.addEventListener('click', e => { if (e.target === modal) closeModal('tag-specials-modal'); });
    }
    const seasonOptions = (item.seasons || []).sort((a, b) => a.number - b.number).map(s => `<option value="${s.number}">${s.number === 0 ? 'Specials (S00)' : `Season ${s.number}`}</option>`).join('');
    document.getElementById('tag-specials-body').innerHTML = `
        <h3 style="color:var(--accent);margin-bottom:12px;">🎭 Tag as Special</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:12px;">Check episodes that are specials/OVAs.</p>
        <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <label style="font-size:13px;color:var(--text2);">Filter:</label>
            <select id="tag-season-filter" onchange="filterTagSpecials('${docId}')" style="padding:6px 10px;border:2px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;">
                <option value="all">All Seasons</option>${seasonOptions}
            </select>
        </div>
        <div id="tag-specials-list" style="max-height:420px;overflow-y:auto;">${buildTagSpecialsList(item, 'all')}</div>
        <div style="margin-top:15px;display:flex;gap:10px;justify-content:flex-end;">
            <button onclick="closeModal('tag-specials-modal')" style="padding:10px 20px;border:2px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;cursor:pointer;">Cancel</button>
            <button onclick="applySpecialTags('${docId}')" style="padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Save</button>
        </div>`;
    openModal('tag-specials-modal');
}

function buildTagSpecialsList(item, filterSeason) {
    let rows = '';
    (item.seasons || []).forEach(s => {
        if (filterSeason !== 'all' && s.number !== parseInt(filterSeason)) return;
        (s.episodes || []).forEach(ep => {
            const isSpecial = ep.is_special || s.number === 0;
            const label = s.number === 0
                ? `S00 · ${ep.name || 'Special'}`
                : `S${String(s.number).padStart(2, '0')}E${String(ep.number).padStart(2, '0')} · ${ep.name || 'Episode ' + ep.number}`;
            rows += `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--border);">
                <input type="checkbox" class="tag-special-cb" ${isSpecial ? 'checked' : ''} data-season="${s.number}" data-ep="${ep.number}" data-name="${(ep.name || '').replace(/"/g, '&quot;')}">
                <label style="font-size:13px;color:var(--text);cursor:pointer;flex:1;">${label}${isSpecial ? '<span style="background:#FF6B35;color:white;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:6px;">SPECIAL</span>' : ''}</label>
            </div>`;
        });
    });
    return rows || '<p class="empty-state">No episodes found.</p>';
}

function filterTagSpecials(docId) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    const filter = document.getElementById('tag-season-filter')?.value || 'all';
    const listEl = document.getElementById('tag-specials-list');
    if (listEl) listEl.innerHTML = buildTagSpecialsList(item, filter);
}

async function applySpecialTags(docId) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    document.querySelectorAll('.tag-special-cb').forEach(cb => {
        const sNum = parseInt(cb.dataset.season), epNum = parseInt(cb.dataset.ep), name = cb.dataset.name || '';
        const season = item.seasons.find(s => s.number === sNum); if (!season) return;
        const ep = season.episodes.find(e => e.number === epNum && (name ? titlesMatch(e.name || '', name) : true)) || season.episodes.find(e => e.number === epNum);
        if (ep) ep.is_special = cb.checked;
    });
    try {
        await syncMarkToOtherStructure(item, getEpisodeSource());
        await saveDualSeasons(item);
        closeModal('tag-specials-modal');
        await loadMyList();
        openDetails(docId, 'tv', activeDetailTab);
    } catch (e) { logError('Special tags', e, { show: item.title, docId }); }
}

// ===== RATE LIBRARY MODAL — G25: non-blocking save =====
function openRateShowsModal() {
    let modal = document.getElementById('rate-shows-modal');
    if (!modal) {
        modal = document.createElement('div'); modal.id = 'rate-shows-modal'; modal.className = 'modal'; modal.style.cssText = 'z-index:3000;';
        modal.innerHTML = `<div class="modal-content" style="max-width:700px;"><span class="close" onclick="closeModal('rate-shows-modal')">&times;</span><div id="rate-shows-body"></div></div>`;
        document.body.appendChild(modal);
        if (!MODAL_IDS.includes('rate-shows-modal')) MODAL_IDS.push('rate-shows-modal');
        modal.addEventListener('click', e => { if (e.target === modal) closeModal('rate-shows-modal'); });
    }
    const all = [...getAnime(), ...getTVShows(), ...getMovies()];
    document.getElementById('rate-shows-body').innerHTML = `
        <h3 style="color:var(--accent);margin-bottom:8px;">⭐ Rate Library</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:12px;">Tap a number to rate. Improves recommendations.</p>
        <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <select id="rate-type-filter" onchange="filterRateList()" style="padding:6px 10px;border:2px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;">
                <option value="all">All</option><option value="anime">Anime</option><option value="tv">TV</option><option value="movie">Movies</option>
            </select>
            <select id="rate-status-filter" onchange="filterRateList()" style="padding:6px 10px;border:2px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;">
                <option value="all">All</option><option value="watched">Watched</option><option value="unrated">Unrated only</option>
            </select>
            <span style="font-size:12px;color:var(--text3);">${all.filter(i => i.my_rating).length}/${all.length} rated</span>
        </div>
        <div id="rate-shows-list" style="max-height:480px;overflow-y:auto;">${buildRateShowsList(all, 'all', 'all')}</div>
        <div style="margin-top:12px;text-align:right;">
            <button onclick="closeModal('rate-shows-modal')" style="padding:10px 24px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Done</button>
        </div>`;
    openModal('rate-shows-modal');
}

function buildRateShowsList(items, typeFilter, statusFilter) {
    let filtered = items;
    if (typeFilter === 'anime') filtered = filtered.filter(i => i.type === 'tv' && i.is_anime);
    else if (typeFilter === 'tv') filtered = filtered.filter(i => i.type === 'tv' && !i.is_anime);
    else if (typeFilter === 'movie') filtered = filtered.filter(i => i.type === 'movie');
    if (statusFilter === 'watched') filtered = filtered.filter(i => i.is_watched || ['Finished', 'Up to Date', 'Watching', 'Rewatching'].includes(i.user_status));
    else if (statusFilter === 'unrated') filtered = filtered.filter(i => !i.my_rating);
    if (!filtered.length) return '<p class="empty-state">No shows found.</p>';
    return filtered.map(item => {
        const poster = safePoster(item.poster, 'thumb'), current = item.my_rating || 0;
        const col = item.type === 'movie' ? 'movies' : 'series', sd = item.docId.replace(/'/g, "\\'");
        const safeId = item.docId.replace(/[^a-zA-Z0-9]/g, '_');
        return `<div class="rate-show-item">
            <img src="${poster}" onerror="this.src='${PLACEHOLDER_THUMB}'">
            <div class="rate-show-info">
                <div class="rate-show-title">${item.title}</div>
                <div class="rate-show-meta">${item.is_anime ? 'Anime' : item.type === 'movie' ? 'Movie' : 'TV'} · ${item.user_status || (item.is_watched ? 'Watched' : '—')}</div>
            </div>
            <div class="rate-show-buttons" id="rate-btns-${safeId}">
                ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button onclick="rateShowInline('${sd}','${col}',${n})" class="rate-num-btn ${n <= current ? 'active' : ''}" data-num="${n}">${n}</button>`).join('')}
                ${current ? `<button onclick="rateShowInline('${sd}','${col}',0)" class="rate-clear-btn" title="Clear">✕</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

function filterRateList() {
    const t = document.getElementById('rate-type-filter')?.value || 'all';
    const s = document.getElementById('rate-status-filter')?.value || 'all';
    const all = [...getAnime(), ...getTVShows(), ...getMovies()];
    const el = document.getElementById('rate-shows-list');
    if (el) el.innerHTML = buildRateShowsList(all, t, s);
}

// G25: Non-blocking save — UI updates instantly, Firebase saves in background
async function rateShowInline(docId, col, rating) {
    const item = myList.find(i => i.docId === docId); if (!item) return;
    item.my_rating = rating || null;

    // Update UI immediately without waiting for Firebase
    const safeId = docId.replace(/[^a-zA-Z0-9]/g, '_');
    const container = document.getElementById(`rate-btns-${safeId}`);
    if (container) {
        const current = rating || 0, sd = docId.replace(/'/g, "\\'");
        container.innerHTML = `${[1,2,3,4,5,6,7,8,9,10].map(n => `<button onclick="rateShowInline('${sd}','${col}',${n})" class="rate-num-btn ${n <= current ? 'active' : ''}" data-num="${n}">${n}</button>`).join('')}${current ? `<button onclick="rateShowInline('${sd}','${col}',0)" class="rate-clear-btn" title="Clear">✕</button>` : ''}`;
    }

    // Save to Firebase in background — no await, no blocking
    updateDoc(doc(db, col, docId), { my_rating: rating || null }).catch(e => {
        logError('Rate inline', e, { show: item.title, docId });
        showSaveToast('Rating save failed', true);
    });
}

// ===== STATS =====
function openStatsPage(section) {
    const body = document.getElementById('stats-modal-body');
    body.innerHTML = `<h2 style="margin-bottom:15px;color:var(--accent);">📊 Statistics</h2>
        <div class="stats-tabs">
            <button class="stats-tab-btn ${section === 'anime' ? 'active' : ''}" onclick="renderStats('anime')">🎌 Anime</button>
            <button class="stats-tab-btn ${section === 'tv' ? 'active' : ''}" onclick="renderStats('tv')">📺 TV</button>
            <button class="stats-tab-btn ${section === 'movies' ? 'active' : ''}" onclick="renderStats('movies')">🎬 Movies</button>
        </div>
        <div id="stats-body"></div>`;
    openModal('stats-modal');
    renderStats(section);
}

function renderStats(section) {
    document.querySelectorAll('.stats-tab-btn').forEach(b => {
        b.classList.remove('active');
        if ((section === 'anime' && b.textContent.includes('Anime')) ||
            (section === 'tv' && b.textContent.includes('TV')) ||
            (section === 'movies' && b.textContent.includes('Movies'))) b.classList.add('active');
    });
    const container = document.getElementById('stats-body'); if (!container) return;

    // Destroy existing charts
    ['stats-status-chart','stats-monthly-chart','stats-dow-chart','stats-genre-chart'].forEach(id => {
        if (activeCharts[id]) { activeCharts[id].destroy(); delete activeCharts[id]; }
    });

    if (section === 'movies') { renderMovieStats(container); return; }

    const items = section === 'anime' ? getAnime() : getTVShows();
    const epMin = section === 'anime' ? ANIME_EP_MINUTES : TV_EP_MINUTES;
    const excludeGenres = section === 'anime' ? new Set(['Animation']) : new Set();

    let totalEps = 0;
    const statusCounts = {}, monthCounts = {}, dayOfWeekCounts = [0,0,0,0,0,0,0];
    const hourCounts = new Array(24).fill(0), bingeData = {};
    const genreCounts = {}, networkCounts = {}, languageCounts = {}, decadeCounts = {};
    const showSpeeds = [], longestShows = [];
    let totalRating = 0, ratedCount = 0, totalRewatchEps = 0;
    const rewatchedShowsSet = new Set();
    let notesCount = 0, mostNotedShow = { title: '—', count: 0 };
    let within12Count = 0, totalWatched12 = 0;
    const showRewatchData = [];

    items.forEach(item => {
        statusCounts[item.user_status || 'Unknown'] = (statusCounts[item.user_status || 'Unknown'] || 0) + 1;
        (item.genres || []).forEach(g => { if (excludeGenres.has(g)) return; genreCounts[g] = (genreCounts[g] || 0) + 1; });
        (item.networks || []).slice(0, 1).forEach(n => { networkCounts[n] = (networkCounts[n] || 0) + 1; });
        if (item.original_language) languageCounts[languageCodeToName(item.original_language)] = (languageCounts[languageCodeToName(item.original_language)] || 0) + 1;
        const yr = item.year; if (yr && yr > 1900) decadeCounts[`${Math.floor(yr/10)*10}s`] = (decadeCounts[`${Math.floor(yr/10)*10}s`] || 0) + 1;
        if (item.tmdb_rating && item.tmdb_rating > 0) { totalRating += item.tmdb_rating; ratedCount++; }
        if (['Finished','Up to Date'].includes(item.user_status) && item.created_at) {
            const lastW = getLastWatchedDate(item);
            const days = Math.round((new Date(lastW) - new Date(item.created_at)) / 86400000);
            const aired = getAiredEpisodesOnly(item.seasons);
            if (days > 0 && days < 3650) { showSpeeds.push({ title: item.title, days, eps: aired.length }); longestShows.push({ title: item.title, days, eps: aired.length }); }
        }
        const aired = getAiredEpisodesOnly(item.seasons);
        const maxRew = Math.max(...aired.map(ep => ep.rewatch_count || 0), 0);
        if (maxRew > 0) {
            rewatchedShowsSet.add(item.docId);
            const rewatchedEps = aired.filter(ep => (ep.rewatch_count || 0) >= maxRew).length;
            const pct = aired.length > 0 ? Math.round((rewatchedEps / aired.length) * 100) : 0;
            showRewatchData.push({ title: item.title, cycles: maxRew, pct, rewatchedEps, totalEps: aired.length });
            totalRewatchEps += aired.reduce((s, ep) => s + (ep.rewatch_count || 0), 0);
        }
        let showNoteCount = 0;
        item.seasons?.forEach(s => { if (s.number === 0) return; s.episodes?.forEach(ep => {
            if (ep.is_special || isPlaceholderEpisode(ep)) return;
            if (ep.note && ep.note.trim()) { notesCount++; showNoteCount++; }
            if (!ep.is_watched || !ep.watched_at) return;
            totalEps++;
            const d = new Date(ep.watched_at);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            monthCounts[key] = (monthCounts[key] || 0) + 1;
            dayOfWeekCounts[d.getDay()]++;
            hourCounts[d.getHours()]++;
            bingeData[d.toISOString().split('T')[0]] = (bingeData[d.toISOString().split('T')[0]] || 0) + 1;
            if (ep.air_date) {
                totalWatched12++;
                const atd = item.air_time_data; let airHour = 0;
                if (atd && atd.source && atd.source !== 'default' && atd.time) airHour = getGhanaAirHour(atd.time, atd.timezone);
                const airDateTime = new Date(new Date(ep.air_date).getTime() + airHour * 3600000);
                if ((d - airDateTime) / 3600000 >= 0 && (d - airDateTime) / 3600000 <= 12) within12Count++;
            }
        }); });
        if (showNoteCount > mostNotedShow.count) mostNotedShow = { title: item.title, count: showNoteCount };
    });

    showRewatchData.sort((a, b) => b.pct - a.pct);
    const totalRewatchCycles = showRewatchData.reduce((s, d) => s + d.cycles, 0);
    const filteredBinge = Object.fromEntries(Object.entries(bingeData).filter(([,c]) => c <= 25));
    let longestStreak = 0, currentStreak = 0;
    Object.keys(filteredBinge).sort().forEach((day, i, arr) => {
        if (i === 0) currentStreak = 1;
        else currentStreak = (new Date(day) - new Date(arr[i-1])) / 86400000 === 1 ? currentStreak + 1 : 1;
        if (currentStreak > longestStreak) longestStreak = currentStreak;
    });
    const topBingeDays = Object.entries(filteredBinge).sort((a,b) => b[1]-a[1]).slice(0,5);
    showSpeeds.sort((a,b) => (b.eps/Math.max(b.days,1)) - (a.eps/Math.max(a.days,1)));
    longestShows.sort((a,b) => b.days - a.days);
    const monthKeys = Object.keys(monthCounts).sort();
    const avgPerMonth = monthKeys.length ? Math.round(totalEps / monthKeys.length) : 0;
    const avgPerWeek = Math.round(avgPerMonth / 4.3);
    const remaining = items.reduce((sum, item) => sum + getAiredEpisodesOnly(item.seasons).filter(ep => !ep.is_watched).length, 0);
    const twoMonthsAgo = new Date(Date.now() - 60 * 86400000);
    let recentEps = 0;
    items.forEach(item => { item.seasons?.forEach(s => { if (s.number === 0) return; s.episodes?.forEach(ep => { if (ep.is_watched && ep.watched_at && !ep.is_special && !isPlaceholderEpisode(ep) && new Date(ep.watched_at) >= twoMonthsAgo) recentEps++; }); }); });
    const recentPerWeek = Math.round(recentEps / 8);
    const weeksToFinish = recentPerWeek > 0 ? Math.ceil(remaining / recentPerWeek) : null;
    const finishDate = weeksToFinish ? new Date(Date.now() + weeksToFinish * 7 * 86400000).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
    const finishedCount = (statusCounts['Finished'] || 0) + (statusCounts['Up to Date'] || 0);
    const totalStarted = items.filter(i => i.user_status !== 'Planned').length;
    const dropRate = totalStarted > 0 ? Math.round(((statusCounts['Dropped'] || 0) / totalStarted) * 100) : 0;
    const completeRate = totalStarted > 0 ? Math.round((finishedCount / totalStarted) * 100) : 0;
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const peakPeriod = peakHour < 6 ? 'Late Night 🌙' : peakHour < 12 ? 'Morning ☀️' : peakHour < 17 ? 'Afternoon 🌤' : peakHour < 21 ? 'Evening 🌆' : 'Night 🌃';
    const peakDay = dayNames[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))];
    const weekendEps = dayOfWeekCounts[0] + dayOfWeekCounts[6];
    const weekdayEps = dayOfWeekCounts.slice(1,6).reduce((a,b) => a+b, 0);
    const watcherType = weekendEps > weekdayEps ? 'Weekend Watcher 📅' : 'Weekday Watcher 💼';
    const activeDays = Object.keys(filteredBinge).length;
    const avgBinge = activeDays > 0 ? (totalEps / activeDays).toFixed(1) : 0;
    const bingeType = avgBinge >= 5 ? 'Binge Watcher 🍿' : avgBinge >= 2 ? 'Casual Watcher 📺' : 'Light Watcher ☕';
    const seasonCounts = { Spring: 0, Summer: 0, Autumn: 0, Winter: 0 };
    Object.entries(monthCounts).forEach(([key, count]) => { const month = parseInt(key.split('-')[1]); if (month >= 3 && month <= 5) seasonCounts.Spring += count; else if (month >= 6 && month <= 8) seasonCounts.Summer += count; else if (month >= 9 && month <= 11) seasonCounts.Autumn += count; else seasonCounts.Winter += count; });
    const topSeason = Object.entries(seasonCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';
    const topGenres = Object.entries(genreCounts).sort((a,b) => b[1]-a[1]).slice(0,5);
    const topNetworks = Object.entries(networkCounts).sort((a,b) => b[1]-a[1]).slice(0,5);
    const topLanguages = Object.entries(languageCounts).sort((a,b) => b[1]-a[1]).slice(0,5);
    const topDecades = Object.entries(decadeCounts).sort((a,b) => a[0].localeCompare(b[0]));
    const avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : 'N/A';
    const topGenreShare = topGenres.length && items.length ? Math.round((topGenres[0][1] / items.length) * 100) : 0;
    const genreLoyalty = topGenreShare >= 60 ? 'Genre Loyalist 🎯' : topGenreShare >= 40 ? 'Genre Curious 🔍' : 'Genre Explorer 🌍';
    const completedWithPop = items.filter(i => ['Finished','Up to Date'].includes(i.user_status) && i.popularity && i.popularity > 0).sort((a,b) => a.popularity - b.popularity);
    const rarestWatch = completedWithPop[0]?.title || '—';
    const simultaneouslyWatching = items.filter(i => i.user_status === 'Watching' || (i.user_status === 'Up to Date' && isCurrentlyAiring(i))).length;
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const thisMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    const lastMonthKey = (() => { const d = new Date(thisMonthStart); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
    const thisMonthEps = monthCounts[thisMonthKey] || 0, lastMonthEps = monthCounts[lastMonthKey] || 0;
    const thisMonthCompleted = items.filter(i => ['Finished','Up to Date'].includes(i.user_status) && new Date(getLastWatchedDate(i)) >= thisMonthStart).length;
    const top10 = [...items].filter(i => i.my_rating).sort((a,b) => (b.my_rating||0)-(a.my_rating||0)).slice(0,10);
    const within12Pct = totalWatched12 > 0 ? Math.round((within12Count / totalWatched12) * 100) : 0;
    const dayOneShows = items.filter(item => {
        const aired = getAiredEpisodesOnly(item.seasons).filter(ep => ep.is_watched && ep.watched_at && ep.air_date);
        if (!aired.length) return false;
        const w12 = aired.filter(ep => { const atd = item.air_time_data; let airHour = 0; if (atd && atd.source && atd.source !== 'default' && atd.time) airHour = getGhanaAirHour(atd.time, atd.timezone); const airDateTime = new Date(new Date(ep.air_date).getTime() + airHour * 3600000); const diffHrs = (new Date(ep.watched_at) - airDateTime) / 3600000; return diffHrs >= 0 && diffHrs <= 12; });
        return w12.length / aired.length > 0.5;
    }).slice(0,5);

    container.innerHTML = `
    <div class="stats-card"><h4>📈 Overview</h4><div class="stats-card-desc">Your complete watching summary.</div>
        <div class="stats-row"><span class="stats-label">Total</span><span class="stats-value">${items.length}</span></div>
        <div class="stats-row"><span class="stats-label">Episodes Watched</span><span class="stats-value">${totalEps.toLocaleString()}</span></div>
        <div class="stats-row"><span class="stats-label">Watch Time</span><span class="stats-value">${formatWatchTime(totalEps * epMin)}</span></div>
        <div class="stats-row"><span class="stats-label">Completed</span><span class="stats-value">${finishedCount}</span></div>
        <div class="stats-row"><span class="stats-label">In Progress</span><span class="stats-value">${statusCounts['Watching'] || 0}</span></div>
        <div class="stats-row"><span class="stats-label">Simultaneously Watching</span><span class="stats-value">${simultaneouslyWatching}</span></div>
        <div class="stats-row"><span class="stats-label">Completion Rate</span><span class="stats-value">${completeRate}%</span></div>
        <div class="stats-row"><span class="stats-label">Drop Rate</span><span class="stats-value">${dropRate}%</span></div>
        <div class="stats-row"><span class="stats-label">Avg TMDB Rating</span><span class="stats-value">⭐${avgRating}</span></div>
    </div>
    <div class="stats-card"><h4>📅 This Month</h4><div class="stats-card-desc">Activity in the current calendar month.</div>
        <div class="stats-row"><span class="stats-label">Episodes</span><span class="stats-value">${thisMonthEps}</span></div>
        <div class="stats-row"><span class="stats-label">vs Last Month</span><span class="stats-value">${lastMonthEps > 0 ? (thisMonthEps >= lastMonthEps ? '▲' : '▼') + ' ' + Math.abs(thisMonthEps - lastMonthEps) + ' eps' : '—'}</span></div>
        <div class="stats-row"><span class="stats-label">Shows Completed</span><span class="stats-value">${thisMonthCompleted}</span></div>
    </div>
    <div class="stats-card"><h4>⚡ Watching Speed</h4><div class="stats-card-desc">How fast you move through your library.</div>
        <div class="stats-row"><span class="stats-label">Avg eps/month</span><span class="stats-value">${avgPerMonth}</span></div>
        <div class="stats-row"><span class="stats-label">Avg eps/week</span><span class="stats-value">${avgPerWeek}</span></div>
        <div class="stats-row"><span class="stats-label">Recent pace (2mo)</span><span class="stats-value">${recentPerWeek}/wk</span></div>
        <div class="stats-row"><span class="stats-label">Longest streak</span><span class="stats-value">${longestStreak} days</span></div>
    </div>
    <div class="stats-card"><h4>📋 Backlog</h4><div class="stats-card-desc">Estimate based on recent pace, not non-stop watching.</div>
        <div class="stats-row"><span class="stats-label">Remaining eps</span><span class="stats-value">${remaining.toLocaleString()}</span></div>
        <div class="stats-row"><span class="stats-label">Remaining time</span><span class="stats-value">${formatWatchTime(remaining * epMin)}</span></div>
        <div class="stats-row"><span class="stats-label">At current pace</span><span class="stats-value">${recentPerWeek > 0 ? `${weeksToFinish} wks` : '∞'}</span></div>
        <div class="stats-row"><span class="stats-label">Est. catch-up</span><span class="stats-value">${finishDate || '—'}</span></div>
    </div>
    ${showRewatchData.length ? `<div class="stats-card"><h4>↺ Rewatch Stats</h4>
        <div class="stats-card-desc">A <strong>cycle</strong> = one full or partial rewatch. % = how much was rewatched in the latest cycle.</div>
        <div class="stats-row"><span class="stats-label">Shows rewatched</span><span class="stats-value">${rewatchedShowsSet.size}</span></div>
        <div class="stats-row"><span class="stats-label">Total cycles</span><span class="stats-value">${totalRewatchCycles}</span></div>
        <div style="margin-top:12px;">${showRewatchData.slice(0,5).map((d,i) => `<div class="rewatch-rank-item"><span class="rewatch-rank-num">${i+1}</span><div class="rewatch-rank-info"><div class="rewatch-rank-title">${d.title}</div><div class="rewatch-rank-meta">↺ ${d.cycles} cycle${d.cycles!==1?'s':''} · ${d.rewatchedEps}/${d.totalEps} eps</div><div class="rewatch-rank-bar"><div class="rewatch-rank-fill" style="width:${d.pct}%;"></div></div></div><span style="font-size:12px;font-weight:700;color:var(--accent);flex-shrink:0;">${d.pct}%</span></div>`).join('')}</div>
    </div>` : ''}
    ${notesCount > 0 ? `<div class="stats-card"><h4>📝 Notes</h4><div class="stats-card-desc">Episode notes you've written.</div>
        <div class="stats-row"><span class="stats-label">Total notes</span><span class="stats-value">${notesCount}</span></div>
        <div class="stats-row"><span class="stats-label">Most noted show</span><span class="stats-value" style="font-size:11px;max-width:160px;text-align:right;">${mostNotedShow.title} (${mostNotedShow.count})</span></div>
    </div>` : ''}
    ${within12Pct > 0 ? `<div class="stats-card"><h4>⚡ Release Day Viewer</h4>
        <div class="stats-card-desc">% of aired episodes watched within 12 hours of broadcast.</div>
        <div class="stats-row"><span class="stats-label">Within 12hrs</span><span class="stats-value">${within12Pct}%</span></div>
        <div class="stats-row"><span class="stats-label">Same-day episodes</span><span class="stats-value">${within12Count.toLocaleString()}</span></div>
        ${dayOneShows.length ? `<div class="stats-row"><span class="stats-label" style="font-size:11px;">Top day-one shows</span><span class="stats-value" style="font-size:11px;max-width:160px;text-align:right;">${dayOneShows.map(s=>s.title).join(', ')}</span></div>` : ''}
    </div>` : ''}
    <div class="stats-card"><h4>🧠 Watching Habits</h4><div class="stats-card-desc">When and how you watch.</div>
        <div class="stats-row"><span class="stats-label">Type</span><span class="stats-value">${watcherType}</span></div>
        <div class="stats-row"><span class="stats-label">Style</span><span class="stats-value">${bingeType}</span></div>
        <div class="stats-row"><span class="stats-label">Avg eps/active day</span><span class="stats-value">${avgBinge}</span></div>
        <div class="stats-row"><span class="stats-label">Peak time</span><span class="stats-value">${peakPeriod}</span></div>
        <div class="stats-row"><span class="stats-label">Most active day</span><span class="stats-value">${peakDay}</span></div>
        <div class="stats-row"><span class="stats-label">Favorite season</span><span class="stats-value">${topSeason}</span></div>
        <div class="stats-row"><span class="stats-label">Weekend eps</span><span class="stats-value">${weekendEps.toLocaleString()}</span></div>
        <div class="stats-row"><span class="stats-label">Weekday eps</span><span class="stats-value">${weekdayEps.toLocaleString()}</span></div>
    </div>
    <div class="stats-card"><h4>🎭 Content Profile</h4><div class="stats-card-desc">Genre Loyalist = top genre is 60%+ of library. Rarest watch = lowest TMDB popularity among completed shows.</div>
        <div class="stats-row"><span class="stats-label">Genre style</span><span class="stats-value">${genreLoyalty}</span></div>
        <div class="stats-row"><span class="stats-label">Rarest watch</span><span class="stats-value" style="font-size:11px;max-width:160px;text-align:right;">${rarestWatch}</span></div>
        ${topGenres.map(([g,c]) => `<div class="stats-row"><span class="stats-label">🎬 ${g}</span><span class="stats-value">${c}</span></div>`).join('')}
    </div>
    ${topNetworks.length ? `<div class="stats-card"><h4>📺 Top Networks</h4>${topNetworks.map(([n,c]) => `<div class="stats-row"><span class="stats-label">${n}</span><span class="stats-value">${c}</span></div>`).join('')}</div>` : ''}
    ${topLanguages.length ? `<div class="stats-card"><h4>🌍 Languages</h4><div class="stats-card-desc">Original language of shows.</div>${topLanguages.map(([l,c]) => `<div class="stats-row"><span class="stats-label">${l}</span><span class="stats-value">${c}</span></div>`).join('')}</div>` : ''}
    ${topDecades.length ? `<div class="stats-card"><h4>📅 Content by Decade</h4><div class="stats-card-desc">Based on original air year.</div>${topDecades.map(([d,c]) => `<div class="stats-row"><span class="stats-label">${d}</span><span class="stats-value">${c}</span></div>`).join('')}</div>` : ''}
    ${topBingeDays.length ? `<div class="stats-card"><h4>🍿 Biggest Binge Days</h4><div class="stats-card-desc">Capped at 25 eps/day to exclude import artifacts.</div>${topBingeDays.map(([date,count],i) => `<div class="stats-row"><span class="stats-label">${i+1}. ${new Date(date).toLocaleDateString('en-GB',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</span><span class="stats-value">${count} eps</span></div>`).join('')}</div>` : ''}
    ${showSpeeds.length ? `<div class="stats-card"><h4>🏎 Fastest Completed</h4><div class="stats-card-desc">Finished fastest relative to episode count.</div>${showSpeeds.slice(0,5).map((s,i) => `<div class="stats-row"><span class="stats-label" style="font-size:12px;">${i+1}. ${s.title}</span><span class="stats-value">${s.eps}ep/${s.days}d</span></div>`).join('')}</div>` : ''}
    ${longestShows.length ? `<div class="stats-card"><h4>🐢 Slowest to Finish</h4><div class="stats-card-desc">Longest time from added to completed.</div>${longestShows.slice(0,5).map((s,i) => `<div class="stats-row"><span class="stats-label" style="font-size:12px;">${i+1}. ${s.title}</span><span class="stats-value">${Math.round(s.days/30)} months</span></div>`).join('')}</div>` : ''}
    ${top10.length ? `<div class="stats-card"><h4>🌟 Your Top 10</h4><div class="stats-card-desc">By your personal ratings.</div>
        <div class="stats-top10-grid">${top10.map(item => { const p = safePoster(item.poster); const sd = item.docId.replace(/'/g,"\\'"); return `<div class="stats-top10-item" onclick="openDetails('${sd}','${item.type}')"><img src="${p}" onerror="this.src='${PLACEHOLDER_POSTER}'"><div class="top10-title">${item.title}</div><div class="top10-rating">★${item.my_rating}/10</div></div>`; }).join('')}</div>
    </div>` : ''}
    <div class="stats-chart-container"><h4>📊 Status Distribution</h4><canvas id="stats-status-chart"></canvas></div>
    <div class="stats-chart-container"><h4>📅 Episodes per Month</h4><canvas id="stats-monthly-chart"></canvas></div>
    <div class="stats-chart-container"><h4>📆 Day of Week</h4><canvas id="stats-dow-chart"></canvas></div>
    ${topGenres.length ? `<div class="stats-chart-container"><h4>🎭 Top Genres</h4><canvas id="stats-genre-chart"></canvas></div>` : ''}`;

    const colorMap = { 'Watching':'#FFC107','Up to Date':'#4CAF50','Finished':'#2196F3','Dropped':'#f44336','Paused':'#FF9800','Planned':'#9E9E9E','Rewatching':'#9C27B0','Unknown':'#666' };
    const sc = document.getElementById('stats-status-chart'); if (sc) activeCharts['stats-status-chart'] = new Chart(sc.getContext('2d'), { type:'doughnut', data:{ labels:Object.keys(statusCounts), datasets:[{ data:Object.values(statusCounts), backgroundColor:Object.keys(statusCounts).map(s=>colorMap[s]||'#666') }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } } } });
    const mc = document.getElementById('stats-monthly-chart'); if (mc && monthKeys.length) { const last12 = monthKeys.slice(-12); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; activeCharts['stats-monthly-chart'] = new Chart(mc.getContext('2d'), { type:'bar', data:{ labels:last12.map(k => { const [y,m] = k.split('-'); return `${months[parseInt(m)-1]} ${y.slice(2)}`; }), datasets:[{ label:'Episodes', data:last12.map(k=>monthCounts[k]||0), backgroundColor:'rgba(30,60,114,0.6)', borderColor:'rgba(30,60,114,1)', borderWidth:1 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } } }); }
    const dc = document.getElementById('stats-dow-chart'); if (dc) activeCharts['stats-dow-chart'] = new Chart(dc.getContext('2d'), { type:'bar', data:{ labels:dayNames, datasets:[{ label:'Episodes', data:dayOfWeekCounts, backgroundColor:['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40','#FF6384'], borderWidth:1 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } } });
    const gc = document.getElementById('stats-genre-chart'); if (gc && topGenres.length) activeCharts['stats-genre-chart'] = new Chart(gc.getContext('2d'), { type:'bar', data:{ labels:topGenres.map(([g])=>g), datasets:[{ label:'Shows', data:topGenres.map(([,c])=>c), backgroundColor:'rgba(255,107,53,0.7)', borderColor:'rgba(255,107,53,1)', borderWidth:1 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } }, indexAxis:'y' } });
}

function renderMovieStats(container) {
    ['stats-monthly-chart','stats-dow-chart','stats-genre-chart'].forEach(id => {
        if (activeCharts[id]) { activeCharts[id].destroy(); delete activeCharts[id]; }
    });
    const movies = getMovies(), watched = movies.filter(m => m.is_watched), rewatched = movies.reduce((s,m) => s+(m.rewatch_count||0), 0);
    const twoMonthsAgo = new Date(Date.now() - 60*86400000);
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const thisMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    const lastMonthKey = (() => { const d = new Date(thisMonthStart); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
    const monthCounts = {}, dayOfWeekCounts = [0,0,0,0,0,0,0], genreCounts = {}, languageCounts = {}, decadeCounts = {};
    let totalRating = 0, ratedCount = 0;
    movies.forEach(m => { (m.genres||[]).forEach(g => { genreCounts[g]=(genreCounts[g]||0)+1; }); if (m.original_language) languageCounts[languageCodeToName(m.original_language)]=(languageCounts[languageCodeToName(m.original_language)]||0)+1; const yr=m.year; if(yr&&yr>1900) decadeCounts[`${Math.floor(yr/10)*10}s`]=(decadeCounts[`${Math.floor(yr/10)*10}s`]||0)+1; if(m.tmdb_rating&&m.tmdb_rating>0){totalRating+=m.tmdb_rating;ratedCount++;} });
    watched.forEach(m => { if(m.watched_at){const d=new Date(m.watched_at); monthCounts[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`]=(monthCounts[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`]||0)+1; dayOfWeekCounts[d.getDay()]++; } });
    const monthKeys=Object.keys(monthCounts).sort(), avgPerMonth=monthKeys.length?(watched.length/monthKeys.length).toFixed(1):0;
    const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], peakDay=dayNames[dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))];
    const unwatched=movies.filter(m=>!m.is_watched).length, avgRating=ratedCount>0?(totalRating/ratedCount).toFixed(1):'N/A';
    const topGenres=Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const topLanguages=Object.entries(languageCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const topDecades=Object.entries(decadeCounts).sort((a,b)=>a[0].localeCompare(b[0]));
    const recentWatched=movies.filter(m=>m.is_watched&&m.watched_at&&new Date(m.watched_at)>=twoMonthsAgo).length;
    const recentPerWeek=(recentWatched/8).toFixed(1);
    const weeksToFinish=recentWatched>0?Math.ceil(unwatched/(recentWatched/8)):null;
    const finishDate=weeksToFinish?new Date(Date.now()+weeksToFinish*7*86400000).toLocaleDateString('en-GB',{year:'numeric',month:'long'}):null;
    const thisMonthCount=monthCounts[thisMonthKey]||0, lastMonthCount=monthCounts[lastMonthKey]||0;
    const top10=[...movies].filter(m=>m.my_rating).sort((a,b)=>(b.my_rating||0)-(a.my_rating||0)).slice(0,10);

    container.innerHTML = `
    <div class="stats-card"><h4>📈 Overview</h4>
        <div class="stats-row"><span class="stats-label">Total</span><span class="stats-value">${movies.length}</span></div>
        <div class="stats-row"><span class="stats-label">Watched</span><span class="stats-value">${watched.length}</span></div>
        <div class="stats-row"><span class="stats-label">Unwatched</span><span class="stats-value">${unwatched}</span></div>
        <div class="stats-row"><span class="stats-label">Rewatched</span><span class="stats-value">${rewatched}</span></div>
        <div class="stats-row"><span class="stats-label">Watch Time</span><span class="stats-value">${formatWatchTime(watched.length*100)}</span></div>
        <div class="stats-row"><span class="stats-label">Avg per month</span><span class="stats-value">${avgPerMonth}</span></div>
        <div class="stats-row"><span class="stats-label">Most active day</span><span class="stats-value">${peakDay}</span></div>
        <div class="stats-row"><span class="stats-label">Avg TMDB rating</span><span class="stats-value">⭐${avgRating}</span></div>
    </div>
    <div class="stats-card"><h4>📅 This Month</h4>
        <div class="stats-row"><span class="stats-label">Movies</span><span class="stats-value">${thisMonthCount}</span></div>
        <div class="stats-row"><span class="stats-label">vs Last Month</span><span class="stats-value">${lastMonthCount>0?(thisMonthCount>=lastMonthCount?'▲':'▼')+' '+Math.abs(thisMonthCount-lastMonthCount):'—'}</span></div>
    </div>
    <div class="stats-card"><h4>📋 Backlog</h4>
        <div class="stats-row"><span class="stats-label">Unwatched</span><span class="stats-value">${unwatched}</span></div>
        <div class="stats-row"><span class="stats-label">Pace</span><span class="stats-value">${recentPerWeek}/wk</span></div>
        <div class="stats-row"><span class="stats-label">Est. catch-up</span><span class="stats-value">${finishDate||'—'}</span></div>
    </div>
    ${topGenres.length?`<div class="stats-card"><h4>🎭 Top Genres</h4>${topGenres.map(([g,c])=>`<div class="stats-row"><span class="stats-label">${g}</span><span class="stats-value">${c}</span></div>`).join('')}</div>`:''}
    ${topLanguages.length?`<div class="stats-card"><h4>🌍 Languages</h4>${topLanguages.map(([l,c])=>`<div class="stats-row"><span class="stats-label">${l}</span><span class="stats-value">${c}</span></div>`).join('')}</div>`:''}
    ${topDecades.length?`<div class="stats-card"><h4>📅 Content by Decade</h4><div class="stats-card-desc">Based on release year.</div>${topDecades.map(([d,c])=>`<div class="stats-row"><span class="stats-label">${d}</span><span class="stats-value">${c}</span></div>`).join('')}</div>`:''}
    ${top10.length?`<div class="stats-card"><h4>🌟 Your Top 10</h4><div class="stats-top10-grid">${top10.map(item=>{const p=safePoster(item.poster),sd=item.docId.replace(/'/g,"\\'");return`<div class="stats-top10-item" onclick="openDetails('${sd}','movie')"><img src="${p}" onerror="this.src='${PLACEHOLDER_POSTER}'"><div class="top10-title">${item.title}</div><div class="top10-rating">★${item.my_rating}/10</div></div>`;}).join('')}</div></div>`:''}
    <div class="stats-chart-container"><h4>📅 Movies per Month</h4><canvas id="stats-monthly-chart"></canvas></div>
    <div class="stats-chart-container"><h4>📆 Day of Week</h4><canvas id="stats-dow-chart"></canvas></div>
    ${topGenres.length?`<div class="stats-chart-container"><h4>🎭 Top Genres</h4><canvas id="stats-genre-chart"></canvas></div>`:''}`;

    const mc=document.getElementById('stats-monthly-chart'); if(mc&&monthKeys.length){const last12=monthKeys.slice(-12);const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];activeCharts['stats-monthly-chart']=new Chart(mc.getContext('2d'),{type:'bar',data:{labels:last12.map(k=>{const[y,m]=k.split('-');return`${months[parseInt(m)-1]} ${y.slice(2)}`;}),datasets:[{label:'Movies',data:last12.map(k=>monthCounts[k]||0),backgroundColor:'rgba(156,39,176,0.6)',borderColor:'rgba(156,39,176,1)',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});}
    const dc=document.getElementById('stats-dow-chart');if(dc)activeCharts['stats-dow-chart']=new Chart(dc.getContext('2d'),{type:'bar',data:{labels:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],datasets:[{label:'Movies',data:dayOfWeekCounts,backgroundColor:'rgba(156,39,176,0.4)',borderColor:'rgba(156,39,176,1)',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
    const gc=document.getElementById('stats-genre-chart');if(gc&&topGenres.length)activeCharts['stats-genre-chart']=new Chart(gc.getContext('2d'),{type:'bar',data:{labels:topGenres.map(([g])=>g),datasets:[{label:'Movies',data:topGenres.map(([,c])=>c),backgroundColor:'rgba(156,39,176,0.6)',borderColor:'rgba(156,39,176,1)',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}},indexAxis:'y'}});
}

// ===== EXPORTS =====
async function exportData(format) {
    const movies = getMovies(), tv = getTVShows(), anime = getAnime();
    if (format === 'json') downloadFile('my-cinema-export.json', JSON.stringify({ movies, tv_shows: tv, anime, exported_at: new Date().toISOString() }, null, 2), 'application/json');
    else if (format === 'csv') { let csv = 'Type,Title,Year,Status,TMDBRating,MyRating,Watched,Favorite\n'; movies.forEach(m => csv += `Movie,"${m.title}",${m.year||''},${m.is_watched?'Watched':'Unwatched'},${m.tmdb_rating||''},${m.my_rating||''},${m.is_watched?'Yes':'No'},${m.is_favorite?'Yes':'No'}\n`); [...tv,...anime].forEach(s => csv += `${s.is_anime?'Anime':'TV'},"${s.title}",${s.year||''},${s.user_status||''},${s.tmdb_rating||''},${s.my_rating||''},-,${s.is_favorite?'Yes':'No'}\n`); downloadFile('my-cinema-export.csv', csv, 'text/csv'); }
    else if (format === 'txt') { let txt = `MY CINEMA TRACKER\n${new Date().toLocaleDateString('en-GB')}\n\n=== ANIME (${anime.length}) ===\n`; anime.forEach(s => txt += `[${s.user_status||'?'}] ${s.title} (${s.year||'?'})\n`); txt += `\n=== TV (${tv.length}) ===\n`; tv.forEach(s => txt += `[${s.user_status||'?'}] ${s.title} (${s.year||'?'})\n`); txt += `\n=== MOVIES (${movies.length}) ===\n`; movies.forEach(m => txt += `${m.is_watched?'✓':'○'} ${m.title} (${m.year||'?'})\n`); downloadFile('my-cinema-export.txt', txt, 'text/plain'); }
    else if (format === 'trakt') exportToTrakt();
}

function exportToTrakt() {
    const traktData = [], movies = getMovies(), shows = [...getAnime(), ...getTVShows()];
    movies.forEach(m => { if(m.is_watched&&m.watched_at) traktData.push({tmdb_id:String(m.tmdb_id||''),imdb_id:m.imdb_id||undefined,type:'movie',watched_at:m.watched_at,rating:m.my_rating||undefined,rated_at:m.my_rating?m.watched_at:undefined}); (m.rewatch_history||[]).forEach(rw=>traktData.push({tmdb_id:String(m.tmdb_id||''),imdb_id:m.imdb_id||undefined,type:'movie',watched_at:rw})); if(!m.is_watched&&m.created_at) traktData.push({tmdb_id:String(m.tmdb_id||''),imdb_id:m.imdb_id||undefined,type:'movie',watchlisted_at:m.created_at}); });
    shows.forEach(show => { if(show.my_rating&&show.tmdb_id) traktData.push({tmdb_id:String(show.tmdb_id),imdb_id:show.imdb_id||undefined,type:'show',rating:show.my_rating,rated_at:show.created_at||new Date().toISOString()}); if(show.user_status==='Planned'&&show.created_at) traktData.push({tmdb_id:String(show.tmdb_id||''),imdb_id:show.imdb_id||undefined,type:'show',watchlisted_at:show.created_at}); show.seasons?.forEach(s=>{if(s.number===0)return;s.episodes?.forEach(ep=>{if(!ep.is_watched||!ep.watched_at||ep.is_special)return;traktData.push({tmdb_id:String(show.tmdb_id||''),imdb_id:show.imdb_id||undefined,type:'episode',watched_at:ep.watched_at});(ep.rewatch_history||[]).forEach(rw=>traktData.push({tmdb_id:String(show.tmdb_id||''),imdb_id:show.imdb_id||undefined,type:'episode',watched_at:rw}));});}); });
    downloadFile('my-cinema-trakt-import.json', JSON.stringify(traktData.map(item=>{const c={};Object.entries(item).forEach(([k,v])=>{if(v!==undefined)c[k]=v;});return c;}), null, 2), 'application/json');
}

// ===== PERSONAL LIST =====
function openPersonalListModal() {
    let modal = document.getElementById('personal-list-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'personal-list-modal'; modal.className = 'modal'; modal.style.cssText = 'z-index:3000;'; modal.innerHTML = `<div class="modal-content" style="max-width:480px;"><span class="close" onclick="closeModal('personal-list-modal')">&times;</span><div id="personal-list-body"></div></div>`; document.body.appendChild(modal); if(!MODAL_IDS.includes('personal-list-modal'))MODAL_IDS.push('personal-list-modal'); modal.addEventListener('click',e=>{if(e.target===modal)closeModal('personal-list-modal');}); }
    document.getElementById('personal-list-body').innerHTML = `
        <h3 style="color:var(--accent);margin-bottom:16px;">📃 Personal List Export</h3>
        <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-anime" checked> Anime</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-tv" checked> TV Shows</label>
            <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-movies"> Movies</label>
        </div>
        <p style="color:var(--text2);font-size:13px;margin-bottom:10px;">Filter by status:</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;"><input type="checkbox" id="pl-watched" checked> Watched</label>
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

function generatePersonalList() {
    const iA=document.getElementById('pl-anime')?.checked,iT=document.getElementById('pl-tv')?.checked,iM=document.getElementById('pl-movies')?.checked;
    const iW=document.getElementById('pl-watched')?.checked,iP=document.getElementById('pl-planned')?.checked,iPa=document.getElementById('pl-paused')?.checked,iD=document.getElementById('pl-dropped')?.checked;
    if(!iA&&!iT&&!iM){alert('Select a type.');return;} if(!iW&&!iP&&!iPa&&!iD){alert('Select a status.');return;}
    const ws=new Set(['Watching','Up to Date','Finished','Rewatching']);
    function fbs(items,isM=false){const g={};if(isM){if(iW){const w=items.filter(i=>i.is_watched&&!i.hide_from_list);if(w.length)g['Watched']=w;}if(iP){const p=items.filter(i=>!i.is_watched&&!i.hide_from_list);if(p.length)g['Planned']=p;}}else{if(iW){const w=items.filter(i=>ws.has(i.user_status)&&!i.hide_from_list);if(w.length)g['Watched']=w;}if(iP){const p=items.filter(i=>i.user_status==='Planned'&&!i.hide_from_list);if(p.length)g['Planned']=p;}if(iPa){const p=items.filter(i=>i.user_status==='Paused'&&!i.hide_from_list);if(p.length)g['Paused']=p;}if(iD){const d=items.filter(i=>i.user_status==='Dropped'&&!i.hide_from_list);if(d.length)g['Dropped']=d;}}return g;}
    let txt=`MY CINEMA — PERSONAL LIST\n${new Date().toLocaleDateString('en-GB')}\n${'='.repeat(30)}\n\n`,tc=0;
    if(iA){const g=fbs(getAnime().sort((a,b)=>(a.title||'').localeCompare(b.title||'')));if(Object.keys(g).length){txt+=`🎌 ANIME\n${'─'.repeat(20)}\n\n`;Object.entries(g).forEach(([s,items])=>{txt+=`[ ${s.toUpperCase()} — ${items.length} ]\n`;items.forEach((i,n)=>{txt+=`${n+1}. ${i.title}${i.year?` (${i.year})`:''} ${i.my_rating?`★${i.my_rating}/10`:''}\n`;tc++;});txt+='\n';});}}
    if(iT){const g=fbs(getTVShows().sort((a,b)=>(a.title||'').localeCompare(b.title||'')));if(Object.keys(g).length){txt+=`📺 TV SHOWS\n${'─'.repeat(20)}\n\n`;Object.entries(g).forEach(([s,items])=>{txt+=`[ ${s.toUpperCase()} — ${items.length} ]\n`;items.forEach((i,n)=>{txt+=`${n+1}. ${i.title}${i.year?` (${i.year})`:''} ${i.my_rating?`★${i.my_rating}/10`:''}\n`;tc++;});txt+='\n';});}}
    if(iM){const g=fbs(getMovies().sort((a,b)=>(a.title||'').localeCompare(b.title||'')),true);if(Object.keys(g).length){txt+=`🎬 MOVIES\n${'─'.repeat(20)}\n\n`;Object.entries(g).forEach(([s,items])=>{txt+=`[ ${s.toUpperCase()} — ${items.length} ]\n`;items.forEach((i,n)=>{txt+=`${n+1}. ${i.title}${i.year?` (${i.year})`:''} ${i.my_rating?`★${i.my_rating}/10`:''}\n`;tc++;});txt+='\n';});}}
    txt+=`${'='.repeat(30)}\nTotal: ${tc}\n`;
    downloadFile('my-cinema-personal-list.txt', txt, 'text/plain');
    closeModal('personal-list-modal');
}

function downloadFile(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click();
}

// ===== IMPORT =====
async function importMovies() {
    const jsonText = document.getElementById('movies-json').value;
    const st = document.getElementById('import-status');
    try {
        const movies = JSON.parse(jsonText);
        let imp = 0, fail = 0;
        st.className = 'success';
        st.textContent = `Importing... 0/${movies.length}`;
        for (const movie of movies) {
            try {
                const docId = `movie_${movie.id?.tvdb||movie.id?.imdb||movie.tmdb_id||Date.now()}`;
                let poster = PLACEHOLDER_POSTER, tmdbId = null, tmdbRating = null;
                if (movie.id?.imdb) { try { const d = await tmdbFetch(`${TMDB_BASE_URL}/find/${movie.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`); if(d.movie_results?.length){tmdbId=d.movie_results[0].id;poster=d.movie_results[0].poster_path?TMDB_IMG_BASE+d.movie_results[0].poster_path:poster;tmdbRating=d.movie_results[0].vote_average||null;} } catch(e){} }
                if (!tmdbId && movie.title) { try { const d = await tmdbFetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year||''}`); if(d.results?.length){tmdbId=d.results[0].id;poster=d.results[0].poster_path?TMDB_IMG_BASE+d.results[0].poster_path:poster;tmdbRating=d.results[0].vote_average||null;} } catch(e){} }
                await setDoc(doc(db,'movies',docId),{tmdb_id:tmdbId,imdb_id:movie.id?.imdb||null,tvdb_id:movie.id?.tvdb||null,title:movie.title,year:movie.year||null,poster,tmdb_rating:tmdbRating,is_watched:movie.is_watched||false,watched_at:fixImportDate(movie.watched_at),is_favorite:movie.is_favorite||false,hide_from_list:false,rewatch_count:movie.rewatch_count||0,rewatch_history:[],my_rating:null,created_at:fixImportDate(movie.created_at)||new Date().toISOString()});
                imp++; st.textContent=`${imp}/${movies.length} (${fail} failed)`;
                if(imp%30===0) await new Promise(r=>setTimeout(r,1000));
            } catch(e){fail++;logError('Import movie',e);}
        }
        st.textContent = `✓ ${imp} imported! (${fail} failed)`;
        await loadMyList();
    } catch(e){st.className='error';st.textContent=`✗ ${e.message}`;}
}

// ===== IMPORT SERIES — complete rewrite with conflict detection =====
async function importSeries() {
    const jsonText = document.getElementById('series-json').value;
    const st = document.getElementById('import-status');
    try {
        const series = JSON.parse(jsonText);
        st.className = 'success';
        st.textContent = `Scanning ${series.length} shows...`;

        const conflicts = [], newShows = [];

        for (let i = 0; i < series.length; i++) {
            const show = series[i];
            st.textContent = `Scanning ${i+1}/${series.length}: ${show.title}...`;

            // Support both id.tvmaze and ids.tvmaze formats
            const tvmazeIdRaw = show.ids?.tvmaze || show.id?.tvmaze || show.tvmaze_id || null;
            const tvdbIdRaw = show.ids?.tvdb || show.id?.tvdb || show.tvdb_id || null;
            const tmdbIdRaw = show.ids?.tmdb || show.id?.tmdb || show.tmdb_id || null;

            let resolvedTvmazeId = tvmazeIdRaw ? parseInt(tvmazeIdRaw) : null;
            let resolvedTvdbId = tvdbIdRaw ? parseInt(tvdbIdRaw) : null;
            let tmdbId = tmdbIdRaw ? parseInt(tmdbIdRaw) : null;
            let poster = PLACEHOLDER_POSTER, tmdbRating = null;

            // Step 1: TVMaze ID direct lookup
            if (!tmdbId && resolvedTvmazeId) {
                try {
                    const tvShow = await tvmazeFetch(`${TVMAZE_BASE}/shows/${resolvedTvmazeId}`);
                    if (tvShow) {
                        if (tvShow.externals?.themoviedb) tmdbId = tvShow.externals.themoviedb;
                        if (!resolvedTvdbId && tvShow.externals?.thetvdb) resolvedTvdbId = tvShow.externals.thetvdb;
                        const tvPoster = tvmazePoster(tvShow);
                        if (tvPoster) poster = tvPoster;
                    }
                } catch (e) { logError('Import TVMaze lookup', e, { show: show.title }); }
            }

            // Step 2: TVDB → TVMaze lookup
            if (!tmdbId && resolvedTvdbId) {
                try {
                    const tvShow = await tvmazeLookupByTVDB(resolvedTvdbId);
                    if (tvShow) {
                        if (!resolvedTvmazeId) resolvedTvmazeId = tvShow.id;
                        if (tvShow.externals?.themoviedb) tmdbId = tvShow.externals.themoviedb;
                        const tvPoster = tvmazePoster(tvShow);
                        if (tvPoster && poster === PLACEHOLDER_POSTER) poster = tvPoster;
                    }
                } catch (e) { logError('Import TVDB lookup', e, { show: show.title }); }
            }

            // Step 3: IMDB → TMDB find
            const imdbId = show.ids?.imdb || show.id?.imdb || null;
            if (!tmdbId && imdbId) {
                try {
                    const d = await tmdbFetch(`${TMDB_BASE_URL}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
                    if (d.tv_results?.length) { tmdbId = d.tv_results[0].id; poster = d.tv_results[0].poster_path ? TMDB_IMG_BASE + d.tv_results[0].poster_path : poster; tmdbRating = d.tv_results[0].vote_average || null; }
                } catch (e) {}
            }

            // Step 4: Title search
            if (!tmdbId && show.title) {
                try {
                    const clean = show.title.replace(/\s*\(\d{4}\)\s*$/,'');
                    const d = await tmdbFetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(clean)}`);
                    if (d.results?.length) { tmdbId = d.results[0].id; poster = d.results[0].poster_path ? TMDB_IMG_BASE + d.results[0].poster_path : poster; tmdbRating = d.results[0].vote_average || null; }
                } catch (e) {}
            }

            // Get TMDB details for metadata
            let tmdbStatus = 'Unknown', anime = false, detailData = {};
            if (tmdbId) {
                try {
                    const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
                    tmdbStatus = det.status || 'Unknown';
                    anime = isAnimeShow(det);
                    if (!tmdbRating) tmdbRating = det.vote_average || null;
                    if (det.poster_path) poster = TMDB_IMG_BASE + det.poster_path;
                    detailData = {
                        genres: (det.genres||[]).map(g=>g.name),
                        original_language: det.original_language || null,
                        networks: (det.networks||[]).map(n=>n.name),
                        origin_country: det.origin_country || [],
                        popularity: det.popularity || null,
                        year: det.first_air_date ? parseInt(det.first_air_date.substring(0,4)) : (show.year || null)
                    };
                } catch (e) { logError('Import TMDB detail', e, { show: show.title }); }
            }

            // Doc ID — prefer TVMaze ID
            const docId = resolvedTvmazeId
                ? `tv_tmaze_${resolvedTvmazeId}`
                : (tmdbId ? `tv_${tmdbId}` : `tv_${resolvedTvdbId || Date.now()}`);

            const statusMap = { 'up_to_date':'Up to Date','watching':'Watching','watched':'Finished','dropped':'Dropped','on_hold':'Paused','plan_to_watch':'Planned' };

            // Build seasons — handle both old and new JSON formats
            const seasons = (show.seasons||[]).map(s => ({
                number: s.number,
                is_specials: s.number === 0,
                episodes: (s.episodes||[]).map(ep => ({
                    number: ep.number,
                    name: ep.name || `Episode ${ep.number}`,
                    air_date: ep.air_date || null,
                    is_watched: ep.is_watched || false,
                    watched_at: fixImportDate(ep.watched_at),
                    rewatch_count: ep.rewatch_count || ep.watched_count > 1 ? Math.max(0, (ep.watched_count||1) - 1) : 0,
                    rewatch_history: ep.rewatch_history || [],
                    // Handle both 'special' and 'is_special' field names
                    is_special: ep.is_special || ep.special || s.number === 0,
                    my_rating: ep.my_rating || null,
                    note: ep.note || null
                }))
            }));

            let importWatchedCount = 0;
            seasons.forEach(s => { if(s.number===0)return; s.episodes.forEach(ep => { if(ep.is_watched&&!ep.is_special) importWatchedCount++; }); });

            const importData = {
                docId, tmdb_id: tmdbId, imdb_id: imdbId, tvdb_id: resolvedTvdbId,
                tvmaze_id: resolvedTvmazeId, title: show.title,
                year: detailData.year || show.year || null, poster,
                tmdb_rating: tmdbRating, user_status: statusMap[show.status] || 'Watching',
                tmdb_status: tmdbStatus, is_favorite: show.is_favorite || false,
                is_anime: anime, seasons, seasons_tmdb: seasons, seasons_tvmaze: null,
                episode_map: [], detailData, importWatchedCount,
                created_at: fixImportDate(show.created_at) || new Date().toISOString()
            };

            // A2: Find existing by TVMaze ID first, then TMDB, then TVDB
            const existing = myList.find(i =>
                (resolvedTvmazeId && i.tvmaze_id === resolvedTvmazeId) ||
                (tmdbId && i.tmdb_id === tmdbId) ||
                (resolvedTvdbId && i.tvdb_id === resolvedTvdbId)
            );

            if (existing) {
                let existingWatchedCount = 0;
                existing.seasons?.forEach(s => { if(s.number===0)return; s.episodes?.forEach(ep => { if(ep.is_watched&&!ep.is_special) existingWatchedCount++; }); });
                conflicts.push({ existing, importData, existingWatchedCount, importWatchedCount, action: null });
            } else {
                newShows.push(importData);
            }

            await new Promise(r => setTimeout(r, 400));
        }

        // Import new shows immediately
        let imported = 0, failed = 0;
        for (const showData of newShows) {
            try {
                st.textContent = `Importing new: ${showData.title}...`;
                await setDoc(doc(db, 'series', showData.docId), buildImportDoc(showData));
                imported++;
                await new Promise(r => setTimeout(r, 300));
            } catch (e) { failed++; logError('Import new show', e, { show: showData.title }); }
        }

        if (conflicts.length > 0) {
            st.textContent = `${imported} new shows imported. Resolving ${conflicts.length} conflicts...`;
            await showImportConflictDialog(conflicts, st);
        } else {
            st.textContent = `✓ ${imported} imported! (${failed} failed) — Run "Full Library Sync" in Settings to build TVMaze episode data.`;
        }

        await loadMyList();
    } catch (e) { st.className = 'error'; st.textContent = `✗ ${e.message}`; logError('Import series', e); }
}

// ===== IMPORT HELPERS =====
function fixImportDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr.includes(' ') && !dateStr.includes('T')) return dateStr.replace(' ','T') + '.000Z';
    if (dateStr.includes('T')) return dateStr;
    return dateStr + 'T00:00:00.000Z';
}

function buildImportDoc(showData) {
    return {
        tmdb_id: showData.tmdb_id || null,
        imdb_id: showData.imdb_id || null,
        tvdb_id: showData.tvdb_id || null,
        tvmaze_id: showData.tvmaze_id || null,
        title: showData.title,
        year: showData.year || null,
        poster: showData.poster,
        tmdb_rating: showData.tmdb_rating || null,
        user_status: showData.user_status,
        tmdb_status: showData.tmdb_status,
        last_status_check: new Date().toISOString(),
        last_synced: new Date().toISOString(),
        is_favorite: showData.is_favorite || false,
        is_anime: showData.is_anime || false,
        seasons: showData.seasons,
        seasons_tmdb: showData.seasons_tmdb,
        seasons_tvmaze: null,
        episode_map: [],
        my_rating: null,
        hide_from_list: false,
        force_tmdb_source: false,
        id_confidence: showData.tvmaze_id ? 'verified' : 'unverified',
        genres: showData.detailData?.genres || [],
        original_language: showData.detailData?.original_language || null,
        networks: showData.detailData?.networks || [],
        origin_country: showData.detailData?.origin_country || [],
        popularity: showData.detailData?.popularity || null,
        created_at: showData.created_at
    };
}

function mergeSeasons(existingSeasons, importSeasons) {
    const merged = JSON.parse(JSON.stringify(existingSeasons || []));
    (importSeasons || []).forEach(importSeason => {
        const existingSeason = merged.find(s => s.number === importSeason.number);
        if (!existingSeason) { merged.push(JSON.parse(JSON.stringify(importSeason))); return; }
        (importSeason.episodes || []).forEach(importEp => {
            const existingEp = existingSeason.episodes?.find(e => e.number === importEp.number && (importEp.is_special ? e.is_special : !e.is_special));
            if (!existingEp) { if (!existingSeason.episodes) existingSeason.episodes = []; existingSeason.episodes.push(JSON.parse(JSON.stringify(importEp))); return; }
            // Merge watch status — keep whichever is older (first watch)
            if (importEp.is_watched && !existingEp.is_watched) { existingEp.is_watched = true; existingEp.watched_at = importEp.watched_at; }
            else if (importEp.is_watched && existingEp.is_watched) { if (importEp.watched_at && existingEp.watched_at && new Date(importEp.watched_at) < new Date(existingEp.watched_at)) existingEp.watched_at = importEp.watched_at; }
            if ((importEp.rewatch_count||0) > (existingEp.rewatch_count||0)) existingEp.rewatch_count = importEp.rewatch_count;
            if (!existingEp.note && importEp.note) existingEp.note = importEp.note;
            if (!existingEp.my_rating && importEp.my_rating) existingEp.my_rating = importEp.my_rating;
            if (!existingEp.air_date && importEp.air_date) existingEp.air_date = importEp.air_date;
        });
    });
    merged.sort((a,b) => a.number - b.number);
    return merged;
}

// ===== CONFLICT DIALOG — B2: includes Skip option =====
async function showImportConflictDialog(conflicts, statusEl) {
    return new Promise(resolve => {
        let modal = document.getElementById('import-conflict-modal');
        if (!modal) {
            modal = document.createElement('div'); modal.id = 'import-conflict-modal'; modal.className = 'modal'; modal.style.cssText = 'z-index:3500;';
            modal.innerHTML = `<div class="modal-content" style="max-width:700px;"><span class="close" onclick="cancelImportConflicts()">&times;</span><div id="import-conflict-body"></div></div>`;
            document.body.appendChild(modal);
            if (!MODAL_IDS.includes('import-conflict-modal')) MODAL_IDS.push('import-conflict-modal');
            modal.addEventListener('click', e => { if (e.target === modal) cancelImportConflicts(); });
        }

        const body = document.getElementById('import-conflict-body');
        body.innerHTML = `
            <h3 style="color:var(--accent);margin-bottom:8px;">⚠️ ${conflicts.length} Show${conflicts.length!==1?'s':''} Already in Library</h3>
            <p style="color:var(--text2);font-size:13px;margin-bottom:16px;">Choose what to do with each conflict.</p>
            <div style="max-height:450px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;margin-bottom:16px;">
                ${conflicts.map((c,idx) => `
                    <div class="import-conflict-item" data-idx="${idx}" style="padding:14px;border-bottom:1px solid var(--border);">
                        <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
                            <img src="${safePoster(c.existing.poster,'thumb')}" style="width:40px;height:60px;object-fit:cover;border-radius:4px;" onerror="this.src='${PLACEHOLDER_THUMB}'">
                            <div style="flex:1;">
                                <div style="font-size:14px;font-weight:700;color:var(--text);">${c.existing.title}</div>
                                <div style="font-size:11px;color:var(--text3);margin-top:2px;">${c.existing.year||'—'}</div>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                            <div style="flex:1;padding:8px;background:var(--surface2);border-radius:8px;min-width:120px;">
                                <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:4px;">Current</div>
                                <div style="font-size:12px;color:var(--text);">${c.existingWatchedCount} eps watched</div>
                                <div style="font-size:11px;color:var(--text3);">${c.existing.user_status||'—'} ${c.existing.my_rating?'· ★'+c.existing.my_rating:''}</div>
                            </div>
                            <div style="flex:1;padding:8px;background:var(--surface2);border-radius:8px;min-width:120px;">
                                <div style="font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;margin-bottom:4px;">Import</div>
                                <div style="font-size:12px;color:var(--text);">${c.importWatchedCount} eps watched</div>
                                <div style="font-size:11px;color:var(--text3);">${c.importData.user_status||'—'} ${c.importData.is_favorite?'· ⭐':''}</div>
                            </div>
                        </div>
                        <div class="conflict-action-btns" data-idx="${idx}" style="display:flex;gap:6px;flex-wrap:wrap;">
                            <button onclick="setConflictAction(${idx},'keep')" class="conflict-btn" data-action="keep" style="flex:1;padding:7px 8px;border-radius:6px;border:2px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-weight:600;cursor:pointer;min-width:70px;">Keep Current</button>
                            <button onclick="setConflictAction(${idx},'import')" class="conflict-btn" data-action="import" style="flex:1;padding:7px 8px;border-radius:6px;border:2px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-weight:600;cursor:pointer;min-width:70px;">Use Import</button>
                            <button onclick="setConflictAction(${idx},'merge')" class="conflict-btn" data-action="merge" style="flex:1;padding:7px 8px;border-radius:6px;border:2px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-weight:600;cursor:pointer;min-width:70px;">Merge</button>
                            <button onclick="setConflictAction(${idx},'skip')" class="conflict-btn" data-action="skip" style="flex:1;padding:7px 8px;border-radius:6px;border:2px solid var(--border);background:var(--surface);color:var(--text);font-size:11px;font-weight:600;cursor:pointer;min-width:70px;">Skip</button>
                        </div>
                    </div>`).join('')}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:12px;background:var(--surface2);border-radius:10px;">
                <div style="width:100%;font-size:12px;color:var(--text3);margin-bottom:6px;font-weight:600;">Apply to all conflicts:</div>
                <button onclick="setAllConflictActions('keep')" style="flex:1;padding:8px 10px;background:var(--surface);border:2px solid var(--border);border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;color:var(--text);min-width:70px;">Keep All</button>
                <button onclick="setAllConflictActions('import')" style="flex:1;padding:8px 10px;background:var(--surface);border:2px solid var(--border);border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;color:var(--text);min-width:70px;">Import All</button>
                <button onclick="setAllConflictActions('merge')" style="flex:1;padding:8px 10px;background:var(--surface);border:2px solid var(--border);border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;color:var(--text);min-width:70px;">Merge All</button>
                <button onclick="setAllConflictActions('skip')" style="flex:1;padding:8px 10px;background:var(--surface);border:2px solid var(--border);border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;color:var(--text);min-width:70px;">Skip All</button>
            </div>
            <div id="import-conflict-status" style="margin-bottom:12px;"></div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button onclick="cancelImportConflicts()" style="padding:10px 20px;border:2px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;cursor:pointer;font-weight:600;">Cancel</button>
                <button onclick="confirmImportConflicts()" style="padding:10px 24px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Confirm</button>
            </div>`;

        window._importConflicts = conflicts;
        window._importConflictResolve = resolve;
        window._importConflictStatusEl = statusEl;
        openModal('import-conflict-modal');
    });
}

function setConflictAction(idx, action) {
    window._importConflicts[idx].action = action;
    const btns = document.querySelectorAll(`.conflict-action-btns[data-idx="${idx}"] .conflict-btn`);
    const colors = { keep: 'var(--accent)', import: 'var(--orange)', merge: 'var(--green)', skip: 'var(--text3)' };
    btns.forEach(btn => {
        const isActive = btn.dataset.action === action;
        if (isActive) { btn.style.background = colors[action]; btn.style.color = 'white'; btn.style.borderColor = colors[action]; }
        else { btn.style.background = 'var(--surface)'; btn.style.color = 'var(--text)'; btn.style.borderColor = 'var(--border)'; }
    });
}

function setAllConflictActions(action) {
    window._importConflicts.forEach((c, idx) => setConflictAction(idx, action));
}

async function confirmImportConflicts() {
    const conflicts = window._importConflicts;
    const statusEl = window._importConflictStatusEl;
    const resolvePromise = window._importConflictResolve;

    const unresolved = conflicts.filter(c => !c.action);
    if (unresolved.length > 0) {
        const conflictStatus = document.getElementById('import-conflict-status');
        if (conflictStatus) conflictStatus.innerHTML = `<p style="color:var(--red);font-size:13px;">⚠️ ${unresolved.length} show${unresolved.length!==1?'s':''} still need a choice.</p>`;
        return;
    }

    let kept = 0, imported = 0, merged = 0, skipped = 0, failed = 0;

    for (const conflict of conflicts) {
        try {
            if (conflict.action === 'skip') {
                skipped++;
            } else if (conflict.action === 'keep') {
                // Save any new IDs we found
                const updateData = {};
                if (!conflict.existing.tvmaze_id && conflict.importData.tvmaze_id) updateData.tvmaze_id = conflict.importData.tvmaze_id;
                if (!conflict.existing.tvdb_id && conflict.importData.tvdb_id) updateData.tvdb_id = conflict.importData.tvdb_id;
                if (!conflict.existing.tmdb_id && conflict.importData.tmdb_id) updateData.tmdb_id = conflict.importData.tmdb_id;
                if (Object.keys(updateData).length) await updateDoc(doc(db,'series',conflict.existing.docId), updateData);
                kept++;
            } else if (conflict.action === 'import') {
                await setDoc(doc(db,'series',conflict.importData.docId), buildImportDoc(conflict.importData));
                imported++;
            } else if (conflict.action === 'merge') {
                const mergedSeasons = mergeSeasons(conflict.existing.seasons, conflict.importData.seasons);
                const updateData = { seasons: mergedSeasons, seasons_tmdb: mergedSeasons };
                if (!conflict.existing.tvmaze_id && conflict.importData.tvmaze_id) updateData.tvmaze_id = conflict.importData.tvmaze_id;
                if (!conflict.existing.tvdb_id && conflict.importData.tvdb_id) updateData.tvdb_id = conflict.importData.tvdb_id;
                if (!conflict.existing.tmdb_id && conflict.importData.tmdb_id) updateData.tmdb_id = conflict.importData.tmdb_id;
                if (!conflict.existing.genres?.length && conflict.importData.detailData?.genres?.length) updateData.genres = conflict.importData.detailData.genres;
                if (!conflict.existing.original_language && conflict.importData.detailData?.original_language) updateData.original_language = conflict.importData.detailData.original_language;
                if (conflict.importData.created_at && (!conflict.existing.created_at || new Date(conflict.importData.created_at) < new Date(conflict.existing.created_at))) updateData.created_at = conflict.importData.created_at;
                // Remove any undefined values
                Object.keys(updateData).forEach(k => { if (updateData[k] === undefined) updateData[k] = null; });
                await updateDoc(doc(db,'series',conflict.existing.docId), updateData);
                merged++;
            }
            await new Promise(r => setTimeout(r, 300));
        } catch (e) { failed++; logError('Import conflict resolve', e, { show: conflict.existing.title }); }
    }

    closeModal('import-conflict-modal');
    if (statusEl) {
        statusEl.className = 'success';
        statusEl.textContent = `✓ Done! Kept: ${kept}, Imported: ${imported}, Merged: ${merged}, Skipped: ${skipped}${failed?`, Failed: ${failed}`:''} — Run "Full Library Sync" to build TVMaze data.`;
    }

    delete window._importConflicts;
    delete window._importConflictResolve;
    delete window._importConflictStatusEl;
    await loadMyList();
    if (resolvePromise) resolvePromise();
}

function cancelImportConflicts() {
    closeModal('import-conflict-modal');
    const statusEl = window._importConflictStatusEl;
    if (statusEl) { statusEl.className = 'success'; statusEl.textContent = 'Import cancelled. New shows were already imported.'; }
    delete window._importConflicts;
    delete window._importConflictResolve;
    delete window._importConflictStatusEl;
}

// ===== CALENDAR =====
async function loadSectionCalendar(section) {
    const isAnime = section === 'anime';
    const shows = isAnime ? getAnime() : getTVShows();
    const todayEl = document.getElementById(`${section}-calendar-today`);
    const weekEl = document.getElementById(`${section}-calendar-week`);
    const upcomingEl = document.getElementById(`${section}-calendar-upcoming`);
    const today = new Date(), todayStr = today.toISOString().split('T')[0];
    const weekStr = new Date(today.getTime() + 7*86400000).toISOString().split('T')[0];
    const monthStr = new Date(today.getTime() + 30*86400000).toISOString().split('T')[0];
    const toCheck = shows.filter(s => s.tmdb_id && ['Returning Series','In Production','Unknown'].includes(s.tmdb_status));
    if (todayEl) todayEl.innerHTML = `<p class="empty-state">Checking ${toCheck.length} shows...</p>`;
    if (weekEl) weekEl.innerHTML = '';
    if (upcomingEl) upcomingEl.innerHTML = '';
    const tEps=[], wEps=[], uEps=[]; let checked=0;
    for (const show of toCheck) {
        try {
            checked++;
            if (todayEl) todayEl.innerHTML = `<p class="empty-state">Checking ${checked}/${toCheck.length}...</p>`;
            const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);
            if (det.status && det.status !== show.tmdb_status) updateDoc(doc(db,'series',show.docId),{tmdb_status:det.status,last_status_check:new Date().toISOString()}).catch(()=>{});
            if (['Returning Series','In Production'].includes(det.status) && det.next_episode_to_air) {
                let ad = det.next_episode_to_air.air_date;
                const epSeason = det.next_episode_to_air.season_number;
                const epNumber = det.next_episode_to_air.episode_number;

                // Issue 7: Cross-reference with local episode data (which may have TVMaze dates)
                const localSeason = show.seasons?.find(s => s.number === epSeason);
                const localEp = localSeason?.episodes?.find(e => e.number === epNumber && !e.is_special);
                if (localEp?.air_date) {
                    ad = localEp.air_date; // Use the local (TVMaze-sourced) date
                }

                const atd = show.air_time_data;
                const ghanaTimeStr = (atd && atd.source && atd.source !== 'default' && atd.time) ? convertToGhanaTime(atd.time, atd.timezone) : null;
                const ep = {
                    show: show.title, poster: show.poster, docId: show.docId,
                    season: epSeason, episode: epNumber,
                    name: det.next_episode_to_air.name,
                    airDate: ad, airDateObj: new Date(ad), airTime: ghanaTimeStr
                };
                if (ad === todayStr) tEps.push(ep);
                else if (ad > todayStr && ad <= weekStr) wEps.push(ep);
                else if (ad > weekStr && ad <= monthStr) uEps.push(ep);
            }
            await new Promise(r => setTimeout(r, 300));
        } catch (e) { logError('Calendar check', e, { show: show.title }); }
    }
    localStorage.setItem(`upcomingCache_${section}`, JSON.stringify({ today:tEps, week:wEps, upcoming:uEps }));
    localStorage.setItem(`upcomingCache_${section}_day`, getTodayString());
    if (todayEl) displayCalItems(todayEl, tEps, true);
    if (weekEl) displayCalItems(weekEl, wEps, false);
    if (upcomingEl) displayCalItems(upcomingEl, uEps, false);
}

function displayCalendarFromCache(section, data) {
    const todayEl = document.getElementById(`${section}-calendar-today`);
    const weekEl = document.getElementById(`${section}-calendar-week`);
    const upcomingEl = document.getElementById(`${section}-calendar-upcoming`);
    if (todayEl) displayCalItems(todayEl, data.today||[], true);
    if (weekEl) displayCalItems(weekEl, data.week||[], false);
    if (upcomingEl) displayCalItems(upcomingEl, data.upcoming||[], false);
}

function displayCalItems(container, episodes, isToday) {
    if (!episodes.length) { container.innerHTML = '<p class="empty-state">No episodes.</p>'; return; }
    episodes.sort((a,b) => new Date(a.airDateObj) - new Date(b.airDateObj));
    container.innerHTML = episodes.map(ep => {
        const p = safePoster(ep.poster,'thumb'), dateStr = formatAirDate(new Date(ep.airDateObj)), timeStr = ep.airTime || '';
        return `<div class="calendar-item ${isToday?'airing-today':''}" onclick="openDetails('${ep.docId}','tv')">
            <img src="${p}" onerror="this.src='${PLACEHOLDER_THUMB}'">
            <div class="calendar-item-info">
                <h4>${ep.show}</h4>
                <div class="episode-title">S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')} - ${ep.name}</div>
                <div class="air-date ${isToday?'today':''}">📅 ${dateStr}${timeStr?` <span class="air-time">${timeStr}</span>`:''}</div>
            </div>
        </div>`;
    }).join('');
}

function formatAirDate(date) {
    const t=new Date(); t.setHours(0,0,0,0);
    const tm=new Date(t); tm.setDate(tm.getDate()+1);
    const c=new Date(date); c.setHours(0,0,0,0);
    if(c.getTime()===t.getTime()) return 'Today';
    if(c.getTime()===tm.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-GB',{weekday:'short',month:'short',day:'numeric'});
}

// ===== RESCAN / AUTO TAG =====
async function rescanAnime() {
    const statusEl = document.getElementById('settings-action-status');
    const shows = myList.filter(i => i.type==='tv'&&i.tmdb_id);
    if (statusEl) statusEl.innerHTML = `<p style="color:var(--accent);">Scanning ${shows.length} shows...</p>`;
    let changed = 0;
    for (let i=0;i<shows.length;i++) {
        try {
            if (statusEl) statusEl.innerHTML = `<p style="color:var(--accent);">Scanning ${i+1}/${shows.length}...</p>`;
            const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${shows[i].tmdb_id}?api_key=${TMDB_API_KEY}`);
            const shouldBe = isAnimeShow(det);
            if (shouldBe !== shows[i].is_anime) { await updateDoc(doc(db,'series',shows[i].docId),{is_anime:shouldBe}); shows[i].is_anime=shouldBe; changed++; }
            if (i%20===0) await new Promise(r=>setTimeout(r,500));
        } catch(e){logError('Rescan',e,{show:shows[i].title});}
    }
    if (statusEl) statusEl.innerHTML = `<p style="color:var(--green);">✓ ${changed} shows updated.</p>`;
    await loadMyList();
}

async function autoTagStatuses() {
    const statusEl = document.getElementById('settings-action-status');
    if (statusEl) statusEl.innerHTML = '<p style="color:var(--accent);">Tagging...</p>';
    let changed = 0;
    for (const item of myList) {
        if (item.type!=='tv'||item.user_status==='Rewatching') continue;
        const progress = getShowProgressExcludingSpecials(item);
        const hasWatched = item.seasons?.some(s=>s.number!==0&&s.episodes?.some(e=>e.is_watched&&!e.is_special));
        const tmdb = item.tmdb_status||''; let newStatus = item.user_status;
        if (!hasWatched&&!['Dropped','Paused'].includes(item.user_status)) newStatus='Planned';
        else if (progress>=100&&(tmdb==='Ended'||tmdb==='Canceled')) newStatus='Finished';
        else if (progress>=100&&tmdb==='Returning Series') newStatus='Up to Date';
        else if (hasWatched&&progress<100&&!['Dropped','Paused','Finished'].includes(item.user_status)) newStatus='Watching';
        if (newStatus!==item.user_status){await updateDoc(doc(db,'series',item.docId),{user_status:newStatus});item.user_status=newStatus;changed++;}
    }
    if (statusEl) statusEl.innerHTML = `<p style="color:var(--green);">✓ ${changed} shows updated.</p>`;
    await loadMyList();
}

// ===== BULK EDIT =====
function openBulkTagger() {
    const body = document.getElementById('bulk-modal-body');
    const shows = myList.filter(i=>i.type==='tv'), movies = myList.filter(i=>i.type==='movie');
    body.innerHTML = `<h2 style="margin-bottom:15px;color:var(--accent);">📋 Bulk Edit</h2>
        <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <select id="bulk-type-filter" onchange="filterBulkList()" style="padding:6px 12px;border:2px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;">
                <option value="all">All</option><option value="anime">Anime</option><option value="tv">TV</option><option value="movie">Movies</option>
            </select>
            <button onclick="selectAllBulk()" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text);">Select All</button>
        </div>
        <div class="bulk-list" id="bulk-list">${[...shows,...movies].map(item=>`<div class="bulk-item" data-type="${item.type}" data-anime="${item.is_anime||false}"><input type="checkbox" value="${item.docId}" data-item-type="${item.type}"><img src="${safePoster(item.poster,'thumb')}" onerror="this.src='${PLACEHOLDER_THUMB}'"><span class="bulk-item-title">${item.title}</span><span class="bulk-item-status">${item.user_status||(item.is_watched?'Watched':'—')}</span></div>`).join('')}</div>
        <div class="bulk-actions">
            <select id="bulk-action"><option value="">Choose action...</option><option value="Watching">Set: Watching</option><option value="Up to Date">Set: Up to Date</option><option value="Rewatching">Set: Rewatching</option><option value="Finished">Set: Finished</option><option value="Paused">Set: Paused</option><option value="Dropped">Set: Dropped</option><option value="Planned">Set: Planned</option><option value="anime-true">Tag: Anime</option><option value="anime-false">Remove: Anime Tag</option><option value="fav-true">Tag: Favorite</option><option value="fav-false">Remove: Favorite</option><option value="hide-true">Hide from List (R+)</option><option value="hide-false">Show in List</option></select>
            <button onclick="applyBulkAction()">Apply</button>
        </div>`;
    openModal('bulk-modal');
}

function filterBulkList() { const f=document.getElementById('bulk-type-filter').value; document.querySelectorAll('.bulk-item').forEach(item=>{const t=item.dataset.type,a=item.dataset.anime==='true';if(f==='all')item.style.display='flex';else if(f==='anime')item.style.display=a?'flex':'none';else if(f==='tv')item.style.display=(t==='tv'&&!a)?'flex':'none';else if(f==='movie')item.style.display=t==='movie'?'flex':'none';}); }
function selectAllBulk() { const vis=document.querySelectorAll('.bulk-item:not([style*="none"]) input[type="checkbox"]'); const all=[...vis].every(c=>c.checked); vis.forEach(c=>c.checked=!all); }
async function applyBulkAction() { const action=document.getElementById('bulk-action').value; if(!action)return; const checked=document.querySelectorAll('.bulk-item input:checked'); if(!checked.length){alert('Select items first!');return;} for(const cb of checked){const docId=cb.value,itemType=cb.dataset.itemType,col=itemType==='movie'?'movies':'series';try{if(action.startsWith('anime-'))await updateDoc(doc(db,col,docId),{is_anime:action==='anime-true'});else if(action.startsWith('fav-'))await updateDoc(doc(db,col,docId),{is_favorite:action==='fav-true'});else if(action.startsWith('hide-'))await updateDoc(doc(db,col,docId),{hide_from_list:action==='hide-true'});else await updateDoc(doc(db,col,docId),{user_status:action});}catch(e){logError('Bulk action',e,{docId});}} closeModal('bulk-modal'); await loadMyList(); }

// ===== CLOSE MODALS =====
window.addEventListener('click', e => {
    [...MODAL_IDS].forEach(id => { if(e.target===document.getElementById(id)) closeModal(id); });
    if (!e.target.closest('.show-options')) document.querySelectorAll('.options-menu').forEach(m=>m.classList.remove('show'));
});
document.querySelector('#modal .close').addEventListener('click', () => closeModal('modal'));
document.getElementById('import-movies-btn').addEventListener('click', importMovies);
document.getElementById('import-series-btn').addEventListener('click', importSeries);

// ===== WINDOW GLOBALS =====
window.openDetails = openDetails; window.openPreview = openPreview; window.openEpisodeDetail = openEpisodeDetail;
window.openPreviewFromTVMaze = openPreviewFromTVMaze; window.addToListFromTVMaze = addToListFromTVMaze;
window.addToList = addToList; window.removeFromList = removeFromList; window.removeFromListByTMDB = removeFromListByTMDB;
window.toggleEpisode = toggleEpisode; window.toggleFavorite = toggleFavorite; window.toggleWatched = toggleWatched;
window.markSeasonWatched = markSeasonWatched; window.quickMarkWatched = quickMarkWatched;
window.setUserStatus = setUserStatus; window.toggleAnimeStatus = toggleAnimeStatus;
window.toggleOptionsMenu = toggleOptionsMenu; window.toggleSeason = toggleSeason;
window.switchDetailTab = switchDetailTab; window.switchSection = switchSection; window.switchSubTab = switchSubTab;
window.renderLibrary = renderLibrary; window.loadSectionCalendar = loadSectionCalendar;
window.exportData = exportData; window.openPersonalListModal = openPersonalListModal; window.generatePersonalList = generatePersonalList;
window.handlePreviewAdd = handlePreviewAdd; window.openStatsPage = openStatsPage; window.renderStats = renderStats;
window.rescanAnime = rescanAnime; window.autoTagStatuses = autoTagStatuses;
window.openBulkTagger = openBulkTagger; window.filterBulkList = filterBulkList; window.selectAllBulk = selectAllBulk; window.applyBulkAction = applyBulkAction;
window.openTagSpecialsModal = openTagSpecialsModal; window.applySpecialTags = applySpecialTags; window.filterTagSpecials = filterTagSpecials;
window.syncAiringShows = syncAiringShows; window.fullLibrarySync = fullLibrarySync; window.confirmFullSync = confirmFullSync;
window.generateErrorLog = generateErrorLog; window.fetchMissingTVDBIds = fetchMissingTVDBIds;
window.openRateShowsModal = openRateShowsModal; window.filterRateList = filterRateList; window.rateShowInline = rateShowInline; window.setMyRating = setMyRating;
window.closeModal = closeModal; window.refreshApp = refreshApp;
window.setAccentColor = setAccentColor; window.setRewatchColor = setRewatchColor;
window.setCardStyle = setCardStyle; window.setPosterSize = setPosterSize; window.setFontSize = setFontSize; window.setEpisodeSource = setEpisodeSource;
window.toggleSettingsGroup = toggleSettingsGroup; window.toggleImportSection = toggleImportSection;
window.jumpToSection = jumpToSection;
window.toggleHideUpToDate = toggleHideUpToDate;
window.toggleHideFromList = toggleHideFromList;
window.renderCollections = renderCollections; window.filterCollections = filterCollections;
window.openCollection = openCollection; window.filterCollectionModal = filterCollectionModal;
window.updateNavBadges = updateNavBadges; window.saveEpisodeNote = saveEpisodeNote;
window.showEditWatchDateInline = showEditWatchDateInline; window.applyEditWatchDate = applyEditWatchDate;
window.showRewatchSeasonConfirm = showRewatchSeasonConfirm;
window.showUnmarkOptionsConfirm = showUnmarkOptionsConfirm;
window.openEditDatesModal = openEditDatesModal; window.filterEditDatesList = filterEditDatesList;
window.selectAllEditDates = selectAllEditDates; window.applyBulkEditDates = applyBulkEditDates;
window.openFixShowModal = openFixShowModal; window.runFixShowSearch = runFixShowSearch;
window.selectFixShowResult = selectFixShowResult; window.applyFixShowData = applyFixShowData;
window.applyTVMazeFallback = applyTVMazeFallback;
window.toggleSaveFeedback = toggleSaveFeedback; window.toggleIdBadges = toggleIdBadges;
window.toggleRefreshStatus = toggleRefreshStatus; window.toggleOfflineIndicator = toggleOfflineIndicator;
window.openIDManager = openIDManager; window.saveShowID = saveShowID; window.verifyShowID = verifyShowID; window.filterIDManager = filterIDManager;
window.openManualAirTimeModal = openManualAirTimeModal; window.applyManualAirTime = applyManualAirTime; window.filterAirtimeShows = filterAirtimeShows; window.updateAirtimePreview = updateAirtimePreview;
window.setConflictAction = setConflictAction; window.setAllConflictActions = setAllConflictActions;
window.confirmImportConflicts = confirmImportConflicts; window.cancelImportConflicts = cancelImportConflicts;
window.renderIDManager = renderIDManager;
