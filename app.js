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
const TMDB_IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original';

let myList = [];
let currentSearchType = 'multi';
let tmdbCache = {};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    setupPullToRefresh();
    await loadMyList();
    updateStats();
    setupRealtimeListeners();
});

// Pull to Refresh
let pullStartY = 0;
let pulling = false;

function setupPullToRefresh() {
    const container = document.getElementById('main-container');
    const indicator = document.getElementById('pull-refresh-indicator');

    container.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            pullStartY = e.touches[0].clientY;
            pulling = true;
        }
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
            updateStats();
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

function setupRealtimeListeners() {
    onSnapshot(collection(db, 'movies'), () => { loadMyList(); updateStats(); });
    onSnapshot(collection(db, 'series'), () => { loadMyList(); updateStats(); });
}

function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterMyList(btn.dataset.filter);
        });
    });

    document.getElementById('search-btn').addEventListener('click', performSearch);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    document.querySelectorAll('.search-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSearchType = btn.dataset.type;
        });
    });

    document.getElementById('import-movies-btn').addEventListener('click', importMovies);
    document.getElementById('import-series-btn').addEventListener('click', importSeries);
    document.getElementById('refresh-calendar-btn').addEventListener('click', () => loadCalendar(true));

    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === 'calendar') {
            btn.addEventListener('click', () => loadCalendar());
        }
    });

    document.querySelector('.close').addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal')) document.getElementById('modal').style.display = 'none';
        if (e.target === document.getElementById('confirm-dialog')) document.getElementById('confirm-dialog').style.display = 'none';
        if (e.target === document.getElementById('episode-modal')) document.getElementById('episode-modal').style.display = 'none';
        // Close options menus
        if (!e.target.closest('.show-options')) {
            document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
        }
    });
}

// TMDB fetch with caching
async function tmdbFetch(url) {
    if (tmdbCache[url] && Date.now() - tmdbCache[url].time < 3600000) {
        return tmdbCache[url].data;
    }
    const response = await fetch(url);
    const data = await response.json();
    tmdbCache[url] = { data, time: Date.now() };
    return data;
}

// Load My List
async function loadMyList() {
    try {
        myList = [];
        const moviesSnapshot = await getDocs(collection(db, 'movies'));
        moviesSnapshot.forEach(docSnap => {
            myList.push({ ...docSnap.data(), docId: docSnap.id, type: 'movie' });
        });
        const seriesSnapshot = await getDocs(collection(db, 'series'));
        seriesSnapshot.forEach(docSnap => {
            myList.push({ ...docSnap.data(), docId: docSnap.id, type: 'tv' });
        });
        myList.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        displayMyList();
    } catch (error) {
        console.error('Error loading list:', error);
    }
}

function displayMyList() {
    const container = document.getElementById('my-list-content');
    if (myList.length === 0) {
        container.innerHTML = '<p class="empty-state">Your list is empty!</p>';
        return;
    }
    container.innerHTML = myList.map(item => createMediaCard(item)).join('');
}

function createMediaCard(item) {
    const poster = item.poster && !item.poster.includes('placeholder')
        ? item.poster
        : 'https://via.placeholder.com/200x300?text=' + encodeURIComponent(item.title || 'No Image');

    let statusLineHTML = '';
    if (item.type === 'tv' && item.user_status) {
        const progress = getShowProgressExcludingSpecials(item);
        const statusMap = {
            'Watching': 'watching',
            'Up to Date': 'uptodate',
            'Finished': 'finished',
            'Dropped': 'dropped',
            'Paused': 'paused'
        };
        const cls = statusMap[item.user_status] || '';
        if (cls) {
            const w = (item.user_status === 'Watching' || item.user_status === 'Dropped') ? `${progress}%` : '100%';
            statusLineHTML = `<div class="status-line status-${cls}" style="width:${w};"></div>`;
        }
    }

    const rating = item.tmdb_rating ? `⭐ ${item.tmdb_rating.toFixed(1)}` : '';

    return `
        <div class="media-card" onclick="openDetails('${item.docId}', '${item.type}')">
            ${item.is_favorite ? '<div class="favorite-badge">⭐</div>' : ''}
            <img src="${poster}" alt="${item.title}" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
            ${statusLineHTML}
            <div class="info">
                <h3>${item.title || 'Unknown'}</h3>
                <p class="year">${rating || item.year || 'N/A'}</p>
                ${item.type === 'tv' ? `<p class="year">${item.user_status || 'Watching'}</p>` : ''}
                ${item.type === 'movie' && item.is_watched ? '<p class="year">✓ Watched</p>' : ''}
            </div>
        </div>
    `;
}

function getShowProgressExcludingSpecials(show) {
    if (!show.seasons) return 0;
    let total = 0, watched = 0;
    show.seasons.forEach(s => {
        if (s.number === 0) return;
        if (s.episodes) s.episodes.forEach(ep => { total++; if (ep.is_watched) watched++; });
    });
    return total > 0 ? (watched / total) * 100 : 0;
}

function filterMyList(filter) {
    const container = document.getElementById('my-list-content');
    const continueSection = document.getElementById('continue-watching-section');

    if (filter === 'continue') {
        continueSection.style.display = 'block';
        container.style.display = 'none';
        displayContinueWatching();
        return;
    } else {
        continueSection.style.display = 'none';
        container.style.display = 'grid';
    }

    let filtered = myList;
    if (filter === 'tv') filtered = myList.filter(i => i.type === 'tv');
    else if (filter === 'movie') filtered = myList.filter(i => i.type === 'movie');
    else if (filter === 'favorites') filtered = myList.filter(i => i.is_favorite);

    if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-state">No items found.</p>';
        return;
    }
    container.innerHTML = filtered.map(item => createMediaCard(item)).join('');
}

