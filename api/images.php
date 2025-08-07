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
    
    // Get all images ordered by upload time (newest first)
    $stmt = $pdo->prepare("
        SELECT id, filename, original_name, filepath, file_size, mime_type, upload_time, created_at
        FROM images 
        ORDER BY upload_time DESC
    ");
    
    $stmt->execute();
    $images = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Convert to format expected by frontend
    $formattedImages = [];
    $baseUrl = getBaseUrl();
    
    foreach ($images as $image) {
        $formattedImages[] = [
            'id' => (string)$image['id'],
            'filename' => $image['original_name'],
            'filepath' => $baseUrl . '/uploads/' . basename($image['filepath']),
            'storageRef' => $image['filepath'],
            'uploadTime' => (int)$image['upload_time'],
            'fileSize' => (int)$image['file_size'],
            'mimeType' => $image['mime_type'],
            'createdAt' => $image['created_at']
        ];
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
        'error' => $e->getMessage()
    ]);
}
?>