/**
 * ✅ MongoDB Query Explainer Utility
 * مساعد لتحليل أداء الاستعلامات باستخدام .explain()
 */

/**
 * تحليل استعلام MongoDB للحصول على معلومات الأداء
 * @param {Function} queryFunction - دالة الاستعلام (يجب أن تكون Mongoose Query)
 * @param {Object} options - خيارات إضافية
 * @returns {Promise<Object>} معلومات الأداء
 */
async function explainQuery(queryFunction, options = {}) {
  try {
    const {
      verbose = false, // طباعة تفاصيل إضافية
      logResults = true, // طباعة النتائج في console
    } = options;

    // إنشاء نسخة من الاستعلام لاستخدام explain
    const query = queryFunction();
    
    // الحصول على معلومات التنفيذ
    const explainResult = await query.explain("executionStats");

    // استخراج المعلومات المهمة
    const executionStats = explainResult.executionStats || {};
    const queryPlanner = explainResult.queryPlanner || {};

    const stats = {
      // معلومات الاستعلام
      query: queryPlanner.parsedQuery || {},
      
      // معلومات الأداء
      executionTimeMillis: executionStats.executionTimeMillis || 0,
      nReturned: executionStats.nReturned || 0, // عدد المستندات المرجعة
      totalDocsExamined: executionStats.totalDocsExamined || 0, // عدد المستندات المفحوصة
      
      // معلومات الفهرس
      indexesUsed: queryPlanner.winningPlan?.inputStage?.indexName || "COLLECTION_SCAN",
      indexBounds: queryPlanner.winningPlan?.inputStage?.indexBounds || null,
      
      // معلومات المراحل
      executionStages: executionStats.executionStages || {},
      
      // كفاءة الاستعلام
      efficiency: executionStats.nReturned > 0
        ? ((executionStats.nReturned / executionStats.totalDocsExamined) * 100).toFixed(2) + "%"
        : "0%",
      
      // تحذيرات
      warnings: executionStats.executionStages?.warning || null,
    };

    // التحقق من full collection scan
    const isCollectionScan = !stats.indexesUsed || stats.indexesUsed === "COLLECTION_SCAN";
    
    if (isCollectionScan) {
      stats.warning = "⚠️ Full Collection Scan detected! Consider adding an index.";
    }

    // طباعة النتائج
    if (logResults) {
      console.log("\n" + "=".repeat(60));
      console.log("📊 QUERY EXPLAIN RESULTS");
      console.log("=".repeat(60));
      console.log(`⏱️  Execution Time: ${stats.executionTimeMillis}ms`);
      console.log(`📄 Documents Returned: ${stats.nReturned}`);
      console.log(`🔍 Documents Examined: ${stats.totalDocsExamined}`);
      console.log(`📈 Efficiency: ${stats.efficiency}`);
      console.log(`📑 Index Used: ${stats.indexesUsed || "NONE (Collection Scan)"}`);
      
      if (stats.warning) {
        console.log(`⚠️  ${stats.warning}`);
      }
      
      if (verbose) {
        console.log("\n📋 Full Execution Stats:");
        console.log(JSON.stringify(executionStats, null, 2));
      }
      
      console.log("=".repeat(60) + "\n");
    }

    return stats;
  } catch (error) {
    console.error("❌ Error explaining query:", error.message);
    throw error;
  }
}

/**
 * تحليل استعلام بسيط للحصول على معلومات الأداء
 * @param {Object} Model - Mongoose Model
 * @param {Object} query - query object
 * @param {Object} options - خيارات إضافية (select, sort, limit, etc.)
 * @returns {Promise<Object>} معلومات الأداء
 */
async function explainSimpleQuery(Model, query, options = {}) {
  try {
    const {
      select,
      sort,
      limit,
      skip,
      verbose = false,
      logResults = true,
    } = options;

    return await explainQuery(() => {
      let mongooseQuery = Model.find(query);
      
      if (select) mongooseQuery = mongooseQuery.select(select);
      if (sort) mongooseQuery = mongooseQuery.sort(sort);
      if (skip) mongooseQuery = mongooseQuery.skip(skip);
      if (limit) mongooseQuery = mongooseQuery.limit(limit);
      
      return mongooseQuery;
    }, { verbose, logResults });
  } catch (error) {
    console.error("❌ Error explaining simple query:", error.message);
    throw error;
  }
}

/**
 * مقارنة أداء استعلامين
 * @param {Function} query1 - الاستعلام الأول
 * @param {Function} query2 - الاستعلام الثاني
 * @param {string} label1 - تسمية الاستعلام الأول
 * @param {string} label2 - تسمية الاستعلام الثاني
 * @returns {Promise<Object>} نتائج المقارنة
 */
async function compareQueries(query1, query2, label1 = "Query 1", label2 = "Query 2") {
  try {
    const [stats1, stats2] = await Promise.all([
      explainQuery(query1, { logResults: false }),
      explainQuery(query2, { logResults: false }),
    ]);

    const comparison = {
      [label1]: stats1,
      [label2]: stats2,
      improvement: {
        timeReduction: stats1.executionTimeMillis > 0
          ? ((stats1.executionTimeMillis - stats2.executionTimeMillis) / stats1.executionTimeMillis * 100).toFixed(2) + "%"
          : "0%",
        docsExaminedReduction: stats1.totalDocsExamined > 0
          ? ((stats1.totalDocsExamined - stats2.totalDocsExamined) / stats1.totalDocsExamined * 100).toFixed(2) + "%"
          : "0%",
      },
      winner: stats2.executionTimeMillis < stats1.executionTimeMillis ? label2 : label1,
    };

    console.log("\n" + "=".repeat(60));
    console.log("📊 QUERY COMPARISON");
    console.log("=".repeat(60));
    console.log(`${label1}: ${stats1.executionTimeMillis}ms (Examined: ${stats1.totalDocsExamined})`);
    console.log(`${label2}: ${stats2.executionTimeMillis}ms (Examined: ${stats2.totalDocsExamined})`);
    console.log(`✅ Winner: ${comparison.winner}`);
    console.log(`📈 Time Improvement: ${comparison.improvement.timeReduction}`);
    console.log(`📈 Docs Examined Reduction: ${comparison.improvement.docsExaminedReduction}`);
    console.log("=".repeat(60) + "\n");

    return comparison;
  } catch (error) {
    console.error("❌ Error comparing queries:", error.message);
    throw error;
  }
}

module.exports = {
  explainQuery,
  explainSimpleQuery,
  compareQueries,
};
