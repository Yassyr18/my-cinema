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

let myList = [];
let currentSearchType = 'multi';
let tmdbCache = {};
let currentSection = 'anime';
let isLoading = false;
let activeDetailTab = 'info-tab';
let expandedSeasons = new Set(); // Track expanded seasons

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    setupBottomNav();
    setupSearch();
    setupSubTabSwipe();
    setupPullToRefresh();
    setupDarkMode();
    await loadMyList();
    setupRealtimeListeners();
    setupAutoSync();
    setupUpcomingAutoRefresh();
});

// ===== DARK MODE =====
function setupDarkMode() {
    const toggle = document.getElementById('dark-mode-toggle');
    const saved = localStorage.getItem('darkMode') === 'true';
    if (saved) {
        document.documentElement.setAttribute('data-theme', 'dark');
        toggle.checked = true;
    }
    toggle.addEventListener('change', () => {
        document.documentElement.setAttribute('data-theme', toggle.checked ? 'dark' : 'light');
        localStorage.setItem('darkMode', toggle.checked);
    });
}

// ===== PULL TO REFRESH =====
let pullStartY = 0, pulling = false;

function setupPullToRefresh() {
    const container = document.getElementById('main-container');
    const indicator = document.getElementById('pull-refresh-indicator');

    container.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) { pullStartY = e.touches[0].clientY; pulling = true; }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!pulling) return;
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

// ===== REALTIME =====
function setupRealtimeListeners() {
    let debounceTimer;
    const debouncedLoad = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { if (!isLoading) loadMyList(); }, 2000);
    };
    onSnapshot(collection(db, 'movies'), debouncedLoad);
    onSnapshot(collection(db, 'series'), debouncedLoad);
}

// ===== AUTO SYNC EVERY 24HRS =====
function setupAutoSync() {
    const lastSync = localStorage.getItem('lastEpisodeSync');
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (!lastSync || now - parseInt(lastSync) > twentyFourHours) {
        // Delay sync by 5 seconds after load to not block UI
        setTimeout(() => syncAllAiringShows(true), 5000);
    }

    // Check every hour if 24hrs have passed
    setInterval(() => {
        const last = localStorage.getItem('lastEpisodeSync');
        if (!last || Date.now() - parseInt(last) > twentyFourHours) {
            syncAllAiringShows(true);
        }
    }, 3600000);
}

// ===== UPCOMING AUTO REFRESH =====
function setupUpcomingAutoRefresh() {
    // When switching to upcoming tab, check if cache is stale (>24hrs)
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.subtab;
            if (tabId === 'anime-upcoming' || tabId === 'tv-upcoming') {
                const section = tabId.includes('anime') ? 'anime' : 'tv';
                const cacheKey = `upcomingCache_${section}`;
                const cacheTime = localStorage.getItem(`${cacheKey}_time`);
                const now = Date.now();
                const twentyFourHours = 24 * 60 * 60 * 1000;

                if (!cacheTime || now - parseInt(cacheTime) > twentyFourHours) {
                    loadSectionCalendar(section);
                } else {
                    // Load from cache
                    const cached = localStorage.getItem(cacheKey);
                    if (cached) {
                        try {
                            const data = JSON.parse(cached);
                            displayCalendarFromCache(section, data);
                        } catch(e) {
                            loadSectionCalendar(section);
                        }
                    } else {
                        loadSectionCalendar(section);
                    }
                }
            }
        });
    });
}

// ===== SYNC ALL AIRING SHOWS =====
async function syncAllAiringShows(silent = false) {
    const statusEl = document.getElementById('settings-action-status');
    const shows = myList.filter(i =>
        i.type === 'tv' &&
        i.tmdb_id &&
        ['Returning Series', 'In Production'].includes(i.tmdb_status)
    );

    if (!silent && statusEl) {
        statusEl.innerHTML = `<p style="color:var(--accent);">Syncing ${shows.length} airing shows...</p>`;
    }

    let updated = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < shows.length; i++) {
        const show = shows[i];
        try {
            if (!silent && statusEl) {
                statusEl.innerHTML = `<p style="color:var(--accent);">Syncing ${i+1}/${shows.length}: ${show.title}</p>`;
            }

            const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);
            const newSeasons = [];

            for (let s = 0; s <= det.number_of_seasons; s++) {
                try {
                    const sd = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}/season/${s}?api_key=${TMDB_API_KEY}`);
                    if (!sd.episodes?.length) continue;

                    // Get existing season data
                    const existingSeason = show.seasons?.find(es => es.number === s);

                    const episodes = sd.episodes.map(ep => {
                        const existing = existingSeason?.episodes?.find(e => e.number === ep.episode_number);
                        return {
                            number: ep.episode_number,
                            name: ep.name || `Episode ${ep.episode_number}`,
                            air_date: ep.air_date || null,
                            is_watched: existing?.is_watched || false,
                            watched_at: existing?.watched_at || null,
                            rewatch_count: existing?.rewatch_count || 0,
                            rewatch_history: existing?.rewatch_history || [],
                            is_special: existing?.is_special || false
                        };
                    });

                    // Detect and fix duplicate episode numbers (specials masquerading as regular eps)
                    const fixed = detectAndFixDuplicateEpisodes(episodes, s);

                    newSeasons.push({
                        number: s,
                        is_specials: s === 0,
                        episodes: fixed
                    });
                } catch(e) {}
            }

            if (newSeasons.length > 0) {
                // Merge: keep existing watch data, add new episodes
                const mergedSeasons = mergeSeasonData(show.seasons || [], newSeasons);

                await updateDoc(doc(db, 'series', show.docId), {
                    seasons: mergedSeasons,
                    tmdb_status: det.status || show.tmdb_status,
                    last_synced: new Date().toISOString()
                });

                show.seasons = mergedSeasons;
                show.tmdb_status = det.status || show.tmdb_status;
                updated++;
            }

            await new Promise(r => setTimeout(r, 400));
        } catch(e) {
            console.error(`Sync failed for ${show.title}:`, e);
        }
    }

    localStorage.setItem('lastEpisodeSync', Date.now().toString());

    if (!silent && statusEl) {
        statusEl.innerHTML = `<p style="color:var(--green);">✓ Synced ${updated} shows!</p>`;
    }

    if (updated > 0) renderAllSections();
}

// ===== DETECT & FIX DUPLICATE EPISODE NUMBERS =====
// Episodes with duplicate numbers that break sequence are specials
function detectAndFixDuplicateEpisodes(episodes, seasonNum) {
    if (seasonNum === 0) return episodes; // Already specials

    const seen = new Map(); // ep number -> first occurrence index
    const result = [];

    // First pass: find duplicates
    const numCount = {};
    episodes.forEach(ep => {
        numCount[ep.number] = (numCount[ep.number] || 0) + 1;
    });

    // Second pass: mark duplicates as specials
    const seenNums = new Set();
    episodes.forEach(ep => {
        if (numCount[ep.number] > 1) {
            if (seenNums.has(ep.number)) {
                // This is the duplicate — mark as special
                result.push({ ...ep, is_special: true, original_number: ep.number });
            } else {
                seenNums.add(ep.number);
                result.push(ep);
            }
        } else {
            result.push(ep);
        }
    });

    return result;
}

// ===== MERGE SEASON DATA =====
function mergeSeasonData(existingSeasons, newSeasons) {
    return newSeasons.map(newSeason => {
        const existingSeason = existingSeasons.find(s => s.number === newSeason.number);
        if (!existingSeason) return newSeason;

        const mergedEpisodes = newSeason.episodes.map(newEp => {
            // Match by number AND name similarity to avoid special conflicts
            const existingEp = existingSeason.episodes.find(e =>
                e.number === newEp.number &&
                !e.is_special &&
                !newEp.is_special
            ) || existingSeason.episodes.find(e =>
                e.number === newEp.number &&
                e.is_special === newEp.is_special
            );

            if (existingEp) {
                return {
                    ...newEp,
                    is_watched: existingEp.is_watched || false,
                    watched_at: existingEp.watched_at || null,
                    rewatch_count: existingEp.rewatch_count || 0,
                    rewatch_history: existingEp.rewatch_history || [],
                    is_special: newEp.is_special || existingEp.is_special || false
                };
            }
            return newEp;
        });

        return { ...newSeason, episodes: mergedEpisodes };
    });
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

// ===== SUB TAB SWIPE =====
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
    const topInput = document.getElementById('search-input');
    const overlayInput = document.getElementById('search-overlay-input');
    const btn = document.getElementById('search-btn');
    const closeBtn = document.getElementById('close-search-btn');
    const clearBtn = document.getElementById('search-clear-btn');

    topInput.addEventListener('focus', (e) => { e.preventDefault(); showSearchOverlay(); });
    topInput.addEventListener('click', (e) => { e.preventDefault(); showSearchOverlay(); });

    btn.addEventListener('click', () => {
        showSearchOverlay();
        overlayInput.value = topInput.value;
        if (overlayInput.value.trim()) performSearch();
    });

    closeBtn.addEventListener('click', hideSearchOverlay);
    overlayInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
    overlayInput.addEventListener('input', () => { clearBtn.style.display = overlayInput.value ? 'block' : 'none'; });

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
    } catch (e) {
        container.innerHTML = '<p class="empty-state">Search failed.</p>';
    }
}

function displaySearchResults(results) {
    const container = document.getElementById('search-results');
    if (!results.length) { container.innerHTML = '<p class="empty-state">No results.</p>'; return; }

    container.innerHTML = results.map(item => {
        const title = item.title || item.name || 'Unknown';
        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
        const type = item.media_type || currentSearchType;
        if (type === 'person') return '';
        const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : 'https://via.placeholder.com/140x210?text=No+Image';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const isInList = myList.some(li => li.tmdb_id === item.id);
        const safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <div class="media-card" onclick="openPreview(${item.id},'${type}','${safeTitle}','${year}','${poster}')">
                <img src="${poster}" alt="${title}" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'">
                <div class="info">
                    <h3>${title}</h3>
                    <p class="year">${year} · ⭐${rating}</p>
                </div>
                <button class="add-btn ${isInList ? 'in-list-btn' : ''}"
                    onclick="event.stopPropagation(); ${isInList ? `removeFromListByTMDB(${item.id},'${type}')` : `addToList(${item.id},'${type}','${safeTitle}','${year}','${poster}')`}">
                    ${isInList ? '✓ In Library' : '+ Add'}
                </button>
            </div>
        `;
    }).filter(Boolean).join('');
}

// ===== TMDB CACHE =====
async function tmdbFetch(url) {
    if (tmdbCache[url] && Date.now() - tmdbCache[url].time < 3600000) return tmdbCache[url].data;
    const response = await fetch(url);
    const data = await response.json();
    tmdbCache[url] = { data, time: Date.now() };
    return data;
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
    } catch (e) { console.error('Load error:', e); }
    isLoading = false;
}

// ===== HELPERS =====
function getAnime() { return myList.filter(i => i.type === 'tv' && i.is_anime); }
function getTVShows() { return myList.filter(i => i.type === 'tv' && !i.is_anime); }
function getMovies() { return myList.filter(i => i.type === 'movie'); }

// Only count AIRED episodes in progress (air_date <= today)
function getAiredEpisodesOnly(seasons) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const aired = [];
    (seasons || []).forEach(s => {
        if (s.number === 0) return;
        (s.episodes || []).forEach(ep => {
            if (ep.is_special) return;
            const airDate = ep.air_date ? new Date(ep.air_date) : null;
            if (!airDate || airDate <= today) {
                aired.push({ ...ep, seasonNum: s.number });
            }
        });
    });
    return aired;
}

function getShowProgressExcludingSpecials(show) {
    const aired = getAiredEpisodesOnly(show.seasons);
    if (!aired.length) return 0;
    const watched = aired.filter(ep => ep.is_watched).length;
    return (watched / aired.length) * 100;
}

function getNextEpisodeExcludingSpecials(show) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (!show.seasons) return null;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special) continue;
            const airDate = ep.air_date ? new Date(ep.air_date) : null;
            if (airDate && airDate > today) continue; // Skip unaired
            if (!ep.is_watched) return {
                season: s.number,
                number: ep.number,
                name: ep.name || `Episode ${ep.number}`,
                air_date: ep.air_date || null
            };
        }
    }
    return null;
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

