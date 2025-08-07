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
        // Non fare controlli se stiamo caricando
        if (this.isUploading) {
            console.log('🔄 [POLLING] Skipping check - upload in progress');
            return;
        }
        
        try {
            console.log('🔄 [POLLING] Checking for updates...');
            // Check Firebase state
            const stateSnapshot = await get(stateRef);
            const currentFirebaseState = stateSnapshot.val();
            console.log('🔄 [POLLING] Current Firebase state:', currentFirebaseState);
            
            if (currentFirebaseState) {
                // Check if images version changed
                if (currentFirebaseState.imagesVersion && 
                    currentFirebaseState.imagesVersion !== this.lastKnownImagesVersion) {
                    console.log('🔄 [POLLING] Images version changed, reloading...', 
                        this.lastKnownImagesVersion, '->', currentFirebaseState.imagesVersion);
                    
                    console.log('🔄 [POLLING] Calling loadImages from polling...');
                    await this.loadImages();
                    this.lastKnownImagesVersion = currentFirebaseState.imagesVersion;
                    this.updateSyncIndicator('images', 'synced');
                    console.log('🔄 [POLLING] Images reloaded successfully');
                }
                
                this.updateSyncIndicator('firebase', 'connected');
                this.lastSyncTime = Date.now();
            } else {
                console.warn('🔄 [POLLING] No Firebase state found');
                this.updateSyncIndicator('firebase', 'error');
            }
            
        } catch (error) {
            console.error('🔄 [POLLING] Polling check error:', error);
            console.error('🔄 [POLLING] Error stack:', error.stack);
            // Solo mostra errore se non stiamo caricando
            if (!this.isUploading) {
                this.updateSyncIndicator('firebase', 'error');
            }
        }
    }
    
    updateSyncIndicator(type, status) {
        this.syncStatus[type] = status;
        this.syncStatus.lastUpdate = new Date().toLocaleTimeString();
        this.renderSyncStatus();
    }
    
    renderSyncStatus() {
        console.log('🔄 [RENDER_SYNC] renderSyncStatus called');
        console.log('🔄 [RENDER_SYNC] Current sync status:', this.syncStatus);
        console.log('🔄 [RENDER_SYNC] isUploading:', this.isUploading);
        
        const firebaseStatus = this.syncStatus.firebase;
        const imagesStatus = this.syncStatus.images;
        
        console.log('🔄 [RENDER_SYNC] Firebase status:', firebaseStatus, 'Images status:', imagesStatus);
        
        // Update main sync status
        let statusText = '';
        let statusColor = '';
        
        if (this.isUploading) {
            statusText = '📤 Caricamento in corso...';
            statusColor = 'var(--warning-color)';
            console.log('🔄 [RENDER_SYNC] Upload in progress status');
        } else if (firebaseStatus === 'connected' && imagesStatus === 'synced') {
            statusText = '🔥 Tutto sincronizzato';
            statusColor = 'var(--success-color)';
            console.log('🔄 [RENDER_SYNC] All synced status');
        } else if (firebaseStatus === 'connecting' || imagesStatus === 'checking') {
            statusText = '🔄 Controllo sincronizzazione...';
            statusColor = 'var(--primary-color)';
            console.log('🔄 [RENDER_SYNC] Checking sync status');
        } else {
            statusText = '❌ Errore sincronizzazione';
            statusColor = 'var(--error-color)';
            console.log('🔄 [RENDER_SYNC] Error sync status');
        }
        
        const syncElement = document.getElementById('syncStatus');
        if (syncElement) {
            console.log('🔄 [RENDER_SYNC] Updating sync element with:', statusText);
            syncElement.textContent = statusText;
            syncElement.style.color = statusColor;
        } else {
            console.error('🔄 [RENDER_SYNC] syncStatus element not found in DOM!');
        }
        
        // Update detailed status in status bar
        const detailedStatus = document.getElementById('detailedSyncStatus');
        if (detailedStatus) {
            if (this.isUploading) {
                console.log('🔄 [RENDER_SYNC] Updating detailed status for upload');
                detailedStatus.innerHTML = `
                    <span style="color: var(--warning-color)">📤 Upload in corso...</span>
                `;
                return;
            }
            
            console.log('🔄 [RENDER_SYNC] Updating detailed status for normal operation');
            detailedStatus.innerHTML = `
                Firebase: <span style="color: ${firebaseStatus === 'connected' ? 'var(--success-color)' : 'var(--error-color)'}">
                    ${firebaseStatus === 'connected' ? '✅' : '❌'}
                </span> | 
                Immagini: <span style="color: ${imagesStatus === 'synced' ? 'var(--success-color)' : 'var(--primary-color)'}">
                    ${imagesStatus === 'synced' ? '✅' : '🔄'}
                </span> | 
                Ultimo: ${this.syncStatus.lastUpdate || 'mai'}
            `;
        } else {
            console.error('🔄 [RENDER_SYNC] detailedSyncStatus element not found in DOM!');
        }
    }

    handleStateUpdate(newState) {
        console.log('🔥 [STATE_UPDATE] === handleStateUpdate START ===');
        console.log('🔥 [STATE_UPDATE] Received new state:', JSON.stringify(newState));
        console.log('🔥 [STATE_UPDATE] Current state:', JSON.stringify(this.currentState));
        console.log('🔥 [STATE_UPDATE] isUploading:', this.isUploading);
        console.log('🔥 [STATE_UPDATE] isDragging:', this.isDragging);
        console.log('🔥 [STATE_UPDATE] isSyncing:', this.isSyncing);

        // Convert Firebase state format to our format
        const formattedState = {
            selectedImage: newState.selectedImage || '',
            zoom: newState.zoom || 1,
            pan: newState.pan || { x: 0, y: 0 },
            backgroundColor: newState.backgroundColor || '#0000ff',
            imagesVersion: newState.imagesVersion || 0
        };

        const stateChanged = JSON.stringify(formattedState) !== JSON.stringify(this.currentState);
        console.log('🔥 [STATE_UPDATE] State changed:', stateChanged);

        // 🔄 Check for new images
        if (newState.imagesVersion && 
            newState.imagesVersion !== this.currentState.imagesVersion) {
            console.log('🔥 [STATE_UPDATE] 🖼️ Images version changed, updating lastKnownImagesVersion...');
            console.log('🔥 [STATE_UPDATE] Old version:', this.currentState.imagesVersion, 'New version:', newState.imagesVersion);
            this.lastKnownImagesVersion = newState.imagesVersion;
            this.updateSyncIndicator('images', 'syncing');
        }

        if (stateChanged && !this.isDragging) {
            console.log('🔥 [STATE_UPDATE] Applying new state from Firebase');
            this.isSyncing = true;
            this.currentState = formattedState;
            console.log('🔥 [STATE_UPDATE] Calling updateView...');
            this.updateView();
            this.isSyncing = false;
            console.log('🔥 [STATE_UPDATE] updateView completed, updating sync status...');
            this.updateSyncStatus('success');
        } else {
            console.log('🔥 [STATE_UPDATE] Not applying state - stateChanged:', stateChanged, 'isDragging:', this.isDragging);
        }
        console.log('🔥 [STATE_UPDATE] === handleStateUpdate END ===');
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
        
        // Header upload progress elements
        this.uploadProgress = document.getElementById('uploadProgress');
        this.progressText = document.getElementById('progressText');
        this.progressDetails = document.getElementById('progressDetails');
        this.progressBarFill = document.getElementById('progressBarFill');
        this.progressPercentage = document.getElementById('progressPercentage');
        
        // Custom modal elements
        this.customModal = document.getElementById('customModal');
        this.modalIcon = document.getElementById('modalIcon');
        this.modalTitle = document.getElementById('modalTitle');
        this.modalMessage = document.getElementById('modalMessage');
        this.modalCancel = document.getElementById('modalCancel');
        this.modalConfirm = document.getElementById('modalConfirm');
        
        // Inizializza la barra di progresso come nascosta
        if (this.uploadProgress) {
            this.uploadProgress.style.display = 'none';
            this.uploadProgress.classList.remove('show');
        }
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
        
        // Modal event listeners
        this.modalCancel.addEventListener('click', () => this.hideModal());
        this.customModal.addEventListener('click', (e) => {
            if (e.target === this.customModal) {
                this.hideModal();
            }
        });
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

        console.log('🚀 [UPLOAD] Starting upload process for', validFiles.length, 'files');
        console.log('🚀 [UPLOAD] Current state before upload:', JSON.stringify(this.currentState));
        console.log('🚀 [UPLOAD] Polling status before upload:', this.pollingInterval ? 'ACTIVE' : 'INACTIVE');
        
        this.isUploading = true;
        // Pausa il polling durante l'upload per evitare conflitti
        console.log('🚀 [UPLOAD] Stopping polling...');
        this.stopPolling();
        
        // Reset progress values before showing
        this.updateUploadProgress('Preparazione file...', 0);
        this.showUploadProgress();

        try {
            // Compress images before upload
            const compressedFiles = [];
            
            for (let i = 0; i < validFiles.length; i++) {
                const file = validFiles[i];
                console.log(`🚀 [UPLOAD] Compressing file ${i + 1}/${validFiles.length}: ${file.name}`);
                this.updateUploadProgress(
                    `Compressione ${i + 1} di ${validFiles.length}: ${file.name}`,
                    (i / validFiles.length) * 40
                );
                
                const compressedFile = await this.compressImage(file);
                compressedFiles.push(compressedFile);
            }
            
            // Update progress for upload phase
            this.updateUploadProgress(
                `Caricamento ${compressedFiles.length} file sul server...`,
                50
            );
            
            console.log('🚀 [UPLOAD] Starting PHP backend upload...');
            // Upload all files to PHP backend
            const uploadResult = await uploadImages(compressedFiles);
            console.log('🚀 [UPLOAD] PHP backend upload result:', uploadResult);
            
            this.updateUploadProgress(
                'Upload completato, aggiornamento galleria...',
                80
            );
            
            if (!uploadResult.success) {
                console.error('🚀 [UPLOAD] Upload failed:', uploadResult.error);
                throw new Error(uploadResult.error || 'Errore durante il caricamento');
            }
            
            console.log('🚀 [UPLOAD] Upload successful, reloading images...');
            this.updateUploadProgress(
                'Ricaricamento immagini...',
                90
            );
            
            // Reload images after successful upload
            console.log('🚀 [UPLOAD] Calling loadImages()...');
            await this.loadImages();
            console.log('🚀 [UPLOAD] loadImages() completed');

            this.updateUploadProgress(
                'Sincronizzazione con altri client...',
                95
            );

            console.log('🚀 [UPLOAD] Updating Firebase imagesVersion...');
            const newImagesVersion = Date.now();
            console.log('🚀 [UPLOAD] New imagesVersion:', newImagesVersion);
            
            // Notify other clients about new images
            const syncResult = await updateGalleryState({ imagesVersion: newImagesVersion });
            console.log('🚀 [UPLOAD] Firebase sync result:', syncResult);
            
            if (!syncResult.success) {
                console.error('🚀 [UPLOAD] Firebase sync failed:', syncResult.error);
                throw new Error('Errore sincronizzazione Firebase: ' + syncResult.error);
            }

            this.updateUploadProgress(
                'Completato!',
                100
            );

            console.log('🚀 [UPLOAD] Upload process completed successfully');
            this.updateStatus(`${compressedFiles.length} immagini caricate e compresse con successo`, 'success');
            
            if (uploadResult.errors && uploadResult.errors.length > 0) {
                console.warn('Upload warnings:', uploadResult.errors);
                this.showNotification(`Caricati ${uploadResult.uploaded} file con successo!`, 'success');
            }

        } catch (error) {
            console.error('🚀 [UPLOAD] Upload error:', error);
            console.error('🚀 [UPLOAD] Error stack:', error.stack);
            this.updateStatus('Errore durante il caricamento', 'error');
            this.showNotification('Errore durante il caricamento: ' + error.message, 'error');
        } finally {
            console.log('🚀 [UPLOAD] Upload process finished, cleaning up...');
            this.isUploading = false;
            // Hide progress after a short delay to show completion
            setTimeout(() => {
                this.hideUploadProgress();
            }, 1500);
            this.fileInput.value = '';
            // Riavvia il polling dopo l'upload
            setTimeout(() => {
                console.log('🚀 [UPLOAD] Restarting polling after upload...');
                this.startPolling();
            }, 2000);
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

    showUploadProgress() {
        console.log('📤 Showing upload progress');
        if (this.uploadProgress) {
            this.uploadProgress.style.display = 'block';
            // Force reflow before adding class
            this.uploadProgress.offsetHeight;
            this.uploadProgress.classList.add('show');
        }
    }

    hideUploadProgress() {
        console.log('📤 Hiding upload progress');
        if (this.uploadProgress) {
            this.uploadProgress.classList.remove('show');
            // Hide after animation completes
            setTimeout(() => {
                this.uploadProgress.style.display = 'none';
            }, 300);
        }
    }

    updateUploadProgress(text, percentage) {
        console.log('📊 Updating progress:', text, percentage + '%');
        
        if (this.progressDetails) {
            this.progressDetails.textContent = text;
        }
        if (this.progressBarFill) {
            this.progressBarFill.style.width = percentage + '%';
        }
        if (this.progressPercentage) {
            this.progressPercentage.textContent = Math.round(percentage) + '%';
        }
        
        // Update main progress text based on percentage
        let mainText = 'Caricamento in corso...';
        if (percentage < 40) {
            mainText = 'Compressione immagini...';
        } else if (percentage < 80) {
            mainText = 'Caricamento in corso...';
        } else if (percentage < 100) {
            mainText = 'Finalizzazione...';
        } else {
            mainText = 'Completato!';
        }
        
        if (this.progressText) {
            this.progressText.textContent = mainText;
        }
    }
    
    showModal(title, message, icon = '❓', confirmText = 'Conferma', cancelText = 'Annulla') {
        return new Promise((resolve) => {
            this.modalTitle.textContent = title;
            this.modalMessage.textContent = message;
            this.modalIcon.textContent = icon;
            this.modalConfirm.textContent = confirmText;
            this.modalCancel.textContent = cancelText;
            
            this.customModal.classList.add('show');
            
            const handleConfirm = () => {
                this.hideModal();
                this.modalConfirm.removeEventListener('click', handleConfirm);
                resolve(true);
            };
            
            const handleCancel = () => {
                this.hideModal();
                this.modalCancel.removeEventListener('click', handleCancel);
                resolve(false);
            };
            
            this.modalConfirm.addEventListener('click', handleConfirm);
            this.modalCancel.addEventListener('click', handleCancel);
        });
    }
    
    hideModal() {
        this.customModal.classList.remove('show');
    }

    async loadImages() {
        try {
            console.log('📸 [LOAD_IMAGES] Starting loadImages...');
            console.log('📸 [LOAD_IMAGES] isUploading:', this.isUploading);
            this.updateSyncIndicator('images', 'loading');
            
            console.log('📸 [LOAD_IMAGES] Calling fetchImages()...');
            const result = await fetchImages();
            console.log('📸 [LOAD_IMAGES] fetchImages result:', result);
            
            if (result.success) {
                this.images = result.images || [];
                console.log('📸 [LOAD_IMAGES] Loaded images:', this.images.length, 'images');
                this.images.forEach(img => {
                    console.log('📸 [LOAD_IMAGES] Image:', img.filename, 'URL:', img.filepath);
                });
                this.updateSyncIndicator('images', 'synced');
            } else {
                console.error('📸 [LOAD_IMAGES] fetchImages failed:', result.error);
                throw new Error(result.error || 'Errore nel caricamento immagini');
            }
            
            console.log('📸 [LOAD_IMAGES] Rendering thumbnails...');
            this.renderThumbnails();
            console.log('📸 [LOAD_IMAGES] Updating image count...');
            this.updateImageCount();
            console.log('📸 [LOAD_IMAGES] loadImages completed successfully');

        } catch (error) {
            console.error('📸 [LOAD_IMAGES] Error loading images:', error);
            console.error('📸 [LOAD_IMAGES] Error stack:', error.stack);
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
        const confirmed = await this.showModal(
            'Conferma eliminazione',
            `Sei sicuro di voler eliminare "${image.filename}"?`,
            '🗑️',
            'Elimina',
            'Annulla'
        );
        
        if (confirmed) {
            try {
                console.log('🗑️ Starting delete process for:', image.filename);
                // Pausa il polling durante l'eliminazione
                this.stopPolling();
                
                // Reset and show progress
                this.updateUploadProgress('Eliminazione in corso...', 0);
                this.showUploadProgress();
                
                const result = await deleteImage(image.id);
                
                this.updateUploadProgress('Aggiornamento galleria...', 60);
                
                if (result.success) {
                    // If deleted image was selected, clear selection
                    if (this.currentState.selectedImage === image.filepath) {
                        this.currentState.selectedImage = '';
                        this.updateUploadProgress('Aggiornamento selezione...', 80);
                        await updateGalleryState({ 
                            selectedImage: '',
                            imagesVersion: Date.now() 
                        });
                    } else {
                        this.updateUploadProgress('Sincronizzazione...', 80);
                        // Notify other clients about image deletion
                        await updateGalleryState({ imagesVersion: Date.now() });
                    }
                    
                    this.updateUploadProgress('Ricaricamento immagini...', 90);
                    // Reload images
                    await this.loadImages();
                    
                    this.updateUploadProgress('Completato!', 100);
                    
                    this.showNotification('Immagine eliminata con successo', 'success');
                } else {
                    throw new Error(result.error || 'Errore durante l\'eliminazione');
                }
                
            } catch (error) {
                console.error('Delete error:', error);
                this.showNotification('Errore durante l\'eliminazione', 'error');
            } finally {
                // Hide progress after a short delay
                setTimeout(() => {
                    this.hideUploadProgress();
                }, 1000);
                // Riavvia il polling dopo l'eliminazione
                setTimeout(() => {
                    this.startPolling();
                }, 1500);
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
            console.log('🖼️ Loading image:', this.currentState.selectedImage);
            this.currentImage.src = this.currentState.selectedImage;
            this.currentImage.style.display = 'block';
            this.noImage.style.display = 'none';

            this.currentImage.onload = () => {
                console.log('✅ Image loaded successfully');
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

            this.currentImage.onerror = () => {
                console.error('❌ Failed to load image:', this.currentState.selectedImage);
                this.showNotification('Errore nel caricamento dell\'immagine', 'error');
                // Try to reload images in case the URL changed
                setTimeout(() => {
                    this.loadImages();
                }, 1000);
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
        console.log('🔥 [SYNC_STATE] === syncState START ===');
        console.log('🔥 [SYNC_STATE] Syncing state to Firebase:', JSON.stringify(this.currentState));
        console.log('🔥 [SYNC_STATE] isUploading:', this.isUploading);
        console.log('🔥 [SYNC_STATE] isSyncing:', this.isSyncing);

        // Non sincronizzare durante l'upload per evitare conflitti
        if (this.isUploading) {
            console.log('🔥 [SYNC_STATE] Skipping sync during upload');
            return;
        }

        try {
            console.log('🔥 [SYNC_STATE] Updating sync status to syncing...');
            this.updateSyncStatus('syncing');
            console.log('🔥 [SYNC_STATE] Calling updateGalleryState...');
            const result = await updateGalleryState(this.currentState);
            console.log('🔥 [SYNC_STATE] updateGalleryState result:', result);

            if (result.success) {
                console.log('🔥 [SYNC_STATE] State synced successfully to Firebase');
                this.updateSyncStatus('success');
                return { success: true };
            } else {
                console.error('🔥 [SYNC_STATE] Firebase sync error:', result.error);
                this.updateSyncStatus('error');
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('🔥 [SYNC_STATE] Network error:', error);
            console.error('🔥 [SYNC_STATE] Error stack:', error.stack);
            this.updateSyncStatus('error');
            return { success: false, error: error.message };
        }
        console.log('🔥 [SYNC_STATE] === syncState END ===');
    }

    updateSyncStatus(status) {
        console.log('🔄 [SYNC_STATUS] updateSyncStatus called with:', status);
        const syncStatus = this.syncStatus;
        
        if (!syncStatus) {
            console.error('🔄 [SYNC_STATUS] syncStatus element not found!');
            return;
        }

        switch (status) {
            case 'success':
                console.log('🔄 [SYNC_STATUS] Setting success status');
                syncStatus.textContent = '🔥 Firebase Sync';
                syncStatus.style.color = 'var(--success-color)';
                break;
            case 'error':
                console.log('🔄 [SYNC_STATUS] Setting error status');
                syncStatus.textContent = '❌ Errore sync';
                syncStatus.style.color = 'var(--error-color)';
                break;
            case 'syncing':
                console.log('🔄 [SYNC_STATUS] Setting syncing status');
                syncStatus.textContent = '🔄 Sincronizzazione...';
                syncStatus.style.color = 'var(--primary-color)';
                break;
            default:
                console.warn('🔄 [SYNC_STATUS] Unknown status:', status);
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