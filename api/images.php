<?php
require_once 'config.php';

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo non consentito']);
    exit();
}

try {
    $pdo = getDatabase();
    if (!$pdo) {
        throw new Exception('Errore connessione database');
    }
    
    $stmt = $pdo->prepare("
        SELECT id, filename, original_name, filepath, file_size, mime_type, upload_time, created_at
        FROM images
        ORDER BY upload_time DESC
        LIMIT 500
    ");
    
    $stmt->execute();
    $images = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Convert to format expected by frontend
    $formattedImages = [];
    $baseUrl = getBaseUrl();
    
    foreach ($images as $image) {
        try {
            $safeFilename = validateFilePath($image['filepath']);
            $fullPath = UPLOAD_DIR . $safeFilename;

            if (!file_exists($fullPath)) {
                continue;
            }

            $formattedImages[] = [
                'id' => (string)$image['id'],
                'filename' => htmlspecialchars($image['original_name'], ENT_QUOTES, 'UTF-8'),
                'filepath' => $baseUrl . '/uploads/' . urlencode($safeFilename),
                'storageRef' => $image['filepath'],
                'uploadTime' => (int)$image['upload_time'],
                'fileSize' => (int)$image['file_size'],
                'mimeType' => $image['mime_type'],
                'createdAt' => $image['created_at']
            ];
        } catch (Exception $e) {
            error_log("Image validation error: " . $e->getMessage());
            continue;
        }
    }
    
    echo json_encode([
        'success' => true,
        'images' => $formattedImages,
        'count' => count($formattedImages)
    ]);
    
} catch (Exception $e) {
    error_log("Images fetch error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Errore nel recupero immagini'
    ]);
}
?>