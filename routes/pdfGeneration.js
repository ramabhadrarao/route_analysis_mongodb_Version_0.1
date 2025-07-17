// File: routes/pdfGeneration.js
// Purpose: API routes for HPCL PDF generation with dynamic data
// Integration with Enhanced PDF Generator

const express = require('express');
const { auth } = require('../middleware/auth');
const HPCLDynamicPDFGenerator = require('../hpcl-enhanced-pdf-generator');
const Route = require('../models/Route');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

// All PDF routes require authentication
router.use(auth);

// ============================================================================
// DYNAMIC PDF GENERATION ENDPOINTS
// ============================================================================

/**
 * Generate dynamic HPCL title page PDF for a route
 * GET /api/pdf/routes/:routeId/title-page
 */
router.get('/routes/:routeId/title-page', async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    const { download = 'true', filename } = req.query;
    
    console.log(`📄 Generating dynamic PDF title page for route: ${routeId}`);
    
    // Verify route exists and user has access
    const route = await Route.findOne({
      _id: routeId,
      userId,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or access denied'
      });
    }

    // Initialize PDF generator
    const generator = new HPCLDynamicPDFGenerator();
    
    // Generate filename
    const safeRouteName = (route.routeName || route.routeId)
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .substring(0, 50);
    
    const pdfFilename = filename || `HPCL-${safeRouteName}-Analysis-${Date.now()}.pdf`;
    const outputPath = path.join('./downloads/pdf-reports', pdfFilename);
    
    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    // Generate dynamic PDF
    const result = await generator.generateDynamicTitlePage(routeId, userId, outputPath);
    
    // Log generation success
    console.log(`✅ PDF generated successfully: ${pdfFilename}`);
    console.log(`📊 Data points: ${result.routeData.dynamicStats.totalDataPoints}`);
    console.log(`⚠️ Critical points: ${result.routeData.dynamicStats.riskAnalysis.criticalPoints}`);
    
    if (download === 'true') {
      // Send file for download
      res.download(outputPath, pdfFilename, (err) => {
        if (err) {
          console.error('Error sending PDF:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Error sending PDF file'
            });
          }
        } else {
          // Clean up file after download (optional)
          setTimeout(async () => {
            try {
              await fs.unlink(outputPath);
              console.log(`🗑️ Cleaned up PDF file: ${pdfFilename}`);
            } catch (cleanupError) {
              console.warn('Warning: Could not clean up PDF file:', cleanupError.message);
            }
          }, 60000); // Delete after 1 minute
        }
      });
    } else {
      // Return file information
      res.status(200).json({
        success: true,
        message: 'PDF generated successfully',
        data: {
          filename: pdfFilename,
          filePath: outputPath,
          downloadUrl: `/api/pdf/download/${pdfFilename}`,
          routeInfo: {
            routeId: result.routeData.routeId,
            routeName: result.routeData.routeName,
            fromName: result.routeData.fromName,
            toName: result.routeData.toName,
            totalDistance: result.routeData.totalDistance
          },
          analysisData: {
            totalDataPoints: result.routeData.dynamicStats.totalDataPoints,
            criticalPoints: result.routeData.dynamicStats.riskAnalysis.criticalPoints,
            riskLevel: result.routeData.riskLevel,
            dataQuality: result.routeData.dataQuality,
            lastAnalyzed: result.routeData.lastAnalyzed
          },
          generatedAt: new Date().toISOString()
        }
      });
    }

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating PDF',
      error: error.message,
      troubleshooting: [
        'Ensure route has been analyzed and contains data',
        'Check if HPCL-Logo.png exists in the correct directory',
        'Verify sufficient disk space for PDF generation',
        'Ensure all required models are accessible'
      ]
    });
  }
});

/**
 * Generate complete HPCL analysis report (multi-page)
 * POST /api/pdf/routes/:routeId/complete-report
 */
router.post('/routes/:routeId/complete-report', async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    const { 
      includePages = ['title', 'overview', 'safety', 'risks', 'recommendations'],
      format = 'pdf',
      quality = 'high'
    } = req.body;
    
    console.log(`📊 Generating complete HPCL report for route: ${routeId}`);
    console.log(`📋 Pages included: ${includePages.join(', ')}`);
    
    // Verify route access
    const route = await Route.findOne({
      _id: routeId,
      userId,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found or access denied'
      });
    }

    const generator = new HPCLDynamicPDFGenerator();
    
    // Start with title page
    const { doc, routeData } = await generator.generateDynamicTitlePage(routeId, userId);
    
    let pageCount = 1;
    const reportSections = [];
    
    // Add additional pages based on request
    if (includePages.includes('overview')) {
      doc.addPage();
      pageCount++;
      await addOverviewPage(doc, routeData, generator);
      reportSections.push('Route Overview & Statistics');
    }
    
    if (includePages.includes('safety')) {
      doc.addPage();
      pageCount++;
      await addSafetyAnalysisPage(doc, routeData, generator);
      reportSections.push('Safety Analysis & Compliance');
    }
    
    if (includePages.includes('risks')) {
      doc.addPage();
      pageCount++;
      await addRiskAssessmentPage(doc, routeData, generator);
      reportSections.push('Risk Assessment & Critical Points');
    }
    
    if (includePages.includes('recommendations')) {
      doc.addPage();
      pageCount++;
      await addRecommendationsPage(doc, routeData, generator);
      reportSections.push('Safety Recommendations & Action Plan');
    }
    
    // Generate filename and save
    const safeRouteName = (route.routeName || route.routeId)
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .substring(0, 40);
    
    const reportFilename = `HPCL-Complete-Report-${safeRouteName}-${Date.now()}.pdf`;
    const outputPath = path.join('./downloads/pdf-reports', reportFilename);
    
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    // Save PDF
    await new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);
      doc.end();
      
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    
    console.log(`✅ Complete HPCL report generated: ${reportFilename}`);
    console.log(`📄 Total pages: ${pageCount}`);
    console.log(`📊 Sections: ${reportSections.join(', ')}`);
    
    res.status(200).json({
      success: true,
      message: 'Complete HPCL report generated successfully',
      data: {
        filename: reportFilename,
        filePath: outputPath,
        downloadUrl: `/api/pdf/download/${reportFilename}`,
        reportDetails: {
          totalPages: pageCount,
          sections: reportSections,
          format: format,
          quality: quality
        },
        routeInfo: {
          routeId: routeData.routeId,
          routeName: routeData.routeName,
          totalDistance: routeData.totalDistance,
          riskLevel: routeData.riskLevel
        },
        analysisData: {
          totalDataPoints: routeData.dynamicStats.totalDataPoints,
          criticalPoints: routeData.dynamicStats.riskAnalysis.criticalPoints,
          dataQuality: routeData.dataQuality,
          lastAnalyzed: routeData.lastAnalyzed
        },
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Complete report generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating complete report',
      error: error.message
    });
  }
});

