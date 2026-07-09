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

// TMDB Configuration
const TMDB_API_KEY = '73ae67fa40ec16ffe7a242b6d2a4e1d9';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';

// Global State
let myList = [];
let currentSearchType = 'multi';
let recentlyWatchedEpisodes = []; // Track recently watched for history

// Initialize App
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
        const pullDistance = e.touches[0].clientY - pullStartY;
        if (pullDistance > 0 && pullDistance < 100) {
            indicator.style.top = `${pullDistance - 60}px`;
        } else if (pullDistance >= 100) {
            indicator.classList.add('visible');
        }
    });
    
    container.addEventListener('touchend', async (e) => {
        if (!pulling) return;
        pulling = false;
        const pullDistance = e.changedTouches[0].clientY - pullStartY;
        
        if (pullDistance >= 100) {
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

// Setup Realtime Listeners (auto-update without refresh)
function setupRealtimeListeners() {
    onSnapshot(collection(db, 'movies'), () => {
        loadMyList();
        updateStats();
    });
    
    onSnapshot(collection(db, 'series'), () => {
        loadMyList();
        updateStats();
    });
}

// Event Listeners
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
        if (e.target === document.getElementById('modal')) {
            document.getElementById('modal').style.display = 'none';
        }
        if (e.target === document.getElementById('confirm-dialog')) {
            document.getElementById('confirm-dialog').style.display = 'none';
        }
    });
}

// Load My List from Firebase
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

// Display My List
function displayMyList() {
    const container = document.getElementById('my-list-content');

    if (myList.length === 0) {
        container.innerHTML = '<p class="empty-state">Your list is empty. Search for shows/movies to add!</p>';
        return;
    }

    container.innerHTML = myList.map(item => createMediaCard(item)).join('');
}

// Create Media Card HTML with Status Line
function createMediaCard(item) {
    const poster = item.poster && item.poster !== 'https://via.placeholder.com/200x300?text=No+Image'
        ? item.poster
        : 'https://via.placeholder.com/200x300?text=' + encodeURIComponent(item.title || 'No Image');

    let statusLineHTML = '';
    let statusClass = '';
    let statusWidth = '100%';
    
    if (item.type === 'tv' && item.user_status) {
        const progress = getShowProgressExcludingSpecials(item);
        statusClass = `status-${item.user_status.toLowerCase().replace(/ /g, '')}`;
        
        if (item.user_status === 'Watching') {
            statusWidth = `${progress}%`;
        }
        
        statusLineHTML = `<div class="status-line ${statusClass}" style="width: ${statusWidth};"></div>`;
    }

    const rating = item.tmdb_rating ? `⭐ ${item.tmdb_rating.toFixed(1)}` : 'N/A';

    return `
        <div class="media-card" onclick="openDetails('${item.docId}', '${item.type}')">
            ${item.is_favorite ? '<div class="favorite-badge">⭐</div>' : ''}
            <img src="${poster}" alt="${item.title}" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
            ${statusLineHTML}
            <div class="info">
                <h3>${item.title || 'Unknown Title'}</h3>
                <p class="year">${rating}</p>
                ${item.type === 'tv' ? `<p class="year">Status: ${item.user_status || 'Watching'}</p>` : ''}
                ${item.type === 'movie' && item.is_watched ? '<p class="year">✓ Watched</p>' : ''}
            </div>
        </div>
    `;
}

// Get show progress excluding Season 0 (Specials)
function getShowProgressExcludingSpecials(show) {
    if (!show.seasons) return 0;
    
    let total = 0;
    let watched = 0;
    
    show.seasons.forEach(season => {
        if (season.number === 0) return; // Skip specials
        if (season.episodes) {
            season.episodes.forEach(ep => {
                total++;
                if (ep.is_watched) watched++;
            });
        }
    });
    
    return total > 0 ? (watched / total) * 100 : 0;
}

