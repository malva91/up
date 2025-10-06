import {
    database, stateRef, updateGalleryState, uploadImages, fetchImages, deleteImage, initializeDefaultState, ref, onValue, get,
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
        this.isInitialized = false;

        // Throttle timers for sync to avoid flooding updates during drag or wheel
        this.panSyncTimeout = null;
        this.wheelSyncTimeout = null;

        // Prevent default drag behaviors handler
        this.preventDrag = (e) => e.preventDefault();

        // Pre-bind event handlers to preserve context
        this.startPan = this.startPan.bind(this);
        this.handlePan = this.handlePan.bind(this);
        this.endPan = this.endPan.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleKeyboard = this.handleKeyboard.bind(this);

        this.init();
    }

    async init() {
        this.setupElements();
        this.setupEventListeners();
        this.setupVisibilityListener();

        // Initialize Firebase and setup real-time listeners
        await this.initializeFirebase();

        this.updateStatus('Inizializzazione completata', 'success');
    }

    setupVisibilityListener() {
        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden && this.isInitialized) {
                console.log('🔄 Page visible again - resyncing...');
                await this.resyncOnVisibilityChange();
            }
        });

        window.addEventListener('focus', async () => {
            if (this.isInitialized) {
                console.log('🔄 Window focused - resyncing...');
                await this.resyncOnVisibilityChange();
            }
        });
    }

    async resyncOnVisibilityChange() {
        try {
            const snapshot = await get(stateRef);
            if (snapshot.exists()) {
                const data = snapshot.val();
                console.log('🔥 Resynced state:', data);
                this.handleStateUpdate(data);
            }
        } catch (error) {
            console.error('Resync error:', error);
        }
    }

    async initializeFirebase() {
        try {
            // Initialize default state
            await initializeDefaultState();

            // Setup real-time listeners
            this.setupStateListener();

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

    handleStateUpdate(newState) {
        if (!newState || typeof newState !== 'object') {
            console.warn('Invalid state received');
            return;
        }

        const formattedState = {
            selectedImage: String(newState.selectedImage || ''),
            zoom: Math.max(0.1, Math.min(5, Number(newState.zoom) || 1)),
            pan: {
                x: Number(newState.pan?.x) || 0,
                y: Number(newState.pan?.y) || 0
            },
            backgroundColor: String(newState.backgroundColor || '#0000ff')
        };

        const stateChanged = JSON.stringify(formattedState) !== JSON.stringify(this.currentState);

        // Apply remote state only if it differs and we are not currently syncing or dragging/uploading locally
        if (stateChanged && !this.isDragging && !this.isUploading && !this.isSyncing) {
            this.isSyncing = true;
            try {
                this.currentState = formattedState;
                this.updateView();
                this.updateSyncStatus('success');
            } catch (err) {
                console.error('Error updating view:', err);
                this.updateSyncStatus('error');
            } finally {
                this.isSyncing = false;
            }
        }
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

        // Pan con mouse (pre-bound handlers)
        this.imageContainer.addEventListener('mousedown', this.startPan);
        document.addEventListener('mousemove', this.handlePan);
        document.addEventListener('mouseup', this.endPan);

        // Upload
        this.setupUploadListeners();

        // Wheel zoom
        this.imageContainer.addEventListener('wheel', this.handleWheel);

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard);

        // Resync button
        const resyncBtn = document.getElementById('btn-resync');
        if (resyncBtn) {
            resyncBtn.addEventListener('click', () => {
                this.resyncGallery();
            });
        }
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
        document.addEventListener('dragover', this.preventDrag);
        document.addEventListener('drop', this.preventDrag);
    }

    async handleFiles(files) {
        if (this.isUploading) return;

        if (!files || files.length === 0) {
            this.showNotification('Nessun file selezionato', 'error');
            return;
        }

        if (files.length > 20) {
            this.showNotification('Massimo 20 file per volta', 'error');
            return;
        }

        const validFiles = Array.from(files).filter(file => this.isValidImage(file));
        if (validFiles.length === 0) {
            this.showNotification('Nessun file valido selezionato', 'error');
            return;
        }

        this.isUploading = true;
        this.showLoadingOverlay();

        try {
            for (let i = 0; i < validFiles.length; i++) {
                const file = validFiles[i];
                this.updateLoadingProgress(
                    `Caricamento ${i + 1} di ${validFiles.length}: ${file.name}`,
                    (i / validFiles.length) * 100
                );
            }
            
            // Upload all files to PHP backend
            const uploadResult = await uploadImages(validFiles);
            
            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'Errore durante il caricamento');
            }
            
            // Reload images after successful upload
            await this.loadImages();

            this.updateStatus(`${validFiles.length} immagini caricate con successo`, 'success');
            
            if (uploadResult.errors && uploadResult.errors.length > 0) {
                console.warn('Upload warnings:', uploadResult.errors);
                this.showNotification(`Caricati ${uploadResult.uploaded} file. Alcuni errori: ${uploadResult.errors.join(', ')}`, 'warning');
            }

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
        const validExtensions = ['jpg', 'jpeg', 'png', 'gif'];
        const maxSize = 15 * 1024 * 1024;

        if (!file || !file.name || !file.type || !file.size) {
            this.showNotification('File non valido', 'error');
            return false;
        }

        const extension = file.name.split('.').pop().toLowerCase();
        if (!validExtensions.includes(extension)) {
            this.showNotification(`Estensione ${extension} non supportata`, 'error');
            return false;
        }

        if (!validTypes.includes(file.type)) {
            this.showNotification('Tipo file non supportato', 'error');
            return false;
        }

        if (file.size <= 0 || file.size > maxSize) {
            this.showNotification('Dimensione file non valida', 'error');
            return false;
        }

        if (file.name.length > 255) {
            this.showNotification('Nome file troppo lungo', 'error');
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
            const result = await fetchImages();
            let images = [];

            // If result is an array, treat it as images directly
            if (Array.isArray(result)) {
                images = result;
            } else if (result && result.success) {
                images = Array.isArray(result.images) ? result.images : [];
            } else {
                throw new Error(result?.error || 'Errore nel caricamento immagini');
            }

            this.images = images;
            this.renderThumbnails();
            this.updateImageCount();

        } catch (error) {
            console.error('Error loading images:', error);
            this.updateStatus('Errore nel caricamento immagini', 'error');
        }
    }

    renderThumbnails() {
        if (!Array.isArray(this.images) || this.images.length === 0) {
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
            // Use url for image src and name for alt
            thumb.innerHTML = `<img src="${image.url}" alt="${image.name}" loading="lazy">`;

            thumb.addEventListener('click', () => {
                this.selectImage(image.url);
                this.addThumbnailClickEffect(thumb);
            });
            
            // Add delete button for each thumbnail
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'thumbnail-delete';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Elimina immagine';
            // Store id in dataset for debugging or potential external use
            deleteBtn.dataset.id = image.id;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteImageConfirm(image);
            });
            
            thumb.appendChild(deleteBtn);

            thumb.style.animationDelay = `${index * 0.1}s`;
            thumb.classList.add('slide-up');

            this.thumbnailsContainer.appendChild(thumb);
        });
    }

    async deleteImageConfirm(image) {
        if (confirm(`Sei sicuro di voler eliminare "${image.name}"?`)) {
            try {
                this.showLoadingOverlay();
                this.updateLoadingProgress('Eliminazione in corso...', 50);
                
                const result = await deleteImage(image.id);
                
                if (result.success) {
                    // If deleted image was selected, clear selection
                    if (this.currentState.selectedImage === image.url) {
                        this.currentState.selectedImage = '';
                        this.syncState();
                    }
                    
                    // Reload images
                    await this.loadImages();
                    this.showNotification('Immagine eliminata con successo', 'success');
                } else {
                    throw new Error(result.error || 'Errore durante l\'eliminazione');
                }
                
            } catch (error) {
                console.error('Delete error:', error);
                this.showNotification('Errore durante l\'eliminazione', 'error');
            } finally {
                this.hideLoadingOverlay();
            }
        }
    }

    /**
     * Risincronizza la galleria ricaricando le immagini dal backend e
     * aggiornando lo stato di visualizzazione.
     */
    async resyncGallery() {
        try {
            this.updateStatus('Risincronizzazione...', 'info');
            this.showLoadingOverlay();
            await this.loadImages();
            this.updateStatus('Risincronizzazione completata', 'success');
        } catch (err) {
            console.error('Resync error:', err);
            this.updateStatus('Errore risincronizzazione', 'error');
        } finally {
            this.hideLoadingOverlay();
        }
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
        if (!filepath || typeof filepath !== 'string') {
            console.warn('Invalid filepath');
            return;
        }

        if (this.currentState.selectedImage !== filepath) {
            this.hasImageLoaded = false;
        }

        this.currentState.selectedImage = filepath;

        if (!this.isSyncing) {
            this.currentState.zoom = 1;
            this.currentState.pan = { x: 0, y: 0 };
        }

        try {
            this.updateView();
        } catch (err) {
            console.error('Error updating view:', err);
            return;
        }

        if (!this.isSyncing) {
            this.syncState();
            this.showNotification('Immagine selezionata', 'info');
        }
    }

    updateView() {
        try {
            if (this.currentState.selectedImage) {
                const sanitizedSrc = this.currentState.selectedImage.replace(/[<>"']/g, '');
                this.currentImage.src = sanitizedSrc;
                this.currentImage.style.display = 'block';
                this.noImage.style.display = 'none';

                this.currentImage.onerror = () => {
                    console.error('Image load error');
                    this.currentImage.style.display = 'none';
                    this.noImage.style.display = 'flex';
                };

                this.currentImage.onload = () => {
                    try {
                        if (!this.isSyncing && !this.hasImageLoaded) {
                            this.fitImageToViewer();
                            this.hasImageLoaded = true;
                        } else {
                            this.calculateBaseScale();
                            this.updateImageTransform();
                        }
                    } catch (err) {
                        console.error('Error in image onload:', err);
                    }
                };

                this.updateImageTransform();
            } else {
                this.currentImage.style.display = 'none';
                this.noImage.style.display = 'flex';
            }

            const validColors = ['#00ff00', '#ff00ff', '#0000ff', '#ff0000', '#00ffff', '#ffff00', '#ffffff', '#000000', '#808080'];
            const bgColor = validColors.includes(this.currentState.backgroundColor) ? this.currentState.backgroundColor : '#0000ff';
            this.imageViewer.style.backgroundColor = bgColor;

            document.querySelectorAll('.color-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color === bgColor);
            });

            document.querySelectorAll('.thumbnail').forEach((thumb, index) => {
                const isActive = this.images[index] && this.images[index].url === this.currentState.selectedImage;
                thumb.classList.toggle('active', isActive);
            });

            const zoomPercent = Math.max(10, Math.min(500, Math.round(this.currentState.zoom * 100)));
            this.zoomInfo.textContent = zoomPercent + '%';
        } catch (err) {
            console.error('Error in updateView:', err);
        }
    }

    calculateBaseScale() {
        if (!this.currentImage.naturalWidth || !this.currentImage.naturalHeight) {
            return;
        }

        const viewerWidth = this.imageViewer.clientWidth || 800;
        const viewerHeight = this.imageViewer.clientHeight || 600;
        const imageWidth = this.currentImage.naturalWidth;
        const imageHeight = this.currentImage.naturalHeight;

        if (imageWidth <= 0 || imageHeight <= 0) {
            return;
        }

        const padding = 20;
        const scaleX = (viewerWidth - padding * 2) / imageWidth;
        const scaleY = (viewerHeight - padding * 2) / imageHeight;
        const baseScale = Math.max(0.01, Math.min(scaleX, scaleY, 5));

        this.baseScale = baseScale;

        const finalWidth = Math.max(10, imageWidth * baseScale);
        const finalHeight = Math.max(10, imageHeight * baseScale);
        this.currentImage.style.width = finalWidth + 'px';
        this.currentImage.style.height = finalHeight + 'px';
    }

    fitImageToViewer() {
        if (!this.currentImage.naturalWidth || !this.currentImage.naturalHeight) return;

        try {
            this.calculateBaseScale();

            if (!this.isSyncing && !this.hasImageLoaded) {
                this.currentState.pan = { x: 0, y: 0 };
            }
            this.updateImageTransform();
        } catch (err) {
            console.error('Error fitting image:', err);
        }
    }

    updateImageTransform() {
        try {
            if (!this.baseScale) {
                this.currentImage.style.left = '50%';
                this.currentImage.style.top = '50%';
                this.currentImage.style.transform = 'translate(-50%, -50%)';
                return;
            }

            const zoomScale = Math.max(0.1, Math.min(5, this.currentState.zoom));
            const panX = Math.max(-5000, Math.min(5000, this.currentState.pan.x));
            const panY = Math.max(-5000, Math.min(5000, this.currentState.pan.y));

            const transform = `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${zoomScale})`;

            this.currentImage.style.transform = transform;
            this.currentImage.style.left = '50%';
            this.currentImage.style.top = '50%';
        } catch (err) {
            console.error('Error in transform:', err);
        }
    }

    zoomIn() {
        try {
            this.currentState.zoom = Math.min(this.currentState.zoom * 1.2, 5);
            this.updateView();
            this.syncState();
            this.showNotification(`Zoom: ${Math.round(this.currentState.zoom * 100)}%`, 'info');
        } catch (err) {
            console.error('Zoom in error:', err);
        }
    }

    zoomOut() {
        try {
            this.currentState.zoom = Math.max(this.currentState.zoom / 1.2, 0.1);
            this.updateView();
            this.syncState();
            this.showNotification(`Zoom: ${Math.round(this.currentState.zoom * 100)}%`, 'info');
        } catch (err) {
            console.error('Zoom out error:', err);
        }
    }

    resetView() {
        try {
            this.currentState.zoom = 1;
            this.currentState.pan = { x: 0, y: 0 };
            this.updateView();
            this.syncState();
            this.showNotification('Vista ripristinata', 'info');
        } catch (err) {
            console.error('Reset view error:', err);
        }
    }

    handleWheel(e) {
        if (!this.currentState.selectedImage) return;

        e.preventDefault();

        try {
            const oldZoom = this.currentState.zoom;
            const delta = e.deltaY < 0 ? 1.1 : 0.9;
            this.currentState.zoom = Math.min(Math.max(this.currentState.zoom * delta, 0.1), 5);

            const rect = this.imageContainer.getBoundingClientRect();
            const mouseX = Math.max(-5000, Math.min(5000, e.clientX - rect.left - rect.width / 2));
            const mouseY = Math.max(-5000, Math.min(5000, e.clientY - rect.top - rect.height / 2));

            const zoomFactor = this.currentState.zoom / oldZoom;
            const oldPanX = this.currentState.pan.x;
            const oldPanY = this.currentState.pan.y;

            this.currentState.pan.x = Math.max(-5000, Math.min(5000, mouseX - (mouseX - oldPanX) * zoomFactor));
            this.currentState.pan.y = Math.max(-5000, Math.min(5000, mouseY - (mouseY - oldPanY) * zoomFactor));

            this.updateView();
            this.syncState();
        } catch (err) {
            console.error('Wheel zoom error:', err);
        }
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

        const currentIndex = this.images.findIndex(img => img.url === this.currentState.selectedImage);
        let newIndex;

        if (currentIndex === -1) {
            newIndex = 0;
        } else {
            newIndex = (currentIndex + direction + this.images.length) % this.images.length;
        }

        this.selectImage(this.images[newIndex].url);
    }

    startPan(e) {
        try {
            if (this.currentState.selectedImage && e.button === 0) {
                this.isDragging = true;
                this.dragStart = {
                    x: e.clientX - this.currentState.pan.x,
                    y: e.clientY - this.currentState.pan.y
                };
                this.imageContainer.style.cursor = 'grabbing';
            }
        } catch (err) {
            console.error('Start pan error:', err);
        }
    }

    handlePan(e) {
        try {
            if (this.isDragging) {
                // Update pan based on mouse movement
                this.currentState.pan = {
                    x: Math.max(-5000, Math.min(5000, e.clientX - this.dragStart.x)),
                    y: Math.max(-5000, Math.min(5000, e.clientY - this.dragStart.y))
                };
                // Apply transform immediately for responsive UX
                this.updateImageTransform();
                // Throttle sync: push updates to Firebase every 80ms while dragging
                if (this.panSyncTimeout) {
                    clearTimeout(this.panSyncTimeout);
                }
                this.panSyncTimeout = setTimeout(() => {
                    this.syncState();
                    this.panSyncTimeout = null;
                }, 80);
            }
        } catch (err) {
            console.error('Handle pan error:', err);
        }
    }

    endPan() {
        try {
            if (this.isDragging) {
                this.isDragging = false;
                this.imageContainer.style.cursor = 'grab';
                this.syncState();
            }
        } catch (err) {
            console.error('End pan error:', err);
        }
    }

    changeBackgroundColor(color) {
        try {
            const validColors = ['#00ff00', '#ff00ff', '#0000ff', '#ff0000', '#00ffff', '#ffff00', '#ffffff', '#000000', '#808080'];
            if (validColors.includes(color)) {
                this.currentState.backgroundColor = color;
                this.updateView();
                this.syncState();
                this.showNotification('Colore sfondo cambiato', 'info');
            }
        } catch (err) {
            console.error('Change color error:', err);
        }
    }

    async syncState() {
        // Avoid syncing while a previous sync is still in progress
        if (this.isSyncing) {
            return;
        }

        this.isSyncing = true;
        try {
            this.updateSyncStatus('syncing');

            const result = await updateGalleryState(this.currentState);

            if (result.success) {
                this.updateSyncStatus('success');
            } else {
                console.error('Sync error:', result.error);
                this.updateSyncStatus('error');
            }
        } catch (error) {
            console.error('Sync exception:', error);
            this.updateSyncStatus('error');
        } finally {
            this.isSyncing = false;
        }
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
  if (!message || typeof message !== 'string') return;

  // Contenitore (riutilizzabile)
  let container = document.getElementById('notif-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notif-container';
    Object.assign(container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      zIndex: 10000,
    });
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.setAttribute('role', 'status');
  notification.setAttribute('aria-live', 'polite');
  notification.textContent = message.substring(0, 200);

  Object.assign(notification.style, {
    padding: '12px 20px',
    borderRadius: '8px',
    color: '#fff',
    fontWeight: '500',
    maxWidth: '320px',
    overflowWrap: 'break-word', // meglio di wordWrap
    wordBreak: 'break-word',
    transform: 'translateX(110%)',
    transition: 'transform 0.3s ease',
    boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
  });

  // Colori con fallback
  const bgByType = {
    success: 'var(--success-color, #28a745)',
    error:   'var(--error-color, #dc3545)',
    warning: 'var(--warning-color, #ffc107)',
    info:    'var(--primary-color, #0d6efd)',
  };
  notification.style.background = bgByType[type] || bgByType.info;

  container.appendChild(notification);

  // Avvio animazione in modo affidabile
  requestAnimationFrame(() => {
    // forzo un reflow leggendo una proprietà
    void notification.offsetWidth;
    notification.style.transform = 'translateX(0)';
  });

  const hide = () => {
    notification.style.transform = 'translateX(110%)';
    setTimeout(() => {
      if (notification.parentNode) notification.parentNode.removeChild(notification);
      // Rimuovi il contenitore se vuoto
      if (container && container.childElementCount === 0 && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 300);
  };

  // Autohide
  const t = setTimeout(hide, 3000);

  // Chiudibile con click (opzionale)
  notification.addEventListener('click', () => {
    clearTimeout(t);
    hide();
  });
}


    destroy() {
        if (this.stateListener) {
            try {
                this.stateListener();
            } catch (err) {
                console.error('Error removing listener:', err);
            }
        }

        this.isDragging = false;
        this.isUploading = false;
        this.isSyncing = false;

        if (this.currentImage) {
            this.currentImage.onload = null;
            this.currentImage.onerror = null;
        }

        try {
            document.removeEventListener('mousemove', this.handlePan);
            document.removeEventListener('mouseup', this.endPan);
            document.removeEventListener('keydown', this.handleKeyboard);
            document.removeEventListener('dragover', this.preventDrag);
            document.removeEventListener('drop', this.preventDrag);
        } catch (err) {
            console.error('Error removing listeners:', err);
        }
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