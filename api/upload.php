<?php
define('API_ACCESS', true);
require_once __DIR__ . '/config.php';

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendErrorResponse('Metodo non consentito', 405);
}

// Verify CSRF
if (!verifyCsrfToken()) {
    logSecurityEvent('csrf_verification_failed');
    sendErrorResponse('Token CSRF non valido', 403);
}

try {
    // Check if files were uploaded
    if (!isset($_FILES['images']) || !is_array($_FILES['images']['name'])) {
        throw new Exception('Nessun file caricato');
    }
    
    // Check if at least one file exists
    if (empty($_FILES['images']['name'][0])) {
        throw new Exception('Array di file vuoto');
    }
    
    // Get database connection
    $pdo = getDatabase();
    if (!$pdo) {
        throw new Exception('Errore connessione database');
    }
    
    $uploadedFiles = [];
    $errors = [];
    $fileCount = count($_FILES['images']['name']);

    // Limit number of files
    if ($fileCount > 20) {
        throw new Exception('Troppi file. Massimo 20 per volta');
    }

    // Process each file
    for ($i = 0; $i < $fileCount; $i++) {
        // Build file array
        $file = [
            'name' => $_FILES['images']['name'][$i],
            'type' => $_FILES['images']['type'][$i],
            'tmp_name' => $_FILES['images']['tmp_name'][$i],
            'error' => $_FILES['images']['error'][$i],
            'size' => $_FILES['images']['size'][$i]
        ];
        
        // Skip empty files
        if (empty($file['name'])) {
            continue;
        }
        
        // Validate file
        $validationErrors = validateFile($file);
        if (!empty($validationErrors)) {
            $errors[] = $file['name'] . ': ' . implode(', ', $validationErrors);
            logSecurityEvent('file_validation_failed', [
                'filename' => $file['name'],
                'errors' => $validationErrors
            ]);
            continue;
        }
        
        // Generate unique filename
        $filename = generateFilename($file['name']);
        $filepath = UPLOAD_DIR . $filename;

        // Ensure upload directory exists and is writable
        if (!is_dir(UPLOAD_DIR)) {
            if (!mkdir(UPLOAD_DIR, 0755, true)) {
                throw new Exception('Impossibile creare directory upload');
            }
        }

        if (!is_writable(UPLOAD_DIR)) {
            throw new Exception('Directory upload non scrivibile');
        }

        // Move uploaded file
        if (!move_uploaded_file($file['tmp_name'], $filepath)) {
            $errors[] = $file['name'] . ': Errore salvataggio';
            logSecurityEvent('file_move_failed', ['filename' => $file['name']]);
            continue;
        }

        // Set proper permissions
        chmod($filepath, 0644);
        
        // Verify the uploaded file is a valid image (re-check after upload)
        $imageInfo = @getimagesize($filepath);
        if ($imageInfo === false) {
            unlink($filepath); // Delete invalid file
            $errors[] = $file['name'] . ': File non è un\'immagine valida';
            logSecurityEvent('invalid_image_uploaded', ['filename' => $filename]);
            continue;
        }
        
        // Get file info
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $filepath);
        finfo_close($finfo);
        
        // Double-check MIME type
        $allowedMimes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!in_array($mimeType, $allowedMimes)) {
            unlink($filepath);
            $errors[] = $file['name'] . ': Tipo MIME non valido dopo upload';
            logSecurityEvent('invalid_mime_after_upload', [
                'filename' => $filename,
                'mime' => $mimeType
            ]);
            continue;
        }
        
        // Save to database
        try {
            $stmt = $pdo->prepare("
                INSERT INTO images (filename, original_name, filepath, file_size, mime_type, upload_time)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            
            $webPath = 'uploads/' . $filename;
            $uploadTime = time();
            
            $stmt->execute([
                $filename,
                $file['name'],
                $webPath,
                $file['size'],
                $mimeType,
                $uploadTime
            ]);
            
            $imageId = $pdo->lastInsertId();
            
            $uploadedFiles[] = [
                'id' => $imageId,
                'filename' => $file['name'],
                'filepath' => getBaseUrl() . '/uploads/' . $filename,
                'storageRef' => $webPath,
                'uploadTime' => $uploadTime,
                'size' => $file['size'],
                'mimeType' => $mimeType
            ];
            
        } catch (PDOException $e) {
            // Database error - clean up uploaded file
            if (file_exists($filepath)) {
                unlink($filepath);
            }
            $errors[] = $file['name'] . ': Errore database';
            error_log("Database error during upload: " . $e->getMessage());
            continue;
        }
    }
    
    // Prepare response
    if (empty($uploadedFiles) && !empty($errors)) {
        throw new Exception('Nessun file caricato con successo: ' . implode('; ', $errors));
    }
    
    $response = [
        'success' => true,
        'uploaded' => count($uploadedFiles),
        'files' => $uploadedFiles,
        'message' => count($uploadedFiles) . ' file caricati con successo'
    ];
    
    if (!empty($errors)) {
        $response['errors'] = $errors;
        $response['partial'] = true;
    }
    
    // Log successful upload
    error_log("Upload successful: " . count($uploadedFiles) . " files");
    
    sendJsonResponse($response);
    
} catch (Exception $e) {
    error_log("Upload error: " . $e->getMessage());
    logSecurityEvent('upload_exception', ['error' => $e->getMessage()]);
    sendErrorResponse($e->getMessage(), 500);
}