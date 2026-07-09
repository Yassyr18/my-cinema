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
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterMyList(btn.dataset.filter);
        });
    });

    // Search
    document.getElementById('search-btn').addEventListener('click', performSearch);
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // Search filters
    document.querySelectorAll('.search-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.search-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSearchType = btn.dataset.type;
        });
    });

    // Import buttons
    document.getElementById('import-movies-btn').addEventListener('click', importMovies);
    document.getElementById('import-series-btn').addEventListener('click', importSeries);

    // Modal close
    document.querySelector('.close').addEventListener('click', () => {
        document.getElementById('modal').style.display = 'none';
    });
}

// Load My List from Firebase
async function loadMyList() {
    try {
        myList = [];
        const moviesSnapshot = await getDocs(collection(db, 'movies'));
        moviesSnapshot.forEach(doc => {
            myList.push({ ...doc.data(), docId: doc.id, type: 'movie' });
        });

        const seriesSnapshot = await getDocs(collection(db, 'series'));
        seriesSnapshot.forEach(doc => {
            myList.push({ ...doc.data(), docId: doc.id, type: 'tv' });
        });

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

    container.innerHTML = myList.map(item => `
        <div class="media-card" onclick="openDetails('${item.docId}', '${item.type}')">
            ${item.is_favorite ? '<div class="favorite-badge">⭐</div>' : ''}
            <img src="${item.poster || 'https://via.placeholder.com/200x300?text=No+Image'}" alt="${item.title}">
            <div class="info">
                <h3>${item.title}</h3>
                <p class="year">${item.year || 'N/A'}</p>
                ${item.type === 'tv' ? `<p class="year">Status: ${item.status || 'Watching'}</p>` : ''}
            </div>
            <button class="add-btn remove-btn" onclick="event.stopPropagation(); removeFromList('${item.docId}', '${item.type}')">Remove</button>
        </div>
    `).join('');
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

    container.innerHTML = filtered.map(item => `
        <div class="media-card" onclick="openDetails('${item.docId}', '${item.type}')">
            ${item.is_favorite ? '<div class="favorite-badge">⭐</div>' : ''}
            <img src="${item.poster || 'https://via.placeholder.com/200x300?text=No+Image'}" alt="${item.title}">
            <div class="info">
                <h3>${item.title}</h3>
                <p class="year">${item.year || 'N/A'}</p>
                ${item.type === 'tv' ? `<p class="year">Status: ${item.status || 'Watching'}</p>` : ''}
            </div>
            <button class="add-btn remove-btn" onclick="event.stopPropagation(); removeFromList('${item.docId}', '${item.type}')">Remove</button>
        </div>
    `).join('');
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

        return `
            <div class="media-card">
                <img src="${poster}" alt="${title}">
                <div class="info">
                    <h3>${title}</h3>
                    <p class="year">${year}</p>
                </div>
                <button class="add-btn ${isInList ? 'remove-btn' : ''}" 
                        onclick="${isInList ? `removeFromListByTMDB(${item.id}, '${type}')` : `addToList(${item.id}, '${type}', '${title.replace(/'/g, "\\'")}', '${year}', '${poster}')`}">
                    ${isInList ? 'Remove' : 'Add to List'}
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
            // Fetch episode data from TMDB
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
                    episodes: seasonData.episodes.map(ep => ({
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
    } catch (error) {
        console.error('Error removing:', error);
    }
}

// Remove from List by TMDB ID (for search results)
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

    if (type === 'movie') {
        modalBody.innerHTML = `
            <h2>${item.title} (${item.year})</h2>
            <img src="${item.poster}" style="max-width: 200px; margin: 20px 0;">
            <div>
                <button onclick="toggleFavorite('${docId}', '${type}')" class="watch-btn ${item.is_favorite ? 'mark-unwatched' : 'mark-watched'}">
                    ${item.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                </button>
                <button onclick="toggleWatched('${docId}', 'movie')" class="watch-btn ${item.is_watched ? 'mark-unwatched' : 'mark-watched'}">
                    ${item.is_watched ? 'Mark as Unwatched' : 'Mark as Watched'}
                </button>
            </div>
            ${item.watched_at ? `<p style="margin-top: 20px;">Watched on: ${new Date(item.watched_at).toLocaleDateString()}</p>` : ''}
        `;
    } else {
        let episodesHTML = '';
        if (item.seasons) {
            episodesHTML = item.seasons.map(season => `
                <div class="season">
                    <h3>Season ${season.number}</h3>
                    ${season.episodes.map(ep => `
                        <div class="episode ${ep.is_watched ? 'watched' : ''}">
                            <div class="episode-info">
                                <span class="episode-number">E${ep.number}</span> - ${ep.name}
                            </div>
                            <button class="watch-btn ${ep.is_watched ? 'mark-unwatched' : 'mark-watched'}"
                                    onclick="toggleEpisode('${docId}', ${season.number}, ${ep.number})">
                                ${ep.is_watched ? '✓ Watched' : 'Mark Watched'}
                            </button>
                        </div>
                    `).join('')}
                </div>
            `).join('');
        }

        modalBody.innerHTML = `
            <h2>${item.title} (${item.year})</h2>
            <img src="${item.poster}" style="max-width: 200px; margin: 20px 0;">
            <div>
                <button onclick="toggleFavorite('${docId}', '${type}')" class="watch-btn ${item.is_favorite ? 'mark-unwatched' : 'mark-watched'}">
                    ${item.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                </button>
            </div>
            <div style="margin-top: 30px;">
                ${episodesHTML}
            </div>
        `;
    }

    modal.style.display = 'block';
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
        openDetails(docId, 'tv'); // Refresh modal
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
        openDetails(docId, type); // Refresh modal
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
        openDetails(docId, type); // Refresh modal
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

        for (const movie of movies) {
            const docId = `movie_${movie.id.tvdb || movie.id.imdb}`;
            
            // Try to get TMDB data
            let poster = 'https://via.placeholder.com/200x300?text=No+Image';
            let tmdbId = null;

            if (movie.id.imdb) {
                const searchUrl = `${TMDB_BASE_URL}/find/${movie.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
                const response = await fetch(searchUrl);
                const data = await response.json();
                if (data.movie_results && data.movie_results.length > 0) {
                    tmdbId = data.movie_results[0].id;
                    poster = data.movie_results[0].poster_path ? `${TMDB_IMG_BASE}${data.movie_results[0].poster_path}` : poster;
                }
            }

            await setDoc(doc(db, 'movies', docId), {
                tmdb_id: tmdbId,
                imdb_id: movie.id.imdb,
                tvdb_id: movie.id.tvdb,
                title: movie.title,
                year: movie.year,
                poster: poster,
                is_watched: movie.is_watched,
                watched_at: movie.watched_at,
                is_favorite: movie.is_favorite,
                rewatch_count: movie.rewatch_count,
                created_at: movie.created_at
            });
            
            imported++;
        }

        statusDiv.className = 'success';
        statusDiv.textContent = `✓ Successfully imported ${imported} movies!`;
        await loadMyList();
        updateStats();
    } catch (error) {
        statusDiv.className = 'error';
        statusDiv.textContent = `✗ Error importing: ${error.message}`;
    }
}

// Import Series
async function importSeries() {
    const jsonText = document.getElementById('series-json').value;
    const statusDiv = document.getElementById('import-status');
    
    try {
        const series = JSON.parse(jsonText);
        let imported = 0;

        for (const show of series) {
            const docId = `tv_${show.id.tvdb || show.id.imdb}`;
            
            // Try to get TMDB data
            let poster = 'https://via.placeholder.com/200x300?text=No+Image';
            let tmdbId = null;

            if (show.id.imdb) {
                const searchUrl = `${TMDB_BASE_URL}/find/${show.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
                const response = await fetch(searchUrl);
                const data = await response.json();
                if (data.tv_results && data.tv_results.length > 0) {
                    tmdbId = data.tv_results[0].id;
                    poster = data.tv_results[0].poster_path ? `${TMDB_IMG_BASE}${data.tv_results[0].poster_path}` : poster;
                }
            }

            await setDoc(doc(db, 'series', docId), {
                tmdb_id: tmdbId,
                imdb_id: show.id.imdb,
                tvdb_id: show.id.tvdb,
                title: show.title,
                year: show.year || null,
                poster: poster,
                status: show.status,
                is_favorite: show.is_favorite,
                seasons: show.seasons || [],
                created_at: show.created_at
            });
            
            imported++;
        }

        statusDiv.className = 'success';
        statusDiv.textContent = `✓ Successfully imported ${imported} TV shows!`;
        await loadMyList();
        updateStats();
    } catch (error) {
        statusDiv.className = 'error';
        statusDiv.textContent = `✗ Error importing: ${error.message}`;
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
                totalEpisodes += season.episodes.filter(ep => ep.is_watched).length;
            });
        }
    });

    document.getElementById('total-movies').textContent = movies.length;
    document.getElementById('total-shows').textContent = shows.length;
    document.getElementById('total-episodes').textContent = totalEpisodes;
    document.getElementById('total-favorites').textContent = favorites.length;
}

// Make functions globally accessible
window.openDetails = openDetails;
window.removeFromList = removeFromList;
window.removeFromListByTMDB = removeFromListByTMDB;
window.addToList = addToList;
window.toggleEpisode = toggleEpisode;
window.toggleFavorite = toggleFavorite;
window.toggleWatched = toggleWatched;