// Continue Watching
function displayContinueWatching() {
    const container = document.getElementById('continue-watching-list');
    const historyHeader = document.getElementById('watch-history-header');

    const inProgressShows = myList.filter(item => {
        if (item.type !== 'tv' || !item.seasons || item.seasons.length === 0) return false;
        let hasWatched = false, hasUnwatched = false;
        item.seasons.forEach(season => {
            if (season.number === 0) return;
            if (season.episodes) season.episodes.forEach(ep => {
                if (ep.is_watched) hasWatched = true;
                else hasUnwatched = true;
            });
        });
        return hasWatched && hasUnwatched;
    });

    if (inProgressShows.length === 0) {
        container.innerHTML = '<p class="empty-state">No shows in progress!</p>';
        historyHeader.style.display = 'none';
        return;
    }

    inProgressShows.sort((a, b) => new Date(getLastWatchedDate(b)) - new Date(getLastWatchedDate(a)));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const active = inProgressShows.filter(s => new Date(getLastWatchedDate(s)) >= thirtyDaysAgo);
    const history = inProgressShows.filter(s => new Date(getLastWatchedDate(s)) < thirtyDaysAgo);

    let html = active.map(s => createContinueCard(s, false)).join('');
    if (history.length > 0) {
        historyHeader.style.display = 'block';
        html += history.map(s => createContinueCard(s, true)).join('');
    } else {
        historyHeader.style.display = 'none';
    }
    container.innerHTML = html;
}

function createContinueCard(show, isHistory) {
    const nextEp = getNextEpisodeExcludingSpecials(show);
    const progress = getShowProgressExcludingSpecials(show);
    const safeDocId = show.docId.replace(/'/g, "\\'");
    const poster = show.poster && !show.poster.includes('placeholder') ? show.poster : 'https://via.placeholder.com/60x90?text=No+Image';
    const epCode = nextEp ? `S${String(nextEp.season).padStart(2,'0')}E${String(nextEp.number).padStart(2,'0')}` : 'Up to date';

    return `
        <div class="continue-card ${isHistory ? 'history-item' : ''}">
            <img src="${poster}" alt="${show.title}" onerror="this.src='https://via.placeholder.com/60x90?text=No+Image'" onclick="openDetails('${safeDocId}','tv')" style="cursor:pointer;">
            <div class="continue-info">
                <h3 onclick="openDetails('${safeDocId}','tv')">${show.title}</h3>
                <div class="episode-code">${epCode}</div>
                ${nextEp ? `<div class="episode-name">${nextEp.name}</div>` : ''}
                <div class="progress-bar"><div class="progress-fill ${progress >= 100 ? 'uptodate' : 'watching'}" style="width:${progress}%;"></div></div>
                <div style="font-size:11px;color:#999;">${progress.toFixed(0)}%</div>
            </div>
            ${nextEp ? `<button class="quick-check-btn" onclick="quickMarkWatched('${safeDocId}',${nextEp.season},${nextEp.number})" title="Mark ${epCode}">✓</button>` : '<div style="width:44px;"></div>'}
        </div>
    `;
}

function getNextEpisodeExcludingSpecials(show) {
    if (!show.seasons) return null;
    for (const season of show.seasons) {
        if (season.number === 0) continue;
        if (!season.episodes) continue;
        for (const ep of season.episodes) {
            if (!ep.is_watched) return { season: season.number, number: ep.number, name: ep.name || `Episode ${ep.number}` };
        }
    }
    return null;
}

function getLastWatchedDate(show) {
    let lastDate = null;
    if (show.seasons) {
        show.seasons.forEach(s => {
            if (s.episodes) s.episodes.forEach(ep => {
                if (ep.is_watched && ep.watched_at) {
                    if (!lastDate || new Date(ep.watched_at) > new Date(lastDate)) lastDate = ep.watched_at;
                }
            });
        });
    }
    return lastDate || show.created_at || new Date().toISOString();
}

// Confirmation Dialog
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

function getPreviousUnwatchedEpisodes(show, targetSeasonNum, targetEpisodeNum) {
    const unwatched = [];
    if (!show.seasons) return unwatched;
    for (const season of show.seasons) {
        if (season.number === 0) continue;
        if (season.number > targetSeasonNum) break;
        for (const ep of (season.episodes || [])) {
            if (season.number === targetSeasonNum && ep.number >= targetEpisodeNum) break;
            if (!ep.is_watched) unwatched.push({ seasonNum: season.number, episodeNum: ep.number });
        }
    }
    return unwatched;
}

async function quickMarkWatched(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;
    const episode = season.episodes.find(e => e.number === episodeNum);
    if (!episode) return;

    const prev = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);
    if (prev.length > 0) {
        const answer = await showConfirm('Mark Previous?', `${prev.length} unwatched episode(s) before this. Mark all?`, 'Yes', 'No, just this');
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
        const localItem = myList.find(i => i.docId === docId);
        if (localItem) localItem.seasons = item.seasons;
        displayContinueWatching();
        updateStats();
    } catch (error) {
        console.error('Error:', error);
    }
}

async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;
    try {
        const data = await tmdbFetch(`${TMDB_BASE_URL}/search/${currentSearchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
        displaySearchResults(data.results);
    } catch (error) {
        console.error('Search error:', error);
    }
}

function displaySearchResults(results) {
    const container = document.getElementById('search-results');
    if (!results || results.length === 0) {
        container.innerHTML = '<p class="empty-state">No results found.</p>';
        return;
    }
    container.innerHTML = results.map(item => {
        const title = item.title || item.name;
        const year = (item.release_date || item.first_air_date || '').substring(0, 4);
        const type = item.media_type || currentSearchType;
        const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : 'https://via.placeholder.com/200x300?text=No+Image';
        const rating = item.vote_average ? `⭐ ${item.vote_average.toFixed(1)}` : '';
        const isInList = myList.some(li => li.tmdb_id === item.id);
        const safeTitle = (title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
            <div class="media-card">
                <img src="${poster}" alt="${title}" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
                <div class="info">
                    <h3>${title}</h3>
                    <p class="year">${year} ${rating}</p>
                    <p class="year">${type === 'tv' ? 'TV Show' : type === 'movie' ? 'Movie' : ''}</p>
                </div>
                <button class="add-btn ${isInList ? 'remove-btn' : ''}"
                    onclick="${isInList ? `removeFromListByTMDB(${item.id},'${type}')` : `addToList(${item.id},'${type}','${safeTitle}','${year}','${poster}')`}">
                    ${isInList ? 'In Your List ✓' : 'Add to List'}
                </button>
            </div>
        `;
    }).join('');
}

