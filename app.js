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

// Global State
let myList = [];
let currentSearchType = 'multi';
let tmdbCache = {};
let currentSection = 'anime';
let calendarLoaded = { anime: false, tv: false };

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    setupBottomNav();
    setupSearch();
    setupPullToRefresh();
    setupDarkMode();
    await loadMyList();
    setupRealtimeListeners();
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
        const isDark = toggle.checked;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        localStorage.setItem('darkMode', isDark);
    });
}

// ===== PULL TO REFRESH =====
let pullStartY = 0;
let pulling = false;

function setupPullToRefresh() {
    const container = document.getElementById('main-container');
    const indicator = document.getElementById('pull-refresh-indicator');

    container.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) { pullStartY = e.touches[0].clientY; pulling = true; }
    });

    container.addEventListener('touchmove', (e) => {
        if (!pulling) return;
        const d = e.touches[0].clientY - pullStartY;
        if (d > 0 && d < 100) indicator.style.top = `${d - 60}px`;
        else if (d >= 100) indicator.classList.add('visible');
    });

    container.addEventListener('touchend', async (e) => {
        if (!pulling) return;
        pulling = false;
        const d = e.changedTouches[0].clientY - pullStartY;
        if (d >= 100) {
            indicator.querySelector('span').textContent = 'Refreshing...';
            await loadMyList();
            setTimeout(() => {
                indicator.classList.remove('visible');
                indicator.style.top = '-60px';
                indicator.querySelector('span').textContent = 'Release to refresh...';
            }, 1000);
        } else {
            indicator.style.top = '-60px';
            indicator.classList.remove('visible');
        }
    });
}

// ===== REALTIME LISTENERS =====
function setupRealtimeListeners() {
    onSnapshot(collection(db, 'movies'), () => { loadMyList(); });
    onSnapshot(collection(db, 'series'), () => { loadMyList(); });
}

// ===== BOTTOM NAV =====
function setupBottomNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchSection(btn.dataset.section);
        });
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
    // Find which section this tab belongs to
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
    btn.addEventListener('click', () => {
        switchSubTab(btn.dataset.subtab);
    });
});

// ===== SEARCH =====
function setupSearch() {
    const input = document.getElementById('search-input');
    const btn = document.getElementById('search-btn');
    const overlay = document.getElementById('search-overlay');
    const closeBtn = document.getElementById('close-search-btn');

    // Open overlay on focus or button click
    input.addEventListener('focus', () => showSearchOverlay());
    btn.addEventListener('click', () => { showSearchOverlay(); performSearch(); });
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') { showSearchOverlay(); performSearch(); } });

    closeBtn.addEventListener('click', () => hideSearchOverlay());

    // Search type filters
    document.querySelectorAll('.search-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSearchType = btn.dataset.type === 'anime' ? 'tv' : btn.dataset.type;
            if (document.getElementById('search-input').value.trim()) performSearch();
        });
    });
}

function showSearchOverlay() {
    document.getElementById('search-overlay').style.display = 'block';
    document.getElementById('search-input').focus();
}

function hideSearchOverlay() {
    document.getElementById('search-overlay').style.display = 'none';
}

async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const container = document.getElementById('search-results');
    container.innerHTML = '<p class="empty-state">Searching...</p>';

    try {
        const type = currentSearchType === 'multi' ? 'multi' : currentSearchType;
        const data = await tmdbFetch(`${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
        displaySearchResults(data.results || []);
    } catch (error) {
        container.innerHTML = '<p class="empty-state">Search failed. Try again.</p>';
    }
}

function displaySearchResults(results) {
    const container = document.getElementById('search-results');
    if (!results.length) {
        container.innerHTML = '<p class="empty-state">No results found.</p>';
        return;
    }

    container.innerHTML = results.map(item => {
        const title = item.title || item.name || 'Unknown';
        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
        const type = item.media_type || currentSearchType;
        if (type === 'person') return '';
        const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : 'https://via.placeholder.com/150x225?text=No+Image';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const isInList = myList.some(li => li.tmdb_id === item.id);
        const safeTitle = (title).replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <div class="media-card" onclick="openPreview(${item.id},'${type}','${safeTitle}','${year}','${poster}')">
                <img src="${poster}" alt="${title}" onerror="this.src='https://via.placeholder.com/150x225?text=No+Image'">
                <div class="info">
                    <h3>${title}</h3>
                    <p class="year">${year} · ⭐${rating}</p>
                    <p class="year">${type === 'tv' ? 'TV Show' : 'Movie'}</p>
                </div>
                <button class="add-btn ${isInList ? 'in-list-btn' : ''}"
                    onclick="event.stopPropagation(); ${isInList ? `removeFromListByTMDB(${item.id},'${type}')` : `addToList(${item.id},'${type}','${safeTitle}','${year}','${poster}')`}">
                    ${isInList ? '✓ In Library' : '+ Add'}
                </button>
            </div>
        `;
    }).filter(Boolean).join('');
}

// ===== TMDB FETCH WITH CACHE =====
async function tmdbFetch(url) {
    if (tmdbCache[url] && Date.now() - tmdbCache[url].time < 3600000) {
        return tmdbCache[url].data;
    }
    const response = await fetch(url);
    const data = await response.json();
    tmdbCache[url] = { data, time: Date.now() };
    return data;
}

// ===== LOAD MY LIST =====
async function loadMyList() {
    try {
        myList = [];
        const moviesSnap = await getDocs(collection(db, 'movies'));
        moviesSnap.forEach(d => myList.push({ ...d.data(), docId: d.id, type: 'movie' }));
        const seriesSnap = await getDocs(collection(db, 'series'));
        seriesSnap.forEach(d => myList.push({ ...d.data(), docId: d.id, type: 'tv' }));
        myList.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        renderAllSections();
        updateProfilePage();
    } catch (error) {
        console.error('Error loading:', error);
    }
}

// ===== RENDER ALL SECTIONS =====
function renderAllSections() {
    renderContinueWatching('anime');
    renderContinueWatching('tv');
    renderMoviesSection();
    renderLibrary('anime');
    renderLibrary('tv');
    renderLibrary('movies');
}

// ===== HELPERS =====
function getAnime() { return myList.filter(i => i.type === 'tv' && i.is_anime); }
function getTVShows() { return myList.filter(i => i.type === 'tv' && !i.is_anime); }
function getMovies() { return myList.filter(i => i.type === 'movie'); }

function getShowProgressExcludingSpecials(show) {
    if (!show.seasons) return 0;
    let total = 0, watched = 0;
    show.seasons.forEach(s => {
        if (s.number === 0) return;
        if (s.episodes) s.episodes.forEach(ep => { total++; if (ep.is_watched) watched++; });
    });
    return total > 0 ? (watched / total) * 100 : 0;
}

function getNextEpisodeExcludingSpecials(show) {
    if (!show.seasons) return null;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        for (const ep of (s.episodes || [])) {
            if (!ep.is_watched) return { season: s.number, number: ep.number, name: ep.name || `Episode ${ep.number}` };
        }
    }
    return null;
}

function getLastWatchedDate(show) {
    let last = null;
    if (show.seasons) {
        show.seasons.forEach(s => s.episodes?.forEach(ep => {
            if (ep.is_watched && ep.watched_at) {
                if (!last || new Date(ep.watched_at) > new Date(last)) last = ep.watched_at;
            }
        }));
    }
    return last || show.created_at || new Date().toISOString();
}