// Check if show aired an episode within last 7 days
function isCurrentlyAiring(show) {
    if (!['Returning Series', 'In Production'].includes(show.tmdb_status)) return false;
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneWeekAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Check if any episode aired in the last 7 days OR is airing within next 7 days
    for (const s of (show.seasons || [])) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (!ep.air_date) continue;
            const airDate = new Date(ep.air_date);
            if (airDate >= sevenDaysAgo && airDate <= oneWeekAhead) return true;
        }
    }
    return false;
}

// Get the most recent aired episode date for sorting
function getMostRecentAirDate(show) {
    const today = new Date();
    let mostRecent = null;
    (show.seasons || []).forEach(s => {
        if (s.number === 0) return;
        (s.episodes || []).forEach(ep => {
            if (!ep.air_date) return;
            const d = new Date(ep.air_date);
            if (d <= today) {
                if (!mostRecent || d > mostRecent) mostRecent = d;
            }
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
                        show: show.title,
                        poster: show.poster,
                        docId: show.docId,
                        season: s.number,
                        episode: ep.number,
                        name: ep.name,
                        watched_at: ep.watched_at,
                        is_special: ep.is_special || false
                    });
                }
            });
        });
    });
    eps.sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));
    return eps;
}

function getPreviousUnwatchedEpisodes(show, targetSeason, targetEp) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const unwatched = [];
    if (!show.seasons) return unwatched;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        if (s.number > targetSeason) break;
        for (const ep of (s.episodes || [])) {
            if (ep.is_special) continue;
            if (s.number === targetSeason && ep.number >= targetEp) break;
            const airDate = ep.air_date ? new Date(ep.air_date) : null;
            if (airDate && airDate > today) continue; // Skip unaired
            if (!ep.is_watched) unwatched.push({ seasonNum: s.number, episodeNum: ep.number });
        }
    }
    return unwatched;
}

function isAnimeShow(details) {
    const genres = details.genres || [];
    const isAnimation = genres.some(g => g.id === 16);
    const isJapanese = details.original_language === 'ja';
    const isChinese = details.original_language === 'zh';
    const animeNets = ['Fuji TV','Tokyo MX','TBS','TV Tokyo','Crunchyroll','AT-X','BS11','MBS','NHK','Bilibili'];
    const networks = details.networks || [];
    return (isAnimation && (isJapanese || isChinese)) || networks.some(n => animeNets.includes(n.name));
}

function formatWatchTime(totalMinutes) {
    const years = Math.floor(totalMinutes / 525600);
    const months = Math.floor((totalMinutes % 525600) / 43800);
    const days = Math.floor((totalMinutes % 43800) / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    let parts = [];
    if (years > 0) parts.push(`${years}y`);
    if (months > 0) parts.push(`${months}m`);
    if (days > 0) parts.push(`${days}d`);
    parts.push(`${hours}h`);
    return parts.join(' ');
}

function getTimelineLabel(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    if (date >= today) return 'Today';
    if (date >= weekAgo) return 'This Week';
    if (date >= twoWeeksAgo) return 'Last Week';
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function autoTagStatusesSilent() {
    myList.forEach(item => {
        if (item.type !== 'tv') return;
        const progress = getShowProgressExcludingSpecials(item);
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

// ===== CONTINUE WATCHING - 4 SECTIONS =====
function renderContinueWatching(sectionType) {
    const isAnime = sectionType === 'anime';
    const container = document.getElementById(`${sectionType}-continue-list`);
    if (!container) return;

    const shows = isAnime ? getAnime() : getTVShows();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Filter base: has progress, NOT dropped, NOT planned, NOT finished/up-to-date
    const inProgress = shows.filter(item => {
        if (!item.seasons?.length) return false;
        if (item.user_status === 'Dropped') return false;
        if (item.user_status === 'Planned') return false;
        let hasWatched = false, hasUnwatched = false;
        item.seasons.forEach(s => {
            if (s.number === 0) return;
            s.episodes?.forEach(ep => {
                if (ep.is_special) return;
                const airDate = ep.air_date ? new Date(ep.air_date) : null;
                const today = new Date(); today.setHours(23,59,59,999);
                if (airDate && airDate > today) return; // skip unaired
                if (ep.is_watched) hasWatched = true;
                else hasUnwatched = true;
            });
        });
        return hasWatched && hasUnwatched;
    });

    // SECTION 1: Currently Airing (aired ep in last 7 days)
    const currentlyAiring = inProgress.filter(s =>
        s.user_status !== 'Paused' && isCurrentlyAiring(s)
    );

    // SECTION 2: Continue Watching (not airing, last watch < 60 days ago)
    const continueWatching = inProgress.filter(s => {
        if (s.user_status === 'Paused') return false;
        if (isCurrentlyAiring(s)) return false;
        const lastWatch = new Date(getLastWatchedDate(s));
        return lastWatch >= sixtyDaysAgo;
    });

    // SECTION 3: Haven't Watched in a While (not airing, last watch > 60 days ago)
    const notWatchedInAWhile = inProgress.filter(s => {
        if (s.user_status === 'Paused') return false;
        if (isCurrentlyAiring(s)) return false;
        const lastWatch = new Date(getLastWatchedDate(s));
        return lastWatch < sixtyDaysAgo;
    });

    // SECTION 4: Paused
    const paused = inProgress.filter(s => s.user_status === 'Paused');

    // Sort Section 1: by most recent air date (newest first)
    currentlyAiring.sort((a, b) => {
        const aDate = getMostRecentAirDate(a);
        const bDate = getMostRecentAirDate(b);
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return bDate - aDate;
    });

    // Sort Section 2: by last watched date (most recent first)
    continueWatching.sort((a, b) =>
        new Date(getLastWatchedDate(b)) - new Date(getLastWatchedDate(a))
    );

    // Sort Section 3: by last watched (most recent first)
    notWatchedInAWhile.sort((a, b) =>
        new Date(getLastWatchedDate(b)) - new Date(getLastWatchedDate(a))
    );

    // Sort Section 4: by last watched
    paused.sort((a, b) =>
        new Date(getLastWatchedDate(b)) - new Date(getLastWatchedDate(a))
    );

    let html = '';

    if (currentlyAiring.length) {
        html += `<div class="continue-section-label">📡 Currently Airing</div>`;
        html += currentlyAiring.map(s => createContinueCard(s)).join('');
    }

    if (continueWatching.length) {
        html += `<div class="continue-section-label">▶ Continue Watching</div>`;
        html += continueWatching.map(s => createContinueCard(s)).join('');
    }

    if (notWatchedInAWhile.length) {
        html += `<div class="continue-section-label">💤 Haven't Watched in a While</div>`;
        html += notWatchedInAWhile.map(s => createContinueCard(s)).join('');
    }

    if (paused.length) {
        html += `<div class="continue-section-label">⏸ Paused</div>`;
        html += paused.map(s => createContinueCard(s, true)).join('');
    }

    if (!html) {
        html = '<p class="empty-state">No shows in progress!</p>';
    }

    container.innerHTML = html;
}

function createContinueCard(show, forcefade = false) {
    const nextEp = getNextEpisodeExcludingSpecials(show);
    const progress = getShowProgressExcludingSpecials(show);
    const safeDocId = show.docId.replace(/'/g, "\\'");
    const poster = show.poster && !show.poster.includes('placeholder')
        ? show.poster : 'https://via.placeholder.com/52x78?text=?';
    const epCode = nextEp
        ? `S${String(nextEp.season).padStart(2,'0')}E${String(nextEp.number).padStart(2,'0')}`
        : 'Up to date';
    const isPaused = show.user_status === 'Paused';
    const airing = isCurrentlyAiring(show);

    return `
       <div class="continue-card ${(isPaused || forcefade) ? 'paused-card' : ''}">
            <img src="${poster}" alt="${show.title}"
                 onerror="this.src='https://via.placeholder.com/52x78?text=?'"
                 onclick="openDetails('${safeDocId}','tv')">
            <div class="continue-info">
                <h3 onclick="openDetails('${safeDocId}','tv')">${show.title}</h3>
                <div class="episode-code">
                    ${isPaused ? '⏸ ' : ''}${airing ? '🟢 ' : ''}${epCode}
                </div>
                ${nextEp ? `<div class="episode-name">${nextEp.name}</div>` : ''}
                <div class="continue-progress">
                    <div class="continue-progress-fill ${progress >= 100 ? 'uptodate' : 'watching'}"
                         style="width:${progress}%;"></div>
                </div>
            </div>
            ${nextEp && !isPaused
                ? `<button class="quick-check-btn" onclick="quickMarkWatched('${safeDocId}',${nextEp.season},${nextEp.number})">✓</button>`
                : '<div style="width:40px;"></div>'
            }
        </div>
    `;
}

// ===== HISTORY =====
function renderHistory(sectionType) {
    const container = document.getElementById(`${sectionType}-history-list`);
    if (!container) return;

    const shows = sectionType === 'anime' ? getAnime() : getTVShows();
    const allEps = getAllWatchedEpisodes(shows);

    if (!allEps.length) {
        container.innerHTML = '<p class="empty-state">No watch history yet.</p>';
        return;
    }

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
            const poster = ep.poster && !ep.poster.includes('placeholder')
                ? ep.poster : 'https://via.placeholder.com/44x66?text=?';
            const safeDocId = ep.docId.replace(/'/g, "\\'");
            const epCode = ep.is_special
                ? `SE${String(ep.episode).padStart(2,'0')}`
                : `S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')}`;
            const dateStr = new Date(ep.watched_at).toLocaleDateString();
            return `
                <div class="history-card">
                    <img src="${poster}" onerror="this.src='https://via.placeholder.com/44x66?text=?'"
                         onclick="openDetails('${safeDocId}','tv')">
                    <div class="history-info">
                        <h4 onclick="openDetails('${safeDocId}','tv')">${ep.show}</h4>
                        <div class="history-ep">${epCode} - ${ep.name || 'Episode ' + ep.episode}</div>
                        <div class="history-date">${dateStr}</div>
                    </div>
                </div>
            `;
        }).join('');
    });

    container.innerHTML = html;
}

// ===== MOVIES =====
function renderMoviesSection() {
    const movies = getMovies();
    const watchedEl = document.getElementById('movies-watched-list');
    const unwatchedEl = document.getElementById('movies-unwatched-list');

    const watched = movies.filter(m => m.is_watched);
    const unwatched = movies.filter(m => !m.is_watched);

    if (watchedEl) watchedEl.innerHTML = watched.length
        ? watched.map(m => createMediaCard(m)).join('')
        : '<p class="empty-state">No watched movies.</p>';
    if (unwatchedEl) unwatchedEl.innerHTML = unwatched.length
        ? unwatched.map(m => createMediaCard(m)).join('')
        : '<p class="empty-state">No unwatched movies.</p>';
}

// ===== LIBRARY =====
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
    if (filter !== 'all') {
        if (filter === 'watched') filtered = items.filter(i => i.is_watched);
        else if (filter === 'unwatched') filtered = items.filter(i => !i.is_watched);
        else if (filter === 'favorites') filtered = items.filter(i => i.is_favorite);
        else filtered = items.filter(i => i.user_status === filter);
    }

    if (sort === 'title') filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (sort === 'rating') filtered.sort((a, b) => (b.tmdb_rating || 0) - (a.tmdb_rating || 0));
    else if (sort === 'recent') filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sort === 'progress') filtered.sort((a, b) => getShowProgressExcludingSpecials(b) - getShowProgressExcludingSpecials(a));
    else if (sort === 'year') filtered.sort((a, b) => (b.year || 0) - (a.year || 0));

    grid.innerHTML = filtered.length
        ? filtered.map(item => createMediaCard(item)).join('')
        : '<p class="empty-state">No items found.</p>';
}

// ===== CREATE MEDIA CARD =====
function createMediaCard(item) {
    const poster = item.poster && !item.poster.includes('placeholder')
        ? item.poster : `https://via.placeholder.com/140x210?text=${encodeURIComponent(item.title || '?')}`;

    let statusLine = '';
    if (item.type === 'tv' && item.user_status) {
        const prog = getShowProgressExcludingSpecials(item);
        const map = { 'Watching': 'watching', 'Up to Date': 'uptodate', 'Finished': 'finished', 'Dropped': 'dropped', 'Paused': 'paused' };
        const cls = map[item.user_status] || '';
        if (cls) {
            const w = (item.user_status === 'Watching' || item.user_status === 'Dropped') ? `${prog}%` : '100%';
            statusLine = `<div class="status-line status-${cls}" style="width:${w};"></div>`;
        }
    }

    const rating = item.tmdb_rating ? `⭐${item.tmdb_rating.toFixed(1)}` : '';
    const safeDocId = item.docId.replace(/'/g, "\\'");

    return `
        <div class="media-card" onclick="openDetails('${safeDocId}','${item.type}')">
            ${item.is_favorite ? '<div class="favorite-badge">⭐</div>' : ''}
            <img src="${poster}" alt="${item.title}" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'">
            ${statusLine}
            <div class="info">
                <h3>${item.title || 'Unknown'}</h3>
                <p class="year">${rating || item.year || ''}</p>
            </div>
        </div>
    `;
}

// ===== PROFILE =====
function updateProfilePage() {
    const anime = getAnime();
    const tv = getTVShows();
    const movies = getMovies();

    function countEps(list) {
        let t = 0;
        list.forEach(s => s.seasons?.forEach(season => {
            if (season.number === 0) return;
            season.episodes?.forEach(ep => { if (ep.is_watched && !ep.is_special) t++; });
        }));
        return t;
    }

    const animeEps = countEps(anime);
    const tvEps = countEps(tv);
    const moviesWatched = movies.filter(m => m.is_watched).length;
    const animeFinished = anime.filter(a => ['Finished','Up to Date'].includes(a.user_status)).length;
    const tvFinished = tv.filter(t => ['Finished','Up to Date'].includes(t.user_status)).length;
    const moviesRewatched = movies.reduce((s, m) => s + (m.rewatch_count || 0), 0);

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setBar = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = `${pct}%`; };

    setEl('p-anime-watched', animeFinished);
    setEl('p-anime-total', anime.length);
    setEl('p-anime-eps', animeEps);
    setEl('p-anime-time', formatWatchTime(animeEps * 24));
    setBar('p-anime-bar', anime.length ? (animeFinished / anime.length) * 100 : 0);

    setEl('p-tv-watched', tvFinished);
    setEl('p-tv-total', tv.length);
    setEl('p-tv-eps', tvEps);
    setEl('p-tv-time', formatWatchTime(tvEps * 45));
    setBar('p-tv-bar', tv.length ? (tvFinished / tv.length) * 100 : 0);

    setEl('p-movies-watched', moviesWatched);
    setEl('p-movies-total', movies.length);
    setEl('p-movies-rewatched', moviesRewatched);
    setEl('p-movies-time', formatWatchTime(moviesWatched * 100));
    setBar('p-movies-bar', movies.length ? (moviesWatched / movies.length) * 100 : 0);

    function recentPosters(list, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const recent = [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6);
        el.innerHTML = recent.map(item => `
            <img src="${item.poster && !item.poster.includes('placeholder') ? item.poster : 'https://via.placeholder.com/50x75?text=?'}"
                 onerror="this.src='https://via.placeholder.com/50x75?text=?'"
                 onclick="openDetails('${item.docId.replace(/'/g,"\\'")}','${item.type}')">
        `).join('');
    }

    recentPosters(anime, 'p-anime-posters');
    recentPosters(tv, 'p-tv-posters');
    recentPosters(movies, 'p-movies-posters');
}

// ===== QUICK MARK =====
async function quickMarkWatched(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;
    const episode = season.episodes.find(e => e.number === episodeNum && !e.is_special);
    if (!episode) return;

    const prev = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);
    if (prev.length > 0) {
        const a = await showConfirm('Mark Previous?', `${prev.length} unwatched before this.`, 'Yes', 'No');
        if (a === 'yes') prev.forEach(({ seasonNum: sN, episodeNum: eN }) => {
            const s = item.seasons.find(s => s.number === sN);
            const e = s?.episodes.find(e => e.number === eN && !e.is_special);
            if (e) { e.is_watched = true; e.watched_at = new Date().toISOString(); }
        });
    }

    episode.is_watched = true;
    episode.watched_at = new Date().toISOString();

    try {
        await updateDoc(doc(db, 'series', docId), { seasons: item.seasons });
        const local = myList.find(i => i.docId === docId);
        if (local) local.seasons = item.seasons;
        const section = item.is_anime ? 'anime' : 'tv';
        renderContinueWatching(section);
        renderHistory(section);
    } catch (e) { console.error(e); }
}