// Filter My List
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

    if (filter === 'tv') filtered = myList.filter(item => item.type === 'tv');
    else if (filter === 'movie') filtered = myList.filter(item => item.type === 'movie');
    else if (filter === 'favorites') filtered = myList.filter(item => item.is_favorite);

    if (filtered.length === 0) {
        container.innerHTML = '<p class="empty-state">No items found.</p>';
        return;
    }

    container.innerHTML = filtered.map(item => createMediaCard(item)).join('');
}
// Display Continue Watching - Horizontal TV Time Style
function displayContinueWatching() {
    const container = document.getElementById('continue-watching-list');
    const historyHeader = document.getElementById('watch-history-header');
    
    // Get shows with actual unwatched non-special episodes
    const inProgressShows = myList.filter(item => {
        if (item.type !== 'tv' || !item.seasons || item.seasons.length === 0) return false;
        
        let hasWatched = false;
        let hasUnwatched = false;
        
        item.seasons.forEach(season => {
            if (season.number === 0) return; // Skip specials
            if (season.episodes) {
                season.episodes.forEach(ep => {
                    if (ep.is_watched) hasWatched = true;
                    else hasUnwatched = true;
                });
            }
        });
        
        return hasWatched && hasUnwatched;
    });
    
    if (inProgressShows.length === 0) {
        container.innerHTML = '<p class="empty-state">No shows in progress!</p>';
        historyHeader.style.display = 'none';
        return;
    }
    
    // Sort by most recently watched (latest on top)
    inProgressShows.sort((a, b) => {
        const aDate = getLastWatchedDate(a);
        const bDate = getLastWatchedDate(b);
        return new Date(bDate) - new Date(aDate);
    });
    
    // Split into active (watched in last 30 days) and history
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeShows = inProgressShows.filter(show => {
        const lastWatched = new Date(getLastWatchedDate(show));
        return lastWatched >= thirtyDaysAgo;
    });
    
    const historyShows = inProgressShows.filter(show => {
        const lastWatched = new Date(getLastWatchedDate(show));
        return lastWatched < thirtyDaysAgo;
    });
    
    let html = activeShows.map(show => createContinueCard(show, false)).join('');
    
    if (historyShows.length > 0) {
        historyHeader.style.display = 'block';
        html += historyShows.map(show => createContinueCard(show, true)).join('');
    } else {
        historyHeader.style.display = 'none';
    }
    
    container.innerHTML = html;
}

// Create horizontal continue watching card
function createContinueCard(show, isHistory) {
    const nextEp = getNextEpisodeExcludingSpecials(show);
    const progress = getShowProgressExcludingSpecials(show);
    const safeDocId = show.docId.replace(/'/g, "\\'");
    
    const poster = show.poster && show.poster !== 'https://via.placeholder.com/200x300?text=No+Image'
        ? show.poster
        : 'https://via.placeholder.com/60x90?text=No+Image';
    
    let progressClass = 'watching';
    if (progress >= 100) progressClass = 'uptodate';
    
    const episodeCode = nextEp 
        ? `S${String(nextEp.season).padStart(2, '0')}E${String(nextEp.number).padStart(2, '0')}`
        : 'Up to date';
    
    const episodeName = nextEp ? nextEp.name : '';
    
    return `
        <div class="continue-card ${isHistory ? 'history-item' : ''}">
            <img src="${poster}" 
                 alt="${show.title}" 
                 onerror="this.src='https://via.placeholder.com/60x90?text=No+Image'"
                 onclick="openDetails('${safeDocId}', 'tv')"
                 style="cursor:pointer;">
            <div class="continue-info">
                <h3 onclick="openDetails('${safeDocId}', 'tv')">${show.title}</h3>
                <div class="episode-code">${episodeCode}</div>
                ${episodeName ? `<div class="episode-name">${episodeName}</div>` : ''}
                <div class="progress-bar">
                    <div class="progress-fill ${progressClass}" style="width: ${progress}%;"></div>
                </div>
                <div style="font-size: 11px; color: #999;">${progress.toFixed(0)}% complete</div>
            </div>
            ${nextEp ? `
                <button class="quick-check-btn" 
                        onclick="quickMarkWatched('${safeDocId}', ${nextEp.season}, ${nextEp.number})"
                        title="Mark ${episodeCode} as watched">
                    ✓
                </button>
            ` : '<div style="width:44px;"></div>'}
        </div>
    `;
}

// Get next episode excluding specials (Season 0)
function getNextEpisodeExcludingSpecials(show) {
    if (!show.seasons) return null;
    
    for (const season of show.seasons) {
        if (season.number === 0) continue; // Skip specials
        if (!season.episodes) continue;
        for (const episode of season.episodes) {
            if (!episode.is_watched) {
                return {
                    season: season.number,
                    number: episode.number,
                    name: episode.name || `Episode ${episode.number}`
                };
            }
        }
    }
    return null;
}

// Get last watched date
function getLastWatchedDate(show) {
    let lastDate = null;
    
    if (show.seasons) {
        show.seasons.forEach(season => {
            if (season.episodes) {
                season.episodes.forEach(ep => {
                    if (ep.is_watched && ep.watched_at) {
                        if (!lastDate || new Date(ep.watched_at) > new Date(lastDate)) {
                            lastDate = ep.watched_at;
                        }
                    }
                });
            }
        });
    }
    
    return lastDate || show.created_at || new Date().toISOString();
}

// Confirmation Dialog Helper
function showConfirm(title, message, yesText = 'Yes', noText = 'No', showCancel = false, cancelText = 'Cancel') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirm-dialog');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');
        const cancelBtn = document.getElementById('confirm-cancel');
        
        yesBtn.textContent = yesText;
        noBtn.textContent = noText;
        
        if (showCancel) {
            cancelBtn.style.display = 'inline-block';
            cancelBtn.textContent = cancelText;
        } else {
            cancelBtn.style.display = 'none';
        }
        
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