function getPreviousUnwatchedEpisodes(show, targetSeason, targetEp) {
    const unwatched = [];
    if (!show.seasons) return unwatched;
    for (const s of show.seasons) {
        if (s.number === 0) continue;
        if (s.number > targetSeason) break;
        for (const ep of (s.episodes || [])) {
            if (s.number === targetSeason && ep.number >= targetEp) break;
            if (!ep.is_watched) unwatched.push({ seasonNum: s.number, episodeNum: ep.number });
        }
    }
    return unwatched;
}

function isAnimeShow(details) {
    const genres = details.genres || [];
    const isAnimation = genres.some(g => g.id === 16);
    const isJapanese = details.original_language === 'ja';
    const animeNets = ['Fuji TV','Tokyo MX','TBS','TV Tokyo','Crunchyroll','AT-X','BS11','MBS','NHK'];
    const networks = details.networks || [];
    return (isAnimation && isJapanese) || (isAnimation && networks.some(n => animeNets.includes(n.name)));
}

// ===== CREATE MEDIA CARD =====
function createMediaCard(item, clickHandler) {
    const poster = item.poster && !item.poster.includes('placeholder')
        ? item.poster
        : `https://via.placeholder.com/150x225?text=${encodeURIComponent(item.title || 'No Image')}`;

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
    const handler = clickHandler || `openDetails('${safeDocId}','${item.type}')`;

    return `
        <div class="media-card" onclick="${handler}">
            ${item.is_favorite ? '<div class="favorite-badge">⭐</div>' : ''}
            <img src="${poster}" alt="${item.title}" onerror="this.src='https://via.placeholder.com/150x225?text=No+Image'">
            ${statusLine}
            <div class="info">
                <h3>${item.title || 'Unknown'}</h3>
                <p class="year">${rating || item.year || ''}</p>
                ${item.type === 'tv' ? `<p class="year">${item.user_status || 'Watching'}</p>` : ''}
                ${item.type === 'movie' && item.is_watched ? '<p class="year">✓ Watched</p>' : ''}
            </div>
        </div>
    `;
}

// ===== CONTINUE WATCHING =====
function renderContinueWatching(sectionType) {
    const isAnime = sectionType === 'anime';
    const listId = `${sectionType}-continue-list`;
    const historyAreaId = `${sectionType}-watch-history-area`;
    const container = document.getElementById(listId);
    const historyArea = document.getElementById(historyAreaId);
    if (!container) return;

    const shows = isAnime ? getAnime() : getTVShows();

    const inProgress = shows.filter(item => {
        if (!item.seasons || !item.seasons.length) return false;
        let hasWatched = false, hasUnwatched = false;
        item.seasons.forEach(s => {
            if (s.number === 0) return;
            s.episodes?.forEach(ep => {
                if (ep.is_watched) hasWatched = true;
                else hasUnwatched = true;
            });
        });
        return hasWatched && hasUnwatched;
    });

    if (!inProgress.length) {
        container.innerHTML = '<p class="empty-state">No shows in progress!</p>';
        if (historyArea) historyArea.innerHTML = '';
        return;
    }

    // Sort by most recently watched
    inProgress.sort((a, b) => new Date(getLastWatchedDate(b)) - new Date(getLastWatchedDate(a)));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const active = inProgress.filter(s => new Date(getLastWatchedDate(s)) >= thirtyDaysAgo);
    const old = inProgress.filter(s => new Date(getLastWatchedDate(s)) < thirtyDaysAgo);

    // Watch history (old items) shown ABOVE continue watching, faded, oldest at top, newest at bottom
    if (historyArea) {
        if (old.length > 0) {
            // Sort old: oldest at top, most recent at bottom (closest to continue watching)
            const oldSorted = [...old].reverse();
            historyArea.innerHTML = `
                <div class="watch-history-label">WATCH HISTORY</div>
                ${oldSorted.map(s => createContinueCard(s, true)).join('')}
            `;
        } else {
            historyArea.innerHTML = '';
        }
    }

    container.innerHTML = active.length
        ? active.map(s => createContinueCard(s, false)).join('')
        : '<p class="empty-state">Start watching something!</p>';
}

function createContinueCard(show, isHistory) {
    const nextEp = getNextEpisodeExcludingSpecials(show);
    const progress = getShowProgressExcludingSpecials(show);
    const safeDocId = show.docId.replace(/'/g, "\\'");
    const poster = show.poster && !show.poster.includes('placeholder')
        ? show.poster : 'https://via.placeholder.com/52x78?text=?';
    const epCode = nextEp
        ? `S${String(nextEp.season).padStart(2,'0')}E${String(nextEp.number).padStart(2,'0')}`
        : 'Up to date';

    return `
        <div class="continue-card ${isHistory ? 'history-item' : ''}">
            <img src="${poster}" alt="${show.title}"
                 onerror="this.src='https://via.placeholder.com/52x78?text=?'"
                 onclick="openDetails('${safeDocId}','tv')" style="cursor:pointer;">
            <div class="continue-info">
                <h3 onclick="openDetails('${safeDocId}','tv')">${show.title}</h3>
                <div class="episode-code">${epCode}</div>
                ${nextEp ? `<div class="episode-name">${nextEp.name}</div>` : ''}
                <div class="continue-progress">
                    <div class="continue-progress-fill ${progress >= 100 ? 'uptodate' : 'watching'}"
                         style="width:${progress}%;"></div>
                </div>
                <div style="font-size:10px;color:var(--text3);margin-top:2px;">${progress.toFixed(0)}%</div>
            </div>
            ${nextEp
                ? `<button class="quick-check-btn" onclick="quickMarkWatched('${safeDocId}',${nextEp.season},${nextEp.number})" title="Mark ${epCode}">✓</button>`
                : '<div style="width:40px;"></div>'
            }
        </div>
    `;
}

// ===== MOVIES SECTION =====
function renderMoviesSection() {
    const movies = getMovies();
    const watchedEl = document.getElementById('movies-watched-list');
    const unwatchedEl = document.getElementById('movies-unwatched-list');

    const watched = movies.filter(m => m.is_watched);
    const unwatched = movies.filter(m => !m.is_watched);

    watchedEl.innerHTML = watched.length
        ? watched.map(m => createMediaCard(m)).join('')
        : '<p class="empty-state">No watched movies yet.</p>';

    unwatchedEl.innerHTML = unwatched.length
        ? unwatched.map(m => createMediaCard(m)).join('')
        : '<p class="empty-state">No unwatched movies.</p>';
}

// ===== LIBRARY =====
function renderLibrary(section) {
    let items, gridId, sortId, filterId;

    if (section === 'anime') {
        items = getAnime();
        gridId = 'anime-library-grid';
        sortId = 'anime-sort';
        filterId = 'anime-filter';
    } else if (section === 'tv') {
        items = getTVShows();
        gridId = 'tv-library-grid';
        sortId = 'tv-sort';
        filterId = 'tv-filter';
    } else {
        items = getMovies();
        gridId = 'movies-library-grid';
        sortId = 'movies-sort';
        filterId = 'movies-filter';
    }

    const grid = document.getElementById(gridId);
    if (!grid) return;

    const sortEl = document.getElementById(sortId);
    const filterEl = document.getElementById(filterId);
    const sort = sortEl ? sortEl.value : 'title';
    const filter = filterEl ? filterEl.value : 'all';

    // Filter
    let filtered = items;
    if (filter !== 'all') {
        if (filter === 'watched') filtered = items.filter(i => i.is_watched);
        else if (filter === 'unwatched') filtered = items.filter(i => !i.is_watched);
        else if (filter === 'favorites') filtered = items.filter(i => i.is_favorite);
        else filtered = items.filter(i => i.user_status === filter);
    }

    // Sort
    if (sort === 'title') filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (sort === 'rating') filtered.sort((a, b) => (b.tmdb_rating || 0) - (a.tmdb_rating || 0));
    else if (sort === 'recent') filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sort === 'progress') filtered.sort((a, b) => getShowProgressExcludingSpecials(b) - getShowProgressExcludingSpecials(a));
    else if (sort === 'year') filtered.sort((a, b) => (b.year || 0) - (a.year || 0));

    grid.innerHTML = filtered.length
        ? filtered.map(item => createMediaCard(item)).join('')
        : '<p class="empty-state">No items found.</p>';
}

