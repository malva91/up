<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database configuration
define('DB_PATH', __DIR__ . '/gallery.db');
define('UPLOAD_DIR', __DIR__ . '/../uploads/');
define('MAX_FILE_SIZE', 15 * 1024 * 1024); // 15MB
define('ALLOWED_TYPES', ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);

// Create uploads directory if it doesn't exist
if (!file_exists(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}

// Initialize SQLite database
function initDatabase() {
    try {
        $pdo = new PDO('sqlite:' . DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // Create images table if it doesn't exist
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
        
        return $pdo;
    } catch (PDOException $e) {
        error_log("Database error: " . $e->getMessage());
        return null;
    }
}

// Get database connection
function getDatabase() {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = initDatabase();
    }
    return $pdo;
}

// Validate uploaded file
function validateFile($file) {
    $errors = [];
    
    // Check for upload errors
    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errors[] = 'Errore durante il caricamento del file';
        return $errors;
    }
    
    // Check file size
    if ($file['size'] > MAX_FILE_SIZE) {
        $errors[] = 'File troppo grande. Massimo 15MB';
    }
    
    // Check file type
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    if (!in_array($mimeType, ALLOWED_TYPES)) {
        $errors[] = 'Formato file non supportato. Usa JPG, PNG o GIF';
    }
    
    return $errors;
}

// Generate unique filename
function generateFilename($originalName) {
    $extension = pathinfo($originalName, PATHINFO_EXTENSION);
    $timestamp = time();
    $random = bin2hex(random_bytes(8));
    return $timestamp . '_' . $random . '.' . $extension;
}

// Get base URL for file access
function getBaseUrl() {
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $path = dirname($_SERVER['REQUEST_URI']);
    return $protocol . '://' . $host . $path;
}
?>