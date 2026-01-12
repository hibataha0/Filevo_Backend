/**
 * Build full URL for profile image
 * @param {string} profileImg - Profile image filename
 * @param {Object} req - Express request object (optional)
 * @returns {string|null} - Full URL or null
 */
function buildProfileImageUrl(profileImg, req = null) {
  if (!profileImg || profileImg.trim() === "") {
    return null;
  }

  // If already a full URL, return as is
  if (profileImg.startsWith("http://") || profileImg.startsWith("https://")) {
    return profileImg;
  }

  // Build base URL from request or environment
  let baseUrl;
  try {
    if (req) {
      const protocol = req.protocol || "http";
      const host = req.get("host") || "localhost:8000";
      baseUrl = `${protocol}://${host}`;
    } else {
      baseUrl = process.env.BASE_URL || "http://localhost:8000";
    }
  } catch (error) {
    console.error("❌ [profileImageHelper] Error building base URL:", error.message);
    baseUrl = process.env.BASE_URL || "http://localhost:8000";
  }

  // Profile images are stored in uploads/users/ directory
  let imagePath;
  if (profileImg.includes("/")) {
    imagePath = profileImg;
  } else {
    imagePath = `users/${profileImg}`;
  }

  return `${baseUrl}/uploads/${imagePath}`;
}

/**
 * Transform user object to include full profile image URL
 * @param {Object} user - User object (can be Mongoose document or plain object)
 * @param {Object} req - Express request object (optional)
 * @returns {Object} - User object with profileImgUrl field
 */
function transformUserProfileImage(user, req = null) {
  try {
    if (!user) {
      console.warn("⚠️ [profileImageHelper] transformUserProfileImage called with null/undefined user");
      return user;
    }

    const userObj = user.toObject ? user.toObject() : user;
    const profileImgUrl = buildProfileImageUrl(userObj.profileImg, req);

    return {
      ...userObj,
      profileImgUrl: profileImgUrl,
    };
  } catch (error) {
    console.error("❌ [profileImageHelper] Error transforming user profile image:", error.message);
    console.error("Stack trace:", error.stack);
    // Return original user object on error to prevent breaking the request
    return user.toObject ? user.toObject() : user;
  }
}

module.exports = {
  buildProfileImageUrl,
  transformUserProfileImage,
};