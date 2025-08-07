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
  update,
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
const stateRef  = ref(database, 'galleryPePPeTest/state');

// ------------------------------------------------------------
// Helper functions (public API)
// ------------------------------------------------------------

/**
 * Merge a partial gallery state into the existing one.
 * @param {Object} state Partial state to merge.
 */
async function updateGalleryState(state) {
  try {
    console.log('🔥 [FIREBASE] updateGalleryState called with:', JSON.stringify(state));
    console.log('🔥 [FIREBASE] stateRef path:', stateRef.toString());
    
    const stateWithTimestamp = { ...state, updatedAt: serverTimestamp() };
    console.log('🔥 [FIREBASE] Final state to update:', JSON.stringify(stateWithTimestamp));
    
    await update(stateRef, { ...state, updatedAt: serverTimestamp() });
    console.log('🔥 [FIREBASE] Firebase update completed successfully');
    return { success: true };
  } catch (err) {
    console.error('🔥 [FIREBASE] Error updating state:', err);
    console.error('🔥 [FIREBASE] Error code:', err.code);
    console.error('🔥 [FIREBASE] Error message:', err.message);
    console.error('🔥 [FIREBASE] Error stack:', err.stack);
    return { success: false, error: err.message };
  }
}

/**
 * Upload images to PHP backend
 * @param {FileList} files Files to upload
 */
async function uploadImages(files) {
  try {
    console.log('📤 [FIREBASE] uploadImages called with', files.length, 'files');
    const formData = new FormData();
    
    // Add all files to FormData
    for (let i = 0; i < files.length; i++) {
      console.log(`📤 [FIREBASE] Adding file ${i + 1}: ${files[i].name} (${files[i].size} bytes)`);
      formData.append('images[]', files[i]);
    }
    
    console.log('📤 [FIREBASE] Sending request to ./api/upload.php');
    const response = await fetch('./api/upload.php', {
      method: 'POST',
      body: formData
    });
    
    console.log('📤 [FIREBASE] Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      console.error('📤 [FIREBASE] HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('📤 [FIREBASE] Parsing JSON response...');
    const result = await response.json();
    console.log('📤 [FIREBASE] Upload result:', result);
    return result;
  } catch (err) {
    console.error('📤 [FIREBASE] Error uploading images:', err);
    console.error('📤 [FIREBASE] Error stack:', err.stack);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch all images from PHP backend
 */
async function fetchImages() {
  try {
    console.log('📥 [FIREBASE] fetchImages called');
    console.log('📥 [FIREBASE] Sending request to ./api/images.php');
    const response = await fetch('./api/images.php');
    
    console.log('📥 [FIREBASE] Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      console.error('📥 [FIREBASE] HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('📥 [FIREBASE] Parsing JSON response...');
    const result = await response.json();
    console.log('📥 [FIREBASE] Fetch result:', result);
    return result;
  } catch (err) {
    console.error('📥 [FIREBASE] Error fetching images:', err);
    console.error('📥 [FIREBASE] Error stack:', err.stack);
    return { success: false, error: err.message };
  }
}

/**
 * Delete an image from PHP backend
 * @param {string} imageId Image ID to delete
 */
async function deleteImage(imageId) {
  try {
    console.log('🗑️ [FIREBASE] deleteImage called with ID:', imageId);
    console.log('🗑️ [FIREBASE] Sending DELETE request to ./api/delete.php');
    const response = await fetch('./api/delete.php', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: imageId })
    });
    
    console.log('🗑️ [FIREBASE] Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      console.error('🗑️ [FIREBASE] HTTP error:', response.status, response.statusText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log('🗑️ [FIREBASE] Parsing JSON response...');
    const result = await response.json();
    console.log('🗑️ [FIREBASE] Delete result:', result);
    return result;
  } catch (err) {
    console.error('🗑️ [FIREBASE] Error deleting image:', err);
    console.error('🗑️ [FIREBASE] Error stack:', err.stack);
    return { success: false, error: err.message };
  }
}

/**
 * Initialise default gallery state if it doesn't exist yet.
 */
async function initializeDefaultState() {
  try {
    console.log('🔥 [FIREBASE] initializeDefaultState called');
    console.log('🔥 [FIREBASE] Checking if state exists...');
    const snap = await get(stateRef);
    console.log('🔥 [FIREBASE] State snapshot exists:', snap.exists());
    
    if (!snap.exists()) {
      console.log('🔥 [FIREBASE] Creating default state...');
      const defaultState = {
        selectedImage: '',
        zoom: 1,
        pan: { x: 0, y: 0 },
        backgroundColor: '#0000ff',
        imagesVersion: 0,
        updatedAt: serverTimestamp()
      };
      console.log('🔥 [FIREBASE] Default state:', JSON.stringify(defaultState));
      
      await set(stateRef, {
        selectedImage: '',
        zoom: 1,
        pan: { x: 0, y: 0 },
        backgroundColor: '#0000ff',
        imagesVersion: 0,
        updatedAt: serverTimestamp()
      });
      console.info('🔥 [FIREBASE] ✅ Default state initialised');
    } else {
      const existingState = snap.val();
      console.info('🔥 [FIREBASE] ✅ State already present:', JSON.stringify(existingState));
    }
  } catch (err) {
    console.error('🔥 [FIREBASE] Error initialising default state:', err);
    console.error('🔥 [FIREBASE] Error stack:', err.stack);
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
  update,

  // common references
  stateRef,

  // helper API
  updateGalleryState,
  uploadImages,
  fetchImages,
  deleteImage,
  initializeDefaultState
};