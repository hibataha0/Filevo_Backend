// utils/fileUtils.js
exports.getCategoryByExtension = (filename, mimetype) => {
  const ext = filename.split(".").pop().toLowerCase();

  if ((mimetype && mimetype.startsWith("image")) || ["jpg","jpeg","png","gif","webp","svg","bmp","ico"].includes(ext))
    return "Images";

  if ((mimetype && mimetype.startsWith("video")) || ["mp4","mov","avi","mkv","flv","wmv","webm","m4v","3gp"].includes(ext))
    return "Videos";

  if ((mimetype && mimetype.startsWith("audio")) || ["mp3","wav","aac","ogg","flac","m4a","wma","mid","midi"].includes(ext))
    return "Audio";

  if (["pdf","doc","docx","txt","ppt","pptx","xls","xlsx","csv","odt","rtf","odp","ods","epub","mobi"].includes(ext))
    return "Documents";

  if (["zip","rar","7z","tar","gz","bz2","xz","iso","dmg"].includes(ext))
    return "Compressed";

  if (["exe","apk","msi","dmg","deb","rpm","pkg","appimage","bat","sh"].includes(ext))
    return "Applications";

  if (["js","ts","jsx","html","htm","css","scss","sass","less","java","py","cpp","c","h","cs","php","rb","go","rs","swift","kt","dart","json","xml","yaml","yml","ini","cfg","conf","env","gitignore","dockerfile","tex","bib","ics","vcf","log","sql","sh","bash","ps1","bat","md","lock"].includes(ext))
    return "Code";

  return "Others";
};

// Helper function to format file size
exports.formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Helper function to validate folder name
exports.validateFolderName = (name) => {
  if (!name || typeof name !== 'string') {
    return false;
  }
  
  // Check for invalid characters
  const invalidChars = /[<>:"/\\|?*]/;
  if (invalidChars.test(name)) {
    return false;
  }
  
  // Check for reserved names (Windows)
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  if (reservedNames.includes(name.toUpperCase())) {
    return false;
  }
  
  // Check length
  if (name.length === 0 || name.length > 255) {
    return false;
  }
  
  return true;
};

// Helper function to sanitize file/folder name
exports.sanitizeName = (name) => {
  if (!name) return 'Untitled';
  
  // Replace invalid characters with underscores
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
};

// Helper function to generate unique folder name
exports.generateUniqueFolderName = (baseName, existingNames) => {
  let name = baseName;
  let counter = 1;
  
  while (existingNames.includes(name)) {
    name = `${baseName} (${counter})`;
    counter++;
  }
  
  return name;
};