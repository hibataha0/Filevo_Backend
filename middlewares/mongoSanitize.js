/**
 * Custom MongoDB sanitization middleware compatible with Express 5
 * Removes MongoDB operators from request data to prevent NoSQL injection attacks
 */

// MongoDB operators that should be sanitized
const MONGO_OPERATORS = [
  "$where",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  "$exists",
  "$regex",
  "$size",
  "$mod",
  "$type",
  "$all",
  "$elemMatch",
  "$not",
  "$nor",
  "$or",
  "$and",
];

/**
 * Recursively sanitize an object by removing MongoDB operators
 * @param {Object} obj - The object to sanitize
 * @returns {Object} - The sanitized object
 */
function sanitize(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item));
  }

  const sanitized = {};
  const keys = Object.keys(obj);

  keys.forEach((key) => {
    const value = obj[key];

    // Check if key starts with $ (MongoDB operator)
    if (key[0] === "$" && MONGO_OPERATORS.includes(key)) {
      // Skip MongoDB operators (remove them)
      return;
    }

    // Recursively sanitize nested objects
    if (value !== null && typeof value === "object") {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  });

  return sanitized;
}

/**
 * Express middleware to sanitize request data
 * Compatible with Express 5 (req.query is read-only)
 */
const mongoSanitize = () => (req, res, next) => {
  try {
    // Sanitize req.body (can be modified in Express 5)
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      req.body = sanitize(req.body);
    }

    // Sanitize req.query
    // IMPORTANT: In Express 5, req.query is completely read-only
    // We create a sanitized copy that routes can use if needed
    // DO NOT attempt to modify req.query directly - it will throw an error
    if (
      req.query &&
      typeof req.query === "object" &&
      !Array.isArray(req.query)
    ) {
      // Create a sanitized version and store it for routes to use
      const sanitizedQuery = sanitize(req.query);

      // Store sanitized query for routes that need it
      req.sanitizedQuery = sanitizedQuery;

      // Note: req.query remains unchanged (read-only in Express 5)
      // Routes should check req.sanitizedQuery if they need sanitized query params
    }

    // Sanitize req.params
    // Note: In Express 5, req.params might also be read-only, so we sanitize carefully
    if (
      req.params &&
      typeof req.params === "object" &&
      !Array.isArray(req.params)
    ) {
      try {
        req.params = sanitize(req.params);
      } catch (paramsError) {
        // If params is read-only, create sanitized copy instead
        req.sanitizedParams = sanitize(req.params);
      }
    }

    next();
  } catch (error) {
    // If sanitization fails, log error but continue
    // This prevents the middleware from breaking the request flow
    console.error("MongoDB sanitization error:", error.message);
    next();
  }
};

module.exports = mongoSanitize;
