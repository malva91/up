import {
    database, stateRef, imagesRef, updateGalleryState, addImage, initializeDefaultState, ref, onValue, uploadImageToStorage,
    } from './firebase.js';

class SyncGallery {
    constructor() {
        this.currentState = {
            selectedImage: '',
            zoom: 1,
            pan: { x: 0, y: 0 },
            backgroundColor: '#0000ff'
        };

        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.images = [];
        this.isUploading = false;
        this.hasImageLoaded = false;
        this.isSyncing = false;
        this.stateListener = null;
        this.imagesListener = null;
        this.isInitialized = false;

        this.init();
    }

    async init() {
        this.setupElements();
        this.setupEventListeners();

        // Initialize Firebase and setup real-time listeners
        await this.initializeFirebase();

        this.updateStatus('Inizializzazione completata', 'success');
    }

    async initializeFirebase() {
        try {
            // Initialize default state
            await initializeDefaultState();

            // Setup real-time listeners
            this.setupStateListener();
            this.setupImagesListener();

            // Load initial data
            await this.loadImages();

            this.updateSyncStatus('success');
            this.isInitialized = true;

        } catch (error) {
            console.error('Firebase initialization error:', error);
            this.updateStatus('Errore connessione Firebase', 'error');
            this.updateSyncStatus('error');
        }
    }

    setupStateListener() {
        console.log('🔥 Setting up Firebase state listener');

        this.stateListener = onValue(stateRef, (snapshot) => {
            if (!this.isInitialized) return;

            const data = snapshot.val();
            if (data) {
                console.log('🔥 Firebase state update received:', data);
                this.handleStateUpdate(data);
            }
        }, (error) => {
            console.error('Firebase state listener error:', error);
            this.updateSyncStatus('error');
        });
    }

