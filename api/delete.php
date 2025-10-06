<?php
define('API_ACCESS', true);
require_once __DIR__ . '/config.php';

// Only allow DELETE requests
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    sendErrorResponse('Metodo non consentito', 405);
}

// Verify CSRF
if (!verifyCsrfToken()) {
    logSecurityEvent('csrf_verification_failed_delete');
    sendErrorResponse('Token CSRF non valido', 403);
}

try {
    // Get image ID from query string or request body
    $imageId = null;
    
    // Try query string first
    if (isset($_GET['id'])) {
        $imageId = $_GET['id'];
    } else {
        // Try request body
        $input = file_get_contents('php://input');
        $data = json_decode($input, true);
        
        if (isset($data['id'])) {
            $imageId = $data['id'];
        }
    }

    if (empty($imageId)) {
        throw new Exception('ID immagine richiesto');
    }

    // Sanitize image ID
    $imageId = sanitizeImageId($imageId);
    
    // Get database connection
    $pdo = getDatabase();
    if (!$pdo) {
        throw new Exception('Errore connessione database');
    }
    
    // Get image info before deletion
    $stmt = $pdo->prepare("SELECT id, filepath, filename FROM images WHERE id = ? OR filename = ?");
    $stmt->execute([$imageId, $imageId]);
    $image = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$image) {
        // Log attempt to delete non-existent image
        logSecurityEvent('delete_nonexistent_image', ['id' => $imageId]);
        throw new Exception('Immagine non trovata');
    }
    
    // Begin transaction
    $pdo->beginTransaction();
    
    try {
        // Delete from database first
        $deleteStmt = $pdo->prepare("DELETE FROM images WHERE id = ?");
        $deleteStmt->execute([$image['id']]);
        
        if ($deleteStmt->rowCount() === 0) {
            throw new Exception('Errore durante l\'eliminazione dal database');
        }
        
        // Commit transaction
        $pdo->commit();
        
        // Now delete the file
        try {
            $safeFilename = validateFilePath($image['filepath']);
            $fullPath = UPLOAD_DIR . $safeFilename;

            if (file_exists($fullPath) && is_file($fullPath)) {
                // Additional security check: ensure file is in upload directory
                $realPath = realpath($fullPath);
                $uploadDirReal = realpath(UPLOAD_DIR);
                
                if ($realPath && $uploadDirReal && strpos($realPath, $uploadDirReal) === 0) {
                    if (!unlink($fullPath)) {
                        error_log("Failed to delete file: $fullPath");
                        // Don't throw exception - database is already updated
                    }
                } else {
                    logSecurityEvent('path_traversal_attempt_delete', [
                        'filepath' => $image['filepath'],
                        'realpath' => $realPath
                    ]);
                }
            }
        } catch (Exception $e) {
            error_log("File deletion error: " . $e->getMessage());
            // Don't throw - database is already updated
        }
        
        sendJsonResponse([
            'success' => true,
            'message' => 'Immagine eliminata con successo',
            'id' => $image['id']
        ]);
        
    } catch (Exception $e) {
        // Rollback transaction on error
        $pdo->rollBack();
        throw $e;
    }
    
} catch (Exception $e) {
    error_log("Delete error: " . $e->getMessage());
    logSecurityEvent('delete_exception', ['error' => $e->getMessage()]);
    sendErrorResponse($e->getMessage(), 500);
}