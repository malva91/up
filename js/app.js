import {
  database,
  ref,
  onValue,
  updateGalleryState,
  uploadImages,
  fetchImages,
  deleteImage,
  initializeDefaultState,
  stateRef
} from './firebase.js';

const state = {
  images: [],
  selectedImage: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  backgroundColor: '#0000ff',
  isDragging: false,
  dragStart: { x: 0, y: 0 }
};

const elements = {
  uploadArea: document.getElementById('uploadArea'),
  fileInput: document.getElementById('fileInput'),
  thumbnailsContainer: document.getElementById('thumbnailsContainer'),
  imageViewer: document.getElementById('imageViewer'),
  imageContainer: document.getElementById('imageContainer'),
  currentImage: document.getElementById('currentImage'),
  noImage: document.getElementById('noImage'),
  imageCount: document.getElementById('imageCount'),
  statusText: document.getElementById('statusText'),
  syncStatus: document.getElementById('syncStatus'),
  statusIndicator: document.getElementById('statusIndicator'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  zoomInfo: document.getElementById('zoomInfo'),
  resetView: document.getElementById('resetView'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  progressFill: document.getElementById('progressFill')
};

function applyTransform() {
  if (elements.currentImage && elements.currentImage.style.display !== 'none') {
    elements.currentImage.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
  }
}

function applyBackgroundColor() {
  if (elements.imageViewer) {
    elements.imageViewer.style.backgroundColor = state.backgroundColor;
  }
}

function updateZoomDisplay() {
  if (elements.zoomInfo) {
    elements.zoomInfo.textContent = `${Math.round(state.zoom * 100)}%`;
  }
}

function showImage(imageUrl) {
  if (!imageUrl) {
    elements.currentImage.style.display = 'none';
    elements.noImage.style.display = 'flex';
    return;
  }

  elements.currentImage.src = imageUrl;
  elements.currentImage.style.display = 'block';
  elements.noImage.style.display = 'none';
  applyTransform();
  applyBackgroundColor();
}

function renderThumbnails() {
  if (!elements.thumbnailsContainer) return;

  if (state.images.length === 0) {
    elements.thumbnailsContainer.innerHTML = `
      <div class="empty-gallery">
        <div class="empty-icon">📸</div>
        <p>Nessuna immagine caricata</p>
      </div>
    `;
    return;
  }

  elements.thumbnailsContainer.innerHTML = state.images.map(img => `
    <div class="thumbnail-card ${state.selectedImage === img.url ? 'active' : ''}" data-url="${img.url}">
      <img src="${img.url}" alt="${img.name}">
      <div class="thumbnail-overlay">
        <button class="thumbnail-delete" data-id="${img.id}" title="Elimina">🗑️</button>
      </div>
      <div class="thumbnail-name">${img.name}</div>
    </div>
  `).join('');

  elements.imageCount.textContent = state.images.length;

  document.querySelectorAll('.thumbnail-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.thumbnail-delete')) {
        const url = card.dataset.url;
        state.selectedImage = url;
        showImage(url);
        updateGalleryState({
          selectedImage: url,
          zoom: state.zoom,
          pan: state.pan,
          backgroundColor: state.backgroundColor
        });
        renderThumbnails();
      }
    });
  });

  document.querySelectorAll('.thumbnail-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!confirm('Eliminare questa immagine?')) return;

      const result = await deleteImage(id);
      if (result.success) {
        await loadImages();
        updateStatus('Immagine eliminata', 'success');
      } else {
        updateStatus('Errore eliminazione', 'error');
      }
    });
  });
}

async function loadImages() {
  const result = await fetchImages();
  if (result.success) {
    state.images = result.images || [];
    renderThumbnails();

    if (state.selectedImage) {
      const imageExists = state.images.some(img => img.url === state.selectedImage);
      if (imageExists) {
        showImage(state.selectedImage);
      } else {
        state.selectedImage = null;
        showImage(null);
      }
    }
  }
}

function setupFirebaseSync() {
  onValue(stateRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      state.selectedImage = data.selectedImage || null;
      state.zoom = data.zoom || 1;
      state.pan = data.pan || { x: 0, y: 0 };
      state.backgroundColor = data.backgroundColor || '#0000ff';

      showImage(state.selectedImage);
      updateZoomDisplay();
      applyBackgroundColor();
      updateColorPalette();

      elements.syncStatus.textContent = '🔥 Sincronizzato';
      elements.statusIndicator.className = 'status-indicator online';
    }
  }, (error) => {
    console.error('Firebase sync error:', error);
    elements.syncStatus.textContent = '❌ Errore sincronizzazione';
    elements.statusIndicator.className = 'status-indicator error';
  });
}

