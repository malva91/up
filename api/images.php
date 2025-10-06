<?php
define('API_ACCESS', true);
require_once __DIR__ . '/config.php';

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendErrorResponse('Metodo non consentito', 405);
}

try {
    // Get database connection
    $pdo = getDatabase();
    
    if (!$pdo) {
        // Fallback to file system if database is not available
        error_log("Database not available, using filesystem fallback");
        $images = getImagesFromFileSystem();
        sendJsonResponse([
            'success' => true,
            'images' => $images,
            'count' => count($images),
            'source' => 'filesystem'
        ]);
        exit;
    }
    
    // Get images from database
    $stmt = $pdo->prepare("
        SELECT 
            id,
            filename,
            original_name,
            filepath,
            file_size,
            mime_type,
            upload_time,
            created_at
        FROM images 
        ORDER BY upload_time DESC
    ");
    
    $stmt->execute();
    $images = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Verify files exist and build response
    $validImages = [];
    foreach ($images as $image) {
        try {
            $safeFilename = validateFilePath($image['filepath']);
            $fullPath = UPLOAD_DIR . $safeFilename;
            
            // Check if file exists
            if (!file_exists($fullPath)) {
                // File doesn't exist, mark for cleanup
                error_log("File not found: $fullPath, cleaning from database");
                $cleanupStmt = $pdo->prepare("DELETE FROM images WHERE id = ?");
                $cleanupStmt->execute([$image['id']]);
                continue;
            }
            
            // Build image URL
            $imageUrl = getBaseUrl() . '/uploads/' . $safeFilename;
            
            $validImages[] = [
                'id' => $image['id'],
                'name' => $image['original_name'] ?? $image['filename'],
                'filename' => $image['filename'],
                'url' => $imageUrl,
                'filepath' => $image['filepath'],
                'size' => (int)$image['file_size'],
                'mimeType' => $image['mime_type'],
                'uploadTime' => (int)$image['upload_time'],
                'createdAt' => $image['created_at']
            ];
            
        } catch (Exception $e) {
            error_log("Error processing image {$image['id']}: " . $e->getMessage());
            continue;
        }
    }
    
    sendJsonResponse([
        'success' => true,
        'images' => $validImages,
        'count' => count($validImages),
        'source' => 'database'
    ]);
    
} catch (Exception $e) {
    error_log("Images list error: " . $e->getMessage());
    
    // Fallback to filesystem
    try {
        $images = getImagesFromFileSystem();
        sendJsonResponse([
            'success' => true,
            'images' => $images,
            'count' => count($images),
            'source' => 'filesystem_fallback'
        ]);
    } catch (Exception $fallbackError) {
        sendErrorResponse('Errore nel recupero delle immagini', 500);
    }
}

/**
 * Fallback function to get images from filesystem
 * @return array List of images
 */
function getImagesFromFileSystem() {
    $images = [];
    
    if (!is_dir(UPLOAD_DIR)) {
        return $images;
    }
    
    $files = scandir(UPLOAD_DIR);
    
    foreach ($files as $file) {
        if ($file === '.' || $file === '..' || $file === '.htaccess') {
            continue;
        }
        
        $path = UPLOAD_DIR . $file;
        
        if (!is_file($path)) {
            continue;
        }
        
        // Verify it's an image
        $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif'];
        $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        
        if (!in_array($extension, $allowedExtensions)) {
            continue;
        }
        
        // Get file info
        $fileSize = filesize($path);
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $path);
        finfo_close($finfo);
        
        // Build image URL
        $imageUrl = getBaseUrl() . '/uploads/' . rawurlencode($file);
        
        $images[] = [
            'id' => $file, // Use filename as ID for filesystem mode
            'name' => $file,
            'filename' => $file,
            'url' => $imageUrl,
            'filepath' => 'uploads/' . $file,
            'size' => $fileSize,
            'mimeType' => $mimeType,
            'uploadTime' => filemtime($path)
        ];
    }
    
    // Sort by upload time (most recent first)
    usort($images, function($a, $b) {
        return $b['uploadTime'] - $a['uploadTime'];
    });
    
    return $images;
}