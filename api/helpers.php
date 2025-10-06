<?php
// helpers.php - Funzioni di utilità e sicurezza
// Deve essere incluso da tutti i file PHP dell'API

if (!defined('UPLOAD_DIR')) {
    define('UPLOAD_DIR', dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR);
}

/**
 * Get PDO database connection
 * @return PDO|null
 */
function getDatabase() {
    static $pdo = null;
    
    if ($pdo !== null) {
        return $pdo;
    }
    
    try {
        $dbPath = dirname(__DIR__) . '/database/gallery.db';
        $dbDir = dirname($dbPath);
        
        // Create directory if not exists
        if (!is_dir($dbDir)) {
            mkdir($dbDir, 0755, true);
        }
        
        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        
        // Create tables if not exist
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                filepath TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                upload_time INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        // Create index for faster queries
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_upload_time ON images(upload_time)");
        
        return $pdo;
        
    } catch (PDOException $e) {
        error_log("Database connection error: " . $e->getMessage());
        return null;
    }
}

/**
 * Sanitize image ID
 * @param mixed $id Image ID to sanitize
 * @return string Sanitized ID
 * @throws Exception if ID is invalid
 */
function sanitizeImageId($id) {
    if (empty($id)) {
        throw new Exception('ID vuoto');
    }
    
    // If numeric, return as string
    if (is_numeric($id)) {
        return (string)intval($id);
    }
    
    // If string, sanitize filename
    $id = basename($id);
    $id = preg_replace('/[^a-zA-Z0-9._-]/', '', $id);
    
    if (empty($id)) {
        throw new Exception('ID non valido');
    }
    
    return $id;
}

/**
 * Validate file path to prevent directory traversal
 * @param string $filepath File path to validate
 * @return string Safe filepath
 * @throws Exception if path is invalid
 */
function validateFilePath($filepath) {
    if (empty($filepath)) {
        throw new Exception('Percorso vuoto');
    }
    
    // Remove uploads/ prefix if present
    $filepath = str_replace('uploads/', '', $filepath);
    
    // Get basename only (no directories)
    $safeFilename = basename($filepath);
    
    // Additional security: check for path traversal attempts
    if (strpos($safeFilename, '..') !== false || 
        strpos($safeFilename, '/') !== false || 
        strpos($safeFilename, '\\') !== false) {
        throw new Exception('Percorso non valido');
    }
    
    return $safeFilename;
}

/**
 * Validate uploaded file
 * @param array $file File array from $_FILES
 * @return array Array of error messages (empty if valid)
 */
function validateFile($file) {
    $errors = [];
    
    // Check upload errors
    if ($file['error'] !== UPLOAD_ERR_OK) {
        switch ($file['error']) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                $errors[] = 'File troppo grande';
                break;
            case UPLOAD_ERR_PARTIAL:
                $errors[] = 'Upload parziale';
                break;
            case UPLOAD_ERR_NO_FILE:
                $errors[] = 'Nessun file';
                break;
            default:
                $errors[] = 'Errore upload';
        }
        return $errors;
    }
    
    // Validate file size
    $maxSize = 15 * 1024 * 1024; // 15MB
    if ($file['size'] <= 0 || $file['size'] > $maxSize) {
        $errors[] = 'Dimensione non valida (max 15MB)';
    }
    
    // Validate file extension
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif'];
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($extension, $allowedExtensions)) {
        $errors[] = 'Estensione non supportata';
    }
    
    // Validate MIME type
    $allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!in_array($file['type'], $allowedMimes)) {
        $errors[] = 'Tipo MIME non supportato';
    }
    
    // Validate actual file type using finfo
    if (file_exists($file['tmp_name'])) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $realMimeType = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        
        if (!in_array($realMimeType, $allowedMimes)) {
            $errors[] = 'Tipo file reale non valido';
        }
        
        // Additional check: verify it's actually an image
        $imageInfo = @getimagesize($file['tmp_name']);
        if ($imageInfo === false) {
            $errors[] = 'File non è un\'immagine valida';
        }
    }
    
    // Validate filename length
    if (strlen($file['name']) > 255) {
        $errors[] = 'Nome file troppo lungo';
    }
    
    // Check for suspicious content
    if (file_exists($file['tmp_name'])) {
        $content = file_get_contents($file['tmp_name'], false, null, 0, 1024);
        if (preg_match('/<\?php|<script|javascript:/i', $content)) {
            $errors[] = 'Contenuto sospetto rilevato';
        }
    }
    
    return $errors;
}

/**
 * Generate unique filename
 * @param string $originalName Original filename
 * @return string Unique filename
 */
function generateFilename($originalName) {
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    
    // Sanitize original name
    $safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', pathinfo($originalName, PATHINFO_FILENAME));
    $safeName = substr($safeName, 0, 50); // Limit length
    
    // Generate unique filename
    $timestamp = time();
    $random = bin2hex(random_bytes(8));
    
    return "{$safeName}_{$timestamp}_{$random}.{$extension}";
}

/**
 * Get base URL for the application
 * @return string Base URL
 */
function getBaseUrl() {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    $basePath = dirname(dirname($scriptName));
    
    if ($basePath === '/' || $basePath === '\\') {
        $basePath = '';
    }
    
    return $protocol . '://' . $host . $basePath;
}

/**
 * Send JSON response
 * @param mixed $data Data to send
 * @param int $statusCode HTTP status code
 */
function sendJsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send error response
 * @param string $message Error message
 * @param int $statusCode HTTP status code
 */
function sendErrorResponse($message, $statusCode = 500) {
    sendJsonResponse([
        'success' => false,
        'error' => $message
    ], $statusCode);
}

/**
 * Verify CSRF token (simple implementation)
 * In production, use a proper CSRF library
 */
function verifyCsrfToken() {
    // For now, just check origin header
    $origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    
    if (empty($origin)) {
        return true; // Allow if no origin (same-origin requests)
    }
    
    // Extract host from origin
    $originHost = parse_url($origin, PHP_URL_HOST);
    
    // In production, use whitelist of allowed origins
    return $originHost === $host;
}

/**
 * Clean old files from upload directory
 * @param int $maxAge Maximum age in seconds (default 30 days)
 */
function cleanOldFiles($maxAge = 2592000) {
    try {
        $pdo = getDatabase();
        if (!$pdo) return;
        
        $cutoffTime = time() - $maxAge;
        
        // Get old files from database
        $stmt = $pdo->prepare("SELECT id, filepath FROM images WHERE upload_time < ?");
        $stmt->execute([$cutoffTime]);
        $oldFiles = $stmt->fetchAll();
        
        foreach ($oldFiles as $file) {
            try {
                $safeFilename = validateFilePath($file['filepath']);
                $fullPath = UPLOAD_DIR . $safeFilename;
                
                if (file_exists($fullPath)) {
                    unlink($fullPath);
                }
                
                // Delete from database
                $deleteStmt = $pdo->prepare("DELETE FROM images WHERE id = ?");
                $deleteStmt->execute([$file['id']]);
                
            } catch (Exception $e) {
                error_log("Error cleaning file: " . $e->getMessage());
            }
        }
        
    } catch (Exception $e) {
        error_log("Error in cleanOldFiles: " . $e->getMessage());
    }
}

/**
 * Log security event
 * @param string $event Event description
 * @param array $context Additional context
 */
function logSecurityEvent($event, $context = []) {
    $logEntry = [
        'timestamp' => date('Y-m-d H:i:s'),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
        'event' => $event,
        'context' => $context
    ];
    
    error_log("SECURITY: " . json_encode($logEntry));
}