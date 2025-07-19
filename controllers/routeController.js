// File: controllers/routeController.js
// Purpose: Handle GPS route CSV upload with metadata and route management
// GPS CSV format: Each line contains "latitude,longitude" coordinates (two-column format)

const fs = require('fs');
const csv = require('csv-parser');
const { validationResult } = require('express-validator');
const Route = require('../models/Route');

// Simple distance calculation function
function calculateSimpleDistance(coord1, coord2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return Math.round(distance * 100) / 100;
}

// Calculate total route distance from GPS points
function calculateTotalRouteDistance(gpsPoints) {
  let totalDistance = 0;
  for (let i = 1; i < gpsPoints.length; i++) {
    totalDistance += calculateSimpleDistance(gpsPoints[i-1], gpsPoints[i]);
  }
  return totalDistance;
}

// Create Route Manually
exports.createRoute = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      routeName,
      fromAddress, fromCode, fromName, fromCoordinates,
      toAddress, toCode, toName, toCoordinates,
      terrain, majorHighways
    } = req.body;

    // Calculate distance and duration (simplified)
    const distance = calculateSimpleDistance(fromCoordinates, toCoordinates);
    const duration = Math.round(distance * 1.2); // Rough estimate
    
    // Generate simple route points
    const routePoints = [
      {
        latitude: fromCoordinates.latitude,
        longitude: fromCoordinates.longitude,
        pointOrder: 0,
        distanceFromStart: 0,
        distanceToEnd: distance
      },
      {
        latitude: toCoordinates.latitude,
        longitude: toCoordinates.longitude,
        pointOrder: 1,
        distanceFromStart: distance,
        distanceToEnd: 0
      }
    ];

    const route = new Route({
      userId: req.user.id,
      routeName,
      fromAddress,
      fromCode,
      fromName,
      fromCoordinates,
      toAddress,
      toCode,
      toName,
      toCoordinates,
      totalDistance: distance,
      estimatedDuration: duration,
      routePoints,
      terrain: terrain || 'mixed',
      majorHighways: majorHighways || [],
      metadata: {
        uploadSource: 'manual',
        processingNotes: ['Route created manually']
      }
    });

    // Generate live map link
    route.generateLiveMapLink();

    await route.save();

    console.log(`Route created manually: ${route.routeId} by user: ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'Route created successfully',
      route: {
        id: route._id,
        routeId: route.routeId,
        routeName: route.routeName,
        fromAddress: route.fromAddress,
        toAddress: route.toAddress,
        totalDistance: route.totalDistance,
        estimatedDuration: route.estimatedDuration,
        liveMapLink: route.liveMapLink
      }
    });

  } catch (error) {
    console.error('Create route error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating route',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// FIXED: Upload GPS Route CSV with proper two-column parsing
exports.uploadGPSRoute = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No GPS CSV file uploaded'
      });
    }

    // Get route metadata from request body
    const {
      fromCode,
      fromName,
      toCode,
      toName,
      routeName,
      terrain,
      majorHighways,
      fromAddress,
      toAddress
    } = req.body;

    // Validate required metadata
    if (!fromCode || !fromName || !toCode || !toName) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Required metadata missing: fromCode, fromName, toCode, toName are mandatory'
      });
    }

    const gpsPoints = [];
    const errors = [];
    let lineNumber = 0;

    // FIXED: Parse GPS CSV file with proper two-column handling
    fs.createReadStream(req.file.path)
      .pipe(csv({ 
        headers: false,
        skipEmptyLines: true,
        trim: true
      }))
      .on('data', (data) => {
        lineNumber++;
        try {
          // Convert data object to array and handle both single and two-column formats
          const dataArray = Object.values(data);
          
          let latitude, longitude;
          
          if (dataArray.length >= 2) {
            // Two-column format: latitude, longitude (most common)
            latitude = parseFloat(dataArray[0]);
            longitude = parseFloat(dataArray[1]);
          } else if (dataArray.length === 1) {
            // Single-column format: "latitude,longitude"
            const coords = dataArray[0].trim().split(/[,\s]+/);
            if (coords.length >= 2) {
              latitude = parseFloat(coords[0]);
              longitude = parseFloat(coords[1]);
            } else {
              throw new Error('Insufficient coordinate data');
            }
          } else {
            throw new Error('No coordinate data found');
          }

          // Validate parsed coordinates
          if (isNaN(latitude) || isNaN(longitude)) {
            errors.push({
              line: lineNumber,
              error: 'Invalid coordinate values (not numbers)',
              data: dataArray.join(',')
            });
            return;
          }

          // Validate coordinate ranges
          if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            errors.push({
              line: lineNumber,
              error: 'Coordinates out of valid range',
              data: `${latitude},${longitude}`
            });
            return;
          }

          gpsPoints.push({
            latitude,
            longitude,
            pointOrder: lineNumber - 1,
            originalLine: dataArray.join(',')
          });

        } catch (parseError) {
          errors.push({
            line: lineNumber,
            error: `Parse error: ${parseError.message}`,
            data: Object.values(data).join(',')
          });
        }
      })
      .on('end', async () => {
        try {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);

          if (gpsPoints.length < 2) {
            return res.status(400).json({
              success: false,
              message: `Insufficient GPS points. Need at least 2 points, got ${gpsPoints.length}`,
              errors: errors.slice(0, 10), // Show first 10 errors
              parseInfo: {
                totalLinesProcessed: lineNumber,
                validPoints: gpsPoints.length,
                errorCount: errors.length,
                successRate: `${Math.round(((gpsPoints.length) / lineNumber) * 100)}%`
              },
              troubleshooting: [
                'Ensure your CSV has latitude and longitude in separate columns',
                'Check that coordinates are valid numbers',
                'Verify coordinate ranges: lat (-90 to 90), lng (-180 to 180)',
                'Remove any header rows from your CSV file'
              ]
            });
          }

          console.log(`✅ Parsed ${gpsPoints.length} GPS points from CSV (${errors.length} errors)`);

          // Extract start and end coordinates
          const startPoint = gpsPoints[0];
          const endPoint = gpsPoints[gpsPoints.length - 1];

          const fromCoordinates = {
            latitude: startPoint.latitude,
            longitude: startPoint.longitude
          };

          const toCoordinates = {
            latitude: endPoint.latitude,
            longitude: endPoint.longitude
          };

          // Calculate total route distance from GPS tracking
          const totalDistance = calculateTotalRouteDistance(gpsPoints);
          const estimatedDuration = Math.round(totalDistance * 1.5); // Estimate based on distance

          // Prepare route points with distances
          let cumulativeDistance = 0;
          const routePoints = gpsPoints.map((point, index) => {
            if (index > 0) {
              cumulativeDistance += calculateSimpleDistance(gpsPoints[index - 1], point);
            }

            return {
              latitude: point.latitude,
              longitude: point.longitude,
              pointOrder: index,
              distanceFromStart: Math.round(cumulativeDistance * 100) / 100,
              distanceToEnd: Math.round((totalDistance - cumulativeDistance) * 100) / 100,
              elevation: null // Would be calculated with elevation API
            };
          });

          // Create route in database
          const route = new Route({
            userId: req.user.id,
            routeName: routeName || `${fromName} to ${toName}`,
            fromAddress: fromAddress || fromName,
            fromCode: fromCode.trim(),
            fromName: fromName.trim(),
            fromCoordinates,
            toAddress: toAddress || toName,
            toCode: toCode.trim(),
            toName: toName.trim(),
            toCoordinates,
            totalDistance,
            estimatedDuration,
            routePoints,
            terrain: terrain || 'mixed',
            majorHighways: majorHighways ? majorHighways.split(',').map(h => h.trim()) : [],
            metadata: {
              uploadSource: 'gps_csv',
              originalFileName: req.file.originalname,
              processingNotes: [
                `GPS route imported with ${gpsPoints.length} tracking points`,
                `Total distance calculated: ${totalDistance}km`,
                `Start: ${startPoint.latitude}, ${startPoint.longitude}`,
                `End: ${endPoint.latitude}, ${endPoint.longitude}`,
                `Parse errors: ${errors.length}`,
                `Parsing accuracy: ${Math.round(((gpsPoints.length) / lineNumber) * 100)}%`
              ],
              gpsTrackingPoints: gpsPoints.length,
              trackingAccuracy: errors.length === 0 ? 'perfect' : 
                               errors.length < gpsPoints.length * 0.1 ? 'excellent' :
                               errors.length < gpsPoints.length * 0.2 ? 'good' : 'fair'
            }
          });

          // Generate live map link with all GPS points
          route.generateLiveMapLink();

          await route.save();

          console.log(`✅ GPS Route created: ${route.routeId} with ${gpsPoints.length} points`);

          res.status(201).json({
            success: true,
            message: `GPS route created successfully with ${gpsPoints.length} tracking points`,
            data: {
              route: {
                id: route._id,
                routeId: route.routeId,
                routeName: route.routeName,
                fromCode: route.fromCode,
                fromName: route.fromName,
                toCode: route.toCode,
                toName: route.toName,
                totalDistance: route.totalDistance,
                estimatedDuration: route.estimatedDuration,
                liveMapLink: route.liveMapLink,
                coordinates: {
                  start: fromCoordinates,
                  end: toCoordinates
                },
                gpsTracking: {
                  totalPoints: gpsPoints.length,
                  startPoint: `${startPoint.latitude}, ${startPoint.longitude}`,
                  endPoint: `${endPoint.latitude}, ${endPoint.longitude}`,
                  parseErrors: errors.length,
                  accuracy: route.metadata.trackingAccuracy
                }
              },
              processing: {
                totalLinesProcessed: lineNumber,
                validGPSPoints: gpsPoints.length,
                parseErrors: errors.length,
                successRate: `${Math.round(((gpsPoints.length) / lineNumber) * 100)}%`,
                trackingAccuracy: route.metadata.trackingAccuracy
              },
              errors: errors.length > 0 ? errors.slice(0, 5) : [], // Show first 5 errors if any
              nextSteps: [
                'GPS route has been created with detailed tracking points',
                'You can view the route on Google Maps using the live link',
                'Use /api/routes/:id/collect-all-data to gather comprehensive route data',
                'Individual GPS points are stored for detailed analysis',
                'Route is ready for risk assessment and analysis'
              ]
            }
          });

        } catch (processingError) {
          console.error('GPS CSV processing error:', processingError);
          res.status(500).json({
            success: false,
            message: 'Error processing GPS CSV file',
            error: processingError.message
          });
        }
      })
      .on('error', (streamError) => {
        console.error('GPS CSV stream error:', streamError);
        // Clean up file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
          success: false,
          message: 'Error reading GPS CSV file',
          error: streamError.message
        });
      });

  } catch (error) {
    console.error('GPS route upload error:', error);
    // Clean up file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Server error during GPS route upload',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Legacy CSV upload (for backward compatibility)
exports.uploadCSV = async (req, res) => {
  // Keep the existing CSV upload functionality for routes with metadata
  return res.status(200).json({
    success: true,
    message: 'Use /upload-gps-route for GPS tracking files, or /upload-routes-csv for route metadata files'
  });
};

// Get All Routes for User
exports.getRoutes = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { 
      userId: req.user.id,
      status: { $ne: 'deleted' }
    };

    // Add search filter
    if (req.query.search) {
      filter.$or = [
        { routeName: { $regex: req.query.search, $options: 'i' } },
        { fromName: { $regex: req.query.search, $options: 'i' } },
        { toName: { $regex: req.query.search, $options: 'i' } },
        { routeId: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Add risk level filter
    if (req.query.riskLevel) {
      filter.riskLevel = req.query.riskLevel;
    }

    const routes = await Route.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-routePoints -metadata.processingNotes');

    // Import required models for counting
    const AccidentProneArea = require('../models/AccidentProneArea');
    const BlindSpot = require('../models/BlindSpot');
    const SharpTurn = require('../models/SharpTurn');
    const EmergencyService = require('../models/EmergencyService');
    const NetworkCoverage = require('../models/NetworkCoverage');
    const RoadCondition = require('../models/RoadCondition');

    // Enrich routes with counts from related collections
    const enrichedRoutes = await Promise.all(routes.map(async (route) => {
      const routeObj = route.toObject();
      
      try {
        // Get counts for each collection
        const [accidentAreasCount, blindSpotsCount, sharpTurnsCount, emergencyServicesCount, networkCoverageCount, roadConditionsCount] = await Promise.all([
          AccidentProneArea.countDocuments({ routeId: route._id }),
          BlindSpot.countDocuments({ routeId: route._id }),
          SharpTurn.countDocuments({ routeId: route._id }),
          EmergencyService.countDocuments({ routeId: route._id }),
          NetworkCoverage.countDocuments({ routeId: route._id }),
          RoadCondition.countDocuments({ routeId: route._id })
        ]);

        // Add counts to route object
        routeObj.accidentAreasCount = accidentAreasCount;
        routeObj.blindSpotsCount = blindSpotsCount;
        routeObj.sharpTurnsCount = sharpTurnsCount;
        routeObj.emergencyServicesCount = emergencyServicesCount;
        routeObj.networkDeadZones = networkCoverageCount;
        routeObj.roadConditionsIssues = roadConditionsCount;
        
        // Calculate processing status based on data availability
        const hasData = accidentAreasCount > 0 || blindSpotsCount > 0 || sharpTurnsCount > 0 || emergencyServicesCount > 0;
        routeObj.dataProcessingStatus = hasData ? 'completed' : 'pending';
        
        // Calculate risk score from riskScores if available
        routeObj.riskScore = routeObj.riskScores?.totalWeightedScore || 0;
        
      } catch (countError) {
        console.error(`Error counting data for route ${route._id}:`, countError);
        // Set default values if counting fails
        routeObj.accidentAreasCount = 0;
        routeObj.blindSpotsCount = 0;
        routeObj.sharpTurnsCount = 0;
        routeObj.emergencyServicesCount = 0;
        routeObj.networkDeadZones = 0;
        routeObj.roadConditionsIssues = 0;
        routeObj.dataProcessingStatus = 'pending';
        routeObj.riskScore = 0;
      }
      
      return routeObj;
    }));

    const total = await Route.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        routes: enrichedRoutes,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalRoutes: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get routes error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching routes'
    });
  }
};

// Get Single Route Details with GPS Points
exports.getRoute = async (req, res) => {
  try {
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    res.status(200).json({
      success: true,
      route
    });

  } catch (error) {
    console.error('Get route error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching route details'
    });
  }
};

// Update Route
exports.updateRoute = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { routeName, terrain, majorHighways } = req.body;

    const route = await Route.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.id,
        status: { $ne: 'deleted' }
      },
      {
        routeName,
        terrain,
        majorHighways
      },
      { new: true, runValidators: true }
    );

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    console.log(`Route updated: ${route.routeId} by user: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Route updated successfully',
      route
    });

  } catch (error) {
    console.error('Update route error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating route'
    });
  }
};