    setupImagesListener() {
        console.log('🔥 Setting up Firebase images listener');

        this.imagesListener = onValue(imagesRef, (snapshot) => {
            if (!this.isInitialized) return;

            const data = snapshot.val();
            const images = data ? Object.entries(data).map(([id, image]) => ({
                id,
                ...image
            })) : [];

            console.log('🔥 Firebase images update received:', images.length, 'images');
            this.images = images.sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0));
            this.renderThumbnails();
            this.updateImageCount();
        }, (error) => {
            console.error('Firebase images listener error:', error);
        });
    }

    handleStateUpdate(newState) {
        console.log('=== handleStateUpdate START ===');
        console.log('Received new state:', JSON.stringify(newState));
        console.log('Current state:', JSON.stringify(this.currentState));

        // Convert Firebase state format to our format
        const formattedState = {
            selectedImage: newState.selectedImage || '',
            zoom: newState.zoom || 1,
            pan: newState.pan || { x: 0, y: 0 },
            backgroundColor: newState.backgroundColor || '#0000ff'
        };

        const stateChanged = JSON.stringify(formattedState) !== JSON.stringify(this.currentState);
        console.log('State changed:', stateChanged, 'isDragging:', this.isDragging);

        if (stateChanged && !this.isDragging) {
            console.log('Applying new state from Firebase');
            this.isSyncing = true;
            this.currentState = formattedState;
            this.updateView();
            this.isSyncing = false;
            this.updateSyncStatus('success');
        }
        console.log('=== handleStateUpdate END ===');
    }

    setupElements() {
        this.imageViewer = document.getElementById('imageViewer');
        this.imageContainer = document.getElementById('imageContainer');
        this.currentImage = document.getElementById('currentImage');
        this.noImage = document.getElementById('noImage');
        this.thumbnailsContainer = document.getElementById('thumbnailsContainer');
        this.zoomInfo = document.getElementById('zoomInfo');
        this.statusText = document.getElementById('statusText');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.syncStatus = document.getElementById('syncStatus');
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.imageCount = document.getElementById('imageCount');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');
        this.progressFill = document.getElementById('progressFill');
    }

    setupEventListeners() {
        // Controlli zoom e reset
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
        document.getElementById('resetView').addEventListener('click', () => this.resetView());

        // Controlli colore
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const color = e.target.dataset.color;
                this.changeBackgroundColor(color);
            });
        });

        // Pan con mouse
        this.imageContainer.addEventListener('mousedown', this.startPan.bind(this));
        document.addEventListener('mousemove', this.handlePan.bind(this));
        document.addEventListener('mouseup', this.endPan.bind(this));

        // Upload
        this.setupUploadListeners();

        // Wheel zoom
        this.imageContainer.addEventListener('wheel', this.handleWheel.bind(this));

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard.bind(this));
    }

    setupUploadListeners() {
        // Click upload
        this.uploadArea.addEventListener('click', () => {
            if (!this.isUploading) {
                this.fileInput.click();
            }
        });

        this.fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Drag & drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', (e) => {
            if (!this.uploadArea.contains(e.relatedTarget)) {
                this.uploadArea.classList.remove('dragover');
            }
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        // Prevent default drag behaviors on document
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }

    async handleFiles(files) {
        if (this.isUploading) return;

        const validFiles = Array.from(files).filter(file => this.isValidImage(file));
        if (validFiles.length === 0) return;

        this.isUploading = true;
        this.showLoadingOverlay();

        try {
            for (let i = 0; i < validFiles.length; i++) {
                const file = validFiles[i];
                this.updateLoadingProgress(
                    `Caricamento ${i + 1} di ${validFiles.length}: ${file.name}`,
                    (i / validFiles.length) * 100
                );

                // Upload to Firebase Storage
                const uploadResult = await uploadImageToStorage(file);

                if (uploadResult.success) {
                    // Add to Firebase Database
                    await addImage({
                        filename: uploadResult.filename,
                        filepath: uploadResult.filepath,
                        storageRef: uploadResult.storageRef
                    });
                } else {
                    throw new Error(uploadResult.error);
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            this.updateStatus(`${validFiles.length} immagini caricate con successo`, 'success');

        } catch (error) {
            console.error('Upload error:', error);
            this.updateStatus('Errore durante il caricamento', 'error');
        } finally {
            this.isUploading = false;
            this.hideLoadingOverlay();
            this.fileInput.value = '';
        }
    }

    isValidImage(file) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        const maxSize = 15 * 1024 * 1024; // 15MB

        if (!validTypes.includes(file.type)) {
            this.showNotification('Formato non supportato. Usa JPG, PNG o GIF.', 'error');
            return false;
        }

        if (file.size > maxSize) {
            this.showNotification('File troppo grande. Massimo 15MB.', 'error');
            return false;
        }

        return true;
    }

    showLoadingOverlay() {
        this.loadingOverlay.style.display = 'flex';
        this.loadingOverlay.classList.add('fade-in');
    }

    hideLoadingOverlay() {
        this.loadingOverlay.style.display = 'none';
        this.loadingOverlay.classList.remove('fade-in');
    }

    updateLoadingProgress(text, percentage) {
        this.loadingText.textContent = text;
        this.progressFill.style.width = percentage + '%';
    }

    async loadImages() {
        try {
            const snapshot = await get(imagesRef);
            const data = snapshot.val();

            this.images = data ? Object.entries(data).map(([id, image]) => ({
                id,
                ...image
            })) : [];

            this.images.sort((a, b) => (b.uploadTime || 0) - (a.uploadTime || 0));
            this.renderThumbnails();
            this.updateImageCount();

        } catch (error) {
            console.error('Error loading images:', error);
            this.updateStatus('Errore nel caricamento immagini', 'error');
        }
    }

    renderThumbnails() {
        if (this.images.length === 0) {
            this.thumbnailsContainer.innerHTML = `
                <div class="empty-gallery">
                    <div class="empty-icon">📸</div>
                    <p>Nessuna immagine caricata</p>
                </div>
            `;
            return;
        }

        this.thumbnailsContainer.innerHTML = '';

        this.images.forEach((image, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'thumbnail';
            thumb.innerHTML = `<img src="${image.filepath}" alt="${image.filename}" loading="lazy">`;

            thumb.addEventListener('click', () => {
                this.selectImage(image.filepath);
                this.addThumbnailClickEffect(thumb);
            });

            thumb.style.animationDelay = `${index * 0.1}s`;
            thumb.classList.add('slide-up');

            this.thumbnailsContainer.appendChild(thumb);
        });
    }

    addThumbnailClickEffect(thumbnail) {
        thumbnail.style.transform = 'scale(0.95)';
        setTimeout(() => {
            thumbnail.style.transform = '';
        }, 150);
    }

    updateImageCount() {
        this.imageCount.textContent = this.images.length;
    }

    selectImage(filepath) {
        console.log('=== selectImage START ===', filepath);
        console.log('isSyncing flag:', this.isSyncing);

        // Reset hasImageLoaded flag when selecting a new image
        if (this.currentState.selectedImage !== filepath) {
            this.hasImageLoaded = false;
        }

        this.currentState.selectedImage = filepath;

        // NON resettare zoom e pan se stiamo sincronizzando
        if (!this.isSyncing) {
            console.log('Resetting zoom and pan for new image');
            this.currentState.zoom = 1;
            this.currentState.pan = { x: 0, y: 0 };
        } else {
            console.log('NOT resetting zoom/pan - syncing from Firebase');
        }

        this.updateView();

        // Solo sincronizza se non stiamo già sincronizzando
        if (!this.isSyncing) {
            console.log('Syncing state after image selection');
            this.syncState();
        } else {
            console.log('NOT syncing - already in sync mode');
        }

        if (!this.isSyncing) {
            this.showNotification('Immagine selezionata', 'info');
        }
        console.log('=== selectImage END ===');
    }

    updateView() {
        if (this.currentState.selectedImage) {
            this.currentImage.src = this.currentState.selectedImage;
            this.currentImage.style.display = 'block';
            this.noImage.style.display = 'none';

            this.currentImage.onload = () => {
                if (!this.isSyncing && !this.hasImageLoaded) {
                    console.log('Image loaded - calling fitImageToViewer (not syncing)');
                    this.fitImageToViewer();
                    this.hasImageLoaded = true;
                } else {
                    console.log('Image loaded - skipping fitImageToViewer (syncing from Firebase)');
                    this.calculateBaseScale();
                    this.updateImageTransform();
                }
            };

            this.updateImageTransform();
        } else {
            this.currentImage.style.display = 'none';
            this.noImage.style.display = 'flex';
        }

        this.imageViewer.style.backgroundColor = this.currentState.backgroundColor;

        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === this.currentState.backgroundColor);
        });

        document.querySelectorAll('.thumbnail').forEach((thumb, index) => {
            const isActive = this.images[index] && this.images[index].filepath === this.currentState.selectedImage;
            thumb.classList.toggle('active', isActive);
        });

        this.zoomInfo.textContent = Math.round(this.currentState.zoom * 100) + '%';
    }

    calculateBaseScale() {
        console.log('=== calculateBaseScale START ===');
        if (!this.currentImage.naturalWidth || !this.currentImage.naturalHeight) {
            console.log('No natural dimensions available');
            return;
        }

        const viewerWidth = this.imageViewer.clientWidth;
        const viewerHeight = this.imageViewer.clientHeight;
        const imageWidth = this.currentImage.naturalWidth;
        const imageHeight = this.currentImage.naturalHeight;

        console.log('Viewer dimensions:', viewerWidth, 'x', viewerHeight);
        console.log('Image natural dimensions:', imageWidth, 'x', imageHeight);

        const padding = 20;
        const scaleX = (viewerWidth - padding * 2) / imageWidth;
        const scaleY = (viewerHeight - padding * 2) / imageHeight;
        const baseScale = Math.min(scaleX, scaleY);

        console.log('Calculated scales - X:', scaleX, 'Y:', scaleY, 'Base:', baseScale);

        this.baseScale = baseScale;

        const finalWidth = imageWidth * baseScale;
        const finalHeight = imageHeight * baseScale;
        this.currentImage.style.width = finalWidth + 'px';
        this.currentImage.style.height = finalHeight + 'px';
        console.log('Final image size:', finalWidth, 'x', finalHeight);
        console.log('=== calculateBaseScale END ===');
    }

    fitImageToViewer() {
        console.log('=== fitImageToViewer START ===');
        if (!this.currentImage.naturalWidth || !this.currentImage.naturalHeight) return;

        this.calculateBaseScale();

        if (!this.isSyncing && !this.hasImageLoaded) {
            console.log('Resetting pan to center');
            this.currentState.pan = { x: 0, y: 0 };
        } else {
            console.log('NOT resetting pan - syncing from Firebase or image already loaded');
        }
        this.updateImageTransform();
        console.log('=== fitImageToViewer END ===');
    }

    updateImageTransform() {
        console.log('=== updateImageTransform START ===');
        console.log('Current state:', JSON.stringify(this.currentState));

        if (!this.baseScale) {
            console.log('No baseScale, centering image');
            this.currentImage.style.left = '50%';
            this.currentImage.style.top = '50%';
            this.currentImage.style.transform = 'translate(-50%, -50%)';
            return;
        }

        const zoomScale = this.currentState.zoom;
        console.log('Applying zoom scale:', zoomScale);
        console.log('Applying pan:', this.currentState.pan);

        const transform = `
            translate(-50%, -50%) 
            translate(${this.currentState.pan.x}px, ${this.currentState.pan.y}px) 
            scale(${zoomScale})
        `;

        console.log('Applied transform:', transform);
        this.currentImage.style.transform = transform;
        this.currentImage.style.left = '50%';
        this.currentImage.style.top = '50%';
        console.log('=== updateImageTransform END ===');
    }

    zoomIn() {
        console.log('=== zoomIn START ===');
        const oldZoom = this.currentState.zoom;
        this.currentState.zoom = Math.min(this.currentState.zoom * 1.2, 5);
        console.log('Zoom changed from', oldZoom, 'to', this.currentState.zoom);
        this.updateView();
        this.syncState();
        this.showNotification(`Zoom: ${Math.round(this.currentState.zoom * 100)}%`, 'info');
        console.log('=== zoomIn END ===');
    }

    zoomOut() {
        console.log('=== zoomOut START ===');
        const oldZoom = this.currentState.zoom;
        this.currentState.zoom = Math.max(this.currentState.zoom / 1.2, 0.1);
        console.log('Zoom changed from', oldZoom, 'to', this.currentState.zoom);
        this.updateView();
        this.syncState();
        this.showNotification(`Zoom: ${Math.round(this.currentState.zoom * 100)}%`, 'info');
        console.log('=== zoomOut END ===');
    }

    resetView() {
        console.log('=== resetView START ===');
        this.currentState.zoom = 1;
        this.currentState.pan = { x: 0, y: 0 };
        console.log('Reset to zoom=1, pan=(0,0)');
        this.updateView();
        this.syncState();
        this.showNotification('Vista ripristinata', 'info');
        console.log('=== resetView END ===');
    }

    handleWheel(e) {
        if (!this.currentState.selectedImage) return;

        e.preventDefault();

        console.log('=== handleWheel START ===');
        const oldZoom = this.currentState.zoom;
        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        this.currentState.zoom = Math.min(Math.max(this.currentState.zoom * delta, 0.1), 5);

        console.log('Wheel zoom from', oldZoom, 'to', this.currentState.zoom, 'delta:', delta);

        const rect = this.imageContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        console.log('Mouse position:', mouseX, mouseY);

        const zoomFactor = this.currentState.zoom / oldZoom;
        const oldPanX = this.currentState.pan.x;
        const oldPanY = this.currentState.pan.y;

        this.currentState.pan.x = mouseX - (mouseX - oldPanX) * zoomFactor;
        this.currentState.pan.y = mouseY - (mouseY - oldPanY) * zoomFactor;

        console.log('Pan changed from', oldPanX, oldPanY, 'to', this.currentState.pan.x, this.currentState.pan.y);

        this.updateView();
        this.syncState();
        console.log('=== handleWheel END ===');
    }

    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT') return;

        switch (e.key) {
            case '+':
            case '=':
                e.preventDefault();
                this.zoomIn();
                break;
            case '-':
                e.preventDefault();
                this.zoomOut();
                break;
            case '0':
                e.preventDefault();
                this.resetView();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.navigateImage(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.navigateImage(1);
                break;
        }
    }

    navigateImage(direction) {
        if (this.images.length === 0) return;

        const currentIndex = this.images.findIndex(img => img.filepath === this.currentState.selectedImage);
        let newIndex;

        if (currentIndex === -1) {
            newIndex = 0;
        } else {
            newIndex = (currentIndex + direction + this.images.length) % this.images.length;
        }

        this.selectImage(this.images[newIndex].filepath);
    }

    startPan(e) {
        if (this.currentState.selectedImage && e.button === 0) {
            this.isDragging = true;
            this.dragStart = {
                x: e.clientX - this.currentState.pan.x,
                y: e.clientY - this.currentState.pan.y
            };
            this.imageContainer.style.cursor = 'grabbing';
        }
    }

    handlePan(e) {
        if (this.isDragging) {
            this.currentState.pan = {
                x: e.clientX - this.dragStart.x,
                y: e.clientY - this.dragStart.y
            };
            this.updateImageTransform();
        }
    }

    endPan() {
        if (this.isDragging) {
            this.isDragging = false;
            this.imageContainer.style.cursor = 'grab';
            this.syncState();
        }
    }

    changeBackgroundColor(color) {
        this.currentState.backgroundColor = color;
        this.updateView();
        this.syncState();
        this.showNotification('Colore sfondo cambiato', 'info');
    }

    async syncState() {
        console.log('=== syncState START ===');
        console.log('Syncing state to Firebase:', JSON.stringify(this.currentState));

        try {
            const result = await updateGalleryState(this.currentState);

            if (result.success) {
                console.log('State synced successfully to Firebase');
                this.updateSyncStatus('success');
            } else {
                console.error('Firebase sync error:', result.error);
                this.updateSyncStatus('error');
            }
        } catch (error) {
            console.error('Network error:', error);
            this.updateSyncStatus('error');
        }
        console.log('=== syncState END ===');
    }

    updateSyncStatus(status) {
        const syncStatus = this.syncStatus;

        switch (status) {
            case 'success':
                syncStatus.textContent = '🔥 Firebase Sync';
                syncStatus.style.color = 'var(--success-color)';
                break;
            case 'error':
                syncStatus.textContent = '❌ Errore sync';
                syncStatus.style.color = 'var(--error-color)';
                break;
            case 'syncing':
                syncStatus.textContent = '🔄 Sincronizzazione...';
                syncStatus.style.color = 'var(--primary-color)';
                break;
        }
    }

    updateStatus(message, type = 'info') {
        this.statusText.textContent = message;

        switch (type) {
            case 'success':
                this.statusIndicator.style.color = 'var(--success-color)';
                this.statusText.style.color = 'var(--text-primary)';
                break;
            case 'error':
                this.statusIndicator.style.color = 'var(--error-color)';
                this.statusText.style.color = 'var(--error-color)';
                break;
            case 'warning':
                this.statusIndicator.style.color = 'var(--warning-color)';
                this.statusText.style.color = 'var(--warning-color)';
                break;
            default:
                this.statusIndicator.style.color = 'var(--primary-color)';
                this.statusText.style.color = 'var(--text-primary)';
        }

        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                this.statusText.textContent = 'Pronto';
                this.statusIndicator.style.color = 'var(--success-color)';
                this.statusText.style.color = 'var(--text-primary)';
            }, 3000);
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '10000',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            maxWidth: '300px',
            wordWrap: 'break-word'
        });

        switch (type) {
            case 'success':
                notification.style.background = 'var(--success-color)';
                break;
            case 'error':
                notification.style.background = 'var(--error-color)';
                break;
            case 'warning':
                notification.style.background = 'var(--warning-color)';
                break;
            default:
                notification.style.background = 'var(--primary-color)';
        }

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    destroy() {
        // Remove Firebase listeners
        if (this.stateListener) {
            this.stateListener();
        }
        if (this.imagesListener) {
            this.imagesListener();
        }

        // Remove DOM event listeners
        document.removeEventListener('mousemove', this.handlePan);
        document.removeEventListener('mouseup', this.endPan);
        document.removeEventListener('keydown', this.handleKeyboard);
    }
}

// Inizializza l'applicazione quando la pagina è caricata
document.addEventListener('DOMContentLoaded', () => {
    window.gallery = new SyncGallery();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.gallery) {
        window.gallery.destroy();
    }
});