function isAnimeShow(details) {
    const genres = details.genres || [];
    const isAnimation = genres.some(g => g.id === 16);
    const isJapanese = details.original_language === 'ja';
    const networks = details.networks || [];
    const animeNets = ['Fuji TV', 'Tokyo MX', 'TBS', 'TV Tokyo', 'Netflix', 'Crunchyroll', 'AT-X', 'BS11', 'MBS'];
    return (isAnimation && isJapanese) || (isAnimation && networks.some(n => animeNets.includes(n.name)));
}
// Add to List
async function addToList(tmdbId, type, title, year, poster) {
    try {
        const collectionName = type === 'movie' ? 'movies' : 'series';
        const docId = `${type}_${tmdbId}`;

        let data = {
            tmdb_id: tmdbId,
            title,
            year,
            poster,
            is_favorite: false,
            created_at: new Date().toISOString()
        };

        if (type === 'tv') {
            const details = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
            const isAnime = isAnimeShow(details);

            data.user_status = 'Watching';
            data.tmdb_status = details.status || 'Unknown';
            data.last_status_check = new Date().toISOString();
            data.is_anime = isAnime;
            data.tmdb_rating = details.vote_average || null;
            data.seasons = [];

            for (let i = 0; i <= details.number_of_seasons; i++) {
                try {
                    const seasonData = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${i}?api_key=${TMDB_API_KEY}`);
                    if (seasonData.episodes && seasonData.episodes.length > 0) {
                        data.seasons.push({
                            number: i,
                            is_specials: i === 0,
                            episodes: seasonData.episodes.map(ep => ({
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
        updateStats();
        alert(`${title} added to your list!`);
    } catch (error) {
        console.error('Error adding:', error);
        alert('Error adding. Please try again.');
    }
}

async function removeFromList(docId, type) {
    const answer = await showConfirm('Remove from Library', 'Are you sure?', 'Remove', 'Cancel');
    if (answer !== 'yes') return;
    try {
        await deleteDoc(doc(db, type === 'movie' ? 'movies' : 'series', docId));
        await loadMyList();
        updateStats();
        document.getElementById('modal').style.display = 'none';
    } catch (error) {
        console.error('Error removing:', error);
    }
}

async function removeFromListByTMDB(tmdbId, type) {
    await removeFromList(`${type}_${tmdbId}`, type);
}

// ========== DETAIL PAGES ==========

async function openDetails(docId, type) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modal-body');
    const safeDocId = docId.replace(/'/g, "\\'");

    // Show loading
    modalBody.innerHTML = '<p class="empty-state">Loading details...</p>';
    modal.style.display = 'block';

    if (type === 'movie') {
        await openMovieDetails(item, modalBody, safeDocId);
    } else {
        await openTVDetails(item, modalBody, safeDocId);
    }
}

// ========== MOVIE DETAIL PAGE ==========
async function openMovieDetails(item, modalBody, safeDocId) {
    let details = null;
    let credits = null;
    let similar = null;
    let watchProviders = null;

    if (item.tmdb_id) {
        try {
            [details, credits, similar, watchProviders] = await Promise.all([
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}/credits?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}/similar?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/movie/${item.tmdb_id}/watch/providers?api_key=${TMDB_API_KEY}`)
            ]);
        } catch (e) {
            console.warn('Could not fetch full movie details');
        }
    }

    const synopsis = details?.overview || 'No synopsis available.';
    const runtime = details?.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : 'N/A';
    const genres = details?.genres || [];
    const rating = details?.vote_average || item.tmdb_rating || null;
    const releaseDate = details?.release_date || '';
    const cast = credits?.cast?.slice(0, 15) || [];
    const crew = credits?.crew || [];
    const director = crew.find(c => c.job === 'Director');
    const similarMovies = similar?.results?.slice(0, 10) || [];
    const providers = watchProviders?.results?.US?.flatrate || watchProviders?.results?.GB?.flatrate || [];
    const productionCompanies = details?.production_companies || [];

    modalBody.innerHTML = `
        <div class="detail-header">
            <img src="${item.poster}" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'" alt="${item.title}">
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

                ${rating ? `<p style="margin:5px 0;">⭐ <strong>${rating.toFixed(1)}</strong> / 10</p>` : ''}
                ${director ? `<p style="color:#666; font-size:14px;">Directed by <strong>${director.name}</strong></p>` : ''}
                <p style="color:#666; font-size:14px;">Runtime: ${runtime}</p>

                <div class="genre-tags">
                    ${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}
                </div>

                <div style="margin-top:15px; display:flex; gap:10px; flex-wrap:wrap;">
                    <button onclick="toggleWatched('${safeDocId}','movie')" class="watch-btn ${item.is_watched ? 'watched' : 'mark-watched'}">
                        ${item.is_watched ? '✓ Watched' : '○ Mark as Watched'}
                    </button>
                </div>

                ${item.watched_at ? `<p style="margin-top:10px; color:#666; font-size:13px;">Watched: ${new Date(item.watched_at).toLocaleDateString()}</p>` : ''}
                ${item.rewatch_count > 0 ? `<p style="color:#666; font-size:13px;">Rewatched: ${item.rewatch_count} time(s)</p>` : ''}
            </div>
        </div>

        <div class="synopsis">
            <h3 style="color:#1e3c72; margin-bottom:8px;">Synopsis</h3>
            <p>${synopsis}</p>
        </div>

        ${buildCastSection(cast)}
        ${buildNetworksSection(providers, productionCompanies)}
        ${buildSimilarSection(similarMovies, 'movie')}
    `;
}

