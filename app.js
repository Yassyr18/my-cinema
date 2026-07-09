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
        
    // Calendar refresh
document.getElementById('refresh-calendar-btn').addEventListener('click', () => loadCalendar(true));    
    // Tab change - load calendar when calendar tab is clicked
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === 'calendar') {
            btn.addEventListener('click', () => {
                loadCalendar();
            });
        }
    });

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
    const continueSection = document.getElementById('continue-watching-section');
    
    if (filter === 'continue') {
        // Show continue watching section
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
                        const response = await fetch(searchUrl);
                        const data = await response.json();
                        if (data.movie_results && data.movie_results.length > 0) {
                            tmdbId = data.movie_results[0].id;
                            poster = data.movie_results[0].poster_path ? `${TMDB_IMG_BASE}${data.movie_results[0].poster_path}` : poster;
                        }
                    } catch (e) {
                        console.warn('TMDB lookup failed for:', movie.title);
                    }
                }

                // If no IMDB result, try searching by title
                if (!tmdbId && movie.title) {
                    try {
                        const searchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&year=${movie.year}`;
                        const response = await fetch(searchUrl);
                        const data = await response.json();
                        if (data.results && data.results.length > 0) {
                            tmdbId = data.results[0].id;
                            poster = data.results[0].poster_path ? `${TMDB_IMG_BASE}${data.results[0].poster_path}` : poster;
                        }
                    } catch (e) {
                        console.warn('TMDB search failed for:', movie.title);
                    }
                }

                await setDoc(doc(db, 'movies', docId), {
                    tmdb_id: tmdbId,
                    imdb_id: movie.id.imdb,
                    tvdb_id: movie.id.tvdb,
                    title: movie.title,
                    year: movie.year,
                    poster: poster,
                    is_watched: movie.is_watched || false,
                    watched_at: movie.watched_at || null,
                    is_favorite: movie.is_favorite || false,
                    rewatch_count: movie.rewatch_count || 0,
                    created_at: movie.created_at || new Date().toISOString()
                });

                imported++;
                statusDiv.textContent = `Importing... ${imported}/${total} (${failed} failed)`;

                // Small delay to avoid rate limiting
                if (imported % 30 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (e) {
                failed++;
                console.error('Failed to import movie:', movie.title, e);
            }
        }

        statusDiv.className = 'success';
        statusDiv.textContent = `✓ Successfully imported ${imported} movies! (${failed} failed)`;
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
        let failed = 0;
        const total = series.length;

        statusDiv.className = 'success';
        statusDiv.textContent = `Importing... 0/${total}`;

        for (const show of series) {
            try {
                const docId = `tv_${show.id.tvdb || show.id.imdb}`;

                let poster = 'https://via.placeholder.com/200x300?text=No+Image';
                let tmdbId = null;

                // Try IMDB lookup first
                if (show.id.imdb) {
                    try {
                        const searchUrl = `${TMDB_BASE_URL}/find/${show.id.imdb}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
                        const response = await fetch(searchUrl);
                        const data = await response.json();
                        if (data.tv_results && data.tv_results.length > 0) {
                            tmdbId = data.tv_results[0].id;
                            poster = data.tv_results[0].poster_path ? `${TMDB_IMG_BASE}${data.tv_results[0].poster_path}` : poster;
                        }
                    } catch (e) {
                        console.warn('TMDB lookup failed for:', show.title);
                    }
                }

                // If no IMDB result, try searching by title
                if (!tmdbId && show.title) {
                    try {
                        // Clean title - remove year in parentheses
                        const cleanTitle = show.title.replace(/\s*\(\d{4}\)\s*$/, '');
                        const searchUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`;
                        const response = await fetch(searchUrl);
                        const data = await response.json();
                        if (data.results && data.results.length > 0) {
                            tmdbId = data.results[0].id;
                            poster = data.results[0].poster_path ? `${TMDB_IMG_BASE}${data.results[0].poster_path}` : poster;
                        }
                    } catch (e) {
                        console.warn('TMDB search failed for:', show.title);
                    }
                }

                // Process seasons and episodes from your JSON
                let seasons = [];
                if (show.seasons && show.seasons.length > 0) {
                    seasons = show.seasons.map(season => ({
                        number: season.number,
                        is_specials: season.is_specials || false,
                        episodes: (season.episodes || []).map(ep => ({
                            number: ep.number,
                            name: ep.name || `Episode ${ep.number}`,
                            is_watched: ep.is_watched || false,
                            watched_at: ep.watched_at || null,
                            rewatch_count: ep.rewatch_count || 0,
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
                    poster: poster,
                    status: show.status || 'unknown',
                    is_favorite: show.is_favorite || false,
                    seasons: seasons,
                    created_at: show.created_at || new Date().toISOString()
                });

                imported++;
                statusDiv.textContent = `Importing... ${imported}/${total} (${failed} failed)`;

                // Small delay to avoid rate limiting
                if (imported % 20 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } catch (e) {
                failed++;
                console.error('Failed to import show:', show.title, e);
            }
        }

        statusDiv.className = 'success';
        statusDiv.textContent = `✓ Successfully imported ${imported} TV shows! (${failed} failed)`;
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
// Display Continue Watching
function displayContinueWatching() {
    const container = document.getElementById('continue-watching-list');
    
    // Get all TV shows that are in progress
    const inProgressShows = myList.filter(item => {
        if (item.type !== 'tv' || !item.seasons || item.seasons.length === 0) return false;
        
        // Check if there's at least one watched episode and at least one unwatched episode
        let hasWatched = false;
        let hasUnwatched = false;
        
        item.seasons.forEach(season => {
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
        container.innerHTML = '<p class="empty-state">No shows in progress. Start watching something!</p>';
        return;
    }
    
    // Sort by most recently watched
    inProgressShows.sort((a, b) => {
        const aLastWatched = getLastWatchedDate(a);
        const bLastWatched = getLastWatchedDate(b);
        return new Date(bLastWatched) - new Date(aLastWatched);
    });
    
    container.innerHTML = inProgressShows.map(show => {
        const nextEp = getNextEpisode(show);
        const progress = getShowProgress(show);
        const poster = show.poster && show.poster !== 'https://via.placeholder.com/200x300?text=No+Image'
            ? show.poster
            : 'https://via.placeholder.com/80x120?text=' + encodeURIComponent(show.title || 'No Image');
        
        return `
            <div class="continue-card">
                <img src="${poster}" alt="${show.title}" onerror="this.src='https://via.placeholder.com/80x120?text=No+Image'">
                <div class="continue-info">
                    <h3>${show.title}</h3>
                    ${nextEp ? `
                        <div class="next-episode">
                            <strong>Next:</strong> S${nextEp.season}E${nextEp.number} - ${nextEp.name}
                        </div>
                    ` : '<div class="next-episode">All caught up!</div>'}
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div style="font-size: 12px; color: #999; margin-bottom: 8px;">
                        ${progress.toFixed(0)}% complete
                    </div>
                    <div class="continue-actions">
                        ${nextEp ? `
                            <button class="quick-watch-btn" onclick="quickMarkWatched('${show.docId}', ${nextEp.season}, ${nextEp.number})">
                                ✓ Mark Watched
                            </button>
                        ` : ''}
                        <button class="view-details-btn" onclick="openDetails('${show.docId}', 'tv')">
                            View All Episodes
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Get next episode to watch
function getNextEpisode(show) {
    if (!show.seasons) return null;
    
    for (const season of show.seasons) {
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

// Get show progress percentage
function getShowProgress(show) {
    if (!show.seasons) return 0;
    
    let total = 0;
    let watched = 0;
    
    show.seasons.forEach(season => {
        if (season.episodes) {
            season.episodes.forEach(ep => {
                total++;
                if (ep.is_watched) watched++;
            });
        }
    });
    
    return total > 0 ? (watched / total) * 100 : 0;
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

// Quick mark episode as watched
async function quickMarkWatched(docId, seasonNum, episodeNum) {
    await toggleEpisode(docId, seasonNum, episodeNum);
    displayContinueWatching(); // Refresh the continue watching list
}
// Calendar cache
let calendarCache = {
    lastUpdated: null,
    data: { today: [], week: [], upcoming: [] }
};

// Load Calendar
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
    
    // Check cache (refresh every 6 hours)
    const cacheAge = calendarCache.lastUpdated ? Date.now() - calendarCache.lastUpdated : Infinity;
    const sixHours = 6 * 60 * 60 * 1000;
    
    if (!forceRefresh && cacheAge < sixHours && calendarCache.data.today.length + calendarCache.data.week.length + calendarCache.data.upcoming.length > 0) {
        displayCalendarSection(todayContainer, calendarCache.data.today, true);
        displayCalendarSection(weekContainer, calendarCache.data.week, false);
        displayCalendarSection(upcomingContainer, calendarCache.data.upcoming, false);
        return;
    }
    
    todayContainer.innerHTML = '<p class="empty-state">Checking your shows...</p>';
    weekContainer.innerHTML = '<p class="empty-state">Checking your shows...</p>';
    upcomingContainer.innerHTML = '<p class="empty-state">Checking your shows...</p>';
    
    const todayEpisodes = [];
    const weekEpisodes = [];
    const upcomingEpisodes = [];
    
    // Get all TV shows with TMDB IDs
    const tvShows = myList.filter(item => item.type === 'tv' && item.tmdb_id);
    
    let checked = 0;
    const total = tvShows.length;
    
    for (const show of tvShows) {
        try {
            checked++;
            todayContainer.innerHTML = `<p class="empty-state">Checking shows... ${checked}/${total}</p>`;
            
            // Get show details from TMDB
            const detailsUrl = `${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}`;
            const response = await fetch(detailsUrl);
            const details = await response.json();
            
            // Only process if show is still airing or returning
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
                        airDate: airDate,
                        airDateObj: new Date(airDate)
                    };
                    
                    if (airDate === todayStr) {
                        todayEpisodes.push(episode);
                    } else if (airDate > todayStr && airDate <= weekStr) {
                        weekEpisodes.push(episode);
                    } else if (airDate > weekStr && airDate <= monthStr) {
                        upcomingEpisodes.push(episode);
                    }
                }
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
            console.error('Error fetching calendar for:', show.title, error);
        }
    }
    
    // Cache results
    calendarCache = {
        lastUpdated: Date.now(),
        data: {
            today: todayEpisodes,
            week: weekEpisodes,
            upcoming: upcomingEpisodes
        }
    };
    
    // Display results
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
    
    // Sort by air date
    episodes.sort((a, b) => a.airDateObj - b.airDateObj);
    
    container.innerHTML = episodes.map(ep => {
        const poster = ep.poster && ep.poster !== 'https://via.placeholder.com/200x300?text=No+Image'
            ? ep.poster
            : 'https://via.placeholder.com/60x90?text=No+Image';
        
        const dateStr = formatAirDate(ep.airDateObj);
        
        return `
            <div class="calendar-item ${isToday ? 'airing-today' : ''}" onclick="openDetails('${ep.docId}', 'tv')" style="cursor: pointer;">
                <img src="${poster}" alt="${ep.show}" onerror="this.src='https://via.placeholder.com/60x90?text=No+Image'">
                <div class="calendar-item-info">
                    <h4>${ep.show}</h4>
                    <div class="episode-title">
                        S${ep.season}E${ep.episode} - ${ep.name}
                    </div>
                    <div class="air-date ${isToday ? 'today' : ''}">
                        📅 ${dateStr}
                        ${isToday ? '<span class="calendar-badge">Airing Today</span>' : ''}
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
    
    if (checkDate.getTime() === today.getTime()) {
        return 'Today';
    } else if (checkDate.getTime() === tomorrow.getTime()) {
        return 'Tomorrow';
    } else {
        const options = { weekday: 'short', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }
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
