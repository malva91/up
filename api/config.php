<?php
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database configuration
define('DB_PATH', __DIR__ . '/gallery.db');
define('UPLOAD_DIR', realpath(__DIR__ . '/../uploads/') . '/');
define('MAX_FILE_SIZE', 15 * 1024 * 1024);
define('ALLOWED_TYPES', ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'gif']);

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

    if (!isset($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
        $errors[] = 'File non valido';
        return $errors;
    }

    if ($file['error'] !== UPLOAD_ERR_OK) {
        $errors[] = 'Errore durante il caricamento';
        return $errors;
    }

    if ($file['size'] <= 0 || $file['size'] > MAX_FILE_SIZE) {
        $errors[] = 'Dimensione file non valida';
        return $errors;
    }

    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($extension, ALLOWED_EXTENSIONS)) {
        $errors[] = 'Estensione non supportata';
        return $errors;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if (!$finfo) {
        $errors[] = 'Impossibile verificare il file';
        return $errors;
    }

    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, ALLOWED_TYPES)) {
        $errors[] = 'Tipo file non supportato';
        return $errors;
    }

    $imageInfo = @getimagesize($file['tmp_name']);
    if ($imageInfo === false) {
        $errors[] = 'File non è un\'immagine valida';
        return $errors;
    }

    if ($imageInfo[0] > 10000 || $imageInfo[1] > 10000) {
        $errors[] = 'Dimensioni immagine eccessive';
        return $errors;
    }

    return $errors;
}

// Generate unique filename
function generateFilename($originalName) {
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if (!in_array($extension, ALLOWED_EXTENSIONS)) {
        $extension = 'jpg';
    }
    $timestamp = time();
    $random = bin2hex(random_bytes(16));
    return $timestamp . '_' . $random . '.' . $extension;
}

function sanitizeImageId($id) {
    $id = filter_var($id, FILTER_VALIDATE_INT);
    if ($id === false || $id <= 0) {
        throw new Exception('ID non valido');
    }
    return $id;
}

function validateFilePath($filepath) {
    $realUploadDir = realpath(UPLOAD_DIR);
    $realFilePath = realpath(dirname(UPLOAD_DIR . $filepath)) . '/' . basename($filepath);

    if (strpos($realFilePath, $realUploadDir) !== 0) {
        throw new Exception('Percorso non valido');
    }

    return basename($filepath);
}

// Get base URL for file access
function getBaseUrl() {
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $path = dirname(dirname($_SERVER['REQUEST_URI'])); // Go up one level from /api/
    return $protocol . '://' . $host . $path;
}
?>