// ===== CONFIRM =====
function showConfirm(title, message, yesText = 'Yes', noText = 'No', showCancel = false) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');
        const cancelBtn = document.getElementById('confirm-cancel');
        yesBtn.textContent = yesText;
        noBtn.textContent = noText;
        cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
        dialog.style.display = 'flex';
        dialog.style.alignItems = 'center';
        dialog.style.justifyContent = 'center';

        const cleanup = () => {
            dialog.style.display = 'none';
            yesBtn.replaceWith(yesBtn.cloneNode(true));
            noBtn.replaceWith(noBtn.cloneNode(true));
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        };
        document.getElementById('confirm-yes').addEventListener('click', () => { cleanup(); resolve('yes'); });
        document.getElementById('confirm-no').addEventListener('click', () => { cleanup(); resolve('no'); });
        document.getElementById('confirm-cancel').addEventListener('click', () => { cleanup(); resolve('cancel'); });
    });
}

// ===== PREVIEW =====
async function openPreview(tmdbId, type, title, year, poster) {
    hideSearchOverlay();
    const modal = document.getElementById('preview-modal');
    const body = document.getElementById('preview-modal-body');
    body.innerHTML = '<p class="empty-state">Loading...</p>';
    modal.style.display = 'block';

    const libraryItem = myList.find(i => i.tmdb_id === tmdbId);
    if (libraryItem) {
        modal.style.display = 'none';
        openDetails(libraryItem.docId, libraryItem.type);
        return;
    }

    const safeTitle = (title || '').replace(/'/g, "\\'");
    let details, credits, similar, providers;

    try {
        const ep = type === 'movie' ? 'movie' : 'tv';
        [details, credits, similar, providers] = await Promise.all([
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}/credits?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}/similar?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${ep}/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`)
        ]);
    } catch (e) {}

    const synopsis = details?.overview || 'No synopsis.';
    const rating = details?.vote_average;
    const genres = details?.genres || [];
    const cast = credits?.cast?.slice(0, 12) || [];
    const similarItems = similar?.results?.slice(0, 10) || [];
    const providerList = providers?.results?.US?.flatrate || [];
    const networks = details?.networks || [];
    const tmdbStatus = details?.status || '';
    const statusColor = { 'Returning Series': '#4CAF50', 'In Production': '#2196F3', 'Ended': '#666', 'Canceled': '#f44336', 'Released': '#4CAF50' }[tmdbStatus] || '#666';
    const runtime = type === 'movie' && details?.runtime ? `${Math.floor(details.runtime/60)}h ${details.runtime%60}m` : null;

    let episodesPreviewHTML = '';
    if (type === 'tv' && details?.number_of_seasons) {
        episodesPreviewHTML = `
            <div class="detail-tabs" style="margin-top:20px;">
                <button class="detail-tab-btn active" onclick="switchDetailTab('preview-info-tab')">Info</button>
                <button class="detail-tab-btn" onclick="switchDetailTab('preview-episodes-tab')">Episodes</button>
            </div>
            <div class="detail-tab-content active" id="preview-info-tab">
                <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
                ${buildCastSection(cast)}
                ${buildNetworksSection(providerList, networks)}
                ${buildSimilarSection(similarItems, type)}
            </div>
            <div class="detail-tab-content" id="preview-episodes-tab">
                <p style="color:var(--text2);text-align:center;padding:20px;">
                    <strong>Add to Library</strong> to track episodes and mark them as watched.
                </p>
                <p style="color:var(--text3);text-align:center;font-size:13px;">
                    ${details.number_of_seasons} Season(s) · ${details.number_of_episodes || '?'} Episodes
                </p>
            </div>
        `;
    } else {
        episodesPreviewHTML = `
            <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
            ${buildCastSection(cast)}
            ${buildNetworksSection(providerList, networks)}
            ${buildSimilarSection(similarItems, type)}
        `;
    }

    body.innerHTML = `
        <div class="detail-header">
            <img src="${poster}" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'">
            <div class="detail-header-info">
                <h2><span>${title} ${year ? `(${year})` : ''}</span></h2>
                ${tmdbStatus ? `<span class="status-badge" style="background:${statusColor};">${tmdbStatus}</span>` : ''}
                ${rating ? `<p style="margin:5px 0;color:var(--text2);">⭐ <strong>${rating.toFixed(1)}</strong>/10</p>` : ''}
                ${runtime ? `<p style="color:var(--text2);font-size:13px;">⏱ ${runtime}</p>` : ''}
                <div class="genre-tags">${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}</div>
                <div style="margin-top:12px;">
                    <button onclick="handlePreviewAdd(${tmdbId},'${type}','${safeTitle}','${year}','${poster}')"
                            class="watch-btn mark-watched" style="padding:10px 20px;">
                        + Add to Library
                    </button>
                </div>
            </div>
        </div>
        ${episodesPreviewHTML}
    `;
}

async function handlePreviewAdd(tmdbId, type, title, year, poster) {
    await addToList(tmdbId, type, title, year, poster);
    document.getElementById('preview-modal').style.display = 'none';
    const item = myList.find(i => i.tmdb_id === tmdbId);
    if (item) openDetails(item.docId, item.type);
}

// ===== DETAIL PAGE =====
async function openDetails(docId, type, forceTab) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    body.innerHTML = '<p class="empty-state">Loading...</p>';
    modal.style.display = 'block';

    if (forceTab) activeDetailTab = forceTab;

    if (type === 'movie') await openMovieDetails(item, body, docId.replace(/'/g, "\\'"));
    else await openTVDetails(item, body, docId.replace(/'/g, "\\'"));
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
        } catch (e) {}
    }

    const synopsis = details?.overview || 'No synopsis.';
    const rating = details?.vote_average || item.tmdb_rating;
    const genres = details?.genres || [];
    const runtime = details?.runtime ? `${Math.floor(details.runtime/60)}h ${details.runtime%60}m` : 'N/A';
    const cast = credits?.cast?.slice(0, 15) || [];
    const director = credits?.crew?.find(c => c.job === 'Director');
    const similarItems = similar?.results?.slice(0, 10) || [];
    const providerList = providers?.results?.US?.flatrate || [];

    body.innerHTML = `
        <div class="detail-header">
            <img src="${item.poster}" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'">
            <div class="detail-header-info">
                <h2>
                    <span>${item.title} ${item.year ? `(${item.year})` : ''}</span>
                    <div class="show-options">
                        <button class="options-btn" onclick="toggleOptionsMenu('m-opts')">⋯</button>
                        <div class="options-menu" id="m-opts">
                            <button onclick="toggleFavorite('${safeDocId}','movie')">${item.is_favorite ? '⭐ Remove Fav' : '☆ Favorite'}</button>
                            <button class="danger" onclick="removeFromList('${safeDocId}','movie')">🗑 Remove</button>
                        </div>
                    </div>
                </h2>
                ${rating ? `<p style="margin:5px 0;color:var(--text2);">⭐ <strong>${rating.toFixed(1)}</strong>/10</p>` : ''}
                ${director ? `<p style="color:var(--text2);font-size:13px;">🎬 ${director.name}</p>` : ''}
                <p style="color:var(--text2);font-size:13px;">⏱ ${runtime}</p>
                <div class="genre-tags">${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}</div>
                <div style="margin-top:12px;">
                    <button onclick="toggleWatched('${safeDocId}','movie')" class="watch-btn ${item.is_watched ? 'watched' : 'mark-watched'}">
                        ${item.is_watched ? '✓ Watched' : '○ Mark Watched'}
                    </button>
                </div>
                ${item.watched_at ? `<p style="margin-top:6px;color:var(--text3);font-size:12px;">Watched: ${new Date(item.watched_at).toLocaleDateString()}</p>` : ''}
                ${item.rewatch_count > 0 ? `<p style="color:var(--text3);font-size:12px;">↺ ${item.rewatch_count}x</p>` : ''}
            </div>
        </div>
        <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
        ${buildCastSection(cast)}
        ${buildNetworksSection(providerList, details?.production_companies || [])}
        ${buildSimilarSection(similarItems, 'movie')}
    `;
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
        } catch (e) {}
    }

    const synopsis = details?.overview || 'No synopsis.';
    const rating = details?.vote_average || item.tmdb_rating;
    const genres = details?.genres || [];
    const cast = credits?.cast?.slice(0, 15) || [];
    const similarItems = similar?.results?.slice(0, 10) || [];
    const providerList = providers?.results?.US?.flatrate || [];
    const networks = details?.networks || [];
    const tmdbStatus = details?.status || item.tmdb_status || 'Unknown';
    const statusColor = {
        'Returning Series': '#4CAF50',
        'In Production': '#2196F3',
        'Ended': '#666',
        'Canceled': '#f44336'
    }[tmdbStatus] || '#666';

    // Count only AIRED episodes for progress
    const airedEps = getAiredEpisodesOnly(item.seasons);
    const watchedCount = airedEps.filter(e => e.is_watched).length;
    const totalCount = airedEps.length;
    const progress = totalCount > 0 ? (watchedCount / totalCount) * 100 : 0;

    let episodeRatings = [];
    if (item.tmdb_id) episodeRatings = await fetchEpisodeRatings(item.tmdb_id, item.seasons || []);

    const regularSeasons = (item.seasons || []).filter(s => s.number !== 0);
    const specialsSeason = (item.seasons || []).find(s => s.number === 0);

    // Also gather is_special episodes from regular seasons into specials group
    const inlineSpecials = [];
    regularSeasons.forEach(s => {
        s.episodes?.forEach(ep => {
            if (ep.is_special) inlineSpecials.push({ ...ep, fromSeason: s.number });
        });
    });

    const seasonsHTML = regularSeasons.map(s => buildSeasonHTML(s, safeDocId)).join('');

    // Combine Season 0 specials with inline specials
    const allSpecialEps = [
        ...(specialsSeason?.episodes || []),
        ...inlineSpecials
    ];

    const specialsHTML = allSpecialEps.length ? `
        <div class="season specials">
            <div class="season-header" onclick="toggleSeason(this)">
                <span>Specials (${allSpecialEps.filter(e=>e.is_watched).length}/${allSpecialEps.length})</span>
                <span class="toggle-icon">▼</span>
            </div>
            <div class="season-body">
                ${allSpecialEps.map(ep => buildSpecialEpisodeHTML(ep, safeDocId)).join('')}
            </div>
        </div>` : '';

    const infoActive = activeDetailTab === 'info-tab';

    body.innerHTML = `
        <div class="detail-header">
            <img src="${item.poster}" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'">
            <div class="detail-header-info">
                <h2>
                    <span>${item.title}</span>
                    <div class="show-options">
                        <button class="options-btn" onclick="toggleOptionsMenu('t-opts')">⋯</button>
                        <div class="options-menu" id="t-opts">
                            <button onclick="toggleFavorite('${safeDocId}','tv')">${item.is_favorite ? '⭐ Remove Fav' : '☆ Favorite'}</button>
                            <button onclick="setUserStatus('${safeDocId}','Watching')">▶ Watching</button>
                            <button onclick="setUserStatus('${safeDocId}','Up to Date')">✅ Up to Date</button>
                            <button onclick="setUserStatus('${safeDocId}','Paused')">⏸ Paused</button>
                            <button onclick="setUserStatus('${safeDocId}','Dropped')">🚫 Dropped</button>
                            <button onclick="setUserStatus('${safeDocId}','Finished')">🏁 Finished</button>
                            <button onclick="setUserStatus('${safeDocId}','Planned')">📋 Planned</button>
                            <button onclick="toggleAnimeStatus('${safeDocId}')">${item.is_anime ? '🎌 Remove Anime' : '🎌 Mark Anime'}</button>
                            <button onclick="openTagSpecialsModal('${safeDocId}')">🎭 Tag Episodes as Special</button>
                            <button class="danger" onclick="removeFromList('${safeDocId}','tv')">🗑 Remove</button>
                        </div>
                    </div>
                </h2>
                <div>
                    <span class="status-badge" style="background:${statusColor};">${tmdbStatus}</span>
                    ${item.is_anime ? '<span class="status-badge anime-badge">🎌 Anime</span>' : ''}
                </div>
                ${rating ? `<p style="margin:4px 0;color:var(--text2);">⭐ <strong>${rating.toFixed(1)}</strong>/10</p>` : ''}
                <p style="color:var(--text2);font-size:13px;">Status: <strong>${item.user_status || 'Watching'}</strong></p>
                <div class="genre-tags">${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}</div>
                <div class="detail-progress">
                    <div class="detail-progress-label">${watchedCount}/${totalCount} aired (${progress.toFixed(0)}%)</div>
                    <div class="detail-progress-bar">
                        <div class="detail-progress-fill" style="width:${progress}%;background:${progress >= 100 ? '#4CAF50' : '#FFC107'};"></div>
                    </div>
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
                ${buildEpisodeRatingsChart(episodeRatings)}
                ${buildCastSection(cast)}
                ${buildNetworksSection(providerList, networks)}
                ${buildSimilarSection(similarItems, 'tv')}
            </div>
            <div class="detail-tab-content ${!infoActive ? 'active' : ''}" id="episodes-tab">
                ${seasonsHTML}
                ${specialsHTML}
            </div>
        </div>
    `;

    // Restore expanded seasons
    restoreExpandedSeasons();
    setupDetailSwipe();
    if (episodeRatings.length) renderEpisodeRatingsChart(episodeRatings);
}

// ===== TAG SPECIALS MODAL =====
function openTagSpecialsModal(docId) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    // Close options menu
    document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));

    // Use confirm dialog as base but we need a custom modal
    // Create a dedicated special tagger modal with high z-index
    let existingModal = document.getElementById('tag-specials-modal');
    if (!existingModal) {
        existingModal = document.createElement('div');
        existingModal.id = 'tag-specials-modal';
        existingModal.className = 'modal';
        existingModal.style.cssText = 'z-index: 3000;';
        existingModal.innerHTML = `
            <div class="modal-content" style="max-width:600px;">
                <span class="close" onclick="document.getElementById('tag-specials-modal').style.display='none'">&times;</span>
                <div id="tag-specials-body"></div>
            </div>
        `;
        document.body.appendChild(existingModal);
    }

    const body = document.getElementById('tag-specials-body');
    const allEps = [];

    item.seasons?.forEach(s => {
        s.episodes?.forEach(ep => {
            allEps.push({
                seasonNum: s.number,
                epNum: ep.number,
                name: ep.name,
                is_special: ep.is_special || s.number === 0,
                air_date: ep.air_date
            });
        });
    });

    body.innerHTML = `
        <h3 style="color:var(--accent);margin-bottom:15px;">🎭 Tag Episodes as Special</h3>
        <p style="color:var(--text2);font-size:13px;margin-bottom:15px;">
            Check episodes that should be tagged as specials/OVAs. They will be moved to the Specials group.
        </p>
        <div style="max-height:400px;overflow-y:auto;">
            ${allEps.map((ep, idx) => {
                const label = ep.seasonNum === 0
                    ? `S00 · ${ep.name}`
                    : `S${String(ep.seasonNum).padStart(2,'0')}E${String(ep.epNum).padStart(2,'0')} · ${ep.name}`;
                return `
                    <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border);">
                        <input type="checkbox" id="sp_${idx}"
                               ${ep.is_special ? 'checked' : ''}
                               data-season="${ep.seasonNum}" data-ep="${ep.epNum}">
                        <label for="sp_${idx}" style="font-size:13px;color:var(--text);cursor:pointer;flex:1;">
                            ${label}
                            ${ep.is_special ? '<span style="background:#FF6B35;color:white;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:6px;">SPECIAL</span>' : ''}
                        </label>
                    </div>
                `;
            }).join('')}
        </div>
        <div style="margin-top:15px;display:flex;gap:10px;justify-content:flex-end;">
            <button onclick="document.getElementById('tag-specials-modal').style.display='none'"
                    style="padding:10px 20px;border:2px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;cursor:pointer;">
                Cancel
            </button>
            <button onclick="applySpecialTags('${docId}')"
                    style="padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">
                Save
            </button>
        </div>
    `;

    existingModal.style.display = 'block';
}

async function applySpecialTags(docId) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const checkboxes = document.querySelectorAll('#tag-specials-body input[type="checkbox"]');
    checkboxes.forEach(cb => {
        const seasonNum = parseInt(cb.dataset.season);
        const epNum = parseInt(cb.dataset.ep);
        const season = item.seasons.find(s => s.number === seasonNum);
        const ep = season?.episodes.find(e => e.number === epNum);
        if (ep) ep.is_special = cb.checked;
    });

    try {
        await updateDoc(doc(db, 'series', docId), { seasons: item.seasons });
        document.getElementById('tag-specials-modal').style.display = 'none';
        await loadMyList();
        openDetails(docId, 'tv', activeDetailTab);
    } catch(e) { console.error(e); }
}

// ===== EXPANDED SEASONS TRACKING =====
function restoreExpandedSeasons() {
    document.querySelectorAll('.season-header').forEach(header => {
        const body = header.nextElementSibling;
        const icon = header.querySelector('.toggle-icon');
        const seasonLabel = header.querySelector('span')?.textContent?.trim();
        if (expandedSeasons.has(seasonLabel)) {
            body.classList.add('open');
            icon.classList.add('open');
        }
    });
}

function toggleSeason(header) {
    const body = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');
    const seasonLabel = header.querySelector('span')?.textContent?.trim();

    body.classList.toggle('open');
    icon.classList.toggle('open');

    if (body.classList.contains('open')) {
        expandedSeasons.add(seasonLabel);
    } else {
        expandedSeasons.delete(seasonLabel);
    }
}

// ===== BUILD SEASON HTML =====
function buildSeasonHTML(season, safeDocId) {
    // Filter out is_special episodes from regular season display
    const regularEps = (season.episodes || []).filter(ep => !ep.is_special);
    const today = new Date(); today.setHours(23,59,59,999);
    const airedEps = regularEps.filter(ep => !ep.air_date || new Date(ep.air_date) <= today);

    const watched = airedEps.filter(e => e.is_watched).length;
    const total = airedEps.length;
    const allWatched = watched === total && total > 0;
    const seasonLabel = `Season ${season.number}`;
    const isExpanded = expandedSeasons.has(seasonLabel);

    return `
        <div class="season">
            <div class="season-header" onclick="toggleSeason(this)">
                <span>${seasonLabel} <span style="font-size:12px;opacity:0.8;">(${watched}/${total} aired)</span></span>
                <div style="display:flex;gap:8px;align-items:center;">
                    <button class="mark-all-btn" onclick="event.stopPropagation();markSeasonWatched('${safeDocId}',${season.number})">
                        ${allWatched ? 'Unmark' : 'Mark All'}
                    </button>
                    <span class="toggle-icon ${isExpanded ? 'open' : ''}">▼</span>
                </div>
            </div>
            <div class="season-body ${isExpanded ? 'open' : ''}">
                ${regularEps.map(ep => buildEpisodeHTML(ep, season.number, safeDocId)).join('') || '<p>No episodes</p>'}
                ${season.episodes?.filter(ep=>ep.is_special).length
                    ? `<p style="color:var(--text3);font-size:11px;padding:8px 12px;font-style:italic;">
                        ${season.episodes.filter(ep=>ep.is_special).length} special(s) moved to Specials section
                       </p>`
                    : ''}
            </div>
        </div>
    `;
}

// ===== BUILD EPISODE HTML (regular episodes only) =====
function buildEpisodeHTML(ep, seasonNum, safeDocId) {
    const today = new Date(); today.setHours(23,59,59,999);
    const airDate = ep.air_date ? new Date(ep.air_date) : null;
    const isUnaired = airDate && airDate > today;

    return `
        <div class="episode ${ep.is_watched ? 'watched' : ''} ${isUnaired ? 'unaired' : ''}"
             onclick="${isUnaired ? '' : `openEpisodeDetail('${safeDocId}',${seasonNum},${ep.number})`}"
             style="${isUnaired ? 'opacity:0.5;cursor:default;' : ''}">
            <div class="episode-info">
                <span class="episode-number">E${String(ep.number).padStart(2,'0')}</span>
                - ${ep.name || 'Episode ' + ep.number}
                ${isUnaired ? `<br><small style="color:var(--text3);">📅 Airs ${new Date(ep.air_date).toLocaleDateString()}</small>` : ''}
                ${ep.watched_at && !isUnaired ? `<br><small style="color:var(--text3);">${new Date(ep.watched_at).toLocaleDateString()}</small>` : ''}
                ${ep.rewatch_count > 0 ? `<br><small style="color:#2196F3;">↺ ${ep.rewatch_count}x</small>` : ''}
            </div>
            ${!isUnaired ? `
            <button class="watch-btn ${ep.is_watched ? 'watched' : 'mark-watched'}"
                    onclick="event.stopPropagation();toggleEpisode('${safeDocId}',${seasonNum},${ep.number},false)">
                ${ep.is_watched ? '✓' : '○'}
            </button>` : `<div style="width:40px;"></div>`}
        </div>
    `;
}

// ===== BUILD SPECIAL EPISODE HTML =====
function buildSpecialEpisodeHTML(ep, safeDocId) {
    // Specials use season 0 OR their fromSeason if inline special
    const seasonNum = ep.fromSeason !== undefined ? ep.fromSeason : 0;

    return `
        <div class="episode ${ep.is_watched ? 'watched' : ''}"
             onclick="openEpisodeDetail('${safeDocId}',${seasonNum},${ep.number},true)">
            <div class="episode-info">
                <span class="special-tag">SPECIAL</span>
                ${ep.name || 'Special Episode'}
                ${ep.watched_at ? `<br><small style="color:var(--text3);">${new Date(ep.watched_at).toLocaleDateString()}</small>` : ''}
                ${ep.rewatch_count > 0 ? `<br><small style="color:#2196F3;">↺ ${ep.rewatch_count}x</small>` : ''}
            </div>
            <button class="watch-btn ${ep.is_watched ? 'watched' : 'mark-watched'}"
                    onclick="event.stopPropagation();toggleEpisode('${safeDocId}',${seasonNum},${ep.number},true)">
                ${ep.is_watched ? '✓' : '○'}
            </button>
        </div>
    `;
}

// ===== EPISODE RATINGS =====
async function fetchEpisodeRatings(tmdbId, localSeasons) {
    const ratings = [];
    const seasons = localSeasons.filter(s => s.number !== 0).slice(0, 5);
    for (const s of seasons) {
        try {
            const data = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${s.number}?api_key=${TMDB_API_KEY}`);
            data.episodes?.forEach(ep => {
                if (ep.vote_average > 0) ratings.push({
                    label: `S${s.number}E${ep.episode_number}`,
                    rating: ep.vote_average,
                    season: s.number,
                    episode: ep.episode_number,
                    name: ep.name
                });
            });
        } catch (e) {}
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
    const colors = ['#FF6384','#36A2EB','#FFCE56','#4BC0C0','#9966FF','#FF9F40'];
    new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ratings.map(r => r.label),
            datasets: [{
                data: ratings.map(r => r.rating),
                backgroundColor: ratings.map(r => colors[(r.season-1)%colors.length]+'99'),
                borderColor: ratings.map(r => colors[(r.season-1)%colors.length]),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: {
                    title: (i) => `${ratings[i[0].dataIndex].label} - ${ratings[i[0].dataIndex].name}`,
                    label: (i) => `${i.raw.toFixed(1)}/10`
                }}
            },
            scales: { y: { min: 0, max: 10 }, x: { ticks: { maxRotation: 90, font: { size: 9 } } } }
        }
    });
}

