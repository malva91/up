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

        if (stateChanged && !this.isDragging && !this.isUploading) {
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
            
            if (result.success) {
                this.images = result.images || [];
            } else {
                throw new Error(result.error || 'Errore nel caricamento immagini');
            }
            
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
                const isActive = this.images[index] && this.images[index].filepath === this.currentState.selectedImage;
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
                this.currentState.pan = {
                    x: Math.max(-5000, Math.min(5000, e.clientX - this.dragStart.x)),
                    y: Math.max(-5000, Math.min(5000, e.clientY - this.dragStart.y))
                };
                this.updateImageTransform();
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
        if (this.isSyncing || this.isDragging) {
            return;
        }

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
        if (!message || typeof message !== 'string') {
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message.substring(0, 200);}

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