// ========== TV SHOW DETAIL PAGE ==========
async function openTVDetails(item, modalBody, safeDocId) {
    let details = null;
    let credits = null;
    let similar = null;
    let watchProviders = null;

    if (item.tmdb_id) {
        try {
            [details, credits, similar, watchProviders] = await Promise.all([
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/credits?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/similar?api_key=${TMDB_API_KEY}`),
                tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/watch/providers?api_key=${TMDB_API_KEY}`)
            ]);
        } catch (e) {
            console.warn('Could not fetch full TV details');
        }
    }

    const synopsis = details?.overview || 'No synopsis available.';
    const genres = details?.genres || [];
    const rating = details?.vote_average || item.tmdb_rating || null;
    const cast = credits?.cast?.slice(0, 15) || [];
    const similarShows = similar?.results?.slice(0, 10) || [];
    const providers = watchProviders?.results?.US?.flatrate || watchProviders?.results?.GB?.flatrate || [];
    const networks = details?.networks || [];
    const tmdbStatus = details?.status || item.tmdb_status || 'Unknown';
    const totalSeasons = details?.number_of_seasons || 0;
    const totalEps = details?.number_of_episodes || 0;

    const statusColor = {
        'Returning Series': '#4CAF50',
        'In Production': '#2196F3',
        'Ended': '#666',
        'Canceled': '#f44336',
        'Pilot': '#FF9800'
    }[tmdbStatus] || '#666';

    // Progress
    const progress = getShowProgressExcludingSpecials(item);
    let watchedCount = 0, totalCount = 0;
    if (item.seasons) {
        item.seasons.forEach(s => {
            if (s.number === 0) return;
            if (s.episodes) s.episodes.forEach(ep => { totalCount++; if (ep.is_watched) watchedCount++; });
        });
    }

    // Build episode ratings data for chart
    let episodeRatings = [];
    if (item.tmdb_id) {
        episodeRatings = await fetchEpisodeRatings(item.tmdb_id, item.seasons || []);
    }

    // Separate regular seasons and specials
    const regularSeasons = (item.seasons || []).filter(s => s.number !== 0);
    const specialsSeason = (item.seasons || []).find(s => s.number === 0);

    const seasonsHTML = regularSeasons.map(s => buildSeasonHTML(s, safeDocId)).join('');
    const specialsHTML = specialsSeason && specialsSeason.episodes?.length > 0 ? `
        <div class="season specials">
            <h3><span>Specials</span></h3>
            ${specialsSeason.episodes.map(ep => buildEpisodeHTML(ep, 0, safeDocId, item.tmdb_id)).join('')}
        </div>
    ` : '';

    modalBody.innerHTML = `
        <div class="detail-header">
            <img src="${item.poster}" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'" alt="${item.title}">
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
                            <button onclick="toggleAnimeStatus('${safeDocId}')">${item.is_anime ? '🎌 Remove Anime' : '🎌 Mark Anime'}</button>
                            <button class="danger" onclick="removeFromList('${safeDocId}','tv')">🗑 Remove</button>
                        </div>
                    </div>
                </h2>

                <div>
                    <span class="status-badge" style="background:${statusColor};">${tmdbStatus}</span>
                    ${item.is_anime ? '<span class="status-badge anime-badge">🎌 Anime</span>' : ''}
                </div>

                ${rating ? `<p style="margin:5px 0;">⭐ <strong>${rating.toFixed(1)}</strong> / 10</p>` : ''}
                <p style="color:#666; font-size:14px;">${totalSeasons} Season(s) · ${totalEps} Episodes</p>
                <p style="color:#666; font-size:14px;">Your status: <strong>${item.user_status || 'Watching'}</strong></p>

                <div class="genre-tags">
                    ${genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}
                </div>

                <div class="detail-progress">
                    <div class="detail-progress-label">${watchedCount} / ${totalCount} episodes (${progress.toFixed(0)}%)</div>
                    <div class="detail-progress-bar">
                        <div class="detail-progress-fill" style="width:${progress}%; background:${progress >= 100 ? '#4CAF50' : '#FFC107'};"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Detail Tabs -->
        <div class="detail-tabs">
            <button class="detail-tab-btn active" onclick="switchDetailTab('info-tab','${safeDocId}')">Info</button>
            <button class="detail-tab-btn" onclick="switchDetailTab('episodes-tab','${safeDocId}')">Episodes</button>
        </div>

        <div class="swipe-container" id="swipe-container-${safeDocId}">
            <!-- INFO TAB -->
            <div class="detail-tab-content active" id="info-tab">
                <div class="synopsis">
                    <h3 style="color:#1e3c72; margin-bottom:8px;">Synopsis</h3>
                    <p>${synopsis}</p>
                </div>

                ${buildEpisodeRatingsChart(episodeRatings)}
                ${buildCastSection(cast)}
                ${buildNetworksSection(providers, networks)}
                ${buildSimilarSection(similarShows, 'tv')}
            </div>

            <!-- EPISODES TAB -->
            <div class="detail-tab-content" id="episodes-tab">
                ${seasonsHTML}
                ${specialsHTML}
            </div>
        </div>
    `;

    // Init swipe between tabs
    setupDetailSwipe(safeDocId);

    // Render chart if data exists
    if (episodeRatings.length > 0) {
        renderEpisodeRatingsChart(episodeRatings);
    }
}

