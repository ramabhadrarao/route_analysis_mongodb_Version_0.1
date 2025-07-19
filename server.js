// File: server.js - COMPLETE INTEGRATION FIX
// Add the bulk route processing BEFORE the 404 handler

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Basic middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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

// ============================================================================
// LOAD ALL ROUTES WITH ERROR HANDLING
// ============================================================================

// Authentication routes
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Error loading auth routes:', error.message);
}

// Main routes
try {
  const routeRoutes = require('./routes/routes');
  app.use('/api/routes', routeRoutes);
  console.log('✅ Route routes loaded');
} catch (error) {
  console.error('❌ Error loading route routes:', error.message);
}

// Risk assessment routes
try {
  const riskRoutes = require('./routes/risk');
  app.use('/api/risk', riskRoutes);
  console.log('✅ Risk routes loaded');
} catch (error) {
  console.error('❌ Error loading risk routes:', error.message);
}

// Dashboard routes
try {
  const dashboardRoutes = require('./routes/dashboard');
  app.use('/api/dashboard', dashboardRoutes);
  console.log('✅ Dashboard routes loaded');
} catch (error) {
  console.error('❌ Error loading dashboard routes:', error.message);
}

// Visibility/Sharp turns routes
try {
  const sharpTurnsRoutes = require('./routes/sharpTurnsBlindSpots');
  app.use('/api/visibility', sharpTurnsRoutes);
  console.log('✅ Visibility routes loaded');
} catch (error) {
  console.error('❌ Error loading visibility routes:', error.message);
}

// Network coverage routes
try {
  const networkCoverageRoutes = require('./routes/networkCoverage');
  app.use('/api/network-coverage', networkCoverageRoutes);
  console.log('✅ Network coverage routes loaded');
} catch (error) {
  console.error('❌ Error loading network coverage routes:', error.message);
}

// Enhanced road conditions routes
try {
  const enhancedRoadConditionsRoutes = require('./routes/enhancedRoadConditions');
  app.use('/api/enhanced-road-conditions', enhancedRoadConditionsRoutes);
  console.log('✅ Enhanced road conditions routes loaded');
} catch (error) {
  console.error('❌ Error loading enhanced road conditions routes:', error.message);
}

// Sharp turn image download routes
try {
  const sharpTurnImageRoutes = require('./routes/sharpTurnImageDownloader');
  app.use('/api/sharp-turn-images', sharpTurnImageRoutes);
  console.log('✅ Sharp turn image routes loaded');
} catch (error) {
  console.error('❌ Error loading sharp turn image routes:', error.message);
}

// Visibility image download routes
try {
  const visibilityImageRoutes = require('./routes/visibilityImageDownloader');
  app.use('/api/visibility-images', visibilityImageRoutes);
  console.log('✅ Visibility image routes loaded');
} catch (error) {
  console.error('❌ Error loading visibility image routes:', error.message);
}

// PDF generation routes
try {
  const pdfRoutes = require('./routes/pdfGeneration');
  app.use('/api/pdf', pdfRoutes);
  console.log('✅ PDF generation routes loaded');
} catch (error) {
  console.error('❌ Error loading PDF routes:', error.message);
}

// Dynamic reports routes
try {
  const dynamicReportsRoutes = require('./routes/dynamicReports');
  app.use('/api/dynamic-reports', dynamicReportsRoutes);
  console.log('✅ Dynamic reports routes loaded');
} catch (error) {
  console.error('❌ Error loading dynamic reports routes:', error.message);
}

// ✅ CRITICAL: ADD BULK ROUTE PROCESSING ROUTES
try {
  const bulkRouteRoutes = require('./routes/bulkRouteProcessor');
  app.use('/api/bulk-routes', bulkRouteRoutes);
  console.log('✅ Bulk route processing routes loaded');
} catch (error) {
  console.error('❌ Error loading bulk route processing routes:', error.message);
  console.error('❌ Make sure ./routes/bulkRouteProcessor.js exists');
}

// Static file serving
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
      visibilityImages: 'available',
      bulkProcessing: 'available'
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'HPCL Journey Risk Management System API',
    version: '2.2.0',
    endpoints: {
      auth: '/api/auth',
      routes: '/api/routes',
      risk: '/api/risk',
      dashboard: '/api/dashboard',
      visibility: '/api/visibility',
      networkCoverage: '/api/network-coverage',
      enhancedRoadConditions: '/api/enhanced-road-conditions',
      sharpTurnImages: '/api/sharp-turn-images',
      visibilityImages: '/api/visibility-images',
      dynamicReports: '/api/dynamic-reports',
      bulkRoutes: '/api/bulk-routes',
      pdf: '/api/pdf',
      health: '/health'
    },
    bulkRouteEndpoints: {
      processCSV: 'POST /api/bulk-routes/process-csv',
      getStatus: 'GET /api/bulk-routes/status',
      getResults: 'GET /api/bulk-routes/results/:filename'
    }
  });
});

// ============================================================================
// ERROR HANDLERS (MUST BE LAST)
// ============================================================================

// 404 handler - MUST come after all route definitions
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
      '/api/visibility-images',
      '/api/dynamic-reports',
      '/api/bulk-routes',
      '/api/pdf',
      '/health'
    ]
  });
});

// Global error handler
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
  console.log('├── Sharp Turn Images: /api/sharp-turn-images');
  console.log('├── Visibility Images: /api/visibility-images');
  console.log('├── Bulk Route Processing: /api/bulk-routes ✨');
  console.log('├── PDF Generation: /api/pdf');
  console.log('└── Health Check: /health');
  console.log('');
  console.log('🎯 Test bulk processing endpoint:');
  console.log('   POST http://localhost:3000/api/bulk-routes/process-csv');
});

module.exports = app;