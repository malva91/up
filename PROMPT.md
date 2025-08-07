# 🖼️ Firebase Real-time Gallery - Generation Prompt

## Project Description
Create a modern, real-time synchronized image gallery web application using Firebase Realtime Database and Storage. Multiple users can view and interact with the same gallery simultaneously with instant synchronization.

## Core Features
- **Real-time synchronization** across all connected clients
- **Image upload** with drag & drop support
- **Interactive viewer** with zoom, pan, and background color controls
- **Thumbnail gallery** with click selection
- **Chroma key backgrounds** for video production
- **Responsive design** with professional UI/UX

## Technical Requirements

### Frontend Stack
- **Vanilla JavaScript** (ES6+ modules)
- **Vite** as build tool and dev server
- **Firebase SDK v10+** for real-time database and storage
- **Modern CSS** with CSS custom properties and flexbox/grid
- **Responsive design** for mobile and desktop

### Firebase Configuration
```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.region.firebasedatabase.app",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### Database Structure
```
gallery/
├── state/
│   ├── selectedImage: "firebase-storage-url"
│   ├── zoom: 1.2
│   ├── pan: {x: 10, y: 20}
│   ├── backgroundColor: "#00ff00"
│   └── updatedAt: timestamp
└── images/
    └── [auto-generated-id]/
        ├── filename: "original-name.jpg"
        ├── filepath: "firebase-storage-url"
        ├── storageRef: "images/timestamp_filename"
        └── uploadTime: timestamp
```

## UI Components

### Header
- App title with emoji icon
- Color palette for chroma key backgrounds (green, magenta, blue, red, cyan, yellow, white, black, gray)
- Upload zone with drag & drop functionality

### Main Viewer
- Fixed 800x600px image container with colored background
- Zoom controls (+/- buttons and mouse wheel)
- Pan functionality with mouse drag
- Reset view button
- Zoom percentage display

### Thumbnail Gallery
- Grid layout with responsive columns
- Active thumbnail highlighting
- Smooth animations and hover effects
- Image counter badge

### Status Bar
- Connection status indicator
- Firebase sync status
- Real-time activity indicator

## Key Functionalities

### Real-time Synchronization
- Use Firebase `onValue()` listeners for automatic updates
- Prevent infinite loops with proper state management
- Sync: selected image, zoom level, pan position, background color

### Image Management
- Upload to Firebase Storage with progress tracking
- Generate thumbnails automatically
- Support JPG, PNG, GIF formats (max 15MB)
- Automatic filename generation with timestamps

### Interactive Controls
- **Zoom**: Mouse wheel, +/- buttons (0.1x to 5x range)
- **Pan**: Click and drag to move image
- **Background**: Click color swatches for chroma key colors
- **Navigation**: Arrow keys for next/previous image
- **Reset**: Restore default zoom and pan

### User Experience
- Loading overlays with progress bars
- Toast notifications for user feedback
- Smooth animations and transitions
- Professional dark theme design
- Keyboard shortcuts support

## Design Requirements

### Color Scheme
- Dark theme with professional gradients
- Primary: #4a90e2 (blue)
- Surface: #1a1a1a to #2a2a2a gradients
- Text: #ffffff primary, #b0b0b0 secondary
- Success: #27ae60, Error: #e74c3c, Warning: #f39c12

### Typography
- System font stack: -apple-system, BlinkMacSystemFont, 'Segoe UI'
- Line height: 1.6 for body, 1.2 for headings
- Font weights: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)

### Spacing System
- 8px base unit: 4px, 8px, 16px, 24px, 32px, 48px
- Consistent margins and padding throughout

### Animations
- Smooth transitions (0.3s cubic-bezier)
- Hover effects on interactive elements
- Loading spinners and progress indicators
- Slide-up animations for new content

## File Structure
```
/
├── index.html              # Main HTML structure
├── main.js                 # Entry point
├── package.json            # Dependencies and scripts
├── js/
│   ├── firebase.js         # Firebase configuration and helpers
│   └── app.js              # Main application logic
└── css/
    └── style.css           # Complete styling
```

## Implementation Notes

### Firebase Integration
- Initialize Firebase app with provided config
- Set up Realtime Database with proper security rules
- Configure Storage with CORS for web uploads
- Handle offline scenarios gracefully

### State Management
- Maintain local state object synchronized with Firebase
- Use flags to prevent sync loops (isSyncing, isDragging)
- Debounce rapid state changes for performance

### Error Handling
- Network connectivity issues
- File upload failures
- Invalid file formats or sizes
- Firebase quota limits

### Performance Optimization
- Lazy loading for thumbnail images
- Efficient DOM updates
- Minimal re-renders during real-time updates
- Image compression for uploads

## Security Considerations
- Firebase Security Rules for public read/write access
- File type validation on client and server
- File size limits enforcement
- Sanitize user inputs

This prompt will generate a complete, production-ready real-time image gallery with Firebase backend integration.