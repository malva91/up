<?php
require_once 'config.php';

// Only allow DELETE requests
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo non consentito']);
    exit();
}

try {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['id']) || empty($input['id'])) {
        throw new Exception('ID immagine richiesto');
    }
    
    $imageId = (int)$input['id'];
    
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
    
    // Delete physical file
    $fullPath = __DIR__ . '/../' . $image['filepath'];
    if (file_exists($fullPath)) {
        unlink($fullPath);
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
        'error' => $e->getMessage()
    ]);
}
?>