// ===== BUILD HELPERS =====
function buildCastSection(cast) {
    if (!cast.length) return '';
    return `
        <div class="cast-section"><h3>🎭 Cast</h3>
        <div class="cast-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">
            ${cast.map(p => `
                <div class="cast-card">
                    <img src="${p.profile_path ? TMDB_IMG_BASE+p.profile_path : 'https://via.placeholder.com/60x60?text=?'}"
                         alt="${p.name}" onerror="this.src='https://via.placeholder.com/60x60?text=?'">
                    <div class="cast-name">${p.name}</div>
                    <div class="cast-character">${p.character || ''}</div>
                </div>
            `).join('')}
        </div></div>`;
}

function buildNetworksSection(providers, networks) {
    const all = [...(networks||[]),...(providers||[])];
    if (!all.length) return '';
    return `
        <div class="networks-section"><h3>📺 Available On</h3>
        <div class="network-logos">
            ${all.map(n => n.logo_path
                ? `<img class="network-logo" src="${TMDB_IMG_BASE}${n.logo_path}" alt="${n.name||n.provider_name}">`
                : `<span class="network-name">${n.name||n.provider_name}</span>`
            ).join('')}
        </div></div>`;
}

function buildSimilarSection(items, type) {
    if (!items.length) return '';
    return `
        <div class="similar-section"><h3>🎬 Similar</h3>
        <div class="similar-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">
            ${items.map(item => {
                const t = item.title || item.name;
                const p = item.poster_path ? TMDB_IMG_BASE+item.poster_path : 'https://via.placeholder.com/100x150?text=?';
                const r = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                const y = (item.release_date || item.first_air_date || '').substring(0,4);
                const st = (t||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
                return `
                    <div class="similar-card" onclick="openPreview(${item.id},'${type}','${st}','${y}','${p}')">
                        <img src="${p}" alt="${t}" onerror="this.src='https://via.placeholder.com/100x150?text=?'">
                        <div class="similar-title">${t}</div>
                        <div class="similar-rating">⭐${r}</div>
                    </div>`;
            }).join('')}
        </div></div>`;
}

