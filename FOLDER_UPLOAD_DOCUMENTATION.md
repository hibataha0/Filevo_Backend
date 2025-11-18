# Folder Upload Feature Documentation

## Overview
The folder upload feature allows users to upload entire folder structures with nested files and subfolders. This maintains the original folder hierarchy and creates corresponding database records for both folders and files.

## API Endpoints

### Upload Folder
**POST** `/api/files/upload-folder`

Uploads a folder with its complete nested structure.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data
```

**Body:**
- `folderName` (string): Name for the root folder (optional, defaults to "Uploaded Folder")
- Files with fieldnames representing their path within the folder structure

**Example fieldnames:**
- `file1.txt` - File in root folder
- `subfolder/file2.txt` - File in subfolder
- `subfolder/nested/file3.txt` - File in nested subfolder

**Response:**
```json
{
  "message": "✅ Folder uploaded successfully",
  "folder": {
    "_id": "folder_id",
    "name": "My Folder",
    "userId": "user_id",
    "size": 1024000,
    "path": "my_files/My Folder",
    "parentId": null,
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "filesCount": 15,
  "foldersCount": 3,
  "totalSize": 1024000
}
```

### Get Folder Contents
**GET** `/api/files/folders/:id/contents`

Retrieves the contents of a specific folder.

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "message": "Folder contents retrieved successfully",
  "folder": {
    "_id": "folder_id",
    "name": "My Folder",
    "size": 1024000,
    "path": "my_files/My Folder"
  },
  "subfolders": [
    {
      "_id": "subfolder_id",
      "name": "Subfolder",
      "size": 512000,
      "parentId": "folder_id"
    }
  ],
  "files": [
    {
      "_id": "file_id",
      "name": "document.pdf",
      "type": "application/pdf",
      "size": 1024000,
      "category": "Documents",
      "parentFolderId": "folder_id"
    }
  ],
  "totalItems": 2
}
```

## Frontend Implementation

### JavaScript/Node.js Example
```javascript
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

function uploadFolder(folderPath, folderName, token) {
  const form = new FormData();
  
  // Add folder name
  form.append('folderName', folderName);
  
  // Recursively add files
  function addFiles(dirPath, relativePath = '') {
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
      const fullPath = path.join(dirPath, item);
      const relativeItemPath = relativePath ? `${relativePath}/${item}` : item;
      
      if (fs.statSync(fullPath).isDirectory()) {
        addFiles(fullPath, relativeItemPath);
      } else {
        form.append(relativeItemPath, fs.createReadStream(fullPath));
      }
    });
  }
  
  addFiles(folderPath);
  
  return fetch('http://localhost:3000/api/files/upload-folder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...form.getHeaders()
    },
    body: form
  });
}
```

### React Example
```jsx
import React, { useState } from 'react';

function FolderUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFolderUpload = async (event) => {
    const files = event.target.files;
    if (!files.length) return;

    setUploading(true);
    const formData = new FormData();
    
    // Add folder name
    formData.append('folderName', 'My Uploaded Folder');
    
    // Add all files with their relative paths
    for (let file of files) {
      formData.append(file.webkitRelativePath, file);
    }

    try {
      const response = await fetch('/api/files/upload-folder', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const result = await response.json();
      console.log('Upload successful:', result);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFolderUpload}
        disabled={uploading}
      />
      {uploading && <p>Uploading folder...</p>}
    </div>
  );
}
```

## Database Schema

### Folder Model
```javascript
{
  name: String,           // Folder name
  userId: ObjectId,       // Owner user ID
  parentId: ObjectId,    // Parent folder ID (null for root)
  size: Number,          // Total size in bytes
  path: String,          // File system path
  isShared: Boolean,     // Sharing status
  sharedWith: [ObjectId] // Shared with user IDs
}
```

### File Model
```javascript
{
  name: String,              // Original filename
  type: String,              // MIME type
  size: Number,             // File size in bytes
  path: String,             // File system path
  userId: ObjectId,         // Owner user ID
  parentFolderId: ObjectId, // Parent folder ID
  category: String,         // File category
  isShared: Boolean,        // Sharing status
  sharedWith: [ObjectId]    // Shared with user IDs
}
```

## Features

### ✅ Implemented Features
- **Nested Folder Structure**: Maintains original folder hierarchy
- **Automatic Folder Creation**: Creates database records for all folders
- **File Categorization**: Automatically categorizes files by extension
- **Size Calculation**: Calculates and updates folder sizes
- **Error Handling**: Comprehensive error handling with cleanup
- **User Isolation**: Each user can only access their own folders
- **Path Management**: Proper file system path management

### 🔧 Technical Details
- **File Size Limit**: 100MB per file
- **File Count Limit**: 1000 files per upload
- **Supported File Types**: All file types allowed
- **Storage**: Files stored in `my_files/` directory
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT token required

## Error Handling

The system includes comprehensive error handling:

1. **Validation Errors**: Invalid folder names, file types, etc.
2. **Upload Errors**: Network issues, file system errors
3. **Database Errors**: Connection issues, constraint violations
4. **Cleanup**: Automatic cleanup of partial uploads on error

## Security Considerations

- **Authentication Required**: All endpoints require valid JWT token
- **User Isolation**: Users can only access their own files/folders
- **Path Validation**: Prevents directory traversal attacks
- **File Type Validation**: Configurable file type restrictions
- **Size Limits**: Prevents abuse with large uploads

## Performance Considerations

- **Batch Processing**: Files processed in batches for efficiency
- **Size Calculation**: Optimized folder size calculation
- **Database Indexing**: Proper indexing on user and folder relationships
- **Memory Management**: Stream-based file processing for large uploads











