// File: routes/dynamicReports.js
// Purpose: Dynamic Report Generation API endpoints
// Uses existing data collection endpoints to create comprehensive route reports

const express = require('express');
const { auth } = require('../middleware/auth');
const DynamicReportService = require('../services/dynamicReportService');
const Route = require('../models/Route');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../utils/logger');

const router = express.Router();
const dynamicReportService = new DynamicReportService();

// All routes require authentication
router.use(auth);

/**
 * Generate comprehensive dynamic report for a route
 * POST /api/dynamic-reports/routes/:routeId/generate
 */
router.post('/routes/:routeId/generate', async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;
    const { 
      format = 'pdf',
      includeAnalysis = ['all'],
      download = true,
      filename
    } = req.body;

    logger.info(`🚀 Generating dynamic report for route: ${routeId}`);

    // Validate route access
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

    // Generate safe filename
    const safeRouteName = (route.routeName || route.routeId)
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .substring(0, 50);
    
    const reportFilename = filename || `HPCL-Dynamic-Report-${safeRouteName}-${Date.now()}.pdf`;
    const outputPath = path.join('./downloads/pdf-reports', reportFilename);

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Generate comprehensive dynamic report
    const result = await dynamicReportService.generateDynamicReport(routeId, userId, {
      outputPath,
      format,
      includeAnalysis
    });

    // Log generation details
    logger.info(`✅ Dynamic report generated successfully`);
    logger.info(`📊 Data points analyzed: ${result.metadata.dataPoints}`);
    logger.info(`⚠️ Risk level: ${result.metadata.riskLevel}`);

    if (download) {
      // Send file for download
      res.download(outputPath, reportFilename, (err) => {
        if (err) {
          logger.error('Error sending PDF:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Error sending PDF file'
            });
          }
        } else {
          // Clean up file after download
          setTimeout(async () => {
            try {
              await fs.unlink(outputPath);
              logger.info(`🗑️ Cleaned up report file: ${reportFilename}`);
            } catch (cleanupError) {
              logger.warn('Warning: Could not clean up report file:', cleanupError.message);
            }
          }, 60000); // Delete after 1 minute
        }
      });
    } else {
      // Return report information
      res.status(200).json({
        success: true,
        message: 'Dynamic report generated successfully',
        data: {
          filename: reportFilename,
          downloadUrl: `/api/dynamic-reports/download/${reportFilename}`,
          reportSummary: {
            routeId: result.reportData.routeId,
            routeName: result.reportData.routeName,
            totalDistance: result.reportData.totalDistance,
            riskLevel: result.metadata.riskLevel,
            dataPoints: result.metadata.dataPoints,
            criticalPoints: result.reportData.dynamicStats.riskAnalysis.criticalPoints
          },
          analysisBreakdown: {
            visibilityAnalysis: {
              sharpTurns: result.reportData.visibilityAnalysis.sharpTurns.total,
              blindSpots: result.reportData.visibilityAnalysis.blindSpots.total,
              avgRiskScore: result.reportData.visibilityAnalysis.sharpTurns.avgRiskScore
            },
            networkCoverage: {
              totalCoverage: result.reportData.networkCoverage.totalCoverage,
              deadZones: result.reportData.networkCoverage.deadZones,
              riskLevel: result.reportData.networkCoverage.riskLevel
            },
            roadConditions: {
              avgQuality: result.reportData.roadConditions.avgQuality,
              poorSegments: result.reportData.roadConditions.poorSegments,
              riskLevel: result.reportData.roadConditions.riskLevel
            },
            emergencyServices: {
              total: result.reportData.emergencyServices.total,
              avgDistance: result.reportData.emergencyServices.avgDistance,
              riskLevel: result.reportData.emergencyServices.riskLevel
            }
          },
          generatedAt: result.metadata.generatedAt
        }
      });
    }

  } catch (error) {
    logger.error(`❌ Error generating dynamic report: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error generating dynamic report',
      error: error.message,
      troubleshooting: [
        'Ensure route has been analyzed and contains data',
        'Check if all required services are running',
        'Verify sufficient disk space for report generation',
        'Ensure database connectivity'
      ]
    });
  }
});

/**
 * Get route data summary for report preview
 * GET /api/dynamic-reports/routes/:routeId/preview
 */
router.get('/routes/:routeId/preview', async (req, res) => {
  try {
    const { routeId } = req.params;
    const userId = req.user.id;

    logger.info(`👀 Generating report preview for route: ${routeId}`);

    // Collect route data without generating PDF
    const reportData = await dynamicReportService.collectRouteData(routeId, userId);

    res.status(200).json({
      success: true,
      message: 'Report preview generated successfully',
      data: {
        routeInfo: {
          routeId: reportData.routeId,
          routeName: reportData.routeName,
          fromName: reportData.fromName,
          toName: reportData.toName,
          totalDistance: reportData.totalDistance,
          estimatedDuration: reportData.estimatedDuration,
          terrain: reportData.terrain
        },
        riskSummary: {
          overallRiskScore: reportData.dynamicStats.riskAnalysis.avgRiskScore,
          riskLevel: reportData.dynamicStats.riskAnalysis.riskLevel,
          criticalPoints: reportData.dynamicStats.riskAnalysis.criticalPoints,
          riskFactors: reportData.dynamicStats.riskAnalysis.riskFactors
        },
        dataAvailability: {
          visibilityData: {
            sharpTurns: reportData.visibilityAnalysis.sharpTurns.total,
            blindSpots: reportData.visibilityAnalysis.blindSpots.total,
            available: reportData.visibilityAnalysis.sharpTurns.total > 0 || reportData.visibilityAnalysis.blindSpots.total > 0
          },
          networkData: {
            coverage: reportData.networkCoverage.totalCoverage,
            deadZones: reportData.networkCoverage.deadZones,
            available: reportData.networkCoverage.totalCoverage !== null
          },
          roadConditions: {
            avgQuality: reportData.roadConditions.avgQuality,
            poorSegments: reportData.roadConditions.poorSegments,
            available: reportData.roadConditions.avgQuality !== null
          },
          emergencyServices: {
            total: reportData.emergencyServices.total,
            available: reportData.emergencyServices.total > 0
          }
        },
        reportMetadata: reportData.reportMetadata
      }
    });

  } catch (error) {
    logger.error(`❌ Error generating report preview: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error generating report preview',
      error: error.message
    });
  }
});