// ===== PROFILE PAGE =====
function updateProfilePage() {
    const anime = getAnime();
    const tv = getTVShows();
    const movies = getMovies();

    // Count episodes
    function countEps(list) {
        let total = 0;
        list.forEach(show => {
            show.seasons?.forEach(s => {
                if (s.number === 0) return;
                s.episodes?.forEach(ep => { if (ep.is_watched) total++; });
            });
        });
        return total;
    }

    // Estimate watch time (avg 24min anime, 45min tv, 100min movie)
    function calcTime(eps, minutesPerEp) { return Math.round(eps * minutesPerEp / 60); }

    const animeEps = countEps(anime);
    const tvEps = countEps(tv);
    const moviesWatched = movies.filter(m => m.is_watched).length;

    const animeFinished = anime.filter(a => a.user_status === 'Finished' || a.user_status === 'Up to Date').length;
    const tvFinished = tv.filter(t => t.user_status === 'Finished' || t.user_status === 'Up to Date').length;
    const moviesRewatched = movies.reduce((sum, m) => sum + (m.rewatch_count || 0), 0);

    // Update DOM
    document.getElementById('p-anime-watched').textContent = animeFinished;
    document.getElementById('p-anime-total').textContent = anime.length;
    document.getElementById('p-anime-eps').textContent = animeEps;
    document.getElementById('p-anime-time').textContent = `${calcTime(animeEps, 24)}h`;
    document.getElementById('p-anime-bar').style.width = anime.length ? `${(animeFinished / anime.length) * 100}%` : '0%';

    document.getElementById('p-tv-watched').textContent = tvFinished;
    document.getElementById('p-tv-total').textContent = tv.length;
    document.getElementById('p-tv-eps').textContent = tvEps;
    document.getElementById('p-tv-time').textContent = `${calcTime(tvEps, 45)}h`;
    document.getElementById('p-tv-bar').style.width = tv.length ? `${(tvFinished / tv.length) * 100}%` : '0%';

    document.getElementById('p-movies-watched').textContent = moviesWatched;
    document.getElementById('p-movies-total').textContent = movies.length;
    document.getElementById('p-movies-rewatched').textContent = moviesRewatched;
    document.getElementById('p-movies-time').textContent = `${calcTime(moviesWatched, 100)}h`;
    document.getElementById('p-movies-bar').style.width = movies.length ? `${(moviesWatched / movies.length) * 100}%` : '0%';

    // Recent posters (last 6 added)
    function recentPosters(list, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const recent = [...list]
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, 6);
        el.innerHTML = recent.map(item => `
            <img src="${item.poster && !item.poster.includes('placeholder') ? item.poster : 'https://via.placeholder.com/50x75?text=?'}"
                 alt="${item.title}"
                 onerror="this.src='https://via.placeholder.com/50x75?text=?'"
                 onclick="openDetails('${item.docId.replace(/'/g,"\\'")}','${item.type}')" style="cursor:pointer;">
        `).join('');
    }

    recentPosters(anime, 'p-anime-posters');
    recentPosters(tv, 'p-tv-posters');
    recentPosters(movies, 'p-movies-posters');
}
// ===== QUICK MARK WATCHED =====
async function quickMarkWatched(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;
    const episode = season.episodes.find(e => e.number === episodeNum);
    if (!episode) return;

    const prev = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);
    if (prev.length > 0) {
        const answer = await showConfirm('Mark Previous?',
            `${prev.length} unwatched episode(s) before this. Mark all?`, 'Yes', 'No, just this');
        if (answer === 'yes') {
            prev.forEach(({ seasonNum: sN, episodeNum: eN }) => {
                const s = item.seasons.find(s => s.number === sN);
                const e = s?.episodes.find(e => e.number === eN);
                if (e) { e.is_watched = true; e.watched_at = new Date().toISOString(); }
            });
        }
    }

    episode.is_watched = true;
    episode.watched_at = new Date().toISOString();

    try {
        await updateDoc(doc(db, 'series', docId), { seasons: item.seasons });
        const local = myList.find(i => i.docId === docId);
        if (local) local.seasons = item.seasons;
        renderContinueWatching(item.is_anime ? 'anime' : 'tv');
    } catch (e) { console.error(e); }
}

// ===== CONFIRM DIALOG =====
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

