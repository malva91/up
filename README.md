# 🖼️ Galleria Sincronizzata - Firebase + PHP

Una galleria di immagini real-time che combina Firebase Realtime Database per la sincronizzazione dello stato con un backend PHP/SQLite per la gestione delle immagini.

## 🏗️ Architettura

### Frontend
- **Vanilla JavaScript** con moduli ES6
- **Firebase Realtime Database** per sincronizzazione stato (zoom, pan, immagine selezionata, colore sfondo)
- **CSS moderno** con design responsive e dark theme

### Backend
- **PHP** per upload e gestione immagini
- **SQLite** per database locale delle immagini
- **File system** per storage delle immagini

## 📁 Struttura File

```
/
├── index.html              # Interfaccia principale
├── css/style.css          # Stili completi
├── js/
│   ├── app.js             # Logica applicazione
│   └── firebase.js        # Configurazione Firebase
├── api/                   # Backend PHP
│   ├── config.php         # Configurazione database
│   ├── upload.php         # Upload immagini
│   ├── images.php         # Lista immagini
│   ├── delete.php         # Eliminazione immagini
│   └── gallery.db         # Database SQLite (auto-creato)
├── uploads/               # Directory immagini
│   └── .htaccess         # Protezione directory
├── .htaccess             # Configurazione Apache
└── README.md             # Documentazione
```

## 🚀 Installazione

### 1. Requisiti Server
- **PHP 7.4+** con estensioni:
  - PDO SQLite
  - GD o ImageMagick
  - FileInfo
- **Apache** con mod_rewrite abilitato
- **Permessi scrittura** su cartelle `api/` e `uploads/`

### 2. Configurazione Firebase
1. Crea un progetto su [Firebase Console](https://console.firebase.google.com)
2. Abilita **Realtime Database** con regole pubbliche:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
3. Aggiorna la configurazione in `js/firebase.js`

### 3. Deploy
1. Carica tutti i file sul server web
2. Assicurati che le cartelle abbiano i permessi corretti:
```bash
chmod 755 api/
chmod 755 uploads/
chmod 666 api/gallery.db  # (se esiste già)
```

## 🔧 Configurazione

### Limiti Upload
Modifica in `api/config.php`:
```php
define('MAX_FILE_SIZE', 15 * 1024 * 1024); // 15MB
define('ALLOWED_TYPES', ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);
```

### Database
Il database SQLite viene creato automaticamente al primo upload in `api/gallery.db`.

Schema tabella `images`:
```sql
CREATE TABLE images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    filepath TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    upload_time INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🎯 Funzionalità

### Sincronizzazione Real-time
- **Stato condiviso**: Tutti i client vedono la stessa immagine, zoom, pan e colore sfondo
- **Aggiornamenti istantanei**: Modifiche sincronizzate in tempo reale
- **Gestione conflitti**: Prevenzione loop infiniti durante la sincronizzazione

### Gestione Immagini
- **Upload multiplo**: Drag & drop o selezione file
- **Formati supportati**: JPG, PNG, GIF (max 15MB)
- **Eliminazione**: Rimozione immagini con conferma
- **Thumbnails**: Griglia responsive con anteprima

### Controlli Interattivi
- **Zoom**: Rotella mouse, pulsanti +/-, tasti +/-
- **Pan**: Trascinamento mouse
- **Navigazione**: Frecce tastiera per immagine precedente/successiva
- **Reset**: Ripristino vista predefinita
- **Colori sfondo**: Palette chroma key per video production

### Interfaccia
- **Design moderno**: Dark theme professionale
- **Responsive**: Ottimizzato per desktop e mobile
- **Animazioni**: Transizioni fluide e micro-interazioni
- **Notifiche**: Feedback visivo per azioni utente

## 🔒 Sicurezza

### Validazione File
- Controllo tipo MIME reale
- Limite dimensione file
- Estensioni consentite
- Prevenzione upload script

### Protezione Database
- File `.htaccess` blocca accesso diretto al database
- Prepared statements per prevenire SQL injection
- Validazione input lato server

### CORS
- Headers configurati per accesso cross-origin
- Restrizioni su metodi HTTP consentiti

## 🐛 Troubleshooting

### Errori Upload
1. **"Errore connessione database"**
   - Verifica permessi cartella `api/`
   - Controlla che PHP abbia estensione SQLite

2. **"Errore durante il salvataggio"**
   - Verifica permessi cartella `uploads/`
   - Controlla spazio disco disponibile

3. **"Formato file non supportato"**
   - Verifica che il file sia realmente un'immagine
   - Controlla estensione FileInfo PHP

### Errori Firebase
1. **"Errore connessione Firebase"**
   - Verifica configurazione in `js/firebase.js`
   - Controlla regole database Firebase
   - Verifica connessione internet

### Errori Server
1. **500 Internal Server Error**
   - Controlla log errori Apache/PHP
   - Verifica sintassi file PHP
   - Controlla permessi file

## 📊 Performance

### Ottimizzazioni Implementate
- **Lazy loading** per thumbnails
- **Compressione** file statici (gzip)
- **Cache** immagini lato browser
- **Debounce** aggiornamenti stato Firebase

### Monitoraggio
- Log errori in file PHP
- Console browser per debug JavaScript
- Network tab per performance upload

## 🔄 Backup

### Database
```bash
# Backup database SQLite
cp api/gallery.db backup/gallery_$(date +%Y%m%d).db
```

### Immagini
```bash
# Backup cartella uploads
tar -czf backup/uploads_$(date +%Y%m%d).tar.gz uploads/
```

## 📈 Estensioni Future

- [ ] Autenticazione utenti
- [ ] Organizzazione in album
- [ ] Ridimensionamento automatico immagini
- [ ] Watermark automatico
- [ ] API REST completa
- [ ] Interfaccia admin
- [ ] Statistiche utilizzo
- [ ] Integrazione CDN

## 📝 Licenza

Progetto open source per uso educativo e commerciale.

## 🤝 Supporto

Per problemi o domande, controlla:
1. Log errori server
2. Console browser
3. Configurazione Firebase
4. Permessi file system