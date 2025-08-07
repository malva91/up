import {
    database, stateRef, updateGalleryState, uploadImages, fetchImages, deleteImage, initializeDefaultState, ref, onValue, get, update,
    } from './firebase.js';

class SyncGallery {
    constructor() {
        this.currentState = {
            selectedImage: '',
            zoom: 1,
            pan: { x: 0, y: 0 },
            backgroundColor: '#0000ff',
            imagesVersion: 0
        };

        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.images = [];
        this.isUploading = false;
        this.hasImageLoaded = false;
        this.isSyncing = false;
        this.stateListener = null;
        this.isInitialized = false;
        
        // Polling system
        this.pollingInterval = null;
        this.lastSyncTime = 0;
        this.syncCheckInterval = 500; // 0.5 seconds
        this.lastKnownImagesVersion = 0;
        
        // Sync status tracking
        this.syncStatus = {
            firebase: 'connecting',
            images: 'checking',
            lastUpdate: null
        };

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

            // Load initial data
            await this.loadImages();
            
            // Start polling system
            this.startPolling();

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
    startPolling() {
        console.log('🔄 Starting polling system every', this.syncCheckInterval, 'ms');
        
        this.pollingInterval = setInterval(async () => {
            await this.checkForUpdates();
        }, this.syncCheckInterval);
    }
    
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('⏹️ Polling stopped');
        }
    }
    
    async checkForUpdates() {
        try {
            // Check Firebase state
            const stateSnapshot = await get(stateRef);
            const currentFirebaseState = stateSnapshot.val();
            
            if (currentFirebaseState) {
                // Check if images version changed
                if (currentFirebaseState.imagesVersion && 
                    currentFirebaseState.imagesVersion !== this.lastKnownImagesVersion) {
                    console.log('📸 Images version changed, reloading...', 
                        this.lastKnownImagesVersion, '->', currentFirebaseState.imagesVersion);
                    
                    await this.loadImages();
                    this.lastKnownImagesVersion = currentFirebaseState.imagesVersion;
                    this.updateSyncIndicator('images', 'synced');
                }
                
                this.updateSyncIndicator('firebase', 'connected');
                this.lastSyncTime = Date.now();
            } else {
                this.updateSyncIndicator('firebase', 'error');
            }
            
        } catch (error) {
            console.error('Polling check error:', error);
            this.updateSyncIndicator('firebase', 'error');
        }
    }
    
    updateSyncIndicator(type, status) {
        this.syncStatus[type] = status;
        this.syncStatus.lastUpdate = new Date().toLocaleTimeString();
        this.renderSyncStatus();
    }
    
    renderSyncStatus() {
        const syncStatusElement = this.syncStatus;
        const firebaseStatus = this.syncStatus.firebase;
        const imagesStatus = this.syncStatus.images;
        
        // Update main sync status
        let statusText = '';
        let statusColor = '';
        
        if (firebaseStatus === 'connected' && imagesStatus === 'synced') {
            statusText = '🔥 Tutto sincronizzato';
            statusColor = 'var(--success-color)';
        } else if (firebaseStatus === 'connecting' || imagesStatus === 'checking') {
            statusText = '🔄 Controllo sincronizzazione...';
            statusColor = 'var(--primary-color)';
        } else {
            statusText = '❌ Errore sincronizzazione';
            statusColor = 'var(--error-color)';
        }
        
        const syncElement = document.getElementById('syncStatus');
        if (syncElement) {
            syncElement.textContent = statusText;
            syncElement.style.color = statusColor;
        }
        
        // Update detailed status in status bar
        const detailedStatus = document.getElementById('detailedSyncStatus');
        if (detailedStatus) {
            detailedStatus.innerHTML = `
                Firebase: <span style="color: ${firebaseStatus === 'connected' ? 'var(--success-color)' : 'var(--error-color)'}">
                    ${firebaseStatus === 'connected' ? '✅' : '❌'}
                </span> | 
                Immagini: <span style="color: ${imagesStatus === 'synced' ? 'var(--success-color)' : 'var(--primary-color)'}">
                    ${imagesStatus === 'synced' ? '✅' : '🔄'}
                </span> | 
                Ultimo: ${this.syncStatus.lastUpdate || 'mai'}
            `;
        }
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
            backgroundColor: newState.backgroundColor || '#0000ff',
            imagesVersion: newState.imagesVersion || 0
        };

        const stateChanged = JSON.stringify(formattedState) !== JSON.stringify(this.currentState);
        console.log('State changed:', stateChanged, 'isDragging:', this.isDragging);

        // 🔄 Check for new images
        if (newState.imagesVersion && 
            newState.imagesVersion !== this.currentState.imagesVersion) {
            console.log('🖼️ Images version changed, reloading images...');
            this.lastKnownImagesVersion = newState.imagesVersion;
            this.updateSyncIndicator('images', 'syncing');
        }

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
    // Image compression utility
    async compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Calculate new dimensions
                let { width, height } = img;
                
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    // Create new file with compressed data
                    const compressedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    
                    console.log(`📦 Compressed ${file.name}: ${(file.size / 1024).toFixed(1)}KB -> ${(compressedFile.size / 1024).toFixed(1)}KB`);
                    resolve(compressedFile);
                }, file.type, quality);
            };
            
            img.src = URL.createObjectURL(file);
        });
    }

    async handleFiles(files) {
        if (this.isUploading) return;

        const validFiles = Array.from(files).filter(file => this.isValidImage(file));
        if (validFiles.length === 0) return;

        this.isUploading = true;
        this.showLoadingOverlay();

        try {
            // Compress images before upload
            const compressedFiles = [];
            
            for (let i = 0; i < validFiles.length; i++) {
                const file = validFiles[i];
                this.updateLoadingProgress(
                    `Compressione ${i + 1} di ${validFiles.length}: ${file.name}`,
                    (i / validFiles.length) * 100
                );
                
                const compressedFile = await this.compressImage(file);
                compressedFiles.push(compressedFile);
            }
            
            // Upload compressed files
            for (let i = 0; i < compressedFiles.length; i++) {
                const file = compressedFiles[i];
                this.updateLoadingProgress(
                    `Caricamento ${i + 1} di ${compressedFiles.length}: ${file.name}`,
                    50 + (i / compressedFiles.length) * 50
                );
            }
            
            // Upload all files to PHP backend
            const uploadResult = await uploadImages(compressedFiles);
            
            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'Errore durante il caricamento');
            }
            
            // Reload images after successful upload
            await this.loadImages();

            // Notify other clients about new images
            await updateGalleryState({ imagesVersion: Date.now() });

            this.updateStatus(`${compressedFiles.length} immagini caricate e compresse con successo`, 'success');
            
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
            this.updateSyncIndicator('images', 'loading');
            
            const result = await fetchImages();
            
            if (result.success) {
                this.images = result.images || [];
                this.updateSyncIndicator('images', 'synced');
            } else {
                throw new Error(result.error || 'Errore nel caricamento immagini');
            }
            
            this.renderThumbnails();
            this.updateImageCount();

        } catch (error) {
            console.error('Error loading images:', error);
            this.updateStatus('Errore nel caricamento immagini', 'error');
            this.updateSyncIndicator('images', 'error');
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
            
            // Add delete button for each thumbnail
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'thumbnail-delete';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Elimina immagine';
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
        if (confirm(`Sei sicuro di voler eliminare "${image.filename}"?`)) {
            try {
                this.showLoadingOverlay();
                this.updateLoadingProgress('Eliminazione in corso...', 50);
                
                const result = await deleteImage(image.id);
                
                if (result.success) {
                    // If deleted image was selected, clear selection
                    if (this.currentState.selectedImage === image.filepath) {
                        this.currentState.selectedImage = '';
                        this.syncState();
                    }
                    
                    // Reload images
                    await this.loadImages();
                    
                    // Notify other clients about image deletion
                    await updateGalleryState({ imagesVersion: Date.now() });
                    
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
        
        // Stop polling
        this.stopPolling();

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