// ===== OPEN PREVIEW (Search/Similar - NOT in library) =====
async function openPreview(tmdbId, type, title, year, poster) {
    const modal = document.getElementById('preview-modal');
    const body = document.getElementById('preview-modal-body');
    body.innerHTML = '<p class="empty-state">Loading...</p>';
    modal.style.display = 'block';

    const isInList = myList.some(i => i.tmdb_id === tmdbId);
    const safeTitle = (title || '').replace(/'/g, "\\'");

    let details = null, credits = null, similar = null, providers = null;
    try {
        const endpoint = type === 'movie' ? 'movie' : 'tv';
        [details, credits, similar, providers] = await Promise.all([
            tmdbFetch(`${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${endpoint}/${tmdbId}/credits?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${endpoint}/${tmdbId}/similar?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`${TMDB_BASE_URL}/${endpoint}/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`)
        ]);
    } catch (e) { console.warn('Preview fetch failed'); }

    const synopsis = details?.overview || 'No synopsis available.';
    const rating = details?.vote_average || null;
    const genres = details?.genres || [];
    const cast = credits?.cast?.slice(0, 12) || [];
    const similarItems = similar?.results?.slice(0, 10) || [];
    const providerList = providers?.results?.US?.flatrate || providers?.results?.GB?.flatrate || [];
    const networks = details?.networks || [];
    const runtime = type === 'movie' && details?.runtime
        ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : null;
    const tmdbStatus = details?.status || '';
    const statusColor = {
        'Returning Series': '#4CAF50', 'In Production': '#2196F3',
        'Ended': '#666', 'Canceled': '#f44336', 'Released': '#4CAF50'
    }[tmdbStatus] || '#666';

    body.innerHTML = `
        <div class="detail-header">
            <img src="${poster}" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'" alt="${title}">
            <div class="detail-header-info">
                <h2><span>${title} ${year ? `(${year})` : ''}</span></h2>
                ${tmdbStatus ? `<span class="status-badge" style="background:${statusColor};">${tmdbStatus}</span>` : ''}
                ${rating ? `<p style="margin:6px 0; color:var(--text2); font-size:14px;">⭐ <strong>${rating.toFixed(1)}</strong>/10 <small style="color:var(--text3);">TMDB</small></p>` : ''}
                ${runtime ? `<p style="color:var(--text2); font-size:13px;">⏱ ${runtime}</p>` : ''}
                <div class="genre-tags">
                    ${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}
                </div>
                <div style="margin-top:12px;">
                    <button onclick="handlePreviewAdd(${tmdbId},'${type}','${safeTitle}','${year}','${poster}')"
                            class="watch-btn ${isInList ? 'watched' : 'mark-watched'}" style="font-size:14px; padding:10px 20px;">
                        ${isInList ? '✓ In Your Library' : '+ Add to Library'}
                    </button>
                </div>
            </div>
        </div>
        <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
        ${buildCastSection(cast)}
        ${buildNetworksSection(providerList, networks)}
        ${buildSimilarSection(similarItems, type)}
    `;
}

async function handlePreviewAdd(tmdbId, type, title, year, poster) {
    const isInList = myList.some(i => i.tmdb_id === tmdbId);
    if (isInList) {
        const item = myList.find(i => i.tmdb_id === tmdbId);
        if (item) {
            document.getElementById('preview-modal').style.display = 'none';
            openDetails(item.docId, item.type);
        }
    } else {
        await addToList(tmdbId, type, title, year, poster);
        // Refresh the add button
        const btn = document.querySelector('#preview-modal-body .watch-btn');
        if (btn) { btn.textContent = '✓ In Your Library'; btn.classList.add('watched'); }
    }
}

// ===== OPEN DETAILS (items IN library) =====
async function openDetails(docId, type) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    const safeDocId = docId.replace(/'/g, "\\'");

    body.innerHTML = '<p class="empty-state">Loading details...</p>';
    modal.style.display = 'block';

    if (type === 'movie') await openMovieDetails(item, body, safeDocId);
    else await openTVDetails(item, body, safeDocId);
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

    const synopsis = details?.overview || 'No synopsis available.';
    const rating = details?.vote_average || item.tmdb_rating;
    const genres = details?.genres || [];
    const runtime = details?.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : 'N/A';
    const cast = credits?.cast?.slice(0, 15) || [];
    const director = credits?.crew?.find(c => c.job === 'Director');
    const similarItems = similar?.results?.slice(0, 10) || [];
    const providerList = providers?.results?.US?.flatrate || providers?.results?.GB?.flatrate || [];
    const companies = details?.production_companies || [];

    body.innerHTML = `
        <div class="detail-header">
            <img src="${item.poster}" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'" alt="${item.title}">
            <div class="detail-header-info">
                <h2>
                    <span>${item.title} ${item.year ? `(${item.year})` : ''}</span>
                    <div class="show-options">
                        <button class="options-btn" onclick="toggleOptionsMenu('movie-opts')">⋯</button>
                        <div class="options-menu" id="movie-opts">
                            <button onclick="toggleFavorite('${safeDocId}','movie')">${item.is_favorite ? '⭐ Remove Favorite' : '☆ Add Favorite'}</button>
                            <button class="danger" onclick="removeFromList('${safeDocId}','movie')">🗑 Remove</button>
                        </div>
                    </div>
                </h2>
                ${rating ? `<p style="margin:5px 0; color:var(--text2); font-size:14px;">⭐ <strong>${rating.toFixed(1)}</strong>/10 <small style="color:var(--text3);">TMDB</small></p>` : ''}
                ${director ? `<p style="color:var(--text2); font-size:13px;">🎬 ${director.name}</p>` : ''}
                <p style="color:var(--text2); font-size:13px;">⏱ ${runtime}</p>
                <div class="genre-tags">${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}</div>
                <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button onclick="toggleWatched('${safeDocId}','movie')" class="watch-btn ${item.is_watched ? 'watched' : 'mark-watched'}">
                        ${item.is_watched ? '✓ Watched' : '○ Mark Watched'}
                    </button>
                </div>
                ${item.watched_at ? `<p style="margin-top:8px; color:var(--text3); font-size:12px;">Watched: ${new Date(item.watched_at).toLocaleDateString()}</p>` : ''}
                ${item.rewatch_count > 0 ? `<p style="color:var(--text3); font-size:12px;">↺ Rewatched ${item.rewatch_count}x</p>` : ''}
            </div>
        </div>
        <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
        ${buildCastSection(cast)}
        ${buildNetworksSection(providerList, companies)}
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

    const synopsis = details?.overview || 'No synopsis available.';
    const rating = details?.vote_average || item.tmdb_rating;
    const genres = details?.genres || [];
    const cast = credits?.cast?.slice(0, 15) || [];
    const similarItems = similar?.results?.slice(0, 10) || [];
    const providerList = providers?.results?.US?.flatrate || providers?.results?.GB?.flatrate || [];
    const networks = details?.networks || [];
    const tmdbStatus = details?.status || item.tmdb_status || 'Unknown';
    const totalSeasons = details?.number_of_seasons || 0;
    const totalEps = details?.number_of_episodes || 0;
    const statusColor = {
        'Returning Series': '#4CAF50', 'In Production': '#2196F3',
        'Ended': '#666', 'Canceled': '#f44336', 'Pilot': '#FF9800'
    }[tmdbStatus] || '#666';

    const progress = getShowProgressExcludingSpecials(item);
    let watchedCount = 0, totalCount = 0;
    item.seasons?.forEach(s => {
        if (s.number === 0) return;
        s.episodes?.forEach(ep => { totalCount++; if (ep.is_watched) watchedCount++; });
    });

    let episodeRatings = [];
    if (item.tmdb_id) episodeRatings = await fetchEpisodeRatings(item.tmdb_id, item.seasons || []);

    const regularSeasons = (item.seasons || []).filter(s => s.number !== 0);
    const specialsSeason = (item.seasons || []).find(s => s.number === 0);
    const seasonsHTML = regularSeasons.map(s => buildSeasonHTML(s, safeDocId)).join('');
    const specialsHTML = specialsSeason?.episodes?.length ? `
        <div class="season specials">
            <h3><span>Specials</span></h3>
            ${specialsSeason.episodes.map(ep => buildEpisodeHTML(ep, 0, safeDocId)).join('')}
        </div>` : '';

    body.innerHTML = `
        <div class="detail-header">
            <img src="${item.poster}" onerror="this.src='https://via.placeholder.com/140x210?text=No+Image'" alt="${item.title}">
            <div class="detail-header-info">
                <h2>
                    <span>${item.title}</span>
                    <div class="show-options">
                        <button class="options-btn" onclick="toggleOptionsMenu('tv-opts')">⋯</button>
                        <div class="options-menu" id="tv-opts">
                            <button onclick="toggleFavorite('${safeDocId}','tv')">${item.is_favorite ? '⭐ Remove Favorite' : '☆ Add Favorite'}</button>
                            <button onclick="setUserStatus('${safeDocId}','Watching')">▶ Watching</button>
                            <button onclick="setUserStatus('${safeDocId}','Up to Date')">✅ Up to Date</button>
                            <button onclick="setUserStatus('${safeDocId}','Paused')">⏸ Paused</button>
                            <button onclick="setUserStatus('${safeDocId}','Dropped')">🚫 Dropped</button>
                            <button onclick="setUserStatus('${safeDocId}','Finished')">🏁 Finished</button>
                            <button onclick="setUserStatus('${safeDocId}','Planned')">📋 Planned</button>
                            <button onclick="toggleAnimeStatus('${safeDocId}')">${item.is_anime ? '🎌 Remove Anime Tag' : '🎌 Mark as Anime'}</button>
                            <button class="danger" onclick="removeFromList('${safeDocId}','tv')">🗑 Remove</button>
                        </div>
                    </div>
                </h2>
                <div>
                    <span class="status-badge" style="background:${statusColor};">${tmdbStatus}</span>
                    ${item.is_anime ? '<span class="status-badge anime-badge">🎌 Anime</span>' : ''}
                </div>
                ${rating ? `<p style="margin:4px 0; color:var(--text2); font-size:14px;">⭐ <strong>${rating.toFixed(1)}</strong>/10 <small style="color:var(--text3);">TMDB</small></p>` : ''}
                <p style="color:var(--text2); font-size:13px;">${totalSeasons} Season(s) · ${totalEps} Eps</p>
                <p style="color:var(--text2); font-size:13px;">Status: <strong>${item.user_status || 'Watching'}</strong></p>
                <div class="genre-tags">${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}</div>
                <div class="detail-progress">
                    <div class="detail-progress-label">${watchedCount}/${totalCount} watched (${progress.toFixed(0)}%)</div>
                    <div class="detail-progress-bar">
                        <div class="detail-progress-fill" style="width:${progress}%; background:${progress >= 100 ? '#4CAF50' : '#FFC107'};"></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="detail-tabs">
            <button class="detail-tab-btn active" onclick="switchDetailTab('info-tab')">Info</button>
            <button class="detail-tab-btn" onclick="switchDetailTab('episodes-tab')">Episodes</button>
        </div>

        <div class="swipe-container" id="detail-swipe">
            <div class="detail-tab-content active" id="info-tab">
                <div class="synopsis"><h3>Synopsis</h3><p>${synopsis}</p></div>
                ${buildEpisodeRatingsChart(episodeRatings)}
                ${buildCastSection(cast)}
                ${buildNetworksSection(providerList, networks)}
                ${buildSimilarSection(similarItems, 'tv')}
            </div>
            <div class="detail-tab-content" id="episodes-tab">
                ${seasonsHTML}
                ${specialsHTML}
            </div>
        </div>
    `;

    setupDetailSwipe();
    if (episodeRatings.length > 0) renderEpisodeRatingsChart(episodeRatings);
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
                backgroundColor: ratings.map(r => colors[(r.season - 1) % colors.length] + '99'),
                borderColor: ratings.map(r => colors[(r.season - 1) % colors.length]),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => `${ratings[items[0].dataIndex].label} - ${ratings[items[0].dataIndex].name}`,
                        label: (item) => `Rating: ${item.raw.toFixed(1)}/10`
                    }
                }
            },
            scales: {
                y: { min: 0, max: 10 },
                x: { ticks: { maxRotation: 90, font: { size: 9 } } }
            }
        }
    });
}

