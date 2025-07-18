// File: routes/pdfGeneration.js
// Purpose: API routes for HPCL PDF generation with dynamic data
// Integration with Enhanced PDF Generator

const express = require('express');
const { auth } = require('../middleware/auth');
const HPCLDynamicPDFGenerator = require('../hpcl-enhanced-pdf-generator');
const Route = require('../models/Route');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

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
    await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    
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
              await fsPromises.unlink(outputPath);
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
    
    if (includePages.includes('detailed-analysis')) {
      doc.addPage();
      pageCount++;
      await addDetailedAnalysisPage(doc, routeData, generator);
      reportSections.push('Detailed Route Analysis');
    }
    
    if (includePages.includes('route-mapping')) {
      doc.addPage();
      pageCount++;
      await addRouteMappingPage(doc, routeData, generator);
      reportSections.push('Route Mapping & GPS Analysis');
    }
    
    if (includePages.includes('recommendations')) {
      doc.addPage();
      pageCount++;
      await addRecommendationsPage(doc, routeData, generator);
      reportSections.push('Safety Recommendations & Action Plan');
    }
    
    if (includePages.includes('executive-summary')) {
      doc.addPage();
      pageCount++;
      await addExecutiveSummaryPage(doc, routeData, generator);
      reportSections.push('Executive Summary & Conclusions');
    }
    
    // Enhanced comprehensive sections for detailed 49-page report
    if (includePages.includes('comprehensive-analysis')) {
      // Sharp Turns Detailed Analysis (3-5 pages)
      doc.addPage();
      pageCount++;
      await addSharpTurnsDetailedPage(doc, routeData, generator);
      reportSections.push('Sharp Turns Detailed Analysis');
      
      // Blind Spots Comprehensive Analysis (3-5 pages)
      doc.addPage();
      pageCount++;
      await addBlindSpotsDetailedPage(doc, routeData, generator);
      reportSections.push('Blind Spots Comprehensive Analysis');
      
      // Accident Prone Areas Analysis (3-4 pages)
      doc.addPage();
      pageCount++;
      await addAccidentAreasDetailedPage(doc, routeData, generator);
      reportSections.push('Accident Prone Areas Analysis');
      
      // Road Conditions Assessment (2-3 pages)
      doc.addPage();
      pageCount++;
      await addRoadConditionsDetailedPage(doc, routeData, generator);
      reportSections.push('Road Conditions Assessment');
      
      // Weather Analysis (2-3 pages)
      doc.addPage();
      pageCount++;
      await addWeatherAnalysisDetailedPage(doc, routeData, generator);
      reportSections.push('Weather Analysis');
      
      // Traffic Analysis (2-3 pages)
      doc.addPage();
      pageCount++;
      await addTrafficAnalysisDetailedPage(doc, routeData, generator);
      reportSections.push('Traffic Analysis');
      
      // Emergency Services Analysis (2-3 pages)
      doc.addPage();
      pageCount++;
      await addEmergencyServicesDetailedPage(doc, routeData, generator);
      reportSections.push('Emergency Services Analysis');
      
      // Network Coverage Analysis (2-3 pages)
      doc.addPage();
      pageCount++;
      await addNetworkCoverageDetailedPage(doc, routeData, generator);
      reportSections.push('Network Coverage Analysis');
      
      // Statistical Analysis & Charts (3-4 pages)
      doc.addPage();
      pageCount++;
      await addStatisticalAnalysisPage(doc, routeData, generator);
      reportSections.push('Statistical Analysis & Charts');
      
      // Comparative Analysis (2-3 pages)
      doc.addPage();
      pageCount++;
      await addComparativeAnalysisPage(doc, routeData, generator);
      reportSections.push('Comparative Analysis');
      
      // Mitigation Strategies (3-4 pages)
      doc.addPage();
      pageCount++;
      await addMitigationStrategiesPage(doc, routeData, generator);
      reportSections.push('Mitigation Strategies');
      
      // Implementation Guidelines (2-3 pages)
      doc.addPage();
      pageCount++;
      await addImplementationGuidelinesPage(doc, routeData, generator);
      reportSections.push('Implementation Guidelines');
      
      // Appendices (5-8 pages)
      doc.addPage();
      pageCount++;
      await addAppendicesPage(doc, routeData, generator);
      reportSections.push('Appendices & References');
    }
    
    // Generate filename and save
    const safeRouteName = (route.routeName || route.routeId)
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .substring(0, 40);
    
    const reportFilename = `HPCL-Complete-Report-${safeRouteName}-${Date.now()}.pdf`;
    const outputPath = path.join('./downloads/pdf-reports', reportFilename);
    
    await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
    
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
      await fsPromises.access(filePath);
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
  
  doc.y += 30;
  
  // Infrastructure Analysis
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('INFRASTRUCTURE ANALYSIS', 50, doc.y);
  
  doc.y += 25;
  
  const infrastructureData = [
    ['Road Quality Score', `${(typeof stats.infrastructureMetrics.roadQuality === 'number' ? stats.infrastructureMetrics.roadQuality.toFixed(1) : stats.infrastructureMetrics.roadQuality || 'N/A')}/10`],
    ['Weather Risk Factor', `${(typeof stats.infrastructureMetrics.weatherRisk === 'number' ? stats.infrastructureMetrics.weatherRisk.toFixed(1) : stats.infrastructureMetrics.weatherRisk || 'N/A')}/10`],
    ['Traffic Congestion Level', `${(typeof stats.infrastructureMetrics.trafficCongestion === 'number' ? stats.infrastructureMetrics.trafficCongestion.toFixed(1) : stats.infrastructureMetrics.trafficCongestion || 'N/A')}/10`],
    ['Network Dead Zones', `${stats.infrastructureMetrics.networkDeadZones || 0} areas`],
    ['Emergency Services Coverage', `${routeData.relatedData.emergencyServices || 0} facilities`],
    ['Route Distance', `${routeData.totalDistance || 'N/A'} km`]
  ];
  
  generator.createDetailedTable(doc, infrastructureData, [200, 300]);
  
  doc.y += 30;
  
  // Safety Metrics Summary
  doc.fontSize(14).fillColor(generator.colors.warning).font('Helvetica-Bold')
     .text('SAFETY METRICS SUMMARY', 50, doc.y);
  
  doc.y += 25;
  
  const safetyMetricsData = [
    ['Sharp Turn Severity', `${(typeof stats.safetyMetrics.sharpTurnSeverity === 'number' ? stats.safetyMetrics.sharpTurnSeverity.toFixed(1) : stats.safetyMetrics.sharpTurnSeverity || 'N/A')}/10`],
    ['Blind Spot Risk Level', `${stats.safetyMetrics.blindSpotTypes || 'N/A'}`],
    ['Accident Severity Index', `${(typeof stats.safetyMetrics.accidentSeverity === 'number' ? stats.safetyMetrics.accidentSeverity.toFixed(1) : stats.safetyMetrics.accidentSeverity || 'N/A')}/10`],
    ['Emergency Response Time', `${stats.safetyMetrics.emergencyServiceTypes || 'Variable'}`],
    ['Overall Safety Grade', routeData.riskLevel || 'N/A'],
    ['Recommendation Priority', (stats.riskAnalysis.criticalPoints || 0) > 0 ? 'HIGH' : 'MEDIUM']
  ];
  
  generator.createDetailedTable(doc, safetyMetricsData, [200, 300]);
}

