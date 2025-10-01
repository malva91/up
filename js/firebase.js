// firebase.js
// ------------------------------------------------------------
// Firebase module for state synchronization only.
// Image upload/management is handled by PHP backend.
// ------------------------------------------------------------

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
// Initialisation
// ------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

goOnline(database); // explicit network enable
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
    await set(stateRef, { ...state, updatedAt: serverTimestamp() });
    return { success: true };
  } catch (err) {
    console.error('Error updating state:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Upload images to PHP backend
 * @param {FileList} files Files to upload
 */
async function uploadImages(files) {
  try {
    const formData = new FormData();
    
    // Add all files to FormData
    for (let i = 0; i < files.length; i++) {
      formData.append('images[]', files[i]);
    }
    
    const response = await fetch('./api/upload.php', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
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
    const response = await fetch('./api/images.php');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (err) {
    console.error('Error fetching images:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete an image from PHP backend
 * @param {string} imageId Image ID to delete
 */
async function deleteImage(imageId) {
  try {
    const response = await fetch('./api/delete.php', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: imageId })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
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