// Quick mark episode as watched (from Continue Watching - does NOT open modal)
async function quickMarkWatched(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;
    const episode = season.episodes.find(e => e.number === episodeNum);
    if (!episode) return;

    // Check for unwatched previous episodes
    const previousUnwatched = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);
    
    if (previousUnwatched.length > 0) {
        const answer = await showConfirm(
            'Mark Previous Episodes?',
            `You have ${previousUnwatched.length} unwatched episode(s) before this one. Mark them all as watched too?`,
            'Yes, mark all',
            'No, just this one'
        );
        
        if (answer === 'yes') {
            previousUnwatched.forEach(({ seasonNum: sNum, episodeNum: eNum }) => {
                const s = item.seasons.find(s => s.number === sNum);
                const e = s?.episodes.find(e => e.number === eNum);
                if (e) {
                    e.is_watched = true;
                    e.watched_at = new Date().toISOString();
                }
            });
        }
    }

    episode.is_watched = true;
    episode.watched_at = new Date().toISOString();

    try {
        await updateDoc(doc(db, 'series', docId), { seasons: item.seasons });
        
        // Update local state without full reload
        const localItem = myList.find(i => i.docId === docId);
        if (localItem) {
            localItem.seasons = item.seasons;
        }
        
        displayContinueWatching();
        updateStats();
    } catch (error) {
        console.error('Error updating episode:', error);
    }
}

// Get all previous unwatched episodes before a given episode
function getPreviousUnwatchedEpisodes(show, targetSeasonNum, targetEpisodeNum) {
    const unwatched = [];
    
    if (!show.seasons) return unwatched;
    
    for (const season of show.seasons) {
        if (season.number === 0) continue;
        if (season.number > targetSeasonNum) break;
        
        for (const ep of (season.episodes || [])) {
            if (season.number === targetSeasonNum && ep.number >= targetEpisodeNum) break;
            if (!ep.is_watched) {
                unwatched.push({ seasonNum: season.number, episodeNum: ep.number });
            }
        }
    }
    
    return unwatched;
}