// ===== DETAIL TABS =====
function switchDetailTab(tabId) {
    activeDetailTab = tabId;
    document.querySelectorAll('.detail-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    const btns = document.querySelectorAll('.detail-tab-btn');
    btns.forEach(b => {
        if (tabId.includes('info') && b.textContent.trim() === 'Info') b.classList.add('active');
        if (tabId.includes('episodes') && b.textContent.trim() === 'Episodes') b.classList.add('active');
    });
}

function setupDetailSwipe() {
    const c = document.getElementById('detail-swipe');
    if (!c) return;
    let sx = 0;
    c.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    c.addEventListener('touchend', (e) => {
        const d = sx - e.changedTouches[0].clientX;
        if (Math.abs(d) > 60) switchDetailTab(d > 0 ? 'episodes-tab' : 'info-tab');
    });
}

function toggleOptionsMenu(id) {
    const m = document.getElementById(id);
    if (m) m.classList.toggle('show');
    document.querySelectorAll('.options-menu').forEach(x => { if (x.id !== id) x.classList.remove('show'); });
}

// ===== EPISODE DETAIL =====
async function openEpisodeDetail(docId, seasonNum, episodeNum, isSpecial = false) {
    const item = myList.find(i => i.docId === docId);
    if (!item?.tmdb_id) return;
    const epModal = document.getElementById('episode-modal');
    const epBody = document.getElementById('episode-modal-body');
    epBody.innerHTML = '<p class="empty-state">Loading...</p>';
    epModal.style.display = 'block';

    // For inline specials, fetch from their original season
    const fetchSeason = isSpecial && seasonNum !== 0 ? seasonNum : seasonNum;

    try {
        const data = await tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/season/${fetchSeason}/episode/${episodeNum}?api_key=${TMDB_API_KEY}&append_to_response=credits`);
        const still = data.still_path ? `${TMDB_IMG_BASE}${data.still_path}` : '';
        const r = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
        const air = data.air_date ? new Date(data.air_date).toLocaleDateString() : 'N/A';
        const allCast = [...(data.guest_stars||[]),...(data.credits?.cast||[])].slice(0,12);

        // Find local episode — use is_special flag to disambiguate
        const localSeason = item.seasons?.find(s => s.number === seasonNum);
        const localEp = localSeason?.episodes?.find(e =>
            e.number === episodeNum &&
            (isSpecial ? e.is_special : !e.is_special)
        );

        const sd = docId.replace(/'/g, "\\'");

        epBody.innerHTML = `
            <div class="ep-detail-header">
                ${still ? `<img src="${still}" onerror="this.style.display='none'">` : ''}
                <div class="ep-detail-info">
                    <h3>${data.name || `Episode ${episodeNum}`}</h3>
                    ${isSpecial ? '<span style="background:#FF6B35;color:white;padding:2px 8px;border-radius:8px;font-size:11px;">SPECIAL</span>' : ''}
                    <div class="ep-code">S${String(seasonNum).padStart(2,'0')}E${String(episodeNum).padStart(2,'0')}</div>
                    <div class="ep-rating">⭐ ${r}/10</div>
                    <p style="color:var(--text2);font-size:13px;">📅 ${air}</p>
                    ${data.runtime ? `<p style="color:var(--text2);font-size:13px;">⏱ ${data.runtime}min</p>` : ''}
                </div>
            </div>
            <div style="margin:15px 0;">
                <button onclick="toggleEpisode('${sd}',${seasonNum},${episodeNum},${isSpecial});document.getElementById('episode-modal').style.display='none';"
                        class="watch-btn ${localEp?.is_watched ? 'watched' : 'mark-watched'}" style="padding:10px 24px;">
                    ${localEp?.is_watched ? '✓ Watched' : '○ Mark Watched'}
                </button>
                ${localEp?.rewatch_count > 0 ? `<p style="margin-top:6px;color:#2196F3;font-size:12px;">↺ ${localEp.rewatch_count}x</p>` : ''}
            </div>
            <div class="ep-detail-synopsis"><h4 style="color:var(--accent);margin-bottom:8px;">Synopsis</h4><p>${data.overview || 'No synopsis.'}</p></div>
            ${allCast.length ? `
                <div class="ep-guest-cast"><h4>Cast</h4>
                <div class="cast-carousel" onwheel="event.preventDefault();this.scrollLeft+=event.deltaY;">
                    ${allCast.map(p => `
                        <div class="cast-card">
                            <img src="${p.profile_path ? TMDB_IMG_BASE+p.profile_path : 'https://via.placeholder.com/60x60?text=?'}"
                                 onerror="this.src='https://via.placeholder.com/60x60?text=?'">
                            <div class="cast-name">${p.name}</div>
                            <div class="cast-character">${p.character||''}</div>
                        </div>
                    `).join('')}
                </div></div>` : ''}
        `;
    } catch (e) {
        epBody.innerHTML = '<p class="empty-state">Failed to load.</p>';
    }
}

// ===== ADD/REMOVE =====
async function addToList(tmdbId, type, title, year, poster) {
    try {
        const col = type === 'movie' ? 'movies' : 'series';
        const docId = `${type}_${tmdbId}`;
        let data = {
            tmdb_id: tmdbId, title, year, poster,
            is_favorite: false,
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
            data.seasons = [];

            for (let i = 0; i <= det.number_of_seasons; i++) {
                try {
                    const sd = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${i}?api_key=${TMDB_API_KEY}`);
                    if (!sd.episodes?.length) continue;

                    const episodes = sd.episodes.map(ep => ({
                        number: ep.episode_number,
                        name: ep.name || `Episode ${ep.episode_number}`,
                        air_date: ep.air_date || null,
                        is_watched: false,
                        watched_at: null,
                        rewatch_count: 0,
                        rewatch_history: [],
                        is_special: i === 0
                    }));

                    // Detect duplicate episode numbers in regular seasons
                    const fixed = i === 0 ? episodes : detectAndFixDuplicateEpisodes(episodes, i);

                    data.seasons.push({
                        number: i,
                        is_specials: i === 0,
                        episodes: fixed
                    });
                } catch (e) {}
            }
        } else {
            const det = await tmdbFetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
            data.is_watched = false;
            data.watched_at = null;
            data.tmdb_rating = det.vote_average || null;
            data.rewatch_count = 0;
            data.rewatch_history = [];
        }

        await setDoc(doc(db, col, docId), data);
        await loadMyList();
    } catch (e) { console.error(e); alert('Error adding.'); }
}

