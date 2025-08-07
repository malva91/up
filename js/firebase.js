// firebase.js
// ------------------------------------------------------------
// Stand-alone ES-Module: browser-ready, no bundler required.
// Provides a tiny API for a Realtime-DB-backed image gallery.
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
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

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
const storage  = getStorage(app);

goOnline(database); // explicit network enable
console.info('🔥 Firebase initialised');

// ------------------------------------------------------------
// Database references
// ------------------------------------------------------------
const stateRef  = ref(database, 'gallery/state');
const imagesRef = ref(database, 'gallery/images');

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
 * Add a new image record to Realtime Database.
 * @param {Object} imageData Arbitrary metadata (e.g. caption, userId).
 */
async function addImage(imageData) {
  try {
    const newImageRef = push(imagesRef);
    await set(newImageRef, { ...imageData, uploadTime: serverTimestamp() });
    return { success: true, id: newImageRef.key };
  } catch (err) {
    console.error('Error adding image:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Upload a File/Blob to Cloud Storage and return its public URL.
 * @param {File|Blob} file File to upload.
 */
async function uploadImageToStorage(file) {
  try {
    const timestamp = Date.now();
    const filename  = `${timestamp}_${file.name}`;
    const imageRef  = storageRef(storage, `images/${filename}`);

    const snapshot    = await uploadBytes(imageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);

    return {
      success: true,
      filename: file.name,
      filepath: downloadURL,
      storagePath: snapshot.ref.fullPath
    };
  } catch (err) {
    console.error('Error uploading image:', err);
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
  storage,
  ref,
  set,
  get,
  onValue,
  push,
  serverTimestamp,

  // common references
  stateRef,
  imagesRef,

  // helper API
  updateGalleryState,
  addImage,
  uploadImageToStorage,
  initializeDefaultState
};