/**
 * Get available analysis data for a route
 * GET /api/dynamic-reports/routes/:routeId/data-status
 */
router.get('/routes/:routeId/data-status', async (req, res) => {
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
        message: 'Route not found or access denied'
      });
    }

    // Check data availability across all endpoints
    const [sharpTurns, blindSpots, accidentAreas, roadConditions, networkCoverage, trafficData, emergencyServices] = await Promise.all([
      require('../models/SharpTurn').countDocuments({ routeId }),
      require('../models/BlindSpot').countDocuments({ routeId }),
      require('../models/AccidentProneArea').countDocuments({ routeId }),
      require('../models/RoadCondition').countDocuments({ routeId }),
      require('../models/NetworkCoverage').countDocuments({ routeId }),
      require('../models/TrafficData').countDocuments({ routeId }),
      require('../models/EmergencyService').countDocuments({ routeId })
    ]);

    const dataStatus = {
      routeId,
      routeName: route.routeName,
      lastAnalyzed: route.lastAnalyzed,
      dataAvailability: {
        sharpTurns: { count: sharpTurns, available: sharpTurns > 0 },
        blindSpots: { count: blindSpots, available: blindSpots > 0 },
        accidentAreas: { count: accidentAreas, available: accidentAreas > 0 },
        roadConditions: { count: roadConditions, available: roadConditions > 0 },
        networkCoverage: { count: networkCoverage, available: networkCoverage > 0 },
        trafficData: { count: trafficData, available: trafficData > 0 },
        emergencyServices: { count: emergencyServices, available: emergencyServices > 0 }
      },
      totalDataPoints: sharpTurns + blindSpots + accidentAreas + roadConditions + networkCoverage + trafficData + emergencyServices,
      readinessScore: this.calculateReadinessScore({
        sharpTurns, blindSpots, accidentAreas, roadConditions, 
        networkCoverage, trafficData, emergencyServices
      }),
      recommendations: this.generateDataRecommendations({
        sharpTurns, blindSpots, accidentAreas, roadConditions, 
        networkCoverage, trafficData, emergencyServices
      })
    };

    res.status(200).json({
      success: true,
      message: 'Data status retrieved successfully',
      data: dataStatus
    });

  } catch (error) {
    logger.error(`❌ Error checking data status: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error checking data status',
      error: error.message
    });
  }
});

/**
 * Download generated report file
 * GET /api/dynamic-reports/download/:filename
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join('./downloads/pdf-reports', filename);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Report file not found'
      });
    }

    // Send file for download
    res.download(filePath, filename);

  } catch (error) {
    logger.error(`❌ Error downloading report: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error downloading report',
      error: error.message
    });
  }
});

// Helper methods
function calculateReadinessScore(data) {
  const weights = {
    sharpTurns: 20,
    blindSpots: 20,
    accidentAreas: 15,
    roadConditions: 15,
    networkCoverage: 10,
    trafficData: 10,
    emergencyServices: 10
  };

  let score = 0;
  Object.keys(weights).forEach(key => {
    if (data[key] > 0) {
      score += weights[key];
    }
  });

  return score;
}

function generateDataRecommendations(data) {
  const recommendations = [];
  
  if (data.sharpTurns === 0) {
    recommendations.push('Run visibility analysis to identify sharp turns');
  }
  if (data.blindSpots === 0) {
    recommendations.push('Analyze route for blind spots and visibility issues');
  }
  if (data.accidentAreas === 0) {
    recommendations.push('Collect accident-prone area data for better risk assessment');
  }
  if (data.roadConditions === 0) {
    recommendations.push('Analyze road conditions along the route');
  }
  if (data.networkCoverage === 0) {
    recommendations.push('Check network coverage and dead zones');
  }
  if (data.emergencyServices === 0) {
    recommendations.push('Map emergency services along the route');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('All data sources available - ready for comprehensive report generation');
  }
  
  return recommendations;
}

module.exports = router;