async function removeFromList(docId, type) {
    const a = await showConfirm('Remove?', 'Remove from library?', 'Remove', 'Cancel');
    if (a !== 'yes') return;
    try {
        await deleteDoc(doc(db, type === 'movie' ? 'movies' : 'series', docId));
        await loadMyList();
        document.getElementById('modal').style.display = 'none';
    } catch (e) { console.error(e); }
}

async function removeFromListByTMDB(tmdbId, type) {
    await removeFromList(`${type}_${tmdbId}`, type);
}

// ===== TOGGLE EPISODE =====
// isSpecial flag ensures we find the right episode (avoids duplicate number conflict)
async function toggleEpisode(docId, seasonNum, episodeNum, isSpecial = false) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;

    // KEY FIX: use isSpecial to disambiguate episodes with same number
    const episode = season.episodes.find(e =>
        e.number === episodeNum &&
        (isSpecial ? e.is_special === true : !e.is_special)
    );
    if (!episode) return;

    activeDetailTab = 'episodes-tab';

    if (episode.is_watched) {
        const a = await showConfirm('Already Watched', `"${episode.name || 'This episode'}"`, '↺ Rewatch', '✗ Unmark');
        if (a === 'yes') {
            episode.rewatch_count = (episode.rewatch_count || 0) + 1;
            if (!episode.rewatch_history) episode.rewatch_history = [];
            episode.rewatch_history.push(new Date().toISOString());
            episode.watched_at = new Date().toISOString();
        } else if (a === 'no') {
            episode.is_watched = false;
            episode.watched_at = null;
        } else return;
    } else {
        // Only check previous for non-specials
        if (!isSpecial && seasonNum !== 0) {
            const prev = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);
            if (prev.length > 0) {
                const a = await showConfirm('Mark Previous?', `${prev.length} unwatched before this.`, 'Yes, all', 'Just this');
                if (a === 'yes') prev.forEach(({seasonNum: sN, episodeNum: eN}) => {
                    const s = item.seasons.find(s => s.number === sN);
                    const e = s?.episodes.find(e => e.number === eN && !e.is_special);
                    if (e) { e.is_watched = true; e.watched_at = new Date().toISOString(); }
                });
            }
        }
        episode.is_watched = true;
        episode.watched_at = new Date().toISOString();
    }

    try {
        await updateDoc(doc(db, 'series', docId), { seasons: item.seasons });
        // Update local state WITHOUT full re-render to preserve expanded seasons
        const local = myList.find(i => i.docId === docId);
        if (local) local.seasons = item.seasons;

        // Re-render just the detail page, preserving expanded seasons
        const body = document.getElementById('modal-body');
        if (body) await openTVDetails(item, body, docId.replace(/'/g, "\\'"));

        // Update continue/history in background
        const section = item.is_anime ? 'anime' : 'tv';
        renderContinueWatching(section);
        renderHistory(section);
    } catch (e) { console.error(e); }
}

// ===== MARK SEASON =====
async function markSeasonWatched(docId, seasonNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;

    // Only work on non-special aired episodes
    const today = new Date(); today.setHours(23,59,59,999);
    const regularEps = season.episodes.filter(ep => {
        if (ep.is_special) return false;
        const airDate = ep.air_date ? new Date(ep.air_date) : null;
        return !airDate || airDate <= today;
    });

    const allWatched = regularEps.every(e => e.is_watched) && regularEps.length > 0;
    activeDetailTab = 'episodes-tab';

    if (allWatched) {
        const a = await showConfirm('All Watched', 'What to do?', '↺ Rewatch All', '✗ Unmark All');
        if (a === 'yes') {
            regularEps.forEach(ep => {
                ep.rewatch_count = (ep.rewatch_count || 0) + 1;
                if (!ep.rewatch_history) ep.rewatch_history = [];
                ep.rewatch_history.push(new Date().toISOString());
                ep.watched_at = new Date().toISOString();
            });
        } else if (a === 'no') {
            regularEps.forEach(ep => { ep.is_watched = false; ep.watched_at = null; });
        } else return;
    } else {
        if (seasonNum !== 0) {
            const prevSeasons = item.seasons.filter(s =>
                s.number !== 0 && s.number < seasonNum &&
                s.episodes?.some(e => !e.is_watched && !e.is_special)
            );
            if (prevSeasons.length > 0) {
                const a = await showConfirm('Previous Seasons?', `${prevSeasons.length} season(s) have unwatched eps.`, 'Mark all prev', 'Just this');
                if (a === 'yes') prevSeasons.forEach(s =>
                    s.episodes.filter(ep => !ep.is_special).forEach(ep => {
                        ep.is_watched = true; ep.watched_at = new Date().toISOString();
                    })
                );
            }
        }
        regularEps.forEach(ep => { ep.is_watched = true; ep.watched_at = new Date().toISOString(); });
    }

    try {
        await updateDoc(doc(db, 'series', docId), { seasons: item.seasons });
        const local = myList.find(i => i.docId === docId);
        if (local) local.seasons = item.seasons;
        const body = document.getElementById('modal-body');
        if (body) await openTVDetails(item, body, docId.replace(/'/g, "\\'"));
        const section = item.is_anime ? 'anime' : 'tv';
        renderContinueWatching(section);
        renderHistory(section);
    } catch (e) { console.error(e); }
}

// ===== TOGGLE FAVORITE =====
async function toggleFavorite(docId, type) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    item.is_favorite = !item.is_favorite;
    try {
        await updateDoc(doc(db, type === 'movie' ? 'movies' : 'series', docId), { is_favorite: item.is_favorite });
        await loadMyList();
        openDetails(docId, type);
    } catch (e) { console.error(e); }
}

// ===== TOGGLE WATCHED (Movies) =====
async function toggleWatched(docId, type) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    if (item.is_watched) {
        const a = await showConfirm('Already Watched', 'What to do?', '↺ Rewatch', '✗ Unmark');
        if (a === 'yes') {
            item.rewatch_count = (item.rewatch_count || 0) + 1;
            if (!item.rewatch_history) item.rewatch_history = [];
            item.rewatch_history.push(new Date().toISOString());
            item.watched_at = new Date().toISOString();
        } else if (a === 'no') {
            item.is_watched = false;
            item.watched_at = null;
        } else return;
    } else {
        item.is_watched = true;
        item.watched_at = new Date().toISOString();
    }

    try {
        await updateDoc(doc(db, 'movies', docId), {
            is_watched: item.is_watched,
            watched_at: item.watched_at,
            rewatch_count: item.rewatch_count || 0,
            rewatch_history: item.rewatch_history || []
        });
        await loadMyList();
        openDetails(docId, type);
    } catch (e) { console.error(e); }
}

// ===== SET STATUS / ANIME =====
async function setUserStatus(docId, status) {
    try {
        await updateDoc(doc(db, 'series', docId), { user_status: status });
        const item = myList.find(i => i.docId === docId);
        if (item) item.user_status = status;
        await loadMyList();
        openDetails(docId, 'tv');
    } catch (e) { console.error(e); }
}

async function toggleAnimeStatus(docId) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    try {
        await updateDoc(doc(db, 'series', docId), { is_anime: !item.is_anime });
        item.is_anime = !item.is_anime;
        await loadMyList();
        openDetails(docId, 'tv');
    } catch (e) { console.error(e); }
}

// ===== CALENDAR =====
async function loadSectionCalendar(section) {
    const isAnime = section === 'anime';
    const shows = isAnime ? getAnime() : getTVShows();
    const todayEl = document.getElementById(`${section}-calendar-today`);
    const weekEl = document.getElementById(`${section}-calendar-week`);
    const upcomingEl = document.getElementById(`${section}-calendar-upcoming`);

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const weekStr = new Date(today.getTime() + 7*86400000).toISOString().split('T')[0];
    const monthStr = new Date(today.getTime() + 30*86400000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(today.getTime() - 30*86400000);

    const toCheck = shows.filter(s => {
        if (!s.tmdb_id) return false;
        return ['Returning Series', 'In Production', 'Unknown'].includes(s.tmdb_status);
    });

    todayEl.innerHTML = `<p class="empty-state">Checking ${toCheck.length} shows...</p>`;
    weekEl.innerHTML = '';
    upcomingEl.innerHTML = '';

    const tEps = [], wEps = [], uEps = [];
    let checked = 0;

    for (const show of toCheck) {
        try {
            checked++;
            todayEl.innerHTML = `<p class="empty-state">Checking ${checked}/${toCheck.length}...</p>`;
            const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);

            if (det.status && det.status !== show.tmdb_status) {
                updateDoc(doc(db, 'series', show.docId), {
                    tmdb_status: det.status,
                    last_status_check: new Date().toISOString()
                }).catch(() => {});
            }

            if (['Returning Series', 'In Production'].includes(det.status) && det.next_episode_to_air) {
                const ad = det.next_episode_to_air.air_date;
                const ep = {
                    show: show.title,
                    poster: show.poster,
                    docId: show.docId,
                    season: det.next_episode_to_air.season_number,
                    episode: det.next_episode_to_air.episode_number,
                    name: det.next_episode_to_air.name,
                    airDate: ad,
                    airDateObj: new Date(ad)
                };
                if (ad === todayStr) tEps.push(ep);
                else if (ad > todayStr && ad <= weekStr) wEps.push(ep);
                else if (ad > weekStr && ad <= monthStr) uEps.push(ep);
            }
            await new Promise(r => setTimeout(r, 300));
        } catch(e) {}
    }

    // Cache results
    const cacheKey = `upcomingCache_${section}`;
    localStorage.setItem(cacheKey, JSON.stringify({ today: tEps, week: wEps, upcoming: uEps }));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());

    displayCalItems(todayEl, tEps, true);
    displayCalItems(weekEl, wEps, false);
    displayCalItems(upcomingEl, uEps, false);
}

function displayCalendarFromCache(section, data) {
    const todayEl = document.getElementById(`${section}-calendar-today`);
    const weekEl = document.getElementById(`${section}-calendar-week`);
    const upcomingEl = document.getElementById(`${section}-calendar-upcoming`);
    if (todayEl) displayCalItems(todayEl, data.today || [], true);
    if (weekEl) displayCalItems(weekEl, data.week || [], false);
    if (upcomingEl) displayCalItems(upcomingEl, data.upcoming || [], false);
}

function displayCalItems(container, episodes, isToday) {
    if (!episodes.length) { container.innerHTML = '<p class="empty-state">No episodes.</p>'; return; }
    episodes.sort((a, b) => new Date(a.airDateObj) - new Date(b.airDateObj));
    container.innerHTML = episodes.map(ep => {
        const p = ep.poster && !ep.poster.includes('placeholder')
            ? ep.poster : 'https://via.placeholder.com/50x75?text=?';
        return `
            <div class="calendar-item ${isToday ? 'airing-today' : ''}" onclick="openDetails('${ep.docId}','tv')">
                <img src="${p}" onerror="this.src='https://via.placeholder.com/50x75?text=?'">
                <div class="calendar-item-info">
                    <h4>${ep.show}</h4>
                    <div class="episode-title">S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')} - ${ep.name}</div>
                    <div class="air-date ${isToday ? 'today' : ''}">
                        📅 ${formatAirDate(new Date(ep.airDateObj))}
                        ${isToday ? '<span class="calendar-badge">TODAY</span>' : ''}
                    </div>
                </div>
            </div>`;
    }).join('');
}

