// INTEGRATION GUIDE: Enhanced Visibility Image Downloader
// File: server.js (UPDATED VERSION)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hpcl_journey_risk', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Import routes with error handling
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Error loading auth routes:', error.message);
}

try {
  const routeRoutes = require('./routes/routes');
  app.use('/api/routes', routeRoutes);
  console.log('✅ Route routes loaded');
} catch (error) {
  console.error('❌ Error loading route routes:', error.message);
}

try {
  const riskRoutes = require('./routes/risk');
  app.use('/api/risk', riskRoutes);
  console.log('✅ Risk routes loaded');
} catch (error) {
  console.error('❌ Error loading risk routes:', error.message);
}

try {
  const dashboardRoutes = require('./routes/dashboard');
  app.use('/api/dashboard', dashboardRoutes);
  console.log('✅ Dashboard routes loaded');
} catch (error) {
  console.error('❌ Error loading dashboard routes:', error.message);
}

try {
  const sharpTurnsRoutes = require('./routes/sharpTurnsBlindSpots');
  app.use('/api/visibility', sharpTurnsRoutes);
  console.log('✅ Sharp turns & blind spots routes loaded');
} catch (error) {
  console.error('❌ Error loading sharp turns routes:', error.message);
}

try {
  const networkCoverageRoutes = require('./routes/networkCoverage');
  app.use('/api/network-coverage', networkCoverageRoutes);
  console.log('✅ Network coverage routes loaded');
} catch (error) {
  console.error('❌ Error loading network coverage routes:', error.message);
}

// EXISTING: Sharp Turn Image Routes (legacy)
try {
  const sharpTurnImageRoutes = require('./routes/sharpTurnImageDownloader');
  app.use('/api/sharp-turn-images', sharpTurnImageRoutes);
  console.log('✅ Sharp turn image download routes loaded');
} catch (error) {
  console.error('❌ Error loading sharp turn image routes:', error.message);
}

// ✅ NEW: Enhanced Visibility Image Downloader (Sharp Turns + Blind Spots)
try {
  const visibilityImageRoutes = require('./routes/visibilityImageDownloader');
  app.use('/api/visibility-images', visibilityImageRoutes);
  console.log('✅ Enhanced visibility image downloader routes loaded');
} catch (error) {
  console.error('❌ Error loading visibility image routes:', error.message);
}

try {
  const enhancedRoadConditionsRoutes = require('./routes/enhancedRoadConditions');
  app.use('/api/enhanced-road-conditions', enhancedRoadConditionsRoutes);
  console.log('✅ Enhanced road conditions routes loaded');
} catch (error) {
  console.error('❌ Error loading enhanced road conditions routes:', error.message);
}

try {
  const pdfRoutes = require('./routes/pdfGeneration');
  app.use('/api/pdf', pdfRoutes);
  console.log('✅ HPCL PDF generation routes loaded');
} catch (error) {
  console.error('❌ Error loading PDF routes:', error.message);
}

// Static file serving for downloaded images
app.use('/downloads', express.static('downloads'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'connected',
      networkCoverage: 'available',
      visibilityImages: 'available' // ✅ NEW
    }
  });
});