// Perform Search
async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const url = `${TMDB_BASE_URL}/search/${currentSearchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        displaySearchResults(data.results);
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Display Search Results
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
        const rating = item.vote_average ? `⭐ ${item.vote_average.toFixed(1)}` : 'N/A';

        const isInList = myList.some(listItem => listItem.tmdb_id === item.id);
        const safeTitle = (title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <div class="media-card">
                <img src="${poster}" alt="${title}" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
                <div class="info">
                    <h3>${title}</h3>
                    <p class="year">${year} · ${rating}</p>
                    <p class="year">${type === 'tv' ? 'TV Show' : type === 'movie' ? 'Movie' : ''}</p>
                </div>
                <button class="add-btn ${isInList ? 'remove-btn' : ''}"
                        onclick="${isInList 
                            ? `removeFromListByTMDB(${item.id}, '${type}')` 
                            : `addToList(${item.id}, '${type}', '${safeTitle}', '${year}', '${poster}')`}">
                    ${isInList ? 'In Your List ✓' : 'Add to List'}
                </button>
            </div>
        `;
    }).join('');
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
            const detailsUrl = `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
            const response = await fetch(detailsUrl);
            const details = await response.json();

            // Detect anime
            const isAnime = isAnimeShow(details);
            const rating = details.vote_average || null;

            data.user_status = 'Watching';
            data.tmdb_status = details.status || 'Unknown';
            data.last_status_check = new Date().toISOString();
            data.is_anime = isAnime;
            data.tmdb_rating = rating;
            data.seasons = [];

            for (let i = 0; i <= details.number_of_seasons; i++) {
                const seasonUrl = `${TMDB_BASE_URL}/tv/${tmdbId}/season/${i}?api_key=${TMDB_API_KEY}`;
                const seasonResponse = await fetch(seasonUrl);
                const seasonData = await seasonResponse.json();

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
            }
        } else {
            // Movie
            const detailsUrl = `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`;
            const response = await fetch(detailsUrl);
            const details = await response.json();
            
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
        console.error('Error adding to list:', error);
        alert('Error adding to list. Please try again.');
    }
}

// Auto-detect anime from TMDB data
function isAnimeShow(details) {
    const genres = details.genres || [];
    const isAnimation = genres.some(g => g.id === 16);
    const isJapanese = details.original_language === 'ja';
    const networks = details.networks || [];
    const animeNetworks = ['Fuji TV', 'Tokyo MX', 'TBS', 'TV Tokyo', 'Netflix', 'Crunchyroll'];
    const isAnimeNetwork = networks.some(n => animeNetworks.includes(n.name));
    
    return (isAnimation && isJapanese) || (isAnimation && isAnimeNetwork);
}

// Remove from List
async function removeFromList(docId, type) {
    const answer = await showConfirm(
        'Remove from Library',
        'Are you sure you want to remove this from your library?',
        'Remove',
        'Cancel'
    );
    
    if (answer !== 'yes') return;

    try {
        const collectionName = type === 'movie' ? 'movies' : 'series';
        await deleteDoc(doc(db, collectionName, docId));
        await loadMyList();
        updateStats();
        document.getElementById('modal').style.display = 'none';
    } catch (error) {
        console.error('Error removing:', error);
    }
}

// Remove from List by TMDB ID
async function removeFromListByTMDB(tmdbId, type) {
    const docId = `${type}_${tmdbId}`;
    await removeFromList(docId, type);
}

// Open Details Modal
function openDetails(docId, type) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modal-body');
    const safeDocId = docId.replace(/'/g, "\\'");

    if (type === 'movie') {
        modalBody.innerHTML = `
            <div style="display: flex; gap: 20px; flex-wrap: wrap; position: relative;">
                <img src="${item.poster}" style="max-width: 200px; border-radius: 8px;" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
                <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h2>${item.title} (${item.year})</h2>
                        <div class="show-options">
                            <button class="options-btn" onclick="toggleOptionsMenu('movie-options')">⋯</button>
                            <div class="options-menu" id="movie-options">
                                <button onclick="toggleFavorite('${safeDocId}', 'movie')">
                                    ${item.is_favorite ? '⭐ Remove Favorite' : '☆ Add to Favorites'}
                                </button>
                                <button class="danger" onclick="removeFromList('${safeDocId}', 'movie')">🗑 Remove</button>
                            </div>
                        </div>
                    </div>
                    ${item.tmdb_rating ? `<p style="color:#666; margin:5px 0;">⭐ ${item.tmdb_rating.toFixed(1)} / 10</p>` : ''}
                    <div style="margin-top: 15px;">
                        <button onclick="toggleWatched('${safeDocId}', 'movie')" 
                                class="watch-btn ${item.is_watched ? 'watched' : 'mark-watched'}">
                            ${item.is_watched ? '✓ Watched' : '○ Mark as Watched'}
                        </button>
                    </div>
                    ${item.watched_at ? `<p style="margin-top: 15px; color: #666;">Watched on: ${new Date(item.watched_at).toLocaleDateString()}</p>` : ''}
                    ${item.rewatch_count > 0 ? `<p style="color: #666;">Rewatched: ${item.rewatch_count} time(s)</p>` : ''}
                </div>
            </div>
        `;
    } else {
        // TV Show
        const progress = getShowProgressExcludingSpecials(item);
        let watchedCount = 0;
        let totalCount = 0;

        if (item.seasons) {
            item.seasons.forEach(season => {
                if (season.number === 0) return;
                if (season.episodes) {
                    season.episodes.forEach(ep => {
                        totalCount++;
                        if (ep.is_watched) watchedCount++;
                    });
                }
            });
        }

        // Separate regular seasons and specials
        const regularSeasons = (item.seasons || []).filter(s => s.number !== 0);
        const specialsSeason = (item.seasons || []).find(s => s.number === 0);

        const regularSeasonsHTML = regularSeasons.map(season => buildSeasonHTML(season, safeDocId, item)).join('');
        
        const specialsHTML = specialsSeason && specialsSeason.episodes && specialsSeason.episodes.length > 0 ? `
            <div class="season specials">
                <h3>Specials</h3>
                ${specialsSeason.episodes.map(ep => buildEpisodeHTML(ep, 0, safeDocId)).join('')}
            </div>
        ` : '';

        // Get TMDB status badge
        const tmdbStatus = item.tmdb_status || 'Unknown';
        const statusColor = {
            'Returning Series': '#4CAF50',
            'In Production': '#2196F3',
            'Ended': '#666',
            'Canceled': '#f44336',
            'Pilot': '#FF9800'
        }[tmdbStatus] || '#666';

        modalBody.innerHTML = `
            <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:20px; position:relative;">
                <img src="${item.poster}" style="max-width:180px; border-radius:8px;" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
                <div style="flex:1; min-width:200px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h2>${item.title}</h2>
                        <div class="show-options">
                            <button class="options-btn" onclick="toggleOptionsMenu('tv-options')">⋯</button>
                            <div class="options-menu" id="tv-options">
                                <button onclick="toggleFavorite('${safeDocId}', 'tv')">
                                    ${item.is_favorite ? '⭐ Remove Favorite' : '☆ Add to Favorites'}
                                </button>
                                <button onclick="setUserStatus('${safeDocId}', 'Watching')">▶ Watching</button>
                                <button onclick="setUserStatus('${safeDocId}', 'Paused')">⏸ Paused</button>
                                <button onclick="setUserStatus('${safeDocId}', 'Dropped')">🚫 Dropped</button>
                                <button onclick="setUserStatus('${safeDocId}', 'Finished')">✅ Finished</button>
                                <button onclick="setUserStatus('${safeDocId}', 'Planned')">📋 Planned</button>
                                <button onclick="toggleAnimeStatus('${safeDocId}')">
                                    ${item.is_anime ? '🎌 Remove Anime Tag' : '🎌 Mark as Anime'}
                                </button>
                                <button class="danger" onclick="removeFromList('${safeDocId}', 'tv')">🗑 Remove</button>
                            </div>
                        </div>
                    </div>
                    
                    <span style="display:inline-block; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600; color:white; background:${statusColor}; margin:8px 0;">
                        ${tmdbStatus}
                    </span>
                    ${item.is_anime ? '<span style="margin-left:5px; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:600; background:#FF6B35; color:white;">🎌 Anime</span>' : ''}
                    
                    ${item.tmdb_rating ? `<p style="color:#666; margin:5px 0;">⭐ ${item.tmdb_rating.toFixed(1)} / 10</p>` : ''}
                    <p style="color:#666; font-size:14px;">Your status: <strong>${item.user_status || 'Watching'}</strong></p>
                    
                    <div class="detail-progress">
                        <div class="detail-progress-label">${watchedCount} / ${totalCount} episodes watched</div>
                        <div class="detail-progress-bar">
                            <div class="detail-progress-fill" style="width:${progress}%; background:${progress >= 100 ? '#4CAF50' : '#FFC107'};"></div>
                        </div>
                    </div>
                </div>
            </div>
            ${regularSeasonsHTML}
            ${specialsHTML}
        `;
    }

    modal.style.display = 'block';
}

// Build Season HTML
function buildSeasonHTML(season, safeDocId, item) {
    const watchedInSeason = season.episodes ? season.episodes.filter(e => e.is_watched).length : 0;
    const totalInSeason = season.episodes ? season.episodes.length : 0;
    const allWatched = watchedInSeason === totalInSeason && totalInSeason > 0;
    
    return `
        <div class="season">
            <h3>
                <span>Season ${season.number} 
                    <span style="font-size:13px; font-weight:normal; opacity:0.8;">
                        (${watchedInSeason}/${totalInSeason})
                    </span>
                </span>
                <button class="mark-all-btn" 
                        onclick="markSeasonWatched('${safeDocId}', ${season.number})">
                    ${allWatched ? 'Unmark All' : 'Mark All Watched'}
                </button>
            </h3>
            ${season.episodes ? season.episodes.map(ep => buildEpisodeHTML(ep, season.number, safeDocId)).join('') : '<p>No episodes</p>'}
        </div>
    `;
}

// Build Episode HTML
function buildEpisodeHTML(ep, seasonNum, safeDocId) {
    return `
        <div class="episode ${ep.is_watched ? 'watched' : ''}">
            <div class="episode-info">
                <span class="episode-number">E${String(ep.number).padStart(2,'0')}</span> 
                - ${ep.name || 'Episode ' + ep.number}
                ${ep.watched_at ? `<br><small style="color:#999;">${new Date(ep.watched_at).toLocaleDateString()}</small>` : ''}
                ${ep.rewatch_count > 0 ? `<br><small style="color:#2196F3;">↺ Rewatched ${ep.rewatch_count}x</small>` : ''}
            </div>
            <button class="watch-btn ${ep.is_watched ? 'watched' : 'mark-watched'}"
                    onclick="toggleEpisode('${safeDocId}', ${seasonNum}, ${ep.number})">
                ${ep.is_watched ? '✓ Watched' : 'Mark Watched'}
            </button>
        </div>
    `;
}

// Toggle Options Menu
function toggleOptionsMenu(menuId) {
    const menu = document.getElementById(menuId);
    if (menu) {
        menu.classList.toggle('show');
    }
    
    // Close other menus
    document.querySelectorAll('.options-menu').forEach(m => {
        if (m.id !== menuId) m.classList.remove('show');
    });
}

// Set User Status (Watching, Paused, Dropped, etc.)
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

// Toggle Anime Status
async function toggleAnimeStatus(docId) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const newStatus = !item.is_anime;
    
    try {
        await updateDoc(doc(db, 'series', docId), { is_anime: newStatus });
        item.is_anime = newStatus;
        openDetails(docId, 'tv');
    } catch (error) {
        console.error('Error toggling anime status:', error);
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
        // Check for previous unwatched seasons
        const previousUnwatchedSeasons = item.seasons.filter(s => 
            s.number !== 0 && 
            s.number < seasonNum && 
            s.episodes && 
            s.episodes.some(e => !e.is_watched)
        );

        if (previousUnwatchedSeasons.length > 0) {
            const answer = await showConfirm(
                'Mark Previous Seasons?',
                `You have unwatched episodes in ${previousUnwatchedSeasons.length} previous season(s). Mark them all as watched too?`,
                'Yes, mark all',
                'No, just this season'
            );
            
            if (answer === 'yes') {
                previousUnwatchedSeasons.forEach(s => {
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

// Toggle Episode Watched Status (with Rewatch dialog)
async function toggleEpisode(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;
    const episode = season.episodes.find(e => e.number === episodeNum);
    if (!episode) return;

    if (episode.is_watched) {
        // Already watched - ask: Rewatch or Unmark?
        const answer = await showConfirm(
            'Already Watched',
            `What would you like to do with "${episode.name || 'this episode'}"?`,
            '↺ Rewatch',
            '✗ Unmark',
            false
        );
        
        if (answer === 'yes') {
            // Rewatch
            episode.rewatch_count = (episode.rewatch_count || 0) + 1;
            if (!episode.rewatch_history) episode.rewatch_history = [];
            episode.rewatch_history.push(new Date().toISOString());
            episode.watched_at = new Date().toISOString();
        } else if (answer === 'no') {
            // Unmark
            episode.is_watched = false;
            episode.watched_at = null;
        } else {
            return; // cancelled
        }
    } else {
        // Check for previous unwatched episodes
        const previousUnwatched = getPreviousUnwatchedEpisodes(item, seasonNum, episodeNum);
        
        if (previousUnwatched.length > 0) {
            const answer = await showConfirm(
                'Mark Previous Episodes?',
                `You have ${previousUnwatched.length} unwatched episode(s) before this. Mark them as watched too?`,
                'Yes, mark all',
                'No, just this one'
            );
            
            if (answer === 'yes') {
                previousUnwatched.forEach(({ seasonNum: sNum, episodeNum: eNum }) => {
                    const s = item.seasons.find(s => s.number === sNum);
                    const e = s?.episodes.find(e => e.number === eNum);
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
        const collectionName = type === 'movie' ? 'movies' : 'series';
        await updateDoc(doc(db, collectionName, docId), { is_favorite: item.is_favorite });
        await loadMyList();
        updateStats();
        openDetails(docId, type);
    } catch (error) {
        console.error('Error updating favorite:', error);
    }
}

// Toggle Watched (Movies)
async function toggleWatched(docId, type) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    if (item.is_watched) {
        const answer = await showConfirm(
            'Already Watched',
            'What would you like to do?',
            '↺ Rewatch',
            '✗ Unmark'
        );
        
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
        console.error('Error updating watched status:', error);
    }
}

// Update Stats
function updateStats() {
    const movies = myList.filter(item => item.type === 'movie');
    const shows = myList.filter(item => item.type === 'tv');
    const favorites = myList.filter(item => item.is_favorite);

    let totalEpisodes = 0;
    shows.forEach(show => {
        if (show.seasons) {
            show.seasons.forEach(season => {
                if (season.number === 0) return;
                if (season.episodes) {
                    totalEpisodes += season.episodes.filter(ep => ep.is_watched).length;
                }
            });
        }
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
        let imported = 0;
        let failed = 0;
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
                        const searchUrl = `${TMDB_BASE_URL}/find/${movie.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
                        const response = await fetch(searchUrl);
                        const data = await response.json();
                        if (data.movie_results && data.movie_results.length > 0) {
                            tmdbId = data.movie_results[0].id;
                            poster = data.movie_results[0].poster_path ? `${TMDB_IMG_BASE}${data.movie_results[0].poster_path}` : poster;
                            tmdbRating = data.movie_results[0].vote_average || null;
                        }
                    } catch (e) {}
                }

                if (!tmdbId && movie.title) {
                    try {
                        const searchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year}`;
                        const response = await fetch(searchUrl);
                        const data = await response.json();
                        if (data.results && data.results.length > 0) {
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

                if (imported % 30 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (e) {
                failed++;
            }
        }

        statusDiv.className = 'success';
        statusDiv.textContent = `✓ Successfully imported ${imported} movies! (${failed} failed)`;
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
        let imported = 0;
        let failed = 0;
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
                        const searchUrl = `${TMDB_BASE_URL}/find/${show.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
                        const response = await fetch(searchUrl);
                        const data = await response.json();
                        if (data.tv_results && data.tv_results.length > 0) {
                            tmdbId = data.tv_results[0].id;
                            poster = data.tv_results[0].poster_path ? `${TMDB_IMG_BASE}${data.tv_results[0].poster_path}` : poster;
                            tmdbRating = data.tv_results[0].vote_average || null;
                        }
                    } catch (e) {}
                }

                if (!tmdbId && show.title) {
                    try {
                        const cleanTitle = show.title.replace(/\s*\(\d{4}\)\s*$/, '');
                        const searchUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`;
                        const response = await fetch(searchUrl);
                        const data = await response.json();
                        if (data.results && data.results.length > 0) {
                            tmdbId = data.results[0].id;
                            poster = data.results[0].poster_path ? `${TMDB_IMG_BASE}${data.results[0].poster_path}` : poster;
                            tmdbRating = data.results[0].vote_average || null;
                        }
                    } catch (e) {}
                }

                // Get TMDB status for calendar optimization
                if (tmdbId) {
                    try {
                        const detailsUrl = `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
                        const response = await fetch(detailsUrl);
                        const details = await response.json();
                        tmdbStatus = details.status || 'Unknown';
                        isAnime = isAnimeShow(details);
                        if (!tmdbRating) tmdbRating = details.vote_average || null;
                    } catch (e) {}
                }

                // Map TV Time status to our status
                const statusMap = {
                    'up_to_date': 'Up to Date',
                    'watching': 'Watching',
                    'watched': 'Finished',
                    'dropped': 'Dropped',
                    'on_hold': 'Paused',
                    'plan_to_watch': 'Planned'
                };

                let seasons = [];
                if (show.seasons && show.seasons.length > 0) {
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

                if (imported % 20 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } catch (e) {
                failed++;
                console.error('Failed:', show.title, e);
            }
        }

        statusDiv.className = 'success';
        statusDiv.textContent = `✓ Successfully imported ${imported} TV shows! (${failed} failed)`;
        await loadMyList();
        updateStats();
    } catch (error) {
        statusDiv.className = 'error';
        statusDiv.textContent = `✗ Error: ${error.message}`;
    }
}