// ===== BUILD HTML HELPERS =====
function buildCastSection(cast) {
    if (!cast.length) return '';
    return `
        <div class="cast-section">
            <h3>🎭 Cast</h3>
            <div class="cast-carousel" onwheel="event.preventDefault(); this.scrollLeft += event.deltaY;">
                ${cast.map(p => `
                    <div class="cast-card">
                        <img src="${p.profile_path ? TMDB_IMG_BASE + p.profile_path : 'https://via.placeholder.com/70x70?text=?'}"
                             alt="${p.name}" onerror="this.src='https://via.placeholder.com/70x70?text=?'">
                        <div class="cast-name">${p.name}</div>
                        <div class="cast-character">${p.character || ''}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function buildNetworksSection(providers, networks) {
    const all = [...(networks || []), ...(providers || [])];
    if (!all.length) return '';
    return `
        <div class="networks-section">
            <h3>📺 Available On</h3>
            <div class="network-logos">
                ${all.map(n => n.logo_path
                    ? `<img class="network-logo" src="${TMDB_IMG_BASE}${n.logo_path}" alt="${n.name || n.provider_name}" title="${n.name || n.provider_name}">`
                    : `<span class="network-name">${n.name || n.provider_name}</span>`
                ).join('')}
            </div>
        </div>
    `;
}

function buildSimilarSection(items, type) {
    if (!items.length) return '';
    return `
        <div class="similar-section">
            <h3>🎬 Similar ${type === 'tv' ? 'Shows' : 'Movies'}</h3>
            <div class="similar-carousel" onwheel="event.preventDefault(); this.scrollLeft += event.deltaY;">
                ${items.map(item => {
                    const title = item.title || item.name;
                    const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : 'https://via.placeholder.com/110x165?text=No+Image';
                    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                    const year = (item.release_date || item.first_air_date || '').substring(0, 4);
                    const safeTitle = (title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    return `
                        <div class="similar-card" onclick="openPreview(${item.id},'${type}','${safeTitle}','${year}','${poster}')">
                            <img src="${poster}" alt="${title}" onerror="this.src='https://via.placeholder.com/110x165?text=No+Image'">
                            <div class="similar-title">${title}</div>
                            <div class="similar-rating">⭐ ${rating}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function buildSeasonHTML(season, safeDocId) {
    const watched = season.episodes?.filter(e => e.is_watched).length || 0;
    const total = season.episodes?.length || 0;
    const allWatched = watched === total && total > 0;
    return `
        <div class="season">
            <h3>
                <span>Season ${season.number} <span style="font-size:12px;opacity:0.8;">(${watched}/${total})</span></span>
                <button class="mark-all-btn" onclick="markSeasonWatched('${safeDocId}',${season.number})">
                    ${allWatched ? 'Unmark All' : 'Mark All'}
                </button>
            </h3>
            ${season.episodes?.map(ep => buildEpisodeHTML(ep, season.number, safeDocId)).join('') || '<p>No episodes</p>'}
        </div>
    `;
}

function buildEpisodeHTML(ep, seasonNum, safeDocId) {
    return `
        <div class="episode ${ep.is_watched ? 'watched' : ''}"
             onclick="openEpisodeDetail('${safeDocId}',${seasonNum},${ep.number})">
            <div class="episode-info">
                <span class="episode-number">E${String(ep.number).padStart(2,'0')}</span>
                - ${ep.name || 'Episode ' + ep.number}
                ${ep.watched_at ? `<br><small style="color:var(--text3);">${new Date(ep.watched_at).toLocaleDateString()}</small>` : ''}
                ${ep.rewatch_count > 0 ? `<br><small style="color:#2196F3;">↺ ${ep.rewatch_count}x</small>` : ''}
            </div>
            <button class="watch-btn ${ep.is_watched ? 'watched' : 'mark-watched'}"
                    onclick="event.stopPropagation(); toggleEpisode('${safeDocId}',${seasonNum},${ep.number})">
                ${ep.is_watched ? '✓' : '○'}
            </button>
        </div>
    `;
}

function switchDetailTab(tabId) {
    document.querySelectorAll('.detail-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    const btns = document.querySelectorAll('.detail-tab-btn');
    if (tabId === 'info-tab') btns[0]?.classList.add('active');
    else btns[1]?.classList.add('active');
}

function setupDetailSwipe() {
    const container = document.getElementById('detail-swipe');
    if (!container) return;
    let startX = 0;
    container.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    container.addEventListener('touchend', (e) => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 60) {
            switchDetailTab(diff > 0 ? 'episodes-tab' : 'info-tab');
        }
    });
}

function toggleOptionsMenu(menuId) {
    const menu = document.getElementById(menuId);
    if (menu) menu.classList.toggle('show');
    document.querySelectorAll('.options-menu').forEach(m => { if (m.id !== menuId) m.classList.remove('show'); });
}

// Close menus/modals on outside click
window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) document.getElementById('modal').style.display = 'none';
    if (e.target === document.getElementById('episode-modal')) document.getElementById('episode-modal').style.display = 'none';
    if (e.target === document.getElementById('preview-modal')) document.getElementById('preview-modal').style.display = 'none';
    if (e.target === document.getElementById('confirm-dialog')) document.getElementById('confirm-dialog').style.display = 'none';
    if (!e.target.closest('.show-options')) document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
});

