/**
 * Helper function to build full URL for profile image
 * @param {string} profileImg - Profile image filename (e.g., "user-profile-xxx.jpeg")
 * @param {Object} req - Express request object (optional, for building full URL)
 * @returns {string|null} - Full URL or null if profileImg is empty
 */
function buildProfileImageUrl(profileImg, req = null) {
  // If profileImg is null, undefined, or empty, return null
  if (!profileImg || profileImg.trim() === "") {
    return null;
  }

  // If profileImg is already a full URL (starts with http:// or https://), return it as is
  if (profileImg.startsWith("http://") || profileImg.startsWith("https://")) {
    return profileImg;
  }

  // Build base URL
  let baseUrl;
  
  if (req) {
    // Use request to build full URL
    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:8000";
    baseUrl = `${protocol}://${host}`;
  } else {
    // Fallback to environment variable or default
    baseUrl = process.env.BASE_URL || process.env.FRONTEND_URL?.replace(":3000", ":8000") || "http://localhost:8000";
  }

  // Profile images are stored in uploads/users/ directory
  // But the filename in DB doesn't include the directory path
  // So we need to check if it's already a path or just a filename
  let imagePath;
  
  if (profileImg.includes("/")) {
    // Already includes path
    imagePath = profileImg;
  } else {
    // Just filename, add users/ directory
    imagePath = `users/${profileImg}`;
  }

  // Return full URL
  return `${baseUrl}/uploads/${imagePath}`;
}

/**
 * Transform user object to include full profile image URL
 * @param {Object} user - User object (can be Mongoose document or plain object)
 * @param {Object} req - Express request object (optional)
 * @returns {Object} - User object with profileImgUrl field
 */
function transformUserProfileImage(user, req = null) {
  if (!user) {
    return user;
  }

  // Convert Mongoose document to plain object if needed
  const userObj = user.toObject ? user.toObject() : user;

  // Build full URL
  const profileImgUrl = buildProfileImageUrl(userObj.profileImg, req);

  // Add profileImgUrl field (keep original profileImg for backward compatibility)
  return {
    ...userObj,
    profileImgUrl: profileImgUrl,
  };
}

/**
 * Transform array of users to include full profile image URLs
 * @param {Array} users - Array of user objects
 * @param {Object} req - Express request object (optional)
 * @returns {Array} - Array of user objects with profileImgUrl field
 */
function transformUsersProfileImages(users, req = null) {
  if (!Array.isArray(users)) {
    return users;
  }

  return users.map((user) => transformUserProfileImage(user, req));
}

module.exports = {
  buildProfileImageUrl,
  transformUserProfileImage,
  transformUsersProfileImages,
};