// Calendar cache
let calendarCache = {
    lastUpdated: null,
    data: { today: [], week: [], upcoming: [] }
};

// Load Calendar - Smart (only checks Returning/In Production shows)
async function loadCalendar(forceRefresh = false) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekStr = weekFromNow.toISOString().split('T')[0];
    const monthFromNow = new Date(today);
    monthFromNow.setDate(monthFromNow.getDate() + 30);
    const monthStr = monthFromNow.toISOString().split('T')[0];

    const todayContainer = document.getElementById('calendar-today');
    const weekContainer = document.getElementById('calendar-week');
    const upcomingContainer = document.getElementById('calendar-upcoming');

    // Use cache if fresh (6 hours)
    const cacheAge = calendarCache.lastUpdated ? Date.now() - calendarCache.lastUpdated : Infinity;
    if (!forceRefresh && cacheAge < 6 * 60 * 60 * 1000) {
        displayCalendarSection(todayContainer, calendarCache.data.today, true);
        displayCalendarSection(weekContainer, calendarCache.data.week, false);
        displayCalendarSection(upcomingContainer, calendarCache.data.upcoming, false);
        return;
    }

    // Only check shows that might be airing
    // tmdb_status = Returning Series OR In Production OR Unknown/null (haven't been checked yet)
    // OR last_status_check > 30 days ago (re-verify monthly)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const showsToCheck = myList.filter(item => {
        if (item.type !== 'tv' || !item.tmdb_id) return false;
        
        const isActiveStatus = !item.tmdb_status || 
            item.tmdb_status === 'Returning Series' || 
            item.tmdb_status === 'In Production' ||
            item.tmdb_status === 'Unknown';
        
        const needsRecheck = item.last_status_check && 
            new Date(item.last_status_check) < thirtyDaysAgo;
        
        return isActiveStatus || needsRecheck;
    });

    todayContainer.innerHTML = `<p class="empty-state">Checking ${showsToCheck.length} active shows...</p>`;
    weekContainer.innerHTML = '<p class="empty-state">Please wait...</p>';
    upcomingContainer.innerHTML = '<p class="empty-state">Please wait...</p>';

    const todayEpisodes = [];
    const weekEpisodes = [];
    const upcomingEpisodes = [];

    let checked = 0;
    for (const show of showsToCheck) {
        try {
            checked++;
            todayContainer.innerHTML = `<p class="empty-state">Checking shows... ${checked}/${showsToCheck.length}</p>`;

            const response = await fetch(`${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`);
            const details = await response.json();

            // Update status in Firebase (silent background update)
            if (details.status && details.status !== show.tmdb_status) {
                updateDoc(doc(db, 'series', show.docId), {
                    tmdb_status: details.status,
                    last_status_check: new Date().toISOString()
                }).catch(() => {});
            }

            if (details.status === 'Returning Series' || details.status === 'In Production') {
                if (details.next_episode_to_air) {
                    const airDate = details.next_episode_to_air.air_date;
                    const episode = {
                        show: show.title,
                        poster: show.poster,
                        docId: show.docId,
                        season: details.next_episode_to_air.season_number,
                        episode: details.next_episode_to_air.episode_number,
                        name: details.next_episode_to_air.name,
                        airDate,
                        airDateObj: new Date(airDate)
                    };

                    if (airDate === todayStr) todayEpisodes.push(episode);
                    else if (airDate > todayStr && airDate <= weekStr) weekEpisodes.push(episode);
                    else if (airDate > weekStr && airDate <= monthStr) upcomingEpisodes.push(episode);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
            console.error('Calendar error for:', show.title);
        }
    }

    calendarCache = {
        lastUpdated: Date.now(),
        data: { today: todayEpisodes, week: weekEpisodes, upcoming: upcomingEpisodes }
    };

    displayCalendarSection(todayContainer, todayEpisodes, true);
    displayCalendarSection(weekContainer, weekEpisodes, false);
    displayCalendarSection(upcomingContainer, upcomingEpisodes, false);
}

// Display Calendar Section
function displayCalendarSection(container, episodes, isToday) {
    if (episodes.length === 0) {
        container.innerHTML = '<p class="empty-state">No episodes scheduled.</p>';
        return;
    }

    episodes.sort((a, b) => a.airDateObj - b.airDateObj);

    container.innerHTML = episodes.map(ep => {
        const poster = ep.poster && !ep.poster.includes('placeholder')
            ? ep.poster : 'https://via.placeholder.com/60x90?text=No+Image';

        return `
            <div class="calendar-item ${isToday ? 'airing-today' : ''}" onclick="openDetails('${ep.docId}', 'tv')">
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

// Format air date
function formatAirDate(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate.getTime() === today.getTime()) return 'Today';
    if (checkDate.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Make functions globally accessible
window.openDetails = openDetails;
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
window.getPreviousUnwatchedEpisodes = getPreviousUnwatchedEpisodes;
