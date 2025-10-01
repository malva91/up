<?php
require_once 'config.php';

// Only allow DELETE requests
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo non consentito']);
    exit();
}

try {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['id'])) {
        throw new Exception('ID richiesto');
    }

    $imageId = sanitizeImageId($input['id']);
    
    $pdo = getDatabase();
    if (!$pdo) {
        throw new Exception('Errore connessione database');
    }
    
    // Get image info before deletion
    $stmt = $pdo->prepare("SELECT filepath FROM images WHERE id = ?");
    $stmt->execute([$imageId]);
    $image = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$image) {
        throw new Exception('Immagine non trovata');
    }
    
    // Delete from database
    $stmt = $pdo->prepare("DELETE FROM images WHERE id = ?");
    $stmt->execute([$imageId]);
    
    if ($stmt->rowCount() === 0) {
        throw new Exception('Errore durante l\'eliminazione dal database');
    }
    
    try {
        $safeFilename = validateFilePath($image['filepath']);
        $fullPath = UPLOAD_DIR . $safeFilename;

        if (file_exists($fullPath) && is_file($fullPath)) {
            if (!unlink($fullPath)) {
                error_log("Failed to delete file: $fullPath");
            }
        }
    } catch (Exception $e) {
        error_log("File deletion error: " . $e->getMessage());
    }
    
    echo json_encode([
        'success' => true,
        'message' => 'Immagine eliminata con successo'
    ]);
    
} catch (Exception $e) {
    error_log("Delete error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Errore durante l\'eliminazione'
    ]);
}
?>