// Fetch episode ratings from TMDB
async function fetchEpisodeRatings(tmdbId, localSeasons) {
    const ratings = [];
    const regularSeasons = localSeasons.filter(s => s.number !== 0);

    // Only fetch first 5 seasons to avoid too many requests
    const seasonsToFetch = regularSeasons.slice(0, 5);

    for (const season of seasonsToFetch) {
        try {
            const data = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${season.number}?api_key=${TMDB_API_KEY}`);
            if (data.episodes) {
                data.episodes.forEach(ep => {
                    if (ep.vote_average > 0) {
                        ratings.push({
                            label: `S${season.number}E${ep.episode_number}`,
                            rating: ep.vote_average,
                            season: season.number,
                            episode: ep.episode_number,
                            name: ep.name
                        });
                    }
                });
            }
        } catch (e) {}
    }

    return ratings;
}

// Build Episode Ratings Chart HTML
function buildEpisodeRatingsChart(ratings) {
    if (ratings.length === 0) return '';
    return `
        <div class="chart-container">
            <h3>📊 Episode Ratings</h3>
            <canvas id="episode-ratings-chart"></canvas>
        </div>
    `;
}

// Render Chart.js Episode Ratings
function renderEpisodeRatingsChart(ratings) {
    const canvas = document.getElementById('episode-ratings-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Color by season
    const seasonColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FF6384', '#36A2EB'];
    const bgColors = ratings.map(r => seasonColors[(r.season - 1) % seasonColors.length] + '88');
    const borderColors = ratings.map(r => seasonColors[(r.season - 1) % seasonColors.length]);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ratings.map(r => r.label),
            datasets: [{
                label: 'Rating',
                data: ratings.map(r => r.rating),
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const idx = items[0].dataIndex;
                            return `${ratings[idx].label} - ${ratings[idx].name}`;
                        },
                        label: (item) => `Rating: ${item.raw.toFixed(1)} / 10`
                    }
                },
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, max: 10, title: { display: true, text: 'Rating' } },
                x: { ticks: { maxRotation: 90, font: { size: 10 } } }
            }
        }
    });
}

// Build Cast Section HTML
function buildCastSection(cast) {
    if (cast.length === 0) return '';
    return `
        <div class="cast-section">
            <h3>🎭 Cast</h3>
            <div class="cast-carousel">
                ${cast.map(person => `
                    <div class="cast-card">
                        <img src="${person.profile_path ? TMDB_IMG_BASE + person.profile_path : 'https://via.placeholder.com/80x80?text=No+Photo'}"
                             alt="${person.name}" onerror="this.src='https://via.placeholder.com/80x80?text=No+Photo'">
                        <div class="cast-name">${person.name}</div>
                        <div class="cast-character">${person.character || ''}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Build Networks Section HTML
function buildNetworksSection(providers, networks) {
    if (providers.length === 0 && networks.length === 0) return '';

    let html = '<div class="networks-section"><h3>📺 Available On</h3><div class="network-logos">';

    networks.forEach(n => {
        if (n.logo_path) {
            html += `<img class="network-logo" src="${TMDB_IMG_BASE}${n.logo_path}" alt="${n.name}" title="${n.name}">`;
        } else {
            html += `<span class="network-name">${n.name}</span>`;
        }
    });

    providers.forEach(p => {
        if (p.logo_path) {
            html += `<img class="network-logo" src="${TMDB_IMG_BASE}${p.logo_path}" alt="${p.provider_name}" title="${p.provider_name}">`;
        } else {
            html += `<span class="network-name">${p.provider_name}</span>`;
        }
    });

    html += '</div></div>';
    return html;
}

// Build Similar Section HTML
function buildSimilarSection(items, type) {
    if (items.length === 0) return '';
    return `
        <div class="similar-section">
            <h3>🎬 Similar ${type === 'tv' ? 'Shows' : 'Movies'}</h3>
            <div class="similar-carousel">
                ${items.map(item => {
                    const title = item.title || item.name;
                    const poster = item.poster_path ? `${TMDB_IMG_BASE}${item.poster_path}` : 'https://via.placeholder.com/120x180?text=No+Image';
                    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                    const safeTitle = (title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const year = (item.release_date || item.first_air_date || '').substring(0, 4);
                    return `
                        <div class="similar-card" onclick="addToList(${item.id},'${type}','${safeTitle}','${year}','${poster}')">
                            <img src="${poster}" alt="${title}" onerror="this.src='https://via.placeholder.com/120x180?text=No+Image'">
                            <div class="similar-title">${title}</div>
                            <div class="similar-rating">⭐ ${rating}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Switch Detail Tab (Info <-> Episodes)
function switchDetailTab(tabId, docId) {
    document.querySelectorAll('.detail-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    // Highlight correct tab button
    const btns = document.querySelectorAll('.detail-tab-btn');
    if (tabId === 'info-tab') btns[0].classList.add('active');
    else btns[1].classList.add('active');
}

// Setup swipe between detail tabs
function setupDetailSwipe(docId) {
    const container = document.querySelector('.swipe-container');
    if (!container) return;

    let startX = 0;
    container.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; });
    container.addEventListener('touchend', (e) => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) switchDetailTab('episodes-tab', docId); // swipe left = episodes
            else switchDetailTab('info-tab', docId); // swipe right = info
        }
    });
}

// Build Season HTML
function buildSeasonHTML(season, safeDocId) {
    const watchedInSeason = season.episodes ? season.episodes.filter(e => e.is_watched).length : 0;
    const totalInSeason = season.episodes ? season.episodes.length : 0;
    const allWatched = watchedInSeason === totalInSeason && totalInSeason > 0;

    return `
        <div class="season">
            <h3>
                <span>Season ${season.number} <span style="font-size:13px;font-weight:normal;opacity:0.8;">(${watchedInSeason}/${totalInSeason})</span></span>
                <button class="mark-all-btn" onclick="markSeasonWatched('${safeDocId}',${season.number})">${allWatched ? 'Unmark All' : 'Mark All'}</button>
            </h3>
            ${season.episodes ? season.episodes.map(ep => buildEpisodeHTML(ep, season.number, safeDocId)).join('') : '<p>No episodes</p>'}
        </div>
    `;
}

// Build Episode HTML
function buildEpisodeHTML(ep, seasonNum, safeDocId, tmdbId) {
    return `
        <div class="episode ${ep.is_watched ? 'watched' : ''}" onclick="openEpisodeDetail('${safeDocId}',${seasonNum},${ep.number})">
            <div class="episode-info">
                <span class="episode-number">E${String(ep.number).padStart(2,'0')}</span>
                - ${ep.name || 'Episode ' + ep.number}
                ${ep.watched_at ? `<br><small style="color:#999;">${new Date(ep.watched_at).toLocaleDateString()}</small>` : ''}
                ${ep.rewatch_count > 0 ? `<br><small style="color:#2196F3;">↺ ${ep.rewatch_count}x</small>` : ''}
            </div>
            <button class="watch-btn ${ep.is_watched ? 'watched' : 'mark-watched'}"
                    onclick="event.stopPropagation(); toggleEpisode('${safeDocId}',${seasonNum},${ep.number})">
                ${ep.is_watched ? '✓' : '○'}
            </button>
        </div>
    `;
}

// Open Episode Detail Modal
async function openEpisodeDetail(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item || !item.tmdb_id) return;

    const epModal = document.getElementById('episode-modal');
    const epBody = document.getElementById('episode-modal-body');

    epBody.innerHTML = '<p class="empty-state">Loading episode details...</p>';
    epModal.style.display = 'block';

    try {
        const data = await tmdbFetch(`${TMDB_BASE_URL}/tv/${item.tmdb_id}/season/${seasonNum}/episode/${episodeNum}?api_key=${TMDB_API_KEY}&append_to_response=credits`);

        const stillPath = data.still_path ? `${TMDB_IMG_BASE}${data.still_path}` : '';
        const epRating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
        const airDate = data.air_date ? new Date(data.air_date).toLocaleDateString() : 'N/A';
        const overview = data.overview || 'No synopsis available.';
        const guestStars = data.guest_stars?.slice(0, 10) || [];
        const credits = data.credits?.cast?.slice(0, 10) || [];
        const allCast = [...guestStars, ...credits].slice(0, 12);

        // Check local watched status
        const localSeason = item.seasons?.find(s => s.number === seasonNum);
        const localEp = localSeason?.episodes?.find(e => e.number === episodeNum);
        const safeDocId = docId.replace(/'/g, "\\'");

        epBody.innerHTML = `
            <div class="ep-detail-header">
                ${stillPath ? `<img src="${stillPath}" alt="Episode still" onerror="this.style.display='none'">` : ''}
                <div class="ep-detail-info">
                    <h3>${data.name || `Episode ${episodeNum}`}</h3>
                    <div class="ep-code">S${String(seasonNum).padStart(2,'0')}E${String(episodeNum).padStart(2,'0')}</div>
                    <div class="ep-rating">⭐ ${epRating} / 10</div>
                    <p style="color:#666; font-size:13px;">📅 Aired: ${airDate}</p>
                    ${data.runtime ? `<p style="color:#666; font-size:13px;">⏱ ${data.runtime} min</p>` : ''}
                </div>
            </div>

            <div style="margin:15px 0;">
                <button onclick="event.stopPropagation(); toggleEpisode('${safeDocId}',${seasonNum},${episodeNum}); document.getElementById('episode-modal').style.display='none';"
                        class="watch-btn ${localEp?.is_watched ? 'watched' : 'mark-watched'}" style="font-size:16px; padding:10px 24px;">
                    ${localEp?.is_watched ? '✓ Watched' : '○ Mark as Watched'}
                </button>
                ${localEp?.rewatch_count > 0 ? `<p style="margin-top:8px; color:#2196F3; font-size:13px;">↺ Rewatched ${localEp.rewatch_count} time(s)</p>` : ''}
            </div>

            <div class="ep-detail-synopsis">
                <h4 style="color:#1e3c72; margin-bottom:8px;">Synopsis</h4>
                <p>${overview}</p>
            </div>

            ${allCast.length > 0 ? `
                <div class="ep-guest-cast">
                    <h4>Cast</h4>
                    <div class="cast-carousel">
                        ${allCast.map(person => `
                            <div class="cast-card">
                                <img src="${person.profile_path ? TMDB_IMG_BASE + person.profile_path : 'https://via.placeholder.com/80x80?text=No+Photo'}"
                                     alt="${person.name}" onerror="this.src='https://via.placeholder.com/80x80?text=No+Photo'">
                                <div class="cast-name">${person.name}</div>
                                <div class="cast-character">${person.character || ''}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    } catch (error) {
        epBody.innerHTML = '<p class="empty-state">Could not load episode details.</p>';
        console.error('Episode detail error:', error);
    }
}

function toggleOptionsMenu(menuId) {
    const menu = document.getElementById(menuId);
    if (menu) menu.classList.toggle('show');
    document.querySelectorAll('.options-menu').forEach(m => {
        if (m.id !== menuId) m.classList.remove('show');
    });
}
// Set User Status
async function setUserStatus(docId, status) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    try {
        await updateDoc(doc(db, 'series', docId), { user_status: status });
        item.user_status = status;
        await loadMyList();
        openDetails(docId, 'tv');
    } catch (error) {
        console.error('Error setting status:', error);
    }
}

async function toggleAnimeStatus(docId) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    try {
        await updateDoc(doc(db, 'series', docId), { is_anime: !item.is_anime });
        item.is_anime = !item.is_anime;
        openDetails(docId, 'tv');
    } catch (error) {
        console.error('Error toggling anime:', error);
    }
}

// Mark Entire Season as Watched
async function markSeasonWatched(docId, seasonNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;

    const allWatched = season.episodes.every(e => e.is_watched);

    if (!allWatched) {
        const prevSeasons = item.seasons.filter(s =>
            s.number !== 0 &&
            s.number < seasonNum &&
            s.episodes &&
            s.episodes.some(e => !e.is_watched)
        );

        if (prevSeasons.length > 0) {
            const answer = await showConfirm(
                'Mark Previous Seasons?',
                `${prevSeasons.length} previous season(s) have unwatched episodes. Mark all?`,
                'Yes, mark all',
                'No, just this season'
            );
            if (answer === 'yes') {
                prevSeasons.forEach(s => {
                    s.episodes.forEach(ep => {
                        ep.is_watched = true;
                        ep.watched_at = new Date().toISOString();
                    });
                });
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
        updateStats();
        openDetails(docId, 'tv');
    } catch (error) {
        console.error('Error updating season:', error);
    }
}

// Toggle Episode Watched (with Rewatch/Unmark dialog)
async function toggleEpisode(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;
    const episode = season.episodes.find(e => e.number === episodeNum);
    if (!episode) return;

    if (episode.is_watched) {
        const answer = await showConfirm(
            'Already Watched',
            `"${episode.name || 'This episode'}" - What would you like to do?`,
            '↺ Rewatch',
            '✗ Unmark'
        );

        if (answer === 'yes') {
            episode.rewatch_count = (episode.rewatch_count || 0) + 1;
            if (!episode.rewatch_history) episode.rewatch_history = [];
            episode.rewatch_history.push(new Date().toISOString());
            episode.watched_at = new Date().toISOString();
        } else if (answer === 'no') {
            episode.is_watched = false;
            episode.watched_at = null;
        } else {
            return;
        }
    } else {
        const prev = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);

        if (prev.length > 0) {
            const answer = await showConfirm(
                'Mark Previous Episodes?',
                `${prev.length} unwatched episode(s) before this. Mark all?`,
                'Yes, mark all',
                'No, just this one'
            );

            if (answer === 'yes') {
                prev.forEach(({ seasonNum: sN, episodeNum: eN }) => {
                    const s = item.seasons.find(s => s.number === sN);
                    const e = s?.episodes.find(e => e.number === eN);
                    if (e) {
                        e.is_watched = true;
                        e.watched_at = new Date().toISOString();
                    }
                });
            }
        }

        episode.is_watched = true;
        episode.watched_at = new Date().toISOString();
    }

    try {
        await updateDoc(doc(db, 'series', docId), { seasons: item.seasons });
        await loadMyList();
        updateStats();
        openDetails(docId, 'tv');
    } catch (error) {
        console.error('Error updating episode:', error);
    }
}

// Toggle Favorite
async function toggleFavorite(docId, type) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;
    item.is_favorite = !item.is_favorite;
    try {
        await updateDoc(doc(db, type === 'movie' ? 'movies' : 'series', docId), { is_favorite: item.is_favorite });
        await loadMyList();
        updateStats();
        openDetails(docId, type);
    } catch (error) {
        console.error('Error updating favorite:', error);
    }
}

// Toggle Watched (Movies - with Rewatch)
async function toggleWatched(docId, type) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    if (item.is_watched) {
        const answer = await showConfirm('Already Watched', 'What would you like to do?', '↺ Rewatch', '✗ Unmark');
        if (answer === 'yes') {
            item.rewatch_count = (item.rewatch_count || 0) + 1;
            if (!item.rewatch_history) item.rewatch_history = [];
            item.rewatch_history.push(new Date().toISOString());
            item.watched_at = new Date().toISOString();
        } else if (answer === 'no') {
            item.is_watched = false;
            item.watched_at = null;
        } else {
            return;
        }
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
        updateStats();
        openDetails(docId, type);
    } catch (error) {
        console.error('Error:', error);
    }
}

// Update Stats
function updateStats() {
    const movies = myList.filter(i => i.type === 'movie');
    const shows = myList.filter(i => i.type === 'tv');
    const favorites = myList.filter(i => i.is_favorite);

    let totalEpisodes = 0;
    shows.forEach(show => {
        if (show.seasons) show.seasons.forEach(s => {
            if (s.number === 0) return;
            if (s.episodes) totalEpisodes += s.episodes.filter(ep => ep.is_watched).length;
        });
    });

    document.getElementById('total-movies').textContent = movies.length;
    document.getElementById('total-shows').textContent = shows.length;
    document.getElementById('total-episodes').textContent = totalEpisodes;
    document.getElementById('total-favorites').textContent = favorites.length;
}

// Import Movies
async function importMovies() {
    const jsonText = document.getElementById('movies-json').value;
    const statusDiv = document.getElementById('import-status');

    try {
        const movies = JSON.parse(jsonText);
        let imported = 0, failed = 0;
        const total = movies.length;

        statusDiv.className = 'success';
        statusDiv.textContent = `Importing... 0/${total}`;

        for (const movie of movies) {
            try {
                const docId = `movie_${movie.id.tvdb || movie.id.imdb}`;
                let poster = 'https://via.placeholder.com/200x300?text=No+Image';
                let tmdbId = null;
                let tmdbRating = null;

                if (movie.id.imdb) {
                    try {
                        const data = await tmdbFetch(`${TMDB_BASE_URL}/find/${movie.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
                        if (data.movie_results?.length > 0) {
                            tmdbId = data.movie_results[0].id;
                            poster = data.movie_results[0].poster_path ? `${TMDB_IMG_BASE}${data.movie_results[0].poster_path}` : poster;
                            tmdbRating = data.movie_results[0].vote_average || null;
                        }
                    } catch (e) {}
                }

                if (!tmdbId && movie.title) {
                    try {
                        const data = await tmdbFetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year}`);
                        if (data.results?.length > 0) {
                            tmdbId = data.results[0].id;
                            poster = data.results[0].poster_path ? `${TMDB_IMG_BASE}${data.results[0].poster_path}` : poster;
                            tmdbRating = data.results[0].vote_average || null;
                        }
                    } catch (e) {}
                }

                await setDoc(doc(db, 'movies', docId), {
                    tmdb_id: tmdbId,
                    imdb_id: movie.id.imdb,
                    tvdb_id: movie.id.tvdb,
                    title: movie.title,
                    year: movie.year,
                    poster,
                    tmdb_rating: tmdbRating,
                    is_watched: movie.is_watched || false,
                    watched_at: movie.watched_at || null,
                    is_favorite: movie.is_favorite || false,
                    rewatch_count: movie.rewatch_count || 0,
                    rewatch_history: [],
                    created_at: movie.created_at || new Date().toISOString()
                });

                imported++;
                statusDiv.textContent = `Importing... ${imported}/${total} (${failed} failed)`;
                if (imported % 30 === 0) await new Promise(r => setTimeout(r, 1000));
            } catch (e) { failed++; }
        }

        statusDiv.textContent = `✓ Imported ${imported} movies! (${failed} failed)`;
        await loadMyList();
        updateStats();
    } catch (error) {
        statusDiv.className = 'error';
        statusDiv.textContent = `✗ Error: ${error.message}`;
    }
}

// Import Series
async function importSeries() {
    const jsonText = document.getElementById('series-json').value;
    const statusDiv = document.getElementById('import-status');

    try {
        const series = JSON.parse(jsonText);
        let imported = 0, failed = 0;
        const total = series.length;

        statusDiv.className = 'success';
        statusDiv.textContent = `Importing... 0/${total}`;

        for (const show of series) {
            try {
                const docId = `tv_${show.id.tvdb || show.id.imdb}`;
                let poster = 'https://via.placeholder.com/200x300?text=No+Image';
                let tmdbId = null;
                let tmdbStatus = 'Unknown';
                let tmdbRating = null;
                let isAnime = false;

                if (show.id.imdb) {
                    try {
                        const data = await tmdbFetch(`${TMDB_BASE_URL}/find/${show.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
                        if (data.tv_results?.length > 0) {
                            tmdbId = data.tv_results[0].id;
                            poster = data.tv_results[0].poster_path ? `${TMDB_IMG_BASE}${data.tv_results[0].poster_path}` : poster;
                            tmdbRating = data.tv_results[0].vote_average || null;
                        }
                    } catch (e) {}
                }

                if (!tmdbId && show.title) {
                    try {
                        const cleanTitle = show.title.replace(/\s*\(\d{4}\)\s*$/, '');
                        const data = await tmdbFetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`);
                        if (data.results?.length > 0) {
                            tmdbId = data.results[0].id;
                            poster = data.results[0].poster_path ? `${TMDB_IMG_BASE}${data.results[0].poster_path}` : poster;
                            tmdbRating = data.results[0].vote_average || null;
                        }
                    } catch (e) {}
                }

                if (tmdbId) {
                    try {
                        const details = await tmdbFetch(`${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
                        tmdbStatus = details.status || 'Unknown';
                        isAnime = isAnimeShow(details);
                        if (!tmdbRating) tmdbRating = details.vote_average || null;
                    } catch (e) {}
                }

                const statusMap = {
                    'up_to_date': 'Up to Date',
                    'watching': 'Watching',
                    'watched': 'Finished',
                    'dropped': 'Dropped',
                    'on_hold': 'Paused',
                    'plan_to_watch': 'Planned'
                };

                let seasons = [];
                if (show.seasons?.length > 0) {
                    seasons = show.seasons.map(season => ({
                        number: season.number,
                        is_specials: season.number === 0,
                        episodes: (season.episodes || []).map(ep => ({
                            number: ep.number,
                            name: ep.name || `Episode ${ep.number}`,
                            is_watched: ep.is_watched || false,
                            watched_at: ep.watched_at || null,
                            rewatch_count: ep.rewatch_count || 0,
                            rewatch_history: [],
                            watched_count: ep.watched_count || 0
                        }))
                    }));
                }

                await setDoc(doc(db, 'series', docId), {
                    tmdb_id: tmdbId,
                    imdb_id: show.id.imdb,
                    tvdb_id: show.id.tvdb,
                    title: show.title,
                    year: show.year || null,
                    poster,
                    tmdb_rating: tmdbRating,
                    user_status: statusMap[show.status] || 'Watching',
                    tmdb_status: tmdbStatus,
                    last_status_check: new Date().toISOString(),
                    is_favorite: show.is_favorite || false,
                    is_anime: isAnime,
                    seasons,
                    created_at: show.created_at || new Date().toISOString()
                });

                imported++;
                statusDiv.textContent = `Importing... ${imported}/${total} (${failed} failed)`;
                if (imported % 20 === 0) await new Promise(r => setTimeout(r, 1500));
            } catch (e) {
                failed++;
                console.error('Failed:', show.title, e);
            }
        }

        statusDiv.textContent = `✓ Imported ${imported} TV shows! (${failed} failed)`;
        await loadMyList();
        updateStats();
    } catch (error) {
        statusDiv.className = 'error';
        statusDiv.textContent = `✗ Error: ${error.message}`;
    }
}

// Calendar
let calendarCache = { lastUpdated: null, data: { today: [], week: [], upcoming: [] } };

async function loadCalendar(forceRefresh = false) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const weekFromNow = new Date(today); weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekStr = weekFromNow.toISOString().split('T')[0];
    const monthFromNow = new Date(today); monthFromNow.setDate(monthFromNow.getDate() + 30);
    const monthStr = monthFromNow.toISOString().split('T')[0];

    const todayC = document.getElementById('calendar-today');
    const weekC = document.getElementById('calendar-week');
    const upcomingC = document.getElementById('calendar-upcoming');

    const cacheAge = calendarCache.lastUpdated ? Date.now() - calendarCache.lastUpdated : Infinity;
    if (!forceRefresh && cacheAge < 6 * 3600000) {
        displayCalendarSection(todayC, calendarCache.data.today, true);
        displayCalendarSection(weekC, calendarCache.data.week, false);
        displayCalendarSection(upcomingC, calendarCache.data.upcoming, false);
        return;
    }

    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const showsToCheck = myList.filter(item => {
        if (item.type !== 'tv' || !item.tmdb_id) return false;
        const isActive = !item.tmdb_status || item.tmdb_status === 'Returning Series' || item.tmdb_status === 'In Production' || item.tmdb_status === 'Unknown';
        const needsRecheck = item.last_status_check && new Date(item.last_status_check) < thirtyDaysAgo;
        return isActive || needsRecheck;
    });

    todayC.innerHTML = `<p class="empty-state">Checking ${showsToCheck.length} active shows...</p>`;
    weekC.innerHTML = '<p class="empty-state">Please wait...</p>';
    upcomingC.innerHTML = '<p class="empty-state">Please wait...</p>';

    const todayEps = [], weekEps = [], upcomingEps = [];
    let checked = 0;

    for (const show of showsToCheck) {
        try {
            checked++;
            todayC.innerHTML = `<p class="empty-state">Checking... ${checked}/${showsToCheck.length}</p>`;

            const details = await tmdbFetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);

            if (details.status && details.status !== show.tmdb_status) {
                updateDoc(doc(db, 'series', show.docId), {
                    tmdb_status: details.status,
                    last_status_check: new Date().toISOString()
                }).catch(() => {});
            }

            if (details.status === 'Returning Series' || details.status === 'In Production') {
                if (details.next_episode_to_air) {
                    const airDate = details.next_episode_to_air.air_date;
                    const ep = {
                        show: show.title,
                        poster: show.poster,
                        docId: show.docId,
                        season: details.next_episode_to_air.season_number,
                        episode: details.next_episode_to_air.episode_number,
                        name: details.next_episode_to_air.name,
                        airDate,
                        airDateObj: new Date(airDate)
                    };
                    if (airDate === todayStr) todayEps.push(ep);
                    else if (airDate > todayStr && airDate <= weekStr) weekEps.push(ep);
                    else if (airDate > weekStr && airDate <= monthStr) upcomingEps.push(ep);
                }
            }

            await new Promise(r => setTimeout(r, 300));
        } catch (error) {
            console.error('Calendar error:', show.title);
        }
    }

    calendarCache = { lastUpdated: Date.now(), data: { today: todayEps, week: weekEps, upcoming: upcomingEps } };
    displayCalendarSection(todayC, todayEps, true);
    displayCalendarSection(weekC, weekEps, false);
    displayCalendarSection(upcomingC, upcomingEps, false);
}

function displayCalendarSection(container, episodes, isToday) {
    if (episodes.length === 0) {
        container.innerHTML = '<p class="empty-state">No episodes scheduled.</p>';
        return;
    }
    episodes.sort((a, b) => a.airDateObj - b.airDateObj);
    container.innerHTML = episodes.map(ep => {
        const poster = ep.poster && !ep.poster.includes('placeholder') ? ep.poster : 'https://via.placeholder.com/60x90?text=No+Image';
        return `
            <div class="calendar-item ${isToday ? 'airing-today' : ''}" onclick="openDetails('${ep.docId}','tv')">
                <img src="${poster}" alt="${ep.show}" onerror="this.src='https://via.placeholder.com/60x90?text=No+Image'">
                <div class="calendar-item-info">
                    <h4>${ep.show}</h4>
                    <div class="episode-title">S${String(ep.season).padStart(2,'0')}E${String(ep.episode).padStart(2,'0')} - ${ep.name}</div>
                    <div class="air-date ${isToday ? 'today' : ''}">
                        📅 ${formatAirDate(ep.airDateObj)}
                        ${isToday ? '<span class="calendar-badge">Airing Today!</span>' : ''}
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

// Make functions globally accessible
window.openDetails = openDetails;
window.openEpisodeDetail = openEpisodeDetail;
window.removeFromList = removeFromList;
window.removeFromListByTMDB = removeFromListByTMDB;
window.addToList = addToList;
window.toggleEpisode = toggleEpisode;
window.toggleFavorite = toggleFavorite;
window.toggleWatched = toggleWatched;
window.markSeasonWatched = markSeasonWatched;
window.quickMarkWatched = quickMarkWatched;
window.setUserStatus = setUserStatus;
window.toggleAnimeStatus = toggleAnimeStatus;
window.toggleOptionsMenu = toggleOptionsMenu;
window.switchDetailTab = switchDetailTab;
