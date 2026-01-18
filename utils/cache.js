/**
 * Simple In-Memory Cache Utility
 * ✅ Cache بسيط في الذاكرة لتحسين الأداء
 */

class SimpleCache {
  constructor(defaultTTL = 5 * 60 * 1000) {
    // defaultTTL: 5 دقائق افتراضياً
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  /**
   * حفظ قيمة في الكاش
   * @param {string} key - المفتاح
   * @param {any} value - القيمة
   * @param {number} ttl - مدة الصلاحية بالمللي ثانية (اختياري)
   */
  set(key, value, ttl = null) {
    const expirationTime = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, {
      value,
      expiresAt: expirationTime,
    });
  }

  /**
   * جلب قيمة من الكاش
   * @param {string} key - المفتاح
   * @returns {any|null} - القيمة أو null إذا لم توجد أو منتهية الصلاحية
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // التحقق من انتهاء الصلاحية
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * حذف قيمة من الكاش
   * @param {string} key - المفتاح
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * مسح الكاش بالكامل
   */
  clear() {
    this.cache.clear();
  }

  /**
   * التحقق من وجود قيمة في الكاش
   * @param {string} key - المفتاح
   * @returns {boolean}
   */
  has(key) {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }
    
    // التحقق من انتهاء الصلاحية
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * مسح القيم المنتهية الصلاحية تلقائياً
   */
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * الحصول على عدد العناصر في الكاش
   * @returns {number}
   */
  size() {
    this.cleanup(); // تنظيف قبل العد
    return this.cache.size;
  }
}

// ✅ إنشاء instance عام للكاش
// TTL مختلف حسب نوع البيانات:
const userCache = new SimpleCache(10 * 60 * 1000); // 10 دقائق للمستخدمين
const recentFilesCache = new SimpleCache(5 * 60 * 1000); // 5 دقائق للملفات الحديثة
const recentFoldersCache = new SimpleCache(5 * 60 * 1000); // 5 دقائق للمجلدات الحديثة
const sharedWithMeCache = new SimpleCache(5 * 60 * 1000); // 5 دقائق للملفات/المجلدات المشتركة
const folderAccessCache = new SimpleCache(30 * 60 * 1000); // 30 دقيقة للتحقق من كلمة سر المجلدات

// ✅ تشغيل تنظيف دوري كل 5 دقائق
setInterval(() => {
  userCache.cleanup();
  recentFilesCache.cleanup();
  recentFoldersCache.cleanup();
  sharedWithMeCache.cleanup();
  folderAccessCache.cleanup();
}, 5 * 60 * 1000);

module.exports = {
  SimpleCache,
  userCache, // للاستخدام المباشر
  recentFilesCache, // للاستخدام مع getRecentFiles
  recentFoldersCache, // للاستخدام مع getRecentFolders
  sharedWithMeCache, // للاستخدام مع getFilesSharedWithMe, getFoldersSharedWithMe
  folderAccessCache, // للتحقق من كلمة سر المجلدات المحمية
};