/**
 * Download generated PDF file
 * GET /api/pdf/download/:filename
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join('./downloads/pdf-reports', filename);
    
    // Verify file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }
    
    // Send file
    res.download(filePath, filename);
    
  } catch (error) {
    console.error('PDF download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading PDF'
    });
  }
});

/**
 * Get PDF generation status and available reports
 * GET /api/pdf/routes/:routeId/status
 */
router.get('/routes/:routeId/status', async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    
    // Verify route access
    const route = await Route.findOne({
      _id: routeId,
      userId,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    // Load dynamic route data to check PDF generation readiness
    const generator = new HPCLDynamicPDFGenerator();
    const routeData = await generator.loadDynamicRouteData(routeId, userId);
    
    // Assess PDF generation readiness
    const readiness = {
      canGeneratePDF: true,
      dataCompleteness: routeData.dataQuality.score,
      recommendations: []
    };
    
    if (routeData.dynamicStats.totalDataPoints < 10) {
      readiness.canGeneratePDF = false;
      readiness.recommendations.push('Insufficient data - run route analysis first');
    }
    
    if (!routeData.fromAddress || !routeData.toAddress) {
      readiness.canGeneratePDF = false;
      readiness.recommendations.push('Missing route addresses');
    }
    
    if (routeData.dataQuality.level === 'insufficient') {
      readiness.recommendations.push('Data quality is low - consider re-analyzing route');
    }
    
    res.status(200).json({
      success: true,
      data: {
        routeInfo: {
          routeId: route.routeId,
          routeName: route.routeName,
          fromName: route.fromName,
          toName: route.toName
        },
        pdfGenerationReadiness: readiness,
        dataAvailability: routeData.relatedData,
        analysisMetrics: {
          totalDataPoints: routeData.dynamicStats.totalDataPoints,
          criticalPoints: routeData.dynamicStats.riskAnalysis.criticalPoints,
          dataQuality: routeData.dataQuality,
          lastAnalyzed: routeData.lastAnalyzed
        },
        availableReportTypes: [
          'title-page',
          'complete-report'
        ],
        endpoints: {
          generateTitlePage: `/api/pdf/routes/${routeId}/title-page`,
          generateCompleteReport: `/api/pdf/routes/${routeId}/complete-report`,
          downloadPDF: `/api/pdf/download/{filename}`
        }
      }
    });

  } catch (error) {
    console.error('PDF status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking PDF generation status'
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS FOR MULTI-PAGE REPORTS
// ============================================================================

async function addOverviewPage(doc, routeData, generator) {
  // Add page header
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  // Page title
  doc.fontSize(20).fillColor(generator.colors.primary).font('Helvetica-Bold')
     .text('ROUTE OVERVIEW & STATISTICAL ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Statistics summary
  const stats = routeData.dynamicStats;
  
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('DATA ANALYSIS SUMMARY', 50, doc.y);
  
  doc.y += 30;
  doc.fontSize(11).font('Helvetica');
  
  const summaryData = [
    ['Total Data Points Analyzed', stats.totalDataPoints.toString()],
    ['Average Risk Score', stats.riskAnalysis.avgRiskScore.toFixed(2) + '/10'],
    ['Critical Risk Points', stats.riskAnalysis.criticalPoints.toString()],
    ['Maximum Risk Score', stats.riskAnalysis.maxRiskScore.toFixed(2) + '/10'],
    ['Data Quality Level', routeData.dataQuality.level.toUpperCase()],
    ['Analysis Completeness', routeData.dataQuality.score + '%']
  ];
  
  generator.createDetailedTable(doc, summaryData, [200, 300]);
}

async function addSafetyAnalysisPage(doc, routeData, generator) {
  // Safety analysis page implementation
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.warning).font('Helvetica-Bold')
     .text('SAFETY ANALYSIS & COMPLIANCE ASSESSMENT', 50, doc.y);
  
  // Add safety metrics based on dynamic data
  // Implementation continues...
}

async function addRiskAssessmentPage(doc, routeData, generator) {
  // Risk assessment page implementation
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.danger).font('Helvetica-Bold')
     .text('COMPREHENSIVE RISK ASSESSMENT', 50, doc.y);
  
  // Add risk analysis based on dynamic data
  // Implementation continues...
}

async function addRecommendationsPage(doc, routeData, generator) {
  // Recommendations page implementation
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.success).font('Helvetica-Bold')
     .text('SAFETY RECOMMENDATIONS & ACTION PLAN', 50, doc.y);
  
  // Add recommendations based on dynamic analysis
  // Implementation continues...
}

module.exports = router;