// Test script for folder upload functionality
// This demonstrates how to upload a folder with nested structure

const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Example of how to create a FormData object for folder upload
function createFolderUploadForm(folderPath, folderName) {
  const form = new FormData();
  
  // Add folder name
  form.append('folderName', folderName);
  
  // Recursively add all files from the folder
  function addFilesToForm(dirPath, relativePath = '') {
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
      const fullPath = path.join(dirPath, item);
      const relativeItemPath = relativePath ? `${relativePath}/${item}` : item;
      
      if (fs.statSync(fullPath).isDirectory()) {
        // Recursively add files from subdirectory
        addFilesToForm(fullPath, relativeItemPath);
      } else {
        // Add file to form with its relative path as fieldname
        form.append(relativeItemPath, fs.createReadStream(fullPath));
      }
    });
  }
  
  addFilesToForm(folderPath);
  return form;
}

// Example usage:
// const form = createFolderUploadForm('./test-folder', 'My Uploaded Folder');
// 
// fetch('http://localhost:3000/api/files/upload-folder', {
//   method: 'POST',
//   headers: {
//     'Authorization': 'Bearer YOUR_JWT_TOKEN',
//     ...form.getHeaders()
//   },
//   body: form
// })
// .then(response => response.json())
// .then(data => console.log('Upload successful:', data))
// .catch(error => console.error('Upload failed:', error));

module.exports = { createFolderUploadForm };