// Root endpoint with updated API list
app.get('/', (req, res) => {
  res.json({
    message: 'HPCL Journey Risk Management System API',
    version: '2.1.0', // ✅ Updated version
    endpoints: {
      auth: '/api/auth',
      routes: '/api/routes',
      risk: '/api/risk',
      dashboard: '/api/dashboard',
      visibility: '/api/visibility',
      networkCoverage: '/api/network-coverage',
      enhancedRoadConditions: '/api/enhanced-road-conditions',
      sharpTurnImages: '/api/sharp-turn-images', // Legacy
      visibilityImages: '/api/visibility-images', // ✅ NEW Enhanced
      pdf: '/api/pdf',
      health: '/health'
    },
    
    // ✅ NEW: Enhanced Visibility Image Endpoints
    visibilityImageEndpoints: {
      // Comprehensive Downloads
      downloadAllImages: 'POST /api/visibility-images/routes/:routeId/download-all-images',
      
      // Individual Type Downloads  
      downloadSharpTurns: 'POST /api/visibility-images/routes/:routeId/download-sharp-turns',
      downloadBlindSpots: 'POST /api/visibility-images/routes/:routeId/download-blind-spots',
      
      // Management & Status
      getImageStatus: 'GET /api/visibility-images/routes/:routeId/image-status',
      syncDatabase: 'POST /api/visibility-images/routes/:routeId/sync-database',
      deleteAllImages: 'DELETE /api/visibility-images/routes/:routeId/delete-all-images',
      
      // Reports
      getDownloadReport: 'GET /api/visibility-images/routes/:routeId/download-report'
    },
    
    // Existing endpoints...
    networkCoverageEndpoints: {
      analyzeRoute: 'POST /api/network-coverage/routes/:routeId/analyze',
      getOverview: 'GET /api/network-coverage/routes/:routeId/overview',
      getDeadZones: 'GET /api/network-coverage/routes/:routeId/dead-zones',
      getCriticalDeadZones: 'GET /api/network-coverage/routes/:routeId/critical-dead-zones',
      getOperatorCoverage: 'GET /api/network-coverage/routes/:routeId/operator/:operator',
      compareOperators: 'GET /api/network-coverage/routes/:routeId/operator-comparison',
      getStatistics: 'GET /api/network-coverage/routes/:routeId/statistics',
      checkExists: 'GET /api/network-coverage/routes/:routeId/exists',
      deleteData: 'DELETE /api/network-coverage/routes/:routeId'
    },
    
    enhancedRoadConditionsEndpoints: {
      analyzeRoute: 'POST /api/enhanced-road-conditions/routes/:routeId/analyze',
      getOverview: 'GET /api/enhanced-road-conditions/routes/:routeId/overview',
      getSegments: 'GET /api/enhanced-road-conditions/routes/:routeId/segments',
      getRiskAssessment: 'GET /api/enhanced-road-conditions/routes/:routeId/risk-assessment',
      getRecommendations: 'GET /api/enhanced-road-conditions/routes/:routeId/recommendations',
      compareRoutes: 'GET /api/enhanced-road-conditions/routes/:routeId/compare',
      checkApiStatus: 'GET /api/enhanced-road-conditions/api-status',
      deleteData: 'DELETE /api/enhanced-road-conditions/routes/:routeId'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl,
    availableEndpoints: [
      '/api/auth',
      '/api/routes', 
      '/api/risk',
      '/api/dashboard',
      '/api/visibility',
      '/api/network-coverage',
      '/api/enhanced-road-conditions',
      '/api/sharp-turn-images',
      '/api/visibility-images', // ✅ NEW
      '/api/pdf',
      '/health'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 HPCL Journey Risk Management Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}`);
  console.log('');
  console.log('Available API Endpoints:');
  console.log('├── Authentication: /api/auth');
  console.log('├── Routes: /api/routes');
  console.log('├── Risk Assessment: /api/risk');
  console.log('├── Dashboard: /api/dashboard');
  console.log('├── Visibility Analysis: /api/visibility');
  console.log('├── Network Coverage: /api/network-coverage');
  console.log('├── Enhanced Road Conditions: /api/enhanced-road-conditions');
  console.log('├── Sharp Turn Images (Legacy): /api/sharp-turn-images');
  console.log('├── Visibility Images (Enhanced): /api/visibility-images ✨ NEW');
  console.log('├── PDF Generation: /api/pdf');
  console.log('└── Health Check: /health');
  console.log('');
  console.log('✨ NEW FEATURE: Enhanced Visibility Image Downloader');
  console.log('   📸 Download images for both Sharp Turns AND Blind Spots');
  console.log('   🎯 Comprehensive filtering and quality options');
  console.log('   💾 Automatic database synchronization');
  console.log('   📊 Detailed status reporting and management');
});

module.exports = app;

// ============================================================================
// API USAGE EXAMPLES FOR ENHANCED VISIBILITY IMAGE DOWNLOADER
// ============================================================================

/*

🔥 EXAMPLE USAGE:

1. COMPREHENSIVE DOWNLOAD (Sharp Turns + Blind Spots):
   POST http://localhost:3000/api/visibility-images/routes/686bb57ee66a4a39825fc854/download-all-images
   Body: {
     "imageTypes": ["street_view", "satellite", "roadmap"],
     "quality": "high",
     "updateDatabase": true,
     "includeSharpTurns": true,
     "includeBlindSpots": true,
     "riskThreshold": 6.0
   }

2. SHARP TURNS ONLY:
   POST http://localhost:3000/api/visibility-images/routes/686bb57ee66a4a39825fc854/download-sharp-turns
   Body: {
     "imageTypes": ["street_view", "satellite"],
     "quality": "high",
     "riskThreshold": 7.0
   }

3. BLIND SPOTS ONLY:
   POST http://localhost:3000/api/visibility-images/routes/686bb57ee66a4a39825fc854/download-blind-spots
   Body: {
     "imageTypes": ["street_view", "satellite"],
     "quality": "high", 
     "riskThreshold": 6.0
   }

4. CHECK IMAGE STATUS:
   GET http://localhost:3000/api/visibility-images/routes/686bb57ee66a4a39825fc854/image-status

5. SYNC DATABASE WITH EXISTING FILES:
   POST http://localhost:3000/api/visibility-images/routes/686bb57ee66a4a39825fc854/sync-database

6. DOWNLOAD REPORT:
   GET http://localhost:3000/api/visibility-images/routes/686bb57ee66a4a39825fc854/download-report

7. DELETE ALL IMAGES:
   DELETE http://localhost:3000/api/visibility-images/routes/686bb57ee66a4a39825fc854/delete-all-images
   Body: {
     "updateDatabase": true
   }

📂 DOWNLOAD STRUCTURE:
./downloads/
└── visibility-images/
    └── [routeId]/
        ├── turn_001_risk_8.5_street_view.jpg
        ├── turn_001_risk_8.5_satellite.jpg
        ├── turn_001_risk_8.5_roadmap.jpg
        ├── turn_002_risk_7.2_street_view.jpg
        ├── blindspot_001_risk_9.1_street_view.jpg
        ├── blindspot_001_risk_9.1_satellite.jpg
        ├── blindspot_002_risk_6.8_street_view.jpg
        └── visibility_download_summary.json

🎯 KEY FEATURES:
✅ Downloads images for BOTH Sharp Turns AND Blind Spots
✅ Automatic database updates with image metadata
✅ Flexible filtering by risk threshold
✅ Multiple image types (street view, satellite, roadmap)
✅ Quality control (high/standard)
✅ Comprehensive status reporting
✅ File system synchronization
✅ Bulk operations and management
✅ Error handling with retry logic
✅ Public URL generation for web access

*/