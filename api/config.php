<?php
// config.php - Configuration and security headers

// Prevent direct access
if (!defined('API_ACCESS')) {
    define('API_ACCESS', true);
}

// Error reporting (disable in production)
ini_set('display_errors', '0');
error_reporting(E_ALL);
ini_set('log_errors', '1');
ini_set('error_log', dirname(__DIR__) . '/logs/php_errors.log');

// Create logs directory if not exists
$logsDir = dirname(__DIR__) . '/logs';
if (!is_dir($logsDir)) {
    @mkdir($logsDir, 0755, true);
}

// Security headers
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

// CORS headers - IMPORTANTE: In produzione, specifica il dominio esatto
$allowedOrigins = [
    'http://localhost',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://127.0.0.1',
    // Aggiungi qui il tuo dominio di produzione
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    // In sviluppo locale senza origine specifica
    header('Access-Control-Allow-Origin: *');
}

header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400');
header('Access-Control-Allow-Credentials: true');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Upload directory
if (!defined('UPLOAD_DIR')) {
    define('UPLOAD_DIR', dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR);
}

// Create upload directory if not exists
if (!is_dir(UPLOAD_DIR)) {
    if (!@mkdir(UPLOAD_DIR, 0755, true)) {
        error_log("Failed to create upload directory: " . UPLOAD_DIR);
    }
}

// Create .htaccess in upload directory for security
$htaccessPath = UPLOAD_DIR . '.htaccess';
if (!file_exists($htaccessPath)) {
    $htaccessContent = <<<HTACCESS
# Prevent PHP execution in upload directory
<FilesMatch "\.(php|php3|php4|php5|phtml|pl|py|jsp|asp|sh|cgi)$">
    Deny from all
</FilesMatch>

# Allow only images
<FilesMatch "\.(jpg|jpeg|png|gif)$">
    Allow from all
</FilesMatch>

# Prevent directory listing
Options -Indexes

# Security headers
Header set X-Content-Type-Options "nosniff"
Header set Content-Security-Policy "default-src 'none'; img-src 'self'"
HTACCESS;
    @file_put_contents($htaccessPath, $htaccessContent);
}

// Include helper functions
require_once __DIR__ . '/helpers.php';

// Rate limiting (simple implementation)
function checkRateLimit($identifier, $maxRequests = 100, $timeWindow = 3600) {
    $cacheFile = sys_get_temp_dir() . '/rate_limit_' . md5($identifier) . '.json';
    
    $now = time();
    $data = [];
    
    if (file_exists($cacheFile)) {
        $content = file_get_contents($cacheFile);
        $data = json_decode($content, true) ?: [];
    }
    
    // Clean old entries
    $data = array_filter($data, function($timestamp) use ($now, $timeWindow) {
        return ($now - $timestamp) < $timeWindow;
    });
    
    // Check limit
    if (count($data) >= $maxRequests) {
        logSecurityEvent('rate_limit_exceeded', ['identifier' => $identifier]);
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'Troppe richieste']);
        exit;
    }
    
    // Add current request
    $data[] = $now;
    file_put_contents($cacheFile, json_encode($data));
}

// Get client identifier for rate limiting
function getClientIdentifier() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
    return md5($ip . $userAgent);
}

// Apply rate limiting
checkRateLimit(getClientIdentifier());

// Clean old files daily (run randomly 1% of the time)
if (rand(1, 100) === 1) {
    cleanOldFiles(30 * 86400); // 30 days
}