// Delete Route (Soft Delete)
exports.deleteRoute = async (req, res) => {
  try {
    const route = await Route.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user.id,
        status: { $ne: 'deleted' }
      },
      {
        status: 'deleted'
      },
      { new: true }
    );

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    console.log(`Route deleted: ${route.routeId} by user: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Route deleted successfully'
    });

  } catch (error) {
    console.error('Delete route error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting route'
    });
  }
};

// Recalculate Route Risk
exports.recalculateRisk = async (req, res) => {
  try {
    const route = await Route.findOne({
      _id: req.params.id,
      userId: req.user.id,
      status: { $ne: 'deleted' }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // REAL RISK RECALCULATION - Replace mock implementation
    const riskCalculationService = require('../services/riskCalculationService');
    const realRiskResult = await riskCalculationService.calculateRouteRisk(req.params.id);
    
    // Update route with real calculated risk
    await Route.findByIdAndUpdate(req.params.id, {
      riskScores: realRiskResult,
      riskLevel: realRiskResult.riskLevel,
      'metadata.lastCalculated': new Date(),
      'metadata.calculationVersion': '2.0-real'
    });

    res.status(200).json({
      success: true,
      message: 'Route risk recalculated with real data',
      data: {
        routeId: route.routeId,
        riskScores: realRiskResult,
        riskLevel: realRiskResult.riskLevel,
        confidence: realRiskResult.confidenceLevel,
        dataQuality: realRiskResult.dataQuality
      }
    });

  } catch (error) {
    console.error('Real risk recalculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error recalculating risk with real data'
    });
  }
};

module.exports = {
  createRoute: exports.createRoute,
  uploadGPSRoute: exports.uploadGPSRoute,
  uploadCSV: exports.uploadCSV,
  getRoutes: exports.getRoutes,
  getRoute: exports.getRoute,
  updateRoute: exports.updateRoute,
  deleteRoute: exports.deleteRoute,
  recalculateRisk: exports.recalculateRisk
};