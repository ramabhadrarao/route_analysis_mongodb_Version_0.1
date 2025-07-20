// ============================================================================
// FILE 2: routes/routeData.js (FIXED VERSION)
// ============================================================================

const express = require('express');
const { auth } = require('../middleware/auth');
const { getAllRouteData } = require('../controllers/routeDataController');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Main endpoint - Get ALL data for a route
router.get('/:routeId/getalldata', getAllRouteData);

// Alternative endpoints
router.get('/:routeId/comprehensive', getAllRouteData);
router.get('/:routeId/all', getAllRouteData);

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'Route Data Service',
    status: 'operational',
    endpoints: [
      'GET /:routeId/getalldata',
      'GET /:routeId/comprehensive', 
      'GET /:routeId/all'
    ],
    collections: [
      'WeatherConditions', 'TrafficData', 'SharpTurns', 'RoadConditions',
      'NetworkCoverage', 'EmergencyServices', 'BlindSpots', 'AccidentProneAreas'
    ]
  });
});

module.exports = router;