function setupUpload() {
  elements.uploadArea.addEventListener('click', () => {
    elements.fileInput.click();
  });

  elements.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.add('drag-over');
  });

  elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('drag-over');
  });

  elements.uploadArea.addEventListener('drop', async (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleUpload(files);
    }
  });

  elements.fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      await handleUpload(e.target.files);
    }
  });
}

async function handleUpload(files) {
  showLoading();
  elements.loadingText.textContent = 'Caricamento immagini...';

  const result = await uploadImages(files);

  hideLoading();

  if (result.success) {
    await loadImages();
    updateStatus(`${result.uploaded || files.length} immagini caricate`, 'success');
    elements.fileInput.value = '';
  } else {
    updateStatus(result.error || 'Errore caricamento', 'error');
  }
}

function setupControls() {
  elements.zoomIn.addEventListener('click', () => {
    state.zoom = Math.min(5, state.zoom + 0.25);
    applyTransform();
    updateZoomDisplay();
    syncState();
  });

  elements.zoomOut.addEventListener('click', () => {
    state.zoom = Math.max(0.1, state.zoom - 0.25);
    applyTransform();
    updateZoomDisplay();
    syncState();
  });

  elements.resetView.addEventListener('click', () => {
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    applyTransform();
    updateZoomDisplay();
    syncState();
  });

  elements.imageContainer.addEventListener('mousedown', (e) => {
    if (elements.currentImage.style.display === 'none') return;
    state.isDragging = true;
    state.dragStart = {
      x: e.clientX - state.pan.x,
      y: e.clientY - state.pan.y
    };
    elements.imageContainer.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    state.pan = {
      x: e.clientX - state.dragStart.x,
      y: e.clientY - state.dragStart.y
    };
    applyTransform();
  });

  document.addEventListener('mouseup', () => {
    if (state.isDragging) {
      state.isDragging = false;
      elements.imageContainer.style.cursor = 'grab';
      syncState();
    }
  });

  elements.imageContainer.addEventListener('wheel', (e) => {
    if (elements.currentImage.style.display === 'none') return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    state.zoom = Math.max(0.1, Math.min(5, state.zoom + delta));

    applyTransform();
    updateZoomDisplay();
    syncState();
  });
}

function setupColorPalette() {
  document.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', () => {
      const color = option.dataset.color;
      state.backgroundColor = color;
      applyBackgroundColor();
      updateColorPalette();
      syncState();
    });
  });
}

function updateColorPalette() {
  document.querySelectorAll('.color-option').forEach(option => {
    if (option.dataset.color === state.backgroundColor) {
      option.classList.add('active');
    } else {
      option.classList.remove('active');
    }
  });
}

function syncState() {
  updateGalleryState({
    selectedImage: state.selectedImage,
    zoom: state.zoom,
    pan: state.pan,
    backgroundColor: state.backgroundColor
  });
}

function updateStatus(message, type = 'info') {
  elements.statusText.textContent = message;
  elements.statusIndicator.className = `status-indicator ${type === 'success' ? 'online' : type === 'error' ? 'error' : 'info'}`;

  setTimeout(() => {
    elements.statusText.textContent = 'Pronto';
    elements.statusIndicator.className = 'status-indicator online';
  }, 3000);
}

function showLoading() {
  elements.loadingOverlay.style.display = 'flex';
}

function hideLoading() {
  elements.loadingOverlay.style.display = 'none';
}

function handleVisibilityChange() {
  if (!document.hidden) {
    console.log('Page visible again - reloading state');
    loadImages();

    onValue(stateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        state.selectedImage = data.selectedImage || null;
        state.zoom = data.zoom || 1;
        state.pan = data.pan || { x: 0, y: 0 };
        state.backgroundColor = data.backgroundColor || '#0000ff';

        showImage(state.selectedImage);
        updateZoomDisplay();
        applyBackgroundColor();
        updateColorPalette();
      }
    }, { onlyOnce: true });
  }
}

async function init() {
  try {
    updateStatus('Inizializzazione...', 'info');

    await initializeDefaultState();
    setupFirebaseSync();
    await loadImages();

    setupUpload();
    setupControls();
    setupColorPalette();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    updateStatus('Pronto', 'success');
    elements.syncStatus.textContent = '🔥 Connesso';

  } catch (error) {
    console.error('Initialization error:', error);
    updateStatus('Errore inizializzazione', 'error');
    elements.syncStatus.textContent = '❌ Errore';
  }
}

document.addEventListener('DOMContentLoaded', init);
