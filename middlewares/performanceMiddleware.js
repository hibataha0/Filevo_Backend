/**
 * ✅ Performance Monitoring Middleware
 * مراقبة أداء الـ API endpoints
 */

/**
 * Middleware لقياس response time لكل endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const performanceMonitor = (req, res, next) => {
  const startTime = Date.now();
  
  // حفظ الوقت في request object للاستخدام لاحقاً
  req.startTime = startTime;

  // اعتراض إرسال الـ response
  const originalSend = res.send;
  
  res.send = function (body) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    // إضافة header للـ response time
    res.setHeader("X-Response-Time", `${responseTime}ms`);
    
    // طباعة معلومات الأداء
    const method = req.method;
    const url = req.originalUrl || req.url;
    const statusCode = res.statusCode;
    
    // لون حسب الأداء
    let performanceStatus = "✅";
    if (responseTime > 1000) {
      performanceStatus = "🔴"; // بطيء جداً (>1s)
    } else if (responseTime > 500) {
      performanceStatus = "🟡"; // بطيء (>500ms)
    } else if (responseTime > 200) {
      performanceStatus = "🟠"; // متوسط (>200ms)
    }
    
    // طباعة في console
    console.log(
      `${performanceStatus} ${method} ${url} ${statusCode} ${responseTime}ms`
    );
    
    // إرسال الـ response الأصلي
    originalSend.call(this, body);
  };

  next();
};

/**
 * Middleware لمراقبة الاستعلامات البطيئة فقط
 * @param {number} threshold - الحد الأدنى للوقت بالمللي ثانية (افتراضي 500ms)
 * @returns {Function} Express middleware
 */
const slowQueryMonitor = (threshold = 500) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    const originalSend = res.send;
    
    res.send = function (body) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // طباعة فقط الاستعلامات البطيئة
      if (responseTime > threshold) {
        const method = req.method;
        const url = req.originalUrl || req.url;
        const statusCode = res.statusCode;
        const userId = req.user?._id || "Anonymous";
        
        console.warn(
          `⚠️  SLOW QUERY DETECTED: ${method} ${url} ${statusCode} ${responseTime}ms (User: ${userId})`
        );
        
        // يمكن إرسال تنبيه هنا (مثل: إرسال email, log إلى monitoring service, etc.)
      }
      
      originalSend.call(this, body);
    };

    next();
  };
};

/**
 * Middleware لتجميع إحصائيات الأداء
 * @param {Object} stats - object لتخزين الإحصائيات
 * @returns {Function} Express middleware
 */
const performanceStats = (stats = { requests: [], slowQueries: [] }) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    const originalSend = res.send;
    
    res.send = function (body) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      const requestInfo = {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        responseTime,
        timestamp: new Date().toISOString(),
        userId: req.user?._id || null,
      };
      
      // حفظ في الإحصائيات
      stats.requests.push(requestInfo);
      
      // الاحتفاظ بآخر 1000 request فقط
      if (stats.requests.length > 1000) {
        stats.requests.shift();
      }
      
      // حفظ الاستعلامات البطيئة (>500ms)
      if (responseTime > 500) {
        stats.slowQueries.push(requestInfo);
        
        // الاحتفاظ بآخر 100 slow query فقط
        if (stats.slowQueries.length > 100) {
          stats.slowQueries.shift();
        }
      }
      
      originalSend.call(this, body);
    };

    next();
  };
};

/**
 * الحصول على إحصائيات الأداء
 * @param {Object} stats - object الإحصائيات
 * @returns {Object} ملخص الإحصائيات
 */
const getPerformanceStats = (stats) => {
  if (!stats.requests || stats.requests.length === 0) {
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      slowQueries: 0,
      endpoints: {},
    };
  }

  const responseTimes = stats.requests.map((r) => r.responseTime);
  const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

  // تجميع حسب endpoint
  const endpoints = {};
  stats.requests.forEach((req) => {
    const key = `${req.method} ${req.url}`;
    if (!endpoints[key]) {
      endpoints[key] = {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        maxTime: 0,
        minTime: Infinity,
      };
    }
    
    endpoints[key].count++;
    endpoints[key].totalTime += req.responseTime;
    endpoints[key].maxTime = Math.max(endpoints[key].maxTime, req.responseTime);
    endpoints[key].minTime = Math.min(endpoints[key].minTime, req.responseTime);
  });

  // حساب المتوسط لكل endpoint
  Object.keys(endpoints).forEach((key) => {
    endpoints[key].averageTime = endpoints[key].totalTime / endpoints[key].count;
  });

  return {
    totalRequests: stats.requests.length,
    averageResponseTime: Math.round(averageResponseTime),
    slowQueries: stats.slowQueries?.length || 0,
    endpoints: Object.fromEntries(
      Object.entries(endpoints)
        .sort((a, b) => b[1].averageTime - a[1].averageTime)
        .slice(0, 10) // أفضل 10 endpoints بطيئة
    ),
  };
};

module.exports = {
  performanceMonitor,
  slowQueryMonitor,
  performanceStats,
  getPerformanceStats,
};