function formatAirDate(date) {
    const t = new Date(); t.setHours(0,0,0,0);
    const tm = new Date(t); tm.setDate(tm.getDate()+1);
    const c = new Date(date); c.setHours(0,0,0,0);
    if (c.getTime() === t.getTime()) return 'Today';
    if (c.getTime() === tm.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}

// ===== RESCAN ANIME =====
async function rescanAnime() {
    const statusEl = document.getElementById('settings-action-status');
    const shows = myList.filter(i => i.type === 'tv' && i.tmdb_id);
    statusEl.innerHTML = `<p style="color:var(--accent);">Scanning ${shows.length} shows...</p>`;
    let changed = 0;

    for (let i = 0; i < shows.length; i++) {
        try {
            statusEl.innerHTML = `<p style="color:var(--accent);">Scanning ${i+1}/${shows.length}...</p>`;
            const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${shows[i].tmdb_id}?api_key=${TMDB_API_KEY}`);
            const shouldBe = isAnimeShow(det);
            if (shouldBe !== shows[i].is_anime) {
                await updateDoc(doc(db, 'series', shows[i].docId), { is_anime: shouldBe });
                shows[i].is_anime = shouldBe;
                changed++;
            }
            if (i % 20 === 0) await new Promise(r => setTimeout(r, 500));
        } catch(e) {}
    }

    statusEl.innerHTML = `<p style="color:var(--green);">✓ Done! ${changed} shows updated.</p>`;
    await loadMyList();
}

// ===== AUTO TAG STATUSES =====
async function autoTagStatuses() {
    const statusEl = document.getElementById('settings-action-status');
    statusEl.innerHTML = '<p style="color:var(--accent);">Tagging...</p>';
    let changed = 0;

    for (const item of myList) {
        if (item.type !== 'tv') continue;
        const progress = getShowProgressExcludingSpecials(item);
        const hasWatched = item.seasons?.some(s =>
            s.number !== 0 && s.episodes?.some(e => e.is_watched && !e.is_special)
        );
        const tmdb = item.tmdb_status || '';
        let newStatus = item.user_status;

        if (!hasWatched && !['Dropped','Paused'].includes(item.user_status)) newStatus = 'Planned';
        else if (progress >= 100 && (tmdb === 'Ended' || tmdb === 'Canceled')) newStatus = 'Finished';
        else if (progress >= 100 && tmdb === 'Returning Series') newStatus = 'Up to Date';
        else if (hasWatched && progress < 100 && !['Dropped','Paused','Finished'].includes(item.user_status)) newStatus = 'Watching';

        if (newStatus !== item.user_status) {
            await updateDoc(doc(db, 'series', item.docId), { user_status: newStatus });
            item.user_status = newStatus;
            changed++;
        }
    }

    statusEl.innerHTML = `<p style="color:var(--green);">✓ ${changed} shows updated.</p>`;
    await loadMyList();
}

// ===== BULK TAGGER =====
function openBulkTagger() {
    const modal = document.getElementById('bulk-modal');
    const body = document.getElementById('bulk-modal-body');
    const shows = myList.filter(i => i.type === 'tv');
    const movies = myList.filter(i => i.type === 'movie');

    body.innerHTML = `
        <h2 style="margin-bottom:15px;color:var(--accent);">📋 Bulk Tag</h2>
        <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <select id="bulk-type-filter" onchange="filterBulkList()">
                <option value="all">All</option>
                <option value="anime">Anime</option>
                <option value="tv">TV Shows</option>
                <option value="movie">Movies</option>
            </select>
            <button onclick="selectAllBulk()" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;">Select All</button>
        </div>
        <div class="bulk-list" id="bulk-list">
            ${[...shows,...movies].map(item => `
                <div class="bulk-item" data-type="${item.type}" data-anime="${item.is_anime||false}">
                    <input type="checkbox" value="${item.docId}" data-item-type="${item.type}">
                    <img src="${item.poster && !item.poster.includes('placeholder') ? item.poster : 'https://via.placeholder.com/36x54?text=?'}"
                         onerror="this.src='https://via.placeholder.com/36x54?text=?'">
                    <span class="bulk-item-title">${item.title}</span>
                    <span class="bulk-item-status">${item.user_status || (item.is_watched ? 'Watched' : '—')}</span>
                </div>
            `).join('')}
        </div>
        <div class="bulk-actions">
            <select id="bulk-action">
                <option value="">Choose action...</option>
                <option value="Watching">Set: Watching</option>
                <option value="Up to Date">Set: Up to Date</option>
                <option value="Finished">Set: Finished</option>
                <option value="Paused">Set: Paused</option>
                <option value="Dropped">Set: Dropped</option>
                <option value="Planned">Set: Planned</option>
                <option value="anime-true">Tag Anime</option>
                <option value="anime-false">Remove Anime</option>
                <option value="fav-true">Mark Favorite</option>
                <option value="fav-false">Remove Favorite</option>
            </select>
            <button onclick="applyBulkAction()">Apply</button>
        </div>
    `;
    modal.style.display = 'block';
}

function filterBulkList() {
    const f = document.getElementById('bulk-type-filter').value;
    document.querySelectorAll('.bulk-item').forEach(item => {
        const t = item.dataset.type, a = item.dataset.anime === 'true';
        if (f === 'all') item.style.display = 'flex';
        else if (f === 'anime') item.style.display = a ? 'flex' : 'none';
        else if (f === 'tv') item.style.display = (t === 'tv' && !a) ? 'flex' : 'none';
        else if (f === 'movie') item.style.display = t === 'movie' ? 'flex' : 'none';
    });
}

function selectAllBulk() {
    const vis = document.querySelectorAll('.bulk-item:not([style*="none"]) input[type="checkbox"]');
    const all = [...vis].every(c => c.checked);
    vis.forEach(c => c.checked = !all);
}

async function applyBulkAction() {
    const action = document.getElementById('bulk-action').value;
    if (!action) return;
    const checked = document.querySelectorAll('.bulk-item input:checked');
    if (!checked.length) { alert('Select items first!'); return; }

    for (const cb of checked) {
        const docId = cb.value, itemType = cb.dataset.itemType;
        const col = itemType === 'movie' ? 'movies' : 'series';
        try {
            if (action.startsWith('anime-')) await updateDoc(doc(db, col, docId), { is_anime: action === 'anime-true' });
            else if (action.startsWith('fav-')) await updateDoc(doc(db, col, docId), { is_favorite: action === 'fav-true' });
            else await updateDoc(doc(db, col, docId), { user_status: action });
        } catch(e) {}
    }
    document.getElementById('bulk-modal').style.display = 'none';
    await loadMyList();
}

// ===== STATS =====
function openStatsPage(section) {
    const modal = document.getElementById('stats-modal');
    const body = document.getElementById('stats-modal-body');
    body.innerHTML = `
        <h2 style="margin-bottom:15px;color:var(--accent);">📊 Statistics</h2>
        <div class="stats-tabs">
            <button class="stats-tab-btn ${section==='anime'?'active':''}" onclick="renderStats('anime')">🎌 Anime</button>
            <button class="stats-tab-btn ${section==='tv'?'active':''}" onclick="renderStats('tv')">📺 TV</button>
            <button class="stats-tab-btn ${section==='movies'?'active':''}" onclick="renderStats('movies')">🎬 Movies</button>
        </div>
        <div id="stats-body"></div>
    `;
    modal.style.display = 'block';
    renderStats(section);
}

function renderStats(section) {
    document.querySelectorAll('.stats-tab-btn').forEach(b => {
        b.classList.remove('active');
        if ((section==='anime' && b.textContent.includes('Anime')) ||
            (section==='tv' && b.textContent.includes('TV')) ||
            (section==='movies' && b.textContent.includes('Movies'))) {
            b.classList.add('active');
        }
    });

    const container = document.getElementById('stats-body');
    if (!container) return;
    if (section === 'movies') { renderMovieStats(container); return; }

    const items = section === 'anime' ? getAnime() : getTVShows();
    const epMin = section === 'anime' ? 24 : 45;
    let totalEps = 0;
    const statusCounts = {}, monthCounts = {};

    items.forEach(item => {
        statusCounts[item.user_status || 'Unknown'] = (statusCounts[item.user_status || 'Unknown'] || 0) + 1;
        item.seasons?.forEach(s => {
            if (s.number === 0) return;
            s.episodes?.forEach(ep => {
                if (ep.is_watched && !ep.is_special) {
                    totalEps++;
                    if (ep.watched_at) {
                        const d = new Date(ep.watched_at);
                        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                        monthCounts[key] = (monthCounts[key] || 0) + 1;
                    }
                }
            });
        });
    });

    const finishedCount = (statusCounts['Finished'] || 0) + (statusCounts['Up to Date'] || 0);
    const remaining = items.reduce((sum, item) => {
        const aired = getAiredEpisodesOnly(item.seasons);
        return sum + aired.filter(ep => !ep.is_watched).length;
    }, 0);

    const monthKeys = Object.keys(monthCounts).sort();
    const avgPerMonth = monthKeys.length ? Math.round(totalEps / monthKeys.length) : 0;
    const monthsToFinish = avgPerMonth > 0 ? Math.ceil(remaining / avgPerMonth) : '∞';

    container.innerHTML = `
        <div class="stats-card">
            <h4>📈 Overview</h4>
            <div class="stats-row"><span class="stats-label">Total</span><span class="stats-value">${items.length}</span></div>
            <div class="stats-row"><span class="stats-label">Episodes Watched</span><span class="stats-value">${totalEps}</span></div>
            <div class="stats-row"><span class="stats-label">Watch Time</span><span class="stats-value">${formatWatchTime(totalEps*epMin)}</span></div>
            <div class="stats-row"><span class="stats-label">Completed</span><span class="stats-value">${finishedCount}</span></div>
            <div class="stats-row"><span class="stats-label">In Progress</span><span class="stats-value">${statusCounts['Watching']||0}</span></div>
            <div class="stats-row"><span class="stats-label">Remaining Eps (aired)</span><span class="stats-value">${remaining}</span></div>
            <div class="stats-row"><span class="stats-label">Remaining Time</span><span class="stats-value">${formatWatchTime(remaining*epMin)}</span></div>
            <div class="stats-row"><span class="stats-label">Avg Eps/Month</span><span class="stats-value">${avgPerMonth}</span></div>
            <div class="stats-row"><span class="stats-label">Avg Eps/Week</span><span class="stats-value">${Math.round(avgPerMonth/4.3)}</span></div>
            <div class="stats-row"><span class="stats-label">Months to Finish</span><span class="stats-value">${monthsToFinish}</span></div>
        </div>
        <div class="stats-chart-container"><h4>📊 Status Distribution</h4><canvas id="stats-status-chart"></canvas></div>
        <div class="stats-chart-container"><h4>📅 Episodes/Month</h4><canvas id="stats-monthly-chart"></canvas></div>
    `;

    const sc = document.getElementById('stats-status-chart');
    if (sc) {
        const colorMap = {
            'Watching':'#FFC107','Up to Date':'#4CAF50','Finished':'#2196F3',
            'Dropped':'#f44336','Paused':'#FF9800','Planned':'#9E9E9E'
        };
        new Chart(sc.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{ data: Object.values(statusCounts), backgroundColor: Object.keys(statusCounts).map(s => colorMap[s] || '#666') }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    const mc = document.getElementById('stats-monthly-chart');
    if (mc && monthKeys.length) {
        const last12 = monthKeys.slice(-12);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        new Chart(mc.getContext('2d'), {
            type: 'bar',
            data: {
                labels: last12.map(k => { const [y,m] = k.split('-'); return `${months[parseInt(m)-1]} ${y.slice(2)}`; }),
                datasets: [{ label: 'Episodes', data: last12.map(k => monthCounts[k]), backgroundColor: 'rgba(30,60,114,0.6)', borderColor: 'rgba(30,60,114,1)', borderWidth: 1 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }
}

function renderMovieStats(container) {
    const movies = getMovies();
    const watched = movies.filter(m => m.is_watched);
    const rewatched = movies.reduce((s, m) => s + (m.rewatch_count || 0), 0);
    const monthCounts = {};
    watched.forEach(m => {
        if (m.watched_at) {
            const d = new Date(m.watched_at);
            const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            monthCounts[k] = (monthCounts[k] || 0) + 1;
        }
    });
    const monthKeys = Object.keys(monthCounts).sort();
    const avgPerMonth = monthKeys.length ? Math.round(watched.length / monthKeys.length) : 0;

    container.innerHTML = `
        <div class="stats-card">
            <h4>📈 Overview</h4>
            <div class="stats-row"><span class="stats-label">Total</span><span class="stats-value">${movies.length}</span></div>
            <div class="stats-row"><span class="stats-label">Watched</span><span class="stats-value">${watched.length}</span></div>
            <div class="stats-row"><span class="stats-label">Unwatched</span><span class="stats-value">${movies.length-watched.length}</span></div>
            <div class="stats-row"><span class="stats-label">Rewatched</span><span class="stats-value">${rewatched}</span></div>
            <div class="stats-row"><span class="stats-label">Watch Time</span><span class="stats-value">${formatWatchTime(watched.length*100)}</span></div>
            <div class="stats-row"><span class="stats-label">Avg/Month</span><span class="stats-value">${avgPerMonth}</span></div>
        </div>
        <div class="stats-chart-container"><h4>📅 Movies/Month</h4><canvas id="stats-monthly-chart"></canvas></div>
    `;

    const mc = document.getElementById('stats-monthly-chart');
    if (mc && monthKeys.length) {
        const last12 = monthKeys.slice(-12);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        new Chart(mc.getContext('2d'), {
            type: 'bar',
            data: {
                labels: last12.map(k => { const [y,m] = k.split('-'); return `${months[parseInt(m)-1]} ${y.slice(2)}`; }),
                datasets: [{ label: 'Movies', data: last12.map(k => monthCounts[k]), backgroundColor: 'rgba(156,39,176,0.6)', borderColor: 'rgba(156,39,176,1)', borderWidth: 1 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }
}

// ===== EXPORTS =====
async function exportData(format) {
    const movies = getMovies(), tv = getTVShows(), anime = getAnime();
    if (format === 'json') {
        downloadFile('my-cinema-export.json', JSON.stringify({ movies, tv_shows: tv, anime, exported_at: new Date().toISOString() }, null, 2), 'application/json');
    } else if (format === 'csv') {
        let csv = 'Type,Title,Year,Status,Rating,Watched,Favorite\n';
        movies.forEach(m => csv += `Movie,"${m.title}",${m.year||''},${m.is_watched?'Watched':'Unwatched'},${m.tmdb_rating||''},${m.is_watched?'Yes':'No'},${m.is_favorite?'Yes':'No'}\n`);
        [...tv,...anime].forEach(s => csv += `${s.is_anime?'Anime':'TV'},"${s.title}",${s.year||''},${s.user_status||''},${s.tmdb_rating||''},-,${s.is_favorite?'Yes':'No'}\n`);
        downloadFile('my-cinema-export.csv', csv, 'text/csv');
    } else if (format === 'txt') {
        let txt = `MY CINEMA TRACKER\n${new Date().toLocaleDateString()}\n\n=== ANIME (${anime.length}) ===\n`;
        anime.forEach(s => txt += `[${s.user_status||'?'}] ${s.title} (${s.year||'?'})\n`);
        txt += `\n=== TV (${tv.length}) ===\n`;
        tv.forEach(s => txt += `[${s.user_status||'?'}] ${s.title} (${s.year||'?'})\n`);
        txt += `\n=== MOVIES (${movies.length}) ===\n`;
        movies.forEach(m => txt += `${m.is_watched?'✓':'○'} ${m.title} (${m.year||'?'})\n`);
        downloadFile('my-cinema-export.txt', txt, 'text/plain');
    }
}

async function exportPersonalList() {
    const a = await showConfirm('Personal Export', 'What to export?', 'Anime', 'TV Shows', true);
    let items, label;
    if (a === 'yes') { items = getAnime(); label = 'ANIME'; }
    else if (a === 'no') { items = getTVShows(); label = 'TV SHOWS'; }
    else {
        const b = await showConfirm('Export Movies?', 'Export movies list?', 'Yes', 'Cancel');
        if (b !== 'yes') return;
        items = getMovies(); label = 'MOVIES';
    }
    items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    let txt = `${label}\n${'='.repeat(label.length)}\n\n`;
    items.forEach((item, i) => txt += `${i+1}. ${item.title} (${item.year || 'N/A'})\n`);
    txt += `\nTotal: ${items.length}\n${new Date().toLocaleDateString()}`;
    downloadFile(`my-${label.toLowerCase()}-list.txt`, txt, 'text/plain');
}

function downloadFile(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
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
                const docId = `movie_${movie.id.tvdb || movie.id.imdb}`;
                let poster = 'https://via.placeholder.com/140x210?text=No+Image', tmdbId = null, tmdbRating = null;

                if (movie.id.imdb) {
                    try {
                        const d = await tmdbFetch(`${TMDB_BASE_URL}/find/${movie.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
                        if (d.movie_results?.length) {
                            tmdbId = d.movie_results[0].id;
                            poster = d.movie_results[0].poster_path ? TMDB_IMG_BASE + d.movie_results[0].poster_path : poster;
                            tmdbRating = d.movie_results[0].vote_average || null;
                        }
                    } catch(e) {}
                }

                if (!tmdbId && movie.title) {
                    try {
                        const d = await tmdbFetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year}`);
                        if (d.results?.length) {
                            tmdbId = d.results[0].id;
                            poster = d.results[0].poster_path ? TMDB_IMG_BASE + d.results[0].poster_path : poster;
                            tmdbRating = d.results[0].vote_average || null;
                        }
                    } catch(e) {}
                }

                await setDoc(doc(db, 'movies', docId), {
                    tmdb_id: tmdbId, imdb_id: movie.id.imdb, tvdb_id: movie.id.tvdb,
                    title: movie.title, year: movie.year, poster, tmdb_rating: tmdbRating,
                    is_watched: movie.is_watched || false, watched_at: movie.watched_at || null,
                    is_favorite: movie.is_favorite || false, rewatch_count: movie.rewatch_count || 0,
                    rewatch_history: [], created_at: movie.created_at || new Date().toISOString()
                });
                imp++;
                st.textContent = `Importing... ${imp}/${movies.length} (${fail} failed)`;
                if (imp % 30 === 0) await new Promise(r => setTimeout(r, 1000));
            } catch(e) { fail++; }
        }
        st.textContent = `✓ ${imp} movies imported! (${fail} failed)`;
        await loadMyList();
    } catch(e) { st.className = 'error'; st.textContent = `✗ ${e.message}`; }
}

async function importSeries() {
    const jsonText = document.getElementById('series-json').value;
    const st = document.getElementById('import-status');
    try {
        const series = JSON.parse(jsonText);
        let imp = 0, fail = 0;
        st.className = 'success';
        st.textContent = `Importing... 0/${series.length}`;

        for (const show of series) {
            try {
                const docId = `tv_${show.id.tvdb || show.id.imdb}`;
                let poster = 'https://via.placeholder.com/140x210?text=No+Image',
                    tmdbId = null, tmdbStatus = 'Unknown', tmdbRating = null, anime = false;

                if (show.id.imdb) {
                    try {
                        const d = await tmdbFetch(`${TMDB_BASE_URL}/find/${show.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
                        if (d.tv_results?.length) {
                            tmdbId = d.tv_results[0].id;
                            poster = d.tv_results[0].poster_path ? TMDB_IMG_BASE + d.tv_results[0].poster_path : poster;
                            tmdbRating = d.tv_results[0].vote_average || null;
                        }
                    } catch(e) {}
                }

                if (!tmdbId && show.title) {
                    try {
                        const clean = show.title.replace(/\s*\(\d{4}\)\s*$/, '');
                        const d = await tmdbFetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(clean)}`);
                        if (d.results?.length) {
                            tmdbId = d.results[0].id;
                            poster = d.results[0].poster_path ? TMDB_IMG_BASE + d.results[0].poster_path : poster;
                            tmdbRating = d.results[0].vote_average || null;
                        }
                    } catch(e) {}
                }

                if (tmdbId) {
                    try {
                        const det = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
                        tmdbStatus = det.status || 'Unknown';
                        anime = isAnimeShow(det);
                        if (!tmdbRating) tmdbRating = det.vote_average || null;
                    } catch(e) {}
                }

                const statusMap = {
                    'up_to_date': 'Up to Date', 'watching': 'Watching', 'watched': 'Finished',
                    'dropped': 'Dropped', 'on_hold': 'Paused', 'plan_to_watch': 'Planned'
                };

                const seasons = show.seasons?.map(s => ({
                    number: s.number,
                    is_specials: s.number === 0,
                    episodes: (s.episodes || []).map(ep => ({
                        number: ep.number,
                        name: ep.name || `Episode ${ep.number}`,
                        air_date: ep.air_date || null,
                        is_watched: ep.is_watched || false,
                        watched_at: ep.watched_at || null,
                        rewatch_count: ep.rewatch_count || 0,
                        rewatch_history: [],
                        is_special: s.number === 0
                    }))
                })) || [];

                await setDoc(doc(db, 'series', docId), {
                    tmdb_id: tmdbId, imdb_id: show.id.imdb, tvdb_id: show.id.tvdb,
                    title: show.title, year: show.year || null, poster, tmdb_rating: tmdbRating,
                    user_status: statusMap[show.status] || 'Watching',
                    tmdb_status: tmdbStatus,
                    last_status_check: new Date().toISOString(),
                    last_synced: new Date().toISOString(),
                    is_favorite: show.is_favorite || false,
                    is_anime: anime, seasons,
                    created_at: show.created_at || new Date().toISOString()
                });

                imp++;
                st.textContent = `Importing... ${imp}/${series.length} (${fail} failed)`;
                if (imp % 20 === 0) await new Promise(r => setTimeout(r, 1500));
            } catch(e) { fail++; console.error('Failed:', show.title, e); }
        }
        st.textContent = `✓ ${imp} shows imported! (${fail} failed)`;
        await loadMyList();
    } catch(e) { st.className = 'error'; st.textContent = `✗ ${e.message}`; }
}

// ===== CLOSE MODALS =====
window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) document.getElementById('modal').style.display = 'none';
    if (e.target === document.getElementById('episode-modal')) document.getElementById('episode-modal').style.display = 'none';
    if (e.target === document.getElementById('preview-modal')) document.getElementById('preview-modal').style.display = 'none';
    if (e.target === document.getElementById('confirm-dialog')) document.getElementById('confirm-dialog').style.display = 'none';
    if (e.target === document.getElementById('stats-modal')) document.getElementById('stats-modal').style.display = 'none';
    if (e.target === document.getElementById('bulk-modal')) document.getElementById('bulk-modal').style.display = 'none';
    if (e.target === document.getElementById('tag-specials-modal')) document.getElementById('tag-specials-modal').style.display = 'none';
    if (!e.target.closest('.show-options')) document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
});

document.querySelector('#modal .close').addEventListener('click', () => { document.getElementById('modal').style.display = 'none'; });
document.getElementById('import-movies-btn').addEventListener('click', importMovies);
document.getElementById('import-series-btn').addEventListener('click', importSeries);

// ===== GLOBAL =====
window.openDetails = openDetails;
window.openPreview = openPreview;
window.openEpisodeDetail = openEpisodeDetail;
window.addToList = addToList;
window.removeFromList = removeFromList;
window.removeFromListByTMDB = removeFromListByTMDB;
window.toggleEpisode = toggleEpisode;
window.toggleFavorite = toggleFavorite;
window.toggleWatched = toggleWatched;
window.markSeasonWatched = markSeasonWatched;
window.quickMarkWatched = quickMarkWatched;
window.setUserStatus = setUserStatus;
window.toggleAnimeStatus = toggleAnimeStatus;
window.toggleOptionsMenu = toggleOptionsMenu;
window.toggleSeason = toggleSeason;
window.switchDetailTab = switchDetailTab;
window.switchSection = switchSection;
window.switchSubTab = switchSubTab;
window.renderLibrary = renderLibrary;
window.loadSectionCalendar = loadSectionCalendar;
window.exportData = exportData;
window.exportPersonalList = exportPersonalList;
window.handlePreviewAdd = handlePreviewAdd;
window.openStatsPage = openStatsPage;
window.renderStats = renderStats;
window.rescanAnime = rescanAnime;
window.autoTagStatuses = autoTagStatuses;
window.openBulkTagger = openBulkTagger;
window.filterBulkList = filterBulkList;
window.selectAllBulk = selectAllBulk;
window.applyBulkAction = applyBulkAction;
window.openTagSpecialsModal = openTagSpecialsModal;
window.applySpecialTags = applySpecialTags;
window.syncAllAiringShows = syncAllAiringShows;
