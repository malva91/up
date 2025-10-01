<?php
require_once 'config.php';

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo non consentito']);
    exit();
}

try {
    if (!isset($_FILES['images']) || !is_array($_FILES['images']['name']) || empty($_FILES['images']['name'][0])) {
        throw new Exception('Nessun file caricato');
    }
    
    $pdo = getDatabase();
    if (!$pdo) {
        throw new Exception('Errore connessione database');
    }
    
    $uploadedFiles = [];
    $errors = [];
    
    $fileCount = count($_FILES['images']['name']);

    if ($fileCount > 20) {
        throw new Exception('Troppi file. Massimo 20 per volta');
    }

    for ($i = 0; $i < $fileCount; $i++) {
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
            continue;
        }
        
        $filename = generateFilename($file['name']);
        $filepath = UPLOAD_DIR . $filename;

        if (!move_uploaded_file($file['tmp_name'], $filepath)) {
            $errors[] = $file['name'] . ': Errore salvataggio';
            continue;
        }

        chmod($filepath, 0644);
        
        // Get file info
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $filepath);
        finfo_close($finfo);
        
        // Save to database
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
        
        $uploadedFiles[] = [
            'id' => $pdo->lastInsertId(),
            'filename' => $file['name'],
            'filepath' => getBaseUrl() . '/uploads/' . $filename,
            'storageRef' => $webPath,
            'uploadTime' => $uploadTime
        ];
    }
    
    // Prepare response
    $response = [
        'success' => true,
        'uploaded' => count($uploadedFiles),
        'files' => $uploadedFiles
    ];
    
    if (!empty($errors)) {
        $response['errors'] = $errors;
    }
    
    echo json_encode($response);
    
} catch (Exception $e) {
    error_log("Upload error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Errore durante il caricamento'
    ]);
}
?>