document.querySelector('#modal .close').addEventListener('click', () => { document.getElementById('modal').style.display = 'none'; });
// ===== EPISODE DETAIL =====
async function openEpisodeDetail(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item || !item.tmdb_id) return;

    const epModal = document.getElementById('episode-modal');
    const epBody = document.getElementById('episode-modal-body');
    epBody.innerHTML = '<p class="empty-state">Loading...</p>';
    epModal.style.display = 'block';

    try {
        const data = await tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/season/${seasonNum}/episode/${episodeNum}?api_key=${TMDB_API_KEY}&append_to_response=credits`);

        const still = data.still_path ? `${TMDB_IMG_BASE}${data.still_path}` : '';
        const epRating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
        const airDate = data.air_date ? new Date(data.air_date).toLocaleDateString() : 'N/A';
        const overview = data.overview || 'No synopsis available.';
        const allCast = [...(data.guest_stars || []), ...(data.credits?.cast || [])].slice(0, 12);
        const localSeason = item.seasons?.find(s => s.number === seasonNum);
        const localEp = localSeason?.episodes?.find(e => e.number === episodeNum);
        const safeDocId = docId.replace(/'/g, "\\'");

        epBody.innerHTML = `
            <div class="ep-detail-header">
                ${still ? `<img src="${still}" alt="Still" onerror="this.style.display='none'">` : ''}
                <div class="ep-detail-info">
                    <h3>${data.name || `Episode ${episodeNum}`}</h3>
                    <div class="ep-code">S${String(seasonNum).padStart(2,'0')}E${String(episodeNum).padStart(2,'0')}</div>
                    <div class="ep-rating">⭐ ${epRating}/10 <small style="color:var(--text3);">TMDB</small></div>
                    <p style="color:var(--text2); font-size:13px;">📅 ${airDate}</p>
                    ${data.runtime ? `<p style="color:var(--text2); font-size:13px;">⏱ ${data.runtime}min</p>` : ''}
                </div>
            </div>
            <div style="margin:15px 0;">
                <button onclick="toggleEpisode('${safeDocId}',${seasonNum},${episodeNum}); document.getElementById('episode-modal').style.display='none';"
                        class="watch-btn ${localEp?.is_watched ? 'watched' : 'mark-watched'}" style="padding:10px 24px;">
                    ${localEp?.is_watched ? '✓ Watched' : '○ Mark Watched'}
                </button>
                ${localEp?.rewatch_count > 0 ? `<p style="margin-top:6px; color:#2196F3; font-size:12px;">↺ Rewatched ${localEp.rewatch_count}x</p>` : ''}
            </div>
            <div class="ep-detail-synopsis"><h4 style="color:var(--accent); margin-bottom:8px;">Synopsis</h4><p>${overview}</p></div>
            ${allCast.length ? `
                <div class="ep-guest-cast">
                    <h4>Cast</h4>
                    <div class="cast-carousel" onwheel="event.preventDefault(); this.scrollLeft += event.deltaY;">
                        ${allCast.map(p => `
                            <div class="cast-card">
                                <img src="${p.profile_path ? TMDB_IMG_BASE + p.profile_path : 'https://via.placeholder.com/70x70?text=?'}"
                                     alt="${p.name}" onerror="this.src='https://via.placeholder.com/70x70?text=?'">
                                <div class="cast-name">${p.name}</div>
                                <div class="cast-character">${p.character || ''}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    } catch (e) {
        epBody.innerHTML = '<p class="empty-state">Could not load episode details.</p>';
    }
}

