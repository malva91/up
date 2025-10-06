// firebase.js
// ------------------------------------------------------------
// Firebase module for state synchronization only.
// Image upload/management is handled by PHP backend.
// ------------------------------------------------------------

function parseJsonSafely(text) {
  // Try normal parse first
  try {
    return JSON.parse(text);
  } catch (e) {}
  // Attempt to recover by slicing between first '{' and last '}'
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const maybeJson = text.slice(start, end + 1);
    try {
      return JSON.parse(maybeJson);
    } catch (e) {}
  }
  console.error('API non ha restituito JSON puro. Anteprima:', (text || '').slice(0, 160));
  throw new Error("Risposta non-JSON dall'API");
}

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  push,
  serverTimestamp,
  goOnline
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

// ------------------------------------------------------------
// Firebase configuration (replace only if your keys differ).
// NOTE: storageBucket must end with ".appspot.com".
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: 'AIzaSyB6BLnLG19PqANrqChysxk8MFGJ-nkz6eA',
  authDomain: 'immaginiobs.firebaseapp.com',
  databaseURL: 'https://immaginiobs-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'immaginiobs',
  storageBucket: 'immaginiobs.appspot.com',
  messagingSenderId: '1010164088062',
  appId: '1:1010164088062:web:0c46be04f39fa8a2f0f9af',
  measurementId: 'G-K1WZB8TE47'
};

// ------------------------------------------------------------
// API base for backend PHP. Allows override via global variable.
// ------------------------------------------------------------
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || './api';

// ------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Explicitly enable network for Realtime Database
goOnline(database);
console.info('🔥 Firebase initialised');

// ------------------------------------------------------------
// Database references
// ------------------------------------------------------------
const stateRef  = ref(database, 'galleryCani/state');

// ------------------------------------------------------------
// Helper functions (public API)
// ------------------------------------------------------------

/**
 * Merge a partial gallery state into the existing one.
 * @param {Object} state Partial state to merge.
 */
async function updateGalleryState(state) {
  try {
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid state');
    }

    const sanitizedState = {
      selectedImage: String(state.selectedImage || ''),
      zoom: Math.max(0.1, Math.min(5, Number(state.zoom) || 1)),
      pan: {
        x: Number(state.pan?.x) || 0,
        y: Number(state.pan?.y) || 0
      },
      backgroundColor: String(state.backgroundColor || '#0000ff'),
      updatedAt: serverTimestamp()
    };

    await set(stateRef, sanitizedState);
    return { success: true };
  } catch (err) {
    console.error('Error updating state:', err);
    return { success: false, error: 'Sync failed' };
  }
}

/**
 * Upload images to PHP backend
 * @param {FileList} files Files to upload
 */
async function uploadImages(files) {
  try {
    if (!files || files.length === 0) {
      throw new Error('No files');
    }

    if (files.length > 20) {
      throw new Error('Too many files');
    }

    const formData = new FormData();

    for (let i = 0; i < files.length; i++) {
      if (files[i].size > 15 * 1024 * 1024) {
        throw new Error('File too large');
      }
      formData.append('images[]', files[i]);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${API_BASE}/upload.php`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeout);
    
    const text = await response.text();
    const result = parseJsonSafely(text);
    
    if (!response.ok || !result || result.success === false) {
      throw new Error(result?.error || `HTTP ${response.status}`);
    }
    return result;
  } catch (err) {
    console.error('Error uploading images:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch all images from PHP backend
 */
async function fetchImages() {
  try {
    const response = await fetch(`${API_BASE}/images.php`, { method: 'GET' });
    const text = await response.text();
    const data = parseJsonSafely(text);

    if (!response.ok || (data && data.success === false)) {
      return { success: false, error: data?.error || `HTTP ${response.status}` };
    }

    let imagesList = [];
    // data.images from our PHP API, or if an array is returned directly
    if (Array.isArray(data?.images)) {
      imagesList = data.images;
    } else if (Array.isArray(data)) {
      imagesList = data;
    }

    // Normalize to {id, name, url}
    const normalized = imagesList.map(img => ({
      id: (img.id !== undefined && img.id !== null) ? String(img.id) : (img.name || img.filename || ''),
      name: img.original_name || img.name || img.filename || '',
      url: img.filepath || img.url || ''
    }));

    return { success: true, images: normalized };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Timeout' };
    }
    console.error('Error fetching images:', err);
    return { success: false, error: 'Fetch failed' };
  }
}

/**
 * Delete an image from PHP backend
 * @param {string} imageId Image ID to delete
 */
async function deleteImage(id) {
  try {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid ID');
    }

    const response = await fetch(`${API_BASE}/delete.php`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id })
    });
    const text = await response.text();
    const data = parseJsonSafely(text);

    if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  } catch (err) {
    console.error('Error deleting image:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Initialise default gallery state if it doesn't exist yet.
 */
async function initializeDefaultState() {
  try {
    const snap = await get(stateRef);
    if (!snap.exists()) {
      await set(stateRef, {
        selectedImage: '',
        zoom: 1,
        pan: { x: 0, y: 0 },
        backgroundColor: '#0000ff',
        updatedAt: serverTimestamp()
      });
      console.info('✅ Default state initialised');
    } else {
      console.info('✅ State already present');
    }
  } catch (err) {
    console.error('Error initialising default state:', err);
  }
}

// ------------------------------------------------------------
// Exports
// ------------------------------------------------------------
export {
  // raw Firebase services
  database,
  ref,
  set,
  get,
  onValue,
  push,
  serverTimestamp,

  // common references
  stateRef,

  // helper API
  updateGalleryState,
  uploadImages,
  fetchImages,
  deleteImage,
  initializeDefaultState
};