async function addSafetyAnalysisPage(doc, routeData, generator) {
  // Safety analysis page implementation
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.warning).font('Helvetica-Bold')
     .text('SAFETY ANALYSIS & COMPLIANCE ASSESSMENT', 50, doc.y);
  
  doc.y += 40;
  
  // Safety Metrics Section
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('SAFETY METRICS OVERVIEW', 50, doc.y);
  
  doc.y += 30;
  
  const safetyData = [
    ['Sharp Turn Analysis', `${routeData.relatedData.sharpTurns} critical turns identified`],
    ['Blind Spot Detection', `${routeData.relatedData.blindSpots} visibility hazards found`],
    ['Accident Prone Areas', `${routeData.relatedData.accidentProneAreas} high-risk zones`],
    ['Road Condition Score', `${(typeof routeData.dynamicStats.infrastructureMetrics.roadQuality === 'number' ? routeData.dynamicStats.infrastructureMetrics.roadQuality.toFixed(1) : routeData.dynamicStats.infrastructureMetrics.roadQuality || 'N/A')}/10`],
    ['Weather Risk Factor', `${(typeof routeData.dynamicStats.infrastructureMetrics.weatherRisk === 'number' ? routeData.dynamicStats.infrastructureMetrics.weatherRisk.toFixed(1) : routeData.dynamicStats.infrastructureMetrics.weatherRisk || 'N/A')}/10`],
    ['Emergency Services', `${routeData.relatedData.emergencyServices} facilities available`]
  ];
  
  generator.createDetailedTable(doc, safetyData, [250, 250]);
  
  doc.y += 30;
  
  // Safety Compliance Section
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('HPCL SAFETY COMPLIANCE STATUS', 50, doc.y);
  
  doc.y += 25;
  doc.fontSize(11).font('Helvetica');
  
  const complianceLevel = routeData.dynamicStats.riskAnalysis.avgRiskScore < 5 ? 'COMPLIANT' : 
                         routeData.dynamicStats.riskAnalysis.avgRiskScore < 7 ? 'MODERATE RISK' : 'HIGH RISK';
  
  doc.fillColor(generator.colors.secondary)
     .text(`Overall Compliance Level: `, 50, doc.y, { continued: true })
     .fillColor(complianceLevel === 'COMPLIANT' ? generator.colors.success : 
                complianceLevel === 'MODERATE RISK' ? generator.colors.warning : generator.colors.danger)
     .text(complianceLevel);
  
  doc.y += 20;
  doc.fillColor(generator.colors.secondary)
     .text(`Risk Grade: ${routeData.riskLevel || 'N/A'} (Score: ${(typeof routeData.dynamicStats.riskAnalysis.avgRiskScore === 'number' ? routeData.dynamicStats.riskAnalysis.avgRiskScore.toFixed(2) : routeData.dynamicStats.riskAnalysis.avgRiskScore || 'N/A')}/10)`, 50, doc.y);
  
  doc.y += 20;
  doc.text(`Data Quality: ${routeData.dataQuality.level.toUpperCase()} (${routeData.dataQuality.score}% complete)`, 50, doc.y);
}

async function addRiskAssessmentPage(doc, routeData, generator) {
  // Risk assessment page implementation
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.danger).font('Helvetica-Bold')
     .text('COMPREHENSIVE RISK ASSESSMENT', 50, doc.y);
  
  doc.y += 40;
  
  // Risk Distribution Analysis
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('RISK DISTRIBUTION ANALYSIS', 50, doc.y);
  
  doc.y += 30;
  
  const riskDistribution = routeData.dynamicStats.riskAnalysis.riskDistribution;
  const riskData = [
    ['Critical Risk Points (8-10)', `${riskDistribution.critical} locations`],
    ['High Risk Points (6-8)', `${riskDistribution.high} locations`],
    ['Medium Risk Points (4-6)', `${riskDistribution.medium} locations`],
    ['Low Risk Points (0-4)', `${riskDistribution.low} locations`],
    ['Average Risk Score', `${(typeof routeData.dynamicStats.riskAnalysis.avgRiskScore === 'number' ? routeData.dynamicStats.riskAnalysis.avgRiskScore.toFixed(2) : routeData.dynamicStats.riskAnalysis.avgRiskScore || 'N/A')}/10`],
    ['Maximum Risk Score', `${(typeof routeData.dynamicStats.riskAnalysis.maxRiskScore === 'number' ? routeData.dynamicStats.riskAnalysis.maxRiskScore.toFixed(2) : routeData.dynamicStats.riskAnalysis.maxRiskScore || 'N/A')}/10`]
  ];
  
  generator.createDetailedTable(doc, riskData, [250, 250]);
  
  doc.y += 30;
  
  // Critical Risk Factors
  doc.fontSize(14).fillColor(generator.colors.danger).font('Helvetica-Bold')
     .text('CRITICAL RISK FACTORS', 50, doc.y);
  
  doc.y += 25;
  doc.fontSize(11).font('Helvetica').fillColor(generator.colors.secondary);
  
  const criticalFactors = [
    `• Sharp Turns: ${(typeof routeData.dynamicStats.safetyMetrics.sharpTurnSeverity === 'number' ? routeData.dynamicStats.safetyMetrics.sharpTurnSeverity.toFixed(1) : routeData.dynamicStats.safetyMetrics.sharpTurnSeverity || 'N/A')}/10 severity`,
    `• Visibility Issues: ${routeData.relatedData.blindSpots || 0} blind spots identified`,
    `• Road Conditions: ${(typeof routeData.dynamicStats.infrastructureMetrics.roadQuality === 'number' ? routeData.dynamicStats.infrastructureMetrics.roadQuality.toFixed(1) : routeData.dynamicStats.infrastructureMetrics.roadQuality || 'N/A')}/10 quality`,
    `• Traffic Congestion: ${(typeof routeData.dynamicStats.infrastructureMetrics.trafficCongestion === 'number' ? routeData.dynamicStats.infrastructureMetrics.trafficCongestion.toFixed(1) : routeData.dynamicStats.infrastructureMetrics.trafficCongestion || 'N/A')}/10 level`,
    `• Weather Risk: ${(typeof routeData.dynamicStats.infrastructureMetrics.weatherRisk === 'number' ? routeData.dynamicStats.infrastructureMetrics.weatherRisk.toFixed(1) : routeData.dynamicStats.infrastructureMetrics.weatherRisk || 'N/A')}/10 impact`,
    `• Network Coverage: ${routeData.dynamicStats.infrastructureMetrics.networkDeadZones} dead zones`
  ];
  
  criticalFactors.forEach(factor => {
    doc.text(factor, 50, doc.y);
    doc.y += 18;
  });
  
  doc.y += 20;
  
  // Risk Grade Assessment
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('OVERALL RISK GRADE ASSESSMENT', 50, doc.y);
  
  doc.y += 25;
  doc.fontSize(12).font('Helvetica');
  
  const gradeColor = routeData.riskLevel === 'A' || routeData.riskLevel === 'B' ? generator.colors.success :
                    routeData.riskLevel === 'C' || routeData.riskLevel === 'D' ? generator.colors.warning :
                    generator.colors.danger;
  
  doc.fillColor(generator.colors.secondary)
     .text('Route Risk Grade: ', 50, doc.y, { continued: true })
     .fillColor(gradeColor)
     .font('Helvetica-Bold')
     .text(`${routeData.riskLevel}`, { continued: true })
     .fillColor(generator.colors.secondary)
     .font('Helvetica')
     .text(` (${(typeof routeData.dynamicStats.riskAnalysis.avgRiskScore === 'number' ? routeData.dynamicStats.riskAnalysis.avgRiskScore.toFixed(2) : routeData.dynamicStats.riskAnalysis.avgRiskScore || 'N/A')}/10)`);
  
  doc.y += 20;
  doc.text(`Total Data Points Analyzed: ${routeData.dynamicStats.totalDataPoints}`, 50, doc.y);
  doc.y += 15;
  doc.text(`Analysis Date: ${routeData.lastAnalyzed}`, 50, doc.y);
}

async function addRecommendationsPage(doc, routeData, generator) {
  // Recommendations page implementation
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.success).font('Helvetica-Bold')
     .text('SAFETY RECOMMENDATIONS & ACTION PLAN', 50, doc.y);
  
  doc.y += 40;
  
  // Priority Recommendations
  doc.fontSize(14).fillColor(generator.colors.danger).font('Helvetica-Bold')
     .text('HIGH PRIORITY RECOMMENDATIONS', 50, doc.y);
  
  doc.y += 25;
  doc.fontSize(11).font('Helvetica').fillColor(generator.colors.secondary);
  
  const highPriorityRecommendations = [];
  
  if (routeData.dynamicStats.riskAnalysis.criticalPoints > 0) {
    highPriorityRecommendations.push(`• Address ${routeData.dynamicStats.riskAnalysis.criticalPoints} critical risk points immediately`);
  }
  
  if ((routeData.dynamicStats.safetyMetrics.sharpTurnSeverity || 0) > 7) {
    highPriorityRecommendations.push('• Implement enhanced speed control measures for sharp turns');
  }
  
  if (routeData.relatedData.blindSpots > 5) {
    highPriorityRecommendations.push('• Install visibility enhancement systems at blind spots');
  }
  
  if (routeData.dynamicStats.infrastructureMetrics.roadQuality < 5) {
    highPriorityRecommendations.push('• Prioritize road maintenance and surface improvements');
  }
  
  if (highPriorityRecommendations.length === 0) {
    highPriorityRecommendations.push('• No critical issues identified - maintain current safety standards');
  }
  
  highPriorityRecommendations.forEach(rec => {
    doc.text(rec, 50, doc.y);
    doc.y += 18;
  });
  
  doc.y += 20;
  
  // General Safety Recommendations
  doc.fontSize(14).fillColor(generator.colors.warning).font('Helvetica-Bold')
     .text('GENERAL SAFETY RECOMMENDATIONS', 50, doc.y);
  
  doc.y += 25;
  doc.fontSize(11).font('Helvetica').fillColor(generator.colors.secondary);
  
  const generalRecommendations = [
    '• Conduct regular driver safety briefings before route execution',
    '• Maintain vehicle speed limits especially in high-risk zones',
    '• Ensure emergency contact numbers are readily available',
    '• Monitor weather conditions and adjust travel plans accordingly',
    '• Implement GPS tracking for real-time route monitoring',
    '• Establish communication checkpoints at regular intervals'
  ];
  
  generalRecommendations.forEach(rec => {
    doc.text(rec, 50, doc.y);
    doc.y += 18;
  });
  
  doc.y += 20;
  
  // Emergency Preparedness
  doc.fontSize(14).fillColor(generator.colors.info).font('Helvetica-Bold')
     .text('EMERGENCY PREPAREDNESS', 50, doc.y);
  
  doc.y += 25;
  doc.fontSize(11).font('Helvetica').fillColor(generator.colors.secondary);
  
  const emergencyPrep = [
    `• ${routeData.relatedData.emergencyServices} emergency services available along route`,
    '• Carry emergency contact list and first aid kit',
    '• Ensure mobile network coverage for emergency communications',
    '• Plan alternative routes in case of road closures',
    '• Maintain emergency fuel reserves for unexpected delays'
  ];
  
  emergencyPrep.forEach(prep => {
    doc.text(prep, 50, doc.y);
    doc.y += 18;
  });
  
  doc.y += 30;
  
  // Action Plan Summary
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('RECOMMENDED ACTION PLAN', 50, doc.y);
  
  doc.y += 25;
  
  const actionPlan = [
    ['Immediate (0-7 days)', 'Address critical risk points and safety briefings'],
    ['Short-term (1-4 weeks)', 'Implement enhanced monitoring and communication systems'],
    ['Medium-term (1-3 months)', 'Infrastructure improvements and route optimization'],
    ['Long-term (3+ months)', 'Comprehensive safety system upgrades']
  ];
  
  generator.createDetailedTable(doc, actionPlan, [150, 350]);
  
  doc.y += 20;
  doc.fontSize(10).fillColor(generator.colors.secondary)
     .text(`Report generated on: ${new Date().toLocaleDateString()} | Risk Grade: ${routeData.riskLevel} | Data Quality: ${routeData.dataQuality.score}%`, 50, doc.y);
}

async function addDetailedAnalysisPage(doc, routeData, generator) {
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.primary).font('Helvetica-Bold')
     .text('DETAILED ROUTE ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Hazard Analysis
  doc.fontSize(14).fillColor(generator.colors.danger).font('Helvetica-Bold')
     .text('HAZARD IDENTIFICATION & ANALYSIS', 50, doc.y);
  
  doc.y += 25;
  
  const hazardData = [
    ['Sharp Turns Identified', `${routeData.relatedData.sharpTurns} locations`],
    ['Blind Spots Detected', `${routeData.relatedData.blindSpots} visibility issues`],
    ['Accident Prone Areas', `${routeData.relatedData.accidentProneAreas} high-risk zones`],
    ['Poor Road Conditions', `${routeData.relatedData.roadConditions} segments`],
    ['Weather Risk Zones', `${routeData.relatedData.weatherConditions} areas`],
    ['Traffic Congestion Points', `${routeData.relatedData.trafficData} locations`]
  ];
  
  generator.createDetailedTable(doc, hazardData, [250, 250]);
  
  doc.y += 30;
  
  // Risk Factor Breakdown
  doc.fontSize(14).fillColor(generator.colors.warning).font('Helvetica-Bold')
     .text('RISK FACTOR BREAKDOWN', 50, doc.y);
  
  doc.y += 25;
  doc.fontSize(11).font('Helvetica').fillColor(generator.colors.secondary);
  
  const riskFactors = [
    `• Terrain Difficulty: ${routeData.dynamicStats.safetyMetrics.sharpTurnSeverity > 6 ? 'HIGH' : 'MODERATE'}`,
    `• Visibility Challenges: ${routeData.relatedData.blindSpots > 3 ? 'SIGNIFICANT' : 'MANAGEABLE'}`,
    `• Infrastructure Quality: ${routeData.dynamicStats.infrastructureMetrics.roadQuality < 5 ? 'POOR' : 'ACCEPTABLE'}`,
    `• Emergency Response: ${routeData.relatedData.emergencyServices > 2 ? 'ADEQUATE' : 'LIMITED'}`,
    `• Network Connectivity: ${routeData.dynamicStats.infrastructureMetrics.networkDeadZones > 5 ? 'POOR' : 'GOOD'}`,
    `• Weather Vulnerability: ${routeData.dynamicStats.infrastructureMetrics.weatherRisk > 6 ? 'HIGH' : 'MODERATE'}`
  ];
  
  riskFactors.forEach(factor => {
    doc.text(factor, 50, doc.y);
    doc.y += 18;
  });
}

async function addRouteMappingPage(doc, routeData, generator) {
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.info).font('Helvetica-Bold')
     .text('ROUTE MAPPING & GPS ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Route Information
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('ROUTE INFORMATION', 50, doc.y);
  
  doc.y += 25;
  
  const routeInfo = [
    ['Route Name', routeData.routeName || 'N/A'],
    ['From Location', routeData.fromName || routeData.fromAddress || 'N/A'],
    ['To Location', routeData.toName || routeData.toAddress || 'N/A'],
    ['Total Distance', `${routeData.totalDistance || 'N/A'} km`],
    ['Estimated Duration', routeData.estimatedDuration || 'N/A'],
    ['GPS Coordinates Available', routeData.gpsCoordinates ? 'Yes' : 'No']
  ];
  
  generator.createDetailedTable(doc, routeInfo, [200, 300]);
  
  doc.y += 30;
  
  // Critical Points Mapping
  doc.fontSize(14).fillColor(generator.colors.danger).font('Helvetica-Bold')
     .text('CRITICAL POINTS MAPPING', 50, doc.y);
  
  doc.y += 25;
  
  const criticalPoints = [
    ['High-Risk Intersections', `${Math.floor(routeData.dynamicStats.riskAnalysis.criticalPoints * 0.3)} locations`],
    ['Sharp Turn Clusters', `${Math.floor(routeData.relatedData.sharpTurns * 0.4)} zones`],
    ['Blind Spot Concentrations', `${Math.floor(routeData.relatedData.blindSpots * 0.5)} areas`],
    ['Accident Hotspots', `${routeData.relatedData.accidentProneAreas} documented locations`],
    ['Emergency Service Gaps', `${Math.max(0, 5 - routeData.relatedData.emergencyServices)} areas`],
    ['Network Dead Zones', `${routeData.dynamicStats.infrastructureMetrics.networkDeadZones} segments`]
  ];
  
  generator.createDetailedTable(doc, criticalPoints, [250, 250]);
  
  doc.y += 30;
  
  // GPS Analysis Summary
  doc.fontSize(14).fillColor(generator.colors.info).font('Helvetica-Bold')
     .text('GPS ANALYSIS SUMMARY', 50, doc.y);
  
  doc.y += 25;
  doc.fontSize(11).font('Helvetica').fillColor(generator.colors.secondary);
  
  doc.text(`• Total data points analyzed: ${routeData.dynamicStats.totalDataPoints}`, 50, doc.y);
  doc.y += 18;
  doc.text(`• Analysis coverage: ${routeData.dataQuality.score}% of route`, 50, doc.y);
  doc.y += 18;
  doc.text(`• Last updated: ${routeData.lastAnalyzed}`, 50, doc.y);
  doc.y += 18;
  doc.text(`• Data quality level: ${routeData.dataQuality.level.toUpperCase()}`, 50, doc.y);
}

async function addExecutiveSummaryPage(doc, routeData, generator) {
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.primary).font('Helvetica-Bold')
     .text('EXECUTIVE SUMMARY – ROUTE OVERVIEW', 50, doc.y);
  
  doc.y += 40;
  
  // Route Parameters Table
  const formatDuration = (minutes) => {
    if (!minutes) return 'Not specified';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours} hours ${mins} mins` : `${mins} minutes`;
  };
  
  const routeParams = [
    ['Parameter', 'Details'],
    ['Origin', `${routeData.fromAddress || 'N/A'} [${routeData.fromCode || 'N/A'}]`],
    ['Destination', `${routeData.toAddress || 'N/A'} [${routeData.toCode || 'N/A'}]`],
    ['Total Distance', `${routeData.totalDistance || 0} km`],
    ['Estimated Duration', formatDuration(routeData.estimatedDuration)],
    ['Major Highways', routeData.majorHighways ? routeData.majorHighways.join(', ') : 'N/A'],
    ['Terrain', routeData.terrain || 'Mixed']
  ];
  
  generator.createDetailedTable(doc, routeParams, [150, 350]);
  
  doc.y += 30;
  
  // Calculate overall risk score and level
  const avgRiskScore = routeData.dynamicStats?.riskAnalysis?.avgRiskScore || 3;
  const riskLevel = avgRiskScore <= 2 ? 'LOW RISK' : 
                   avgRiskScore <= 4 ? 'MILD RISK' : 
                   avgRiskScore <= 6 ? 'MODERATE RISK' : 
                   avgRiskScore <= 8 ? 'HIGH RISK' : 'CRITICAL RISK';
  
  // Total Weighted Route Score
  doc.fontSize(16).fillColor(generator.colors.primary).font('Helvetica-Bold')
     .text(`TOTAL WEIGHTED ROUTE SCORE: ${avgRiskScore.toFixed(1)} – ${riskLevel}`, 50, doc.y);
  
  doc.y += 30;
  
  // Risk Factor Rating Overview
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('RISK FACTOR RATING OVERVIEW', 50, doc.y);
  
  doc.y += 25;
  
  // Helper function to determine risk category
  const getRiskCategory = (score) => {
    if (score <= 2) return 'Low Risk';
    if (score <= 4) return 'Mild Risk';
    if (score <= 6) return 'Moderate Risk';
    if (score <= 8) return 'High Risk';
    return 'Critical Risk';
  };
  
  // Calculate dynamic risk scores based on actual route data
  const calculateRiskScore = (value, thresholds) => {
    if (value <= thresholds.low) return 1;
    if (value <= thresholds.mild) return 3;
    if (value <= thresholds.moderate) return 5;
    if (value <= thresholds.high) return 7;
    return 9;
  };
  
  // Dynamic risk calculations
  const roadConditionsScore = routeData.dynamicStats?.infrastructureMetrics?.roadQuality || 5;
  const accidentAreasScore = calculateRiskScore(routeData.relatedData?.accidentProneAreas || 0, {low: 1, mild: 3, moderate: 5, high: 8});
  const sharpTurnsScore = calculateRiskScore(routeData.relatedData?.sharpTurns || 0, {low: 2, mild: 5, moderate: 8, high: 12});
  const blindSpotsScore = calculateRiskScore(routeData.relatedData?.blindSpots || 0, {low: 1, mild: 3, moderate: 6, high: 10});
  const trafficScore = routeData.dynamicStats?.trafficMetrics?.avgDensity || 1;
  const weatherScore = routeData.dynamicStats?.weatherMetrics?.riskLevel || 3;
  const emergencyScore = calculateRiskScore(routeData.relatedData?.emergencyServices || 0, {low: 5, mild: 3, moderate: 2, high: 1});
  const networkScore = calculateRiskScore(routeData.relatedData?.networkCoverage || 100, {low: 90, mild: 70, moderate: 50, high: 30});
  const amenitiesScore = calculateRiskScore(routeData.relatedData?.roadsideAmenities || 0, {low: 5, mild: 3, moderate: 2, high: 1});
  const securityScore = routeData.dynamicStats?.securityMetrics?.riskLevel || 1;
  
  // Risk factors data with dynamic values
  const riskFactors = [
    ['Risk Criterion', 'Risk Score', 'Risk Category'],
    ['Road Conditions', roadConditionsScore.toFixed(1), getRiskCategory(roadConditionsScore)],
    ['Accident-Prone Areas', accidentAreasScore.toFixed(1), getRiskCategory(accidentAreasScore)],
    ['Sharp Turns', sharpTurnsScore.toFixed(1), getRiskCategory(sharpTurnsScore)],
    ['Blind Spots', blindSpotsScore.toFixed(1), getRiskCategory(blindSpotsScore)],
    ['Traffic Condition (Density)', trafficScore.toFixed(1), getRiskCategory(trafficScore)],
    ['Seasonal Weather Conditions', weatherScore.toFixed(1), getRiskCategory(weatherScore)],
    ['Emergency Handling Services', emergencyScore.toFixed(1), getRiskCategory(emergencyScore)],
    ['Network Dead/Low Zones', networkScore.toFixed(1), getRiskCategory(networkScore)],
    ['Roadside Amenities', amenitiesScore.toFixed(1), getRiskCategory(amenitiesScore)],
    ['Security & Social Issues', securityScore.toFixed(1), getRiskCategory(securityScore)]
  ];
  
  generator.createDetailedTable(doc, riskFactors, [200, 100, 150]);
}

// ============================================================================
// COMPREHENSIVE DETAILED ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Sharp Turns Detailed Analysis Page
 */
async function addSharpTurnsDetailedPage(doc, routeData, generator) {
  const Route = require('../models/Route');
  const SharpTurn = require('../models/SharpTurn');
  
  // Fetch detailed sharp turns data
  const sharpTurns = await SharpTurn.find({ routeId: routeData._id }).lean();
  
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.danger).font('Helvetica-Bold')
     .text('SHARP TURNS COMPREHENSIVE ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Summary Statistics
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('SHARP TURNS SUMMARY STATISTICS', 50, doc.y);
  
  doc.y += 25;
  
  const turnStats = {
    total: sharpTurns.length,
    hairpin: sharpTurns.filter(t => t.turnSeverity === 'hairpin').length,
    sharp: sharpTurns.filter(t => t.turnSeverity === 'sharp').length,
    moderate: sharpTurns.filter(t => t.turnSeverity === 'moderate').length,
    gentle: sharpTurns.filter(t => t.turnSeverity === 'gentle').length,
    avgRiskScore: sharpTurns.reduce((sum, t) => sum + (t.riskScore || 0), 0) / sharpTurns.length,
    criticalTurns: sharpTurns.filter(t => t.riskScore >= 8).length
  };
  
  const summaryData = [
    ['Total Sharp Turns Identified', turnStats.total.toString()],
    ['Hairpin Turns (Most Critical)', turnStats.hairpin.toString()],
    ['Sharp Turns', turnStats.sharp.toString()],
    ['Moderate Turns', turnStats.moderate.toString()],
    ['Gentle Turns', turnStats.gentle.toString()],
    ['Average Risk Score', (turnStats.avgRiskScore || 0).toFixed(2)],
    ['Critical Risk Turns (Score ≥ 8)', turnStats.criticalTurns.toString()]
  ];
  
  generator.createDetailedTable(doc, summaryData, [200, 300]);
  
  doc.y += 30;
  
  // Detailed Turn Analysis
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('DETAILED TURN-BY-TURN ANALYSIS', 50, doc.y);
  
  doc.y += 25;
  
  // Sort turns by risk score (highest first)
  const sortedTurns = sharpTurns.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
  
  sortedTurns.slice(0, 10).forEach((turn, index) => {
    if (doc.y > 700) {
      doc.addPage();
      generator.addDynamicTitlePageHeader(doc, routeData);
      doc.y = 100;
    }
    
    doc.fontSize(12).fillColor(generator.colors.primary).font('Helvetica-Bold')
       .text(`Turn ${index + 1}: ${turn.turnDirection?.toUpperCase() || 'UNKNOWN'} TURN`, 50, doc.y);
    
    doc.y += 20;
    
    const turnDetails = [
      ['Location', `${turn.latitude?.toFixed(6) || 'N/A'}, ${turn.longitude?.toFixed(6) || 'N/A'}`],
      ['Distance from Start', `${(turn.distanceFromStartKm || 0).toFixed(2)} km`],
      ['Turn Angle', `${turn.turnAngle || 'N/A'}°`],
      ['Turn Severity', turn.turnSeverity || 'N/A'],
      ['Risk Score', `${turn.riskScore || 'N/A'}/10`],
      ['Recommended Speed', `${turn.recommendedSpeed || 'N/A'} km/h`],
      ['Turn Radius', `${turn.turnRadius || 'N/A'} meters`]
    ];
    
    generator.createDetailedTable(doc, turnDetails, [150, 250], { compact: true });
    doc.y += 20;
  });
}

/**
 * Blind Spots Detailed Analysis Page
 */
async function addBlindSpotsDetailedPage(doc, routeData, generator) {
  const BlindSpot = require('../models/BlindSpot');
  
  // Fetch detailed blind spots data
  const blindSpots = await BlindSpot.find({ routeId: routeData._id }).lean();
  
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.warning).font('Helvetica-Bold')
     .text('BLIND SPOTS COMPREHENSIVE ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Summary Statistics
  const spotStats = {
    total: blindSpots.length,
    crest: blindSpots.filter(s => s.spotType === 'crest').length,
    curve: blindSpots.filter(s => s.spotType === 'curve').length,
    intersection: blindSpots.filter(s => s.spotType === 'intersection').length,
    obstruction: blindSpots.filter(s => s.spotType === 'obstruction').length,
    avgVisibility: blindSpots.reduce((sum, s) => sum + (s.visibilityDistance || 0), 0) / blindSpots.length,
    criticalSpots: blindSpots.filter(s => s.riskScore >= 8).length
  };
  
  const summaryData = [
    ['Total Blind Spots Identified', spotStats.total.toString()],
    ['Crest Blind Spots', spotStats.crest.toString()],
    ['Curve Blind Spots', spotStats.curve.toString()],
    ['Intersection Blind Spots', spotStats.intersection.toString()],
    ['Obstruction Blind Spots', spotStats.obstruction.toString()],
    ['Average Visibility Distance', `${(spotStats.avgVisibility || 0).toFixed(1)} meters`],
    ['Critical Risk Spots (Score ≥ 8)', spotStats.criticalSpots.toString()]
  ];
  
  generator.createDetailedTable(doc, summaryData, [200, 300]);
  
  doc.y += 30;
  
  // Detailed Spot Analysis
  const sortedSpots = blindSpots.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
  
  sortedSpots.slice(0, 8).forEach((spot, index) => {
    if (doc.y > 650) {
      doc.addPage();
      generator.addDynamicTitlePageHeader(doc, routeData);
      doc.y = 100;
    }
    
    doc.fontSize(12).fillColor(generator.colors.warning).font('Helvetica-Bold')
       .text(`Blind Spot ${index + 1}: ${spot.spotType?.toUpperCase() || 'UNKNOWN'} TYPE`, 50, doc.y);
    
    doc.y += 20;
    
    const spotDetails = [
      ['Location', `${spot.latitude?.toFixed(6) || 'N/A'}, ${spot.longitude?.toFixed(6) || 'N/A'}`],
      ['Distance from Start', `${(spot.distanceFromStartKm || 0).toFixed(2)} km`],
      ['Spot Type', spot.spotType || 'N/A'],
      ['Visibility Distance', `${spot.visibilityDistance || 'N/A'} meters`],
      ['Risk Score', `${spot.riskScore || 'N/A'}/10`],
      ['Severity Level', spot.severityLevel || 'N/A'],
      ['Obstruction Height', `${spot.obstructionHeight || 'N/A'} meters`]
    ];
    
    generator.createDetailedTable(doc, spotDetails, [150, 250], { compact: true });
    doc.y += 20;
  });
}

/**
 * Accident Prone Areas Detailed Analysis Page
 */
async function addAccidentAreasDetailedPage(doc, routeData, generator) {
  const AccidentProneArea = require('../models/AccidentProneArea');
  
  // Fetch detailed accident areas data
  const accidentAreas = await AccidentProneArea.find({ routeId: routeData._id }).lean();
  
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.danger).font('Helvetica-Bold')
     .text('ACCIDENT PRONE AREAS ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Summary Statistics
  const accidentStats = {
    total: accidentAreas.length,
    fatal: accidentAreas.filter(a => a.accidentSeverity === 'fatal').length,
    major: accidentAreas.filter(a => a.accidentSeverity === 'major').length,
    moderate: accidentAreas.filter(a => a.accidentSeverity === 'moderate').length,
    minor: accidentAreas.filter(a => a.accidentSeverity === 'minor').length,
    avgFrequency: accidentAreas.reduce((sum, a) => sum + (a.accidentFrequencyYearly || 0), 0) / accidentAreas.length,
    criticalAreas: accidentAreas.filter(a => a.riskScore >= 8).length
  };
  
  const summaryData = [
    ['Total Accident Prone Areas', accidentStats.total.toString()],
    ['Fatal Accident Areas', accidentStats.fatal.toString()],
    ['Major Accident Areas', accidentStats.major.toString()],
    ['Moderate Accident Areas', accidentStats.moderate.toString()],
    ['Minor Accident Areas', accidentStats.minor.toString()],
    ['Average Yearly Frequency', (accidentStats.avgFrequency || 0).toFixed(1)],
    ['Critical Risk Areas (Score ≥ 8)', accidentStats.criticalAreas.toString()]
  ];
  
  generator.createDetailedTable(doc, summaryData, [200, 300]);
  
  doc.y += 30;
  
  // Detailed Area Analysis
  const sortedAreas = accidentAreas.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
  
  sortedAreas.slice(0, 6).forEach((area, index) => {
    if (doc.y > 600) {
      doc.addPage();
      generator.addDynamicTitlePageHeader(doc, routeData);
      doc.y = 100;
    }
    
    doc.fontSize(12).fillColor(generator.colors.danger).font('Helvetica-Bold')
       .text(`Accident Area ${index + 1}: ${area.accidentSeverity?.toUpperCase() || 'UNKNOWN'} SEVERITY`, 50, doc.y);
    
    doc.y += 20;
    
    const areaDetails = [
      ['Location', `${area.latitude?.toFixed(6) || 'N/A'}, ${area.longitude?.toFixed(6) || 'N/A'}`],
      ['Distance from Start', `${(area.distanceFromStartKm || 0).toFixed(2)} km`],
      ['Accident Severity', area.accidentSeverity || 'N/A'],
      ['Yearly Frequency', `${area.accidentFrequencyYearly || 'N/A'} accidents/year`],
      ['Risk Score', `${area.riskScore || 'N/A'}/10`],
      ['Weather Risk', `${area.weatherRelatedRisk || 'N/A'}/10`],
      ['Infrastructure Risk', `${area.infrastructureRisk || 'N/A'}/10`],
      ['Traffic Volume Risk', `${area.trafficVolumeRisk || 'N/A'}/10`]
    ];
    
    generator.createDetailedTable(doc, areaDetails, [150, 250], { compact: true });
    doc.y += 20;
  });
}

/**
 * Road Conditions Detailed Analysis Page
 */
async function addRoadConditionsDetailedPage(doc, routeData, generator) {
  const RoadCondition = require('../models/RoadCondition');
  
  // Fetch detailed road conditions data
  const roadConditions = await RoadCondition.find({ routeId: routeData._id }).lean();
  
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.info).font('Helvetica-Bold')
     .text('ROAD CONDITIONS COMPREHENSIVE ASSESSMENT', 50, doc.y);
  
  doc.y += 40;
  
  // Summary Statistics
  const roadStats = {
    total: roadConditions.length,
    excellent: roadConditions.filter(r => r.surfaceQuality === 'excellent').length,
    good: roadConditions.filter(r => r.surfaceQuality === 'good').length,
    fair: roadConditions.filter(r => r.surfaceQuality === 'fair').length,
    poor: roadConditions.filter(r => r.surfaceQuality === 'poor').length,
    critical: roadConditions.filter(r => r.surfaceQuality === 'critical').length,
    avgWidth: roadConditions.reduce((sum, r) => sum + (r.widthMeters || 0), 0) / roadConditions.length,
    potholes: roadConditions.filter(r => r.hasPotholes).length,
    construction: roadConditions.filter(r => r.underConstruction).length
  };
  
  const summaryData = [
    ['Total Road Segments Analyzed', roadStats.total.toString()],
    ['Excellent Condition', roadStats.excellent.toString()],
    ['Good Condition', roadStats.good.toString()],
    ['Fair Condition', roadStats.fair.toString()],
    ['Poor Condition', roadStats.poor.toString()],
    ['Critical Condition', roadStats.critical.toString()],
    ['Average Road Width', `${(roadStats.avgWidth || 0).toFixed(1)} meters`],
    ['Segments with Potholes', roadStats.potholes.toString()],
    ['Under Construction', roadStats.construction.toString()]
  ];
  
  generator.createDetailedTable(doc, summaryData, [200, 300]);
  
  doc.y += 30;
  
  // Quality Distribution Analysis
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('ROAD QUALITY DISTRIBUTION ANALYSIS', 50, doc.y);
  
  doc.y += 25;
  
  const qualityPercentages = [
    ['Excellent Roads', `${((roadStats.excellent / roadStats.total) * 100).toFixed(1)}%`],
    ['Good Roads', `${((roadStats.good / roadStats.total) * 100).toFixed(1)}%`],
    ['Fair Roads', `${((roadStats.fair / roadStats.total) * 100).toFixed(1)}%`],
    ['Poor Roads', `${((roadStats.poor / roadStats.total) * 100).toFixed(1)}%`],
    ['Critical Roads', `${((roadStats.critical / roadStats.total) * 100).toFixed(1)}%`]
  ];
  
  generator.createDetailedTable(doc, qualityPercentages, [200, 300]);
}

/**
 * Weather Analysis Detailed Page
 */
async function addWeatherAnalysisDetailedPage(doc, routeData, generator) {
  const WeatherCondition = require('../models/WeatherCondition');
  
  // Fetch detailed weather data
  const weatherConditions = await WeatherCondition.find({ routeId: routeData._id }).lean();
  
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.warning).font('Helvetica-Bold')
     .text('WEATHER CONDITIONS COMPREHENSIVE ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Weather Statistics
  const weatherStats = {
    total: weatherConditions.length,
    clear: weatherConditions.filter(w => w.weatherCondition === 'clear').length,
    rainy: weatherConditions.filter(w => w.weatherCondition === 'rainy').length,
    foggy: weatherConditions.filter(w => w.weatherCondition === 'foggy').length,
    stormy: weatherConditions.filter(w => w.weatherCondition === 'stormy').length,
    avgTemp: weatherConditions.reduce((sum, w) => sum + (w.averageTemperature || 0), 0) / weatherConditions.length,
    avgHumidity: weatherConditions.reduce((sum, w) => sum + (w.humidity || 0), 0) / weatherConditions.length,
    avgVisibility: weatherConditions.reduce((sum, w) => sum + (w.visibilityKm || 0), 0) / weatherConditions.length,
    highRisk: weatherConditions.filter(w => w.riskScore >= 7).length
  };
  
  const summaryData = [
    ['Total Weather Data Points', weatherStats.total.toString()],
    ['Clear Weather Zones', weatherStats.clear.toString()],
    ['Rainy Weather Zones', weatherStats.rainy.toString()],
    ['Foggy Weather Zones', weatherStats.foggy.toString()],
    ['Stormy Weather Zones', weatherStats.stormy.toString()],
    ['Average Temperature', `${(weatherStats.avgTemp || 0).toFixed(1)}°C`],
    ['Average Humidity', `${(weatherStats.avgHumidity || 0).toFixed(1)}%`],
    ['Average Visibility', `${(weatherStats.avgVisibility || 0).toFixed(1)} km`],
    ['High Risk Weather Zones', weatherStats.highRisk.toString()]
  ];
  
  generator.createDetailedTable(doc, summaryData, [200, 300]);
}

/**
 * Traffic Analysis Detailed Page
 */
async function addTrafficAnalysisDetailedPage(doc, routeData, generator) {
  const TrafficData = require('../models/TrafficData');
  
  // Fetch detailed traffic data
  const trafficData = await TrafficData.find({ routeId: routeData._id }).lean();
  
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.primary).font('Helvetica-Bold')
     .text('TRAFFIC CONDITIONS COMPREHENSIVE ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Traffic Statistics
  const trafficStats = {
    total: trafficData.length,
    freeFlow: trafficData.filter(t => t.congestionLevel === 'free_flow').length,
    light: trafficData.filter(t => t.congestionLevel === 'light').length,
    moderate: trafficData.filter(t => t.congestionLevel === 'moderate').length,
    heavy: trafficData.filter(t => t.congestionLevel === 'heavy').length,
    severe: trafficData.filter(t => t.congestionLevel === 'severe').length,
    avgSpeed: trafficData.reduce((sum, t) => sum + (t.averageSpeedKmph || 0), 0) / trafficData.length,
    tollPoints: trafficData.reduce((sum, t) => sum + (t.tollPoints || 0), 0),
    constructionZones: trafficData.reduce((sum, t) => sum + (t.constructionZones || 0), 0)
  };
  
  const summaryData = [
    ['Total Traffic Data Points', trafficStats.total.toString()],
    ['Free Flow Zones', trafficStats.freeFlow.toString()],
    ['Light Traffic Zones', trafficStats.light.toString()],
    ['Moderate Traffic Zones', trafficStats.moderate.toString()],
    ['Heavy Traffic Zones', trafficStats.heavy.toString()],
    ['Severe Congestion Zones', trafficStats.severe.toString()],
    ['Average Speed', `${(trafficStats.avgSpeed || 0).toFixed(1)} km/h`],
    ['Total Toll Points', trafficStats.tollPoints.toString()],
    ['Construction Zones', trafficStats.constructionZones.toString()]
  ];
  
  generator.createDetailedTable(doc, summaryData, [200, 300]);
}

/**
 * Emergency Services Detailed Analysis Page
 */
async function addEmergencyServicesDetailedPage(doc, routeData, generator) {
  const EmergencyService = require('../models/EmergencyService');
  
  // Fetch detailed emergency services data
  const emergencyServices = await EmergencyService.find({ routeId: routeData._id }).lean();
  
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.success).font('Helvetica-Bold')
     .text('EMERGENCY SERVICES COMPREHENSIVE ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Emergency Services Statistics
  const serviceStats = {
    total: emergencyServices.length,
    hospitals: emergencyServices.filter(s => s.serviceType === 'hospital').length,
    police: emergencyServices.filter(s => s.serviceType === 'police').length,
    fireStations: emergencyServices.filter(s => s.serviceType === 'fire_station').length,
    mechanics: emergencyServices.filter(s => s.serviceType === 'mechanic').length,
    avgDistance: emergencyServices.reduce((sum, s) => sum + (s.distanceFromRouteKm || 0), 0) / emergencyServices.length,
    avgResponse: emergencyServices.reduce((sum, s) => sum + (s.responseTimeMinutes || 0), 0) / emergencyServices.length,
    critical: emergencyServices.filter(s => s.priority === 'critical').length,
    available24h: emergencyServices.filter(s => s.isOpen24Hours).length
  };
  
  const summaryData = [
    ['Total Emergency Services', serviceStats.total.toString()],
    ['Hospitals Available', serviceStats.hospitals.toString()],
    ['Police Stations', serviceStats.police.toString()],
    ['Fire Stations', serviceStats.fireStations.toString()],
    ['Mechanic Services', serviceStats.mechanics.toString()],
    ['Average Distance from Route', `${(serviceStats.avgDistance || 0).toFixed(1)} km`],
    ['Average Response Time', `${(serviceStats.avgResponse || 0).toFixed(1)} minutes`],
    ['Critical Priority Services', serviceStats.critical.toString()],
    ['24/7 Available Services', serviceStats.available24h.toString()]
  ];
  
  generator.createDetailedTable(doc, summaryData, [200, 300]);
}

/**
 * Network Coverage Detailed Analysis Page
 */
async function addNetworkCoverageDetailedPage(doc, routeData, generator) {
  const NetworkCoverage = require('../models/NetworkCoverage');
  
  // Fetch detailed network coverage data
  const networkCoverage = await NetworkCoverage.find({ routeId: routeData._id }).lean();
  
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.info).font('Helvetica-Bold')
     .text('NETWORK COVERAGE COMPREHENSIVE ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Network Coverage Statistics
  const networkStats = {
    total: networkCoverage.length,
    fullCoverage: networkCoverage.filter(n => n.coverageType === 'full_coverage').length,
    partialCoverage: networkCoverage.filter(n => n.coverageType === 'partial_coverage').length,
    weakSignal: networkCoverage.filter(n => n.coverageType === 'weak_signal').length,
    deadZones: networkCoverage.filter(n => n.coverageType === 'dead_zone').length,
    avgSignal: networkCoverage.reduce((sum, n) => sum + (n.signalStrength || 0), 0) / networkCoverage.length,
    criticalZones: networkCoverage.filter(n => n.communicationRisk >= 8).length
  };
  
  const summaryData = [
    ['Total Coverage Data Points', networkStats.total.toString()],
    ['Full Coverage Zones', networkStats.fullCoverage.toString()],
    ['Partial Coverage Zones', networkStats.partialCoverage.toString()],
    ['Weak Signal Zones', networkStats.weakSignal.toString()],
    ['Dead Zones', networkStats.deadZones.toString()],
    ['Average Signal Strength', `${(networkStats.avgSignal || 0).toFixed(1)}/10`],
    ['Critical Communication Risk', networkStats.criticalZones.toString()]
  ];
  
  generator.createDetailedTable(doc, summaryData, [200, 300]);
}

/**
 * Statistical Analysis Page
 */
async function addStatisticalAnalysisPage(doc, routeData, generator) {
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.primary).font('Helvetica-Bold')
     .text('STATISTICAL ANALYSIS & RISK CORRELATIONS', 50, doc.y);
  
  doc.y += 40;
  
  // Overall Risk Distribution
  const riskDistribution = routeData.dynamicStats.riskAnalysis.riskDistribution;
  const totalRiskPoints = Object.values(riskDistribution).reduce((sum, val) => sum + val, 0);
  
  const riskData = [
    ['Low Risk Points', `${riskDistribution.low} (${((riskDistribution.low/totalRiskPoints)*100).toFixed(1)}%)`],
    ['Medium Risk Points', `${riskDistribution.medium} (${((riskDistribution.medium/totalRiskPoints)*100).toFixed(1)}%)`],
    ['High Risk Points', `${riskDistribution.high} (${((riskDistribution.high/totalRiskPoints)*100).toFixed(1)}%)`],
    ['Critical Risk Points', `${riskDistribution.critical} (${((riskDistribution.critical/totalRiskPoints)*100).toFixed(1)}%)`]
  ];
  
  generator.createDetailedTable(doc, riskData, [200, 300]);
}

/**
 * Comparative Analysis Page
 */
async function addComparativeAnalysisPage(doc, routeData, generator) {
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('COMPARATIVE RISK ANALYSIS', 50, doc.y);
  
  doc.y += 40;
  
  // Route comparison with industry standards
  const comparisonData = [
    ['Route Risk Level', routeData.riskLevel || 'N/A'],
    ['Industry Average Risk', 'MEDIUM'],
    ['Route Performance', routeData.riskLevel === 'LOW' ? 'Above Average' : routeData.riskLevel === 'HIGH' ? 'Below Average' : 'Average'],
    ['Total Data Points Analyzed', routeData.dynamicStats.totalDataPoints.toString()],
    ['Critical Points Identified', routeData.dynamicStats.riskAnalysis.criticalPoints.toString()],
    ['Risk Score Range', `1-${routeData.dynamicStats.riskAnalysis.maxRiskScore}`]
  ];
  
  generator.createDetailedTable(doc, comparisonData, [200, 300]);
}

/**
 * Mitigation Strategies Page
 */
async function addMitigationStrategiesPage(doc, routeData, generator) {
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.warning).font('Helvetica-Bold')
     .text('RISK MITIGATION STRATEGIES', 50, doc.y);
  
  doc.y += 40;
  
  // Mitigation strategies based on route data
  doc.fontSize(14).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('RECOMMENDED MITIGATION STRATEGIES', 50, doc.y);
  
  doc.y += 25;
  
  const strategies = [
    'Implement speed reduction protocols in high-risk zones',
    'Establish communication checkpoints in dead zones',
    'Deploy emergency response teams at critical points',
    'Conduct regular route condition assessments',
    'Provide driver training for identified hazards',
    'Install additional safety signage at blind spots',
    'Coordinate with local authorities for traffic management',
    'Develop alternative route options for severe weather'
  ];
  
  strategies.forEach((strategy, index) => {
    doc.fontSize(11).fillColor(generator.colors.secondary).font('Helvetica')
       .text(`${index + 1}. ${strategy}`, 70, doc.y);
    doc.y += 20;
  });
}

/**
 * Implementation Guidelines Page
 */
async function addImplementationGuidelinesPage(doc, routeData, generator) {
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.success).font('Helvetica-Bold')
     .text('IMPLEMENTATION GUIDELINES', 50, doc.y);
  
  doc.y += 40;
  
  // Implementation phases
  const phases = [
    {
      title: 'Phase 1: Immediate Actions (0-30 days)',
      actions: [
        'Brief drivers on identified critical points',
        'Implement speed restrictions in high-risk zones',
        'Establish emergency communication protocols'
      ]
    },
    {
      title: 'Phase 2: Short-term Improvements (1-6 months)',
      actions: [
        'Install additional safety equipment',
        'Conduct driver training programs',
        'Establish partnerships with local emergency services'
      ]
    },
    {
      title: 'Phase 3: Long-term Enhancements (6+ months)',
      actions: [
        'Infrastructure improvements where possible',
        'Technology upgrades for better monitoring',
        'Regular route reassessment and updates'
      ]
    }
  ];
  
  phases.forEach(phase => {
    doc.fontSize(14).fillColor(generator.colors.primary).font('Helvetica-Bold')
       .text(phase.title, 50, doc.y);
    doc.y += 25;
    
    phase.actions.forEach(action => {
      doc.fontSize(11).fillColor(generator.colors.secondary).font('Helvetica')
         .text(`• ${action}`, 70, doc.y);
      doc.y += 18;
    });
    
    doc.y += 15;
  });
}

/**
 * Appendices Page
 */
async function addAppendicesPage(doc, routeData, generator) {
  generator.addDynamicTitlePageHeader(doc, routeData);
  doc.y = 100;
  
  doc.fontSize(20).fillColor(generator.colors.secondary).font('Helvetica-Bold')
     .text('APPENDICES & REFERENCES', 50, doc.y);
  
  doc.y += 40;
  
  // Technical specifications
  doc.fontSize(14).fillColor(generator.colors.primary).font('Helvetica-Bold')
     .text('TECHNICAL SPECIFICATIONS', 50, doc.y);
  
  doc.y += 25;
  
  const techSpecs = [
    ['Analysis Date', new Date().toLocaleDateString()],
    ['Report Version', '2.0'],
    ['Data Sources', 'Multiple APIs and databases'],
    ['Analysis Method', 'Comprehensive risk assessment'],
    ['Confidence Level', '85-95%'],
    ['Update Frequency', 'Monthly or as needed']
  ];
  
  generator.createDetailedTable(doc, techSpecs, [200, 300]);
  
  doc.y += 30;
  
  // Contact information
  doc.fontSize(14).fillColor(generator.colors.primary).font('Helvetica-Bold')
     .text('CONTACT INFORMATION', 50, doc.y);
  
  doc.y += 25;
  
  doc.fontSize(11).fillColor(generator.colors.secondary).font('Helvetica')
     .text('HPCL Journey Risk Management System', 50, doc.y);
  doc.y += 15;
  doc.text('Email: risk.management@hpcl.co.in', 50, doc.y);
  doc.y += 15;
  doc.text('Emergency Hotline: 1800-XXX-XXXX', 50, doc.y);
  doc.y += 15;
  doc.text('Website: www.hpcl.co.in/risk-management', 50, doc.y);
}

module.exports = router;