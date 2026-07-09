// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

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

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadMyList();
    updateStats();
});

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

    document.querySelector('.close').addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal')) {
            document.getElementById('modal').style.display = 'none';
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

        // Sort by title
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

// Create Media Card HTML
function createMediaCard(item) {
    const poster = item.poster && item.poster !== 'https://via.placeholder.com/200x300?text=No+Image'
        ? item.poster
        : 'https://via.placeholder.com/200x300?text=' + encodeURIComponent(item.title || 'No Image');

    return `
        <div class="media-card" onclick="openDetails('${item.docId}', '${item.type}')">
            ${item.is_favorite ? '<div class="favorite-badge">⭐</div>' : ''}
            <img src="${poster}" alt="${item.title}" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
            <div class="info">
                <h3>${item.title || 'Unknown Title'}</h3>
                <p class="year">${item.year || 'N/A'}</p>
                ${item.type === 'tv' ? `<p class="year">Status: ${item.status || 'Watching'}</p>` : ''}
                ${item.type === 'movie' && item.is_watched ? '<p class="year">✓ Watched</p>' : ''}
            </div>
            <button class="add-btn remove-btn" onclick="event.stopPropagation(); removeFromList('${item.docId}', '${item.type}')">Remove</button>
        </div>
    `;
}

// Filter My List
function filterMyList(filter) {
    const container = document.getElementById('my-list-content');
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

        const isInList = myList.some(listItem => listItem.tmdb_id === item.id);
        const safeTitle = (title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <div class="media-card">
                <img src="${poster}" alt="${title}" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
                <div class="info">
                    <h3>${title}</h3>
                    <p class="year">${year}</p>
                    <p class="year">${type === 'tv' ? 'TV Show' : type === 'movie' ? 'Movie' : ''}</p>
                </div>
                <button class="add-btn ${isInList ? 'remove-btn' : ''}"
                        onclick="${isInList ? `removeFromListByTMDB(${item.id}, '${type}')` : `addToList(${item.id}, '${type}', '${safeTitle}', '${year}', '${poster}')`}">
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
            title: title,
            year: year,
            poster: poster,
            is_favorite: false,
            created_at: new Date().toISOString()
        };

        if (type === 'tv') {
            const detailsUrl = `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;
            const response = await fetch(detailsUrl);
            const details = await response.json();

            data.status = 'watching';
            data.seasons = [];

            for (let i = 1; i <= details.number_of_seasons; i++) {
                const seasonUrl = `${TMDB_BASE_URL}/tv/${tmdbId}/season/${i}?api_key=${TMDB_API_KEY}`;
                const seasonResponse = await fetch(seasonUrl);
                const seasonData = await seasonResponse.json();

                data.seasons.push({
                    number: i,
                    episodes: (seasonData.episodes || []).map(ep => ({
                        number: ep.episode_number,
                        name: ep.name,
                        is_watched: false,
                        watched_at: null
                    }))
                });
            }
        } else {
            data.is_watched = false;
            data.watched_at = null;
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

// Remove from List
async function removeFromList(docId, type) {
    if (!confirm('Remove this item from your list?')) return;

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
            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                <img src="${item.poster}" style="max-width: 200px; border-radius: 8px;" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
                <div>
                    <h2>${item.title} (${item.year})</h2>
                    <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="toggleFavorite('${safeDocId}', '${type}')" class="watch-btn ${item.is_favorite ? 'mark-unwatched' : 'mark-watched'}">
                            ${item.is_favorite ? '⭐ Remove Favorite' : '☆ Add to Favorites'}
                        </button>
                        <button onclick="toggleWatched('${safeDocId}', 'movie')" class="watch-btn ${item.is_watched ? 'mark-unwatched' : 'mark-watched'}">
                            ${item.is_watched ? '✓ Watched' : '○ Mark as Watched'}
                        </button>
                    </div>
                    ${item.watched_at ? `<p style="margin-top: 15px; color: #666;">Watched on: ${new Date(item.watched_at).toLocaleDateString()}</p>` : ''}
                    ${item.rewatch_count > 0 ? `<p style="color: #666;">Rewatched: ${item.rewatch_count} time(s)</p>` : ''}
                </div>
            </div>
        `;
    } else {
        let episodesHTML = '';
        let watchedCount = 0;
        let totalCount = 0;

        if (item.seasons && item.seasons.length > 0) {
            item.seasons.forEach(season => {
                if (season.episodes) {
                    season.episodes.forEach(ep => {
                        totalCount++;
                        if (ep.is_watched) watchedCount++;
                    });
                }
            });

            episodesHTML = item.seasons.map(season => `
                <div class="season">
                    <h3>Season ${season.number} 
                        <span style="font-size: 14px; font-weight: normal;">
                            (${season.episodes ? season.episodes.filter(e => e.is_watched).length : 0}/${season.episodes ? season.episodes.length : 0} watched)
                        </span>
                        <button onclick="markSeasonWatched('${safeDocId}', ${season.number})" 
                                style="float: right; padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                            Mark All Watched
                        </button>
                    </h3>
                    ${season.episodes ? season.episodes.map(ep => `
                        <div class="episode ${ep.is_watched ? 'watched' : ''}">
                            <div class="episode-info">
                                <span class="episode-number">E${ep.number}</span> - ${ep.name || 'Episode ' + ep.number}
                                ${ep.watched_at ? `<br><small style="color: #999;">${new Date(ep.watched_at).toLocaleDateString()}</small>` : ''}
                            </div>
                            <button class="watch-btn ${ep.is_watched ? 'mark-unwatched' : 'mark-watched'}"
                                    onclick="toggleEpisode('${safeDocId}', ${season.number}, ${ep.number})">
                                ${ep.is_watched ? '✓ Watched' : 'Mark Watched'}
                            </button>
                        </div>
                    `).join('') : '<p>No episode data available</p>'}
                </div>
            `).join('');
        } else {
            episodesHTML = '<p style="color: #999; padding: 20px;">No episode data available for this show.</p>';
        }

        modalBody.innerHTML = `
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px;">
                <img src="${item.poster}" style="max-width: 200px; border-radius: 8px;" onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'">
                <div>
                    <h2>${item.title}</h2>
                    <p style="color: #666;">Status: ${item.status || 'Unknown'}</p>
                    <p style="color: #666;">Progress: ${watchedCount}/${totalCount} episodes</p>
                    <div style="margin-top: 15px;">
                        <button onclick="toggleFavorite('${safeDocId}', '${type}')" class="watch-btn ${item.is_favorite ? 'mark-unwatched' : 'mark-watched'}">
                            ${item.is_favorite ? '⭐ Remove Favorite' : '☆ Add to Favorites'}
                        </button>
                    </div>
                </div>
            </div>
            ${episodesHTML}
        `;
    }

    modal.style.display = 'block';
}

// Mark Entire Season as Watched
async function markSeasonWatched(docId, seasonNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const season = item.seasons.find(s => s.number === seasonNum);
    if (!season) return;

    const allWatched = season.episodes.every(e => e.is_watched);

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

// Toggle Episode Watched Status
async function toggleEpisode(docId, seasonNum, episodeNum) {
    const item = myList.find(i => i.docId === docId);
    if (!item) return;

    const season = item.seasons.find(s => s.number === seasonNum);
    const episode = season.episodes.find(e => e.number === episodeNum);

    episode.is_watched = !episode.is_watched;
    episode.watched_at = episode.is_watched ? new Date().toISOString() : null;

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

    item.is_watched = !item.is_watched;
    item.watched_at = item.is_watched ? new Date().toISOString() : null;

    try {
        await updateDoc(doc(db, 'movies', docId), {
            is_watched: item.is_watched,
            watched_at: item.watched_at
        });
        await loadMyList();
        updateStats();
        openDetails(docId, type);
    } catch (error) {
        console.error('Error updating watched status:', error);
    }
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

                // Try IMDB lookup first
                if (movie.id.imdb) {
                    try {
                        const searchUrl = `${TMDB_BASE_URL}/find/${movie.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
                        const 