// ===== ADD TO LIST =====
async function addToList(tmdbId, type, title, year, poster) {
    try {
        const collectionName = type === 'movie' ? 'movies' : 'series';
        const docId = `${type}_${tmdbId}`;
        let data = { tmdb_id: tmdbId, title, year, poster, is_favorite: false, created_at: new Date().toISOString() };

        if (type === 'tv') {
            const details = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
            const anime = isAnimeShow(details);
            data.user_status = 'Watching';
            data.tmdb_status = details.status || 'Unknown';
            data.last_status_check = new Date().toISOString();
            data.is_anime = anime;
            data.tmdb_rating = details.vote_average || null;
            data.seasons = [];

            for (let i = 0; i <= details.number_of_seasons; i++) {
                try {
                    const sd = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${i}?api_key=${TMDB_API_KEY}`);
                    if (sd.episodes?.length) {
                        data.seasons.push({
                            number: i,
                            is_specials: i === 0,
                            episodes: sd.episodes.map(ep => ({
                                number: ep.episode_number,
                                name: ep.name,
                                is_watched: false,
                                watched_at: null,
                                rewatch_count: 0,
                                rewatch_history: []
                            }))
                        });
                    }
                } catch (e) {}
            }
        } else {
            const details = await tmdbFetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
            data.is_watched = false;
            data.watched_at = null;
            data.tmdb_rating = details.vote_average || null;
            data.rewatch_count = 0;
            data.rewatch_history = [];
        }

        await setDoc(doc(db, collectionName, docId), data);
        await loadMyList();
    } catch (e) {
        console.error('Error adding:', e);
        alert('Error adding. Try again.');
    }
}

// ===== REMOVE FROM LIST =====
async function removeFromList(docId, type) {
    const answer = await showConfirm('Remove from Library', 'Are you sure?', 'Remove', 'Cancel');
    if (answer !== 'yes') return;
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
async function toggleEpisode(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;
    const episode = season.episodes.find(e => e.number === episodeNum);
    if (!episode) return;

    if (episode.is_watched) {
        const answer = await showConfirm('Already Watched',
            `"${episode.name || 'This episode'}" - What to do?`, '↺ Rewatch', '✗ Unmark');
        if (answer === 'yes') {
            episode.rewatch_count = (episode.rewatch_count || 0) + 1;
            if (!episode.rewatch_history) episode.rewatch_history = [];
            episode.rewatch_history.push(new Date().toISOString());
            episode.watched_at = new Date().toISOString();
        } else if (answer === 'no') {
            episode.is_watched = false;
            episode.watched_at = null;
        } else return;
    } else {
        const prev = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);
        if (prev.length > 0) {
            const answer = await showConfirm('Mark Previous?',
                `${prev.length} unwatched episode(s) before this. Mark all?`, 'Yes, all', 'No, just this');
            if (answer === 'yes') {
                prev.forEach(({ seasonNum: sN, episodeNum: eN }) => {
                    const s = item.seasons.find(s => s.number === sN);
                    const e = s?.episodes.find(e => e.number === eN);
                    if (e) { e.is_watched = true; e.watched_at = new Date().toISOString(); }
                });
            }
        }
        episode.is_watched = true;
        episode.watched_at = new Date().toISOString();
    }

    try {
        await updateDoc(doc(db, 'series', docId), { seasons: item.seasons });
        await loadMyList();
        openDetails(docId, 'tv');
    } catch (e) { console.error(e); }
}

// ===== MARK SEASON WATCHED =====
async function markSeasonWatched(docId, seasonNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;
    const allWatched = season.episodes.every(e => e.is_watched);

    if (!allWatched) {
        const prevSeasons = item.seasons.filter(s =>
            s.number !== 0 && s.number < seasonNum && s.episodes?.some(e => !e.is_watched));
        if (prevSeasons.length > 0) {
            const answer = await showConfirm('Mark Previous Seasons?',
                `${prevSeasons.length} previous season(s) have unwatched episodes. Mark all?`,
                'Yes, all', 'No, just this season');
            if (answer === 'yes') {
                prevSeasons.forEach(s => s.episodes.forEach(ep => {
                    ep.is_watched = true;
                    ep.watched_at = new Date().toISOString();
                }));
            }
        }
    }

    season.episodes.forEach(ep => {
        ep.is_watched = !allWatched;
        ep.watched_at = !allWatched ? new Date().toISOString() : null;
    });

    try {
        await updateDoc(doc(db, 'series', docId), { seasons: item.seasons });
        await loadMyList();
        openDetails(docId, 'tv');
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
        const answer = await showConfirm('Already Watched', 'What to do?', '↺ Rewatch', '✗ Unmark');
        if (answer === 'yes') {
            item.rewatch_count = (item.rewatch_count || 0) + 1;
            if (!item.rewatch_history) item.rewatch_history = [];
            item.rewatch_history.push(new Date().toISOString());
            item.watched_at = new Date().toISOString();
        } else if (answer === 'no') {
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

// ===== SET USER STATUS =====
async function setUserStatus(docId, status) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    try {
        await updateDoc(doc(db, 'series', docId), { user_status: status });
        item.user_status = status;
        await loadMyList();
        openDetails(docId, 'tv');
    } catch (e) { console.error(e); }
}

// ===== TOGGLE ANIME STATUS =====
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
let calendarCache = { anime: null, tv: null };

async function loadSectionCalendar(section) {
    const isAnime = section === 'anime';
    const shows = isAnime ? getAnime() : getTVShows();
    const todayEl = document.getElementById(`${section}-calendar-today`);
    const weekEl = document.getElementById(`${section}-calendar-week`);
    const upcomingEl = document.getElementById(`${section}-calendar-upcoming`);

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const weekStr = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];
    const monthStr = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0];

    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
    const showsToCheck = shows.filter(s => {
        if (!s.tmdb_id) return false;
        const isActive = !s.tmdb_status || ['Returning Series','In Production','Unknown'].includes(s.tmdb_status);
        const needsRecheck = s.last_status_check && new Date(s.last_status_check) < thirtyDaysAgo;
        return isActive || needsRecheck;
    });

    todayEl.innerHTML = `<p class="empty-state">Checking ${showsToCheck.length} shows...</p>`;
    weekEl.innerHTML = '';
    upcomingEl.innerHTML = '';

    const todayEps = [], weekEps = [], upcomingEps = [];
    let checked = 0;

    for (const show of showsToCheck) {
        try {
            checked++;
            todayEl.innerHTML = `<p class="empty-state">Checking ${checked}/${showsToCheck.length}...</p>`;
            const details = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);

            if (details.status && details.status !== show.tmdb_status) {
                updateDoc(doc(db, 'series', show.docId), {
                    tmdb_status: details.status,
                    last_status_check: new Date().toISOString()
                }).catch(() => {});
            }

            if (['Returning Series','In Production'].includes(details.status) && details.next_episode_to_air) {
                const airDate = details.next_episode_to_air.air_date;
                const ep = {
                    show: show.title, poster: show.poster, docId: show.docId,
                    season: details.next_episode_to_air.season_number,
                    episode: details.next_episode_to_air.episode_number,
                    name: details.next_episode_to_air.name,
                    airDate, airDateObj: new Date(airDate)
                };
                if (airDate === todayStr) todayEps.push(ep);
                else if (airDate > todayStr && airDate <= weekStr) weekEps.push(ep);
                else if (airDate > weekStr && airDate <= monthStr) upcomingEps.push(ep);
            }
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {}
    }

    displayCalItems(todayEl, todayEps, true);
    displayCalItems(weekEl, weekEps, false);
    displayCalItems(upcomingEl, upcomingEps, false);
}

function displayCalItems(container, episodes, isToday) {
    if (!episodes.length) {
        container.innerHTML = '<p class="empty-state">No episodes scheduled.</p>';
        return;
    }
    episodes.sort((a, b) => a.airDateObj - b.airDateObj);
    container.innerHTML = episodes.map(ep => {
        const poster = ep.poster && !ep.poster.includes('placeholder') ? ep.poster : 'https://via.placeholder.com/50x75?text=?';
        return `
            <div class="calendar-item ${isToday ? 'airing-today' : ''}" onclick="openDetails('${ep.docId}','tv')">
                <img src="${poster}" alt="${ep.show}" onerror="this.src='https://via.placeholder.com/50x75?text=?'">
                <div class="calendar-item-info">
                    <h4>${ep.show}</h4>
                    <div class="episode-title">S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')} - ${ep.name}</div>
                    <div class="air-date ${isToday ? 'today' : ''}">
                        📅 ${formatAirDate(ep.airDateObj)}
                        ${isToday ? '<span class="calendar-badge">TODAY</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function formatAirDate(date) {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const check = new Date(date); check.setHours(0,0,0,0);
    if (check.getTime() === today.getTime()) return 'Today';
    if (check.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ===== IMPORT MOVIES =====
async function importMovies() {
    const jsonText = document.getElementById('movies-json').value;
    const statusDiv = document.getElementById('import-status');
    try {
        const movies = JSON.parse(jsonText);
        let imported = 0, failed = 0;
        statusDiv.className = 'success';
        statusDiv.textContent = `Importing... 0/${movies.length}`;

        for (const movie of movies) {
            try {
                const docId = `movie_${movie.id.tvdb || movie.id.imdb}`;
                let poster = 'https://via.placeholder.com/150x225?text=No+Image';
                let tmdbId = null, tmdbRating = null;

                if (movie.id.imdb) {
                    try {
                        const d = await tmdbFetch(`${TMDB_BASE_URL}/find/${movie.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
                        if (d.movie_results?.length) {
                            tmdbId = d.movie_results[0].id;
                            poster = d.movie_results[0].poster_path ? `${TMDB_IMG_BASE}${d.movie_results[0].poster_path}` : poster;
                            tmdbRating = d.movie_results[0].vote_average || null;
                        }
                    } catch (e) {}
                }
                if (!tmdbId && movie.title) {
                    try {
                        const d = await tmdbFetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year}`);
                        if (d.results?.length) {
                            tmdbId = d.results[0].id;
                            poster = d.results[0].poster_path ? `${TMDB_IMG_BASE}${d.results[0].poster_path}` : poster;
                            tmdbRating = d.results[0].vote_average || null;
                        }
                    } catch (e) {}
                }

                await setDoc(doc(db, 'movies', docId), {
                    tmdb_id: tmdbId, imdb_id: movie.id.imdb, tvdb_id: movie.id.tvdb,
                    title: movie.title, year: movie.year, poster, tmdb_rating: tmdbRating,
                    is_watched: movie.is_watched || false, watched_at: movie.watched_at || null,
                    is_favorite: movie.is_favorite || false, rewatch_count: movie.rewatch_count || 0,
                    rewatch_history: [], created_at: movie.created_at || new Date().toISOString()
                });
                imported++;
                statusDiv.textContent = `Importing... ${imported}/${movies.length} (${failed} failed)`;
                if (imported % 30 === 0) await new Promise(r => setTimeout(r, 1000));
            } catch (e) { failed++; }
        }
        statusDiv.textContent = `✓ Imported ${imported} movies! (${failed} failed)`;
        await loadMyList();
    } catch (e) {
        statusDiv.className = 'error';
        statusDiv.textContent = `✗ Error: ${e.message}`;
    }
}

// ===== IMPORT SERIES =====
async function importSeries() {
    const jsonText = document.getElementById('series-json').value;
    const statusDiv = document.getElementById('import-status');
    try {
        const series = JSON.parse(jsonText);
        let imported = 0, failed = 0;
        statusDiv.className = 'success';
        statusDiv.textContent = `Importing... 0/${series.length}`;

        for (const show of series) {
            try {
                const docId = `tv_${show.id.tvdb || show.id.imdb}`;
                let poster = 'https://via.placeholder.com/150x225?text=No+Image';
                let tmdbId = null, tmdbStatus = 'Unknown', tmdbRating = null, anime = false;

                if (show.id.imdb) {
                    try {
                        const d = await tmdbFetch(`${TMDB_BASE_URL}/find/${show.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
                        if (d.tv_results?.length) {
                            tmdbId = d.tv_results[0].id;
                            poster = d.tv_results[0].poster_path ? `${TMDB_IMG_BASE}${d.tv_results[0].poster_path}` : poster;
                            tmdbRating = d.tv_results[0].vote_average || null;
                        }
                    } catch (e) {}
                }
                if (!tmdbId && show.title) {
                    try {
                        const clean = show.title.replace(/\s*\(\d{4}\)\s*$/, '');
                        const d = await tmdbFetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(clean)}`);
                        if (d.results?.length) {
                            tmdbId = d.results[0].id;
                            poster = d.results[0].poster_path ? `${TMDB_IMG_BASE}${d.results[0].poster_path}` : poster;
                            tmdbRating = d.results[0].vote_average || null;
                        }
                    } catch (e) {}
                }
                if (tmdbId) {
                    try {
                        const details = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
                        tmdbStatus = details.status || 'Unknown';
                        anime = isAnimeShow(details);
                        if (!tmdbRating) tmdbRating = details.vote_average || null;
                    } catch (e) {}
                }

                const statusMap = {
                    'up_to_date': 'Up to Date', 'watching': 'Watching', 'watched': 'Finished',
                    'dropped': 'Dropped', 'on_hold': 'Paused', 'plan_to_watch': 'Planned'
                };

                const seasons = show.seasons?.map(s => ({
                    number: s.number, is_specials: s.number === 0,
                    episodes: (s.episodes || []).map(ep => ({
                        number: ep.number, name: ep.name || `Episode ${ep.number}`,
                        is_watched: ep.is_watched || false, watched_at: ep.watched_at || null,
                        rewatch_count: ep.rewatch_count || 0, rewatch_history: [],
                        watched_count: ep.watched_count || 0
                    }))
                })) || [];

                await setDoc(doc(db, 'series', docId), {
                    tmdb_id: tmdbId, imdb_id: show.id.imdb, tvdb_id: show.id.tvdb,
                    title: show.title, year: show.year || null, poster, tmdb_rating: tmdbRating,
                    user_status: statusMap[show.status] || 'Watching',
                    tmdb_status: tmdbStatus, last_status_check: new Date().toISOString(),
                    is_favorite: show.is_favorite || false, is_anime: anime,
                    seasons, created_at: show.created_at || new Date().toISOString()
                });
                imported++;
                statusDiv.textContent = `Importing... ${imported}/${series.length} (${failed} failed)`;
                if (imported % 20 === 0) await new Promise(r => setTimeout(r, 1500));
            } catch (e) { failed++; console.error('Failed:', show.title, e); }
        }
        statusDiv.textContent = `✓ Imported ${imported} shows! (${failed} failed)`;
        await loadMyList();
    } catch (e) {
        statusDiv.className = 'error';
        statusDiv.textContent = `✗ Error: ${e.message}`;
    }
}

// ===== EXPORT DATA =====
async function exportData(format) {
    const movies = getMovies();
    const tv = getTVShows();
    const anime = getAnime();

    if (format === 'json') {
        const data = { movies, tv_shows: tv, anime, exported_at: new Date().toISOString() };
        downloadFile('my-cinema-export.json', JSON.stringify(data, null, 2), 'application/json');

    } else if (format === 'csv') {
        let csv = 'Type,Title,Year,Status,Rating,Watched,Favorite,Episodes Watched\n';

        movies.forEach(m => {
            csv += `Movie,"${m.title}",${m.year || ''},${m.is_watched ? 'Watched' : 'Unwatched'},${m.tmdb_rating || ''},${m.is_watched ? 'Yes' : 'No'},${m.is_favorite ? 'Yes' : 'No'},-\n`;
        });

        [...tv, ...anime].forEach(s => {
            let epsWatched = 0;
            s.seasons?.forEach(season => {
                if (season.number === 0) return;
                season.episodes?.forEach(ep => { if (ep.is_watched) epsWatched++; });
            });
            const type = s.is_anime ? 'Anime' : 'TV Show';
            csv += `${type},"${s.title}",${s.year || ''},${s.user_status || 'Watching'},${s.tmdb_rating || ''},-,${s.is_favorite ? 'Yes' : 'No'},${epsWatched}\n`;
        });

        downloadFile('my-cinema-export.csv', csv, 'text/csv');

    } else if (format === 'txt') {
        let txt = `MY CINEMA TRACKER EXPORT\nExported: ${new Date().toLocaleDateString()}\n\n`;

        txt += `=== MOVIES (${movies.length}) ===\n`;
        movies.forEach(m => { txt += `${m.is_watched ? '✓' : '○'} ${m.title} (${m.year || 'N/A'}) ${m.tmdb_rating ? `- ⭐${m.tmdb_rating.toFixed(1)}` : ''}\n`; });

        txt += `\n=== TV SHOWS (${tv.length}) ===\n`;
        tv.forEach(s => { txt += `[${s.user_status || 'Watching'}] ${s.title} (${s.year || 'N/A'}) ${s.tmdb_rating ? `- ⭐${s.tmdb_rating.toFixed(1)}` : ''}\n`; });

        txt += `\n=== ANIME (${anime.length}) ===\n`;
        anime.forEach(s => { txt += `[${s.user_status || 'Watching'}] ${s.title} (${s.year || 'N/A'}) ${s.tmdb_rating ? `- ⭐${s.tmdb_rating.toFixed(1)}` : ''}\n`; });

        downloadFile('my-cinema-export.txt', txt, 'text/plain');
    }
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ===== GLOBAL WINDOW EXPORTS =====
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
window.switchDetailTab = switchDetailTab;
window.switchSection = switchSection;
window.switchSubTab = switchSubTab;
window.renderLibrary = renderLibrary;
window.loadSectionCalendar = loadSectionCalendar;
window.exportData = exportData;
window.handlePreviewAdd = handlePreviewAdd;

// ===== IMPORT BUTTON LISTENERS =====
document.getElementById('import-movies-btn').addEventListener('click', importMovies);
document.getElementById('import-series-btn').addEventListener('click', importSeries);
