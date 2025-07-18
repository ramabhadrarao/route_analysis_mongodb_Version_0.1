// File: test/dynamicReportsTest.js
// Purpose: Test script for Dynamic Reports API endpoints
// Usage: node test/dynamicReportsTest.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:3000';
const TEST_ROUTE_ID = '686bb57ee66a4a39825fc854'; // Replace with actual route ID
const AUTH_TOKEN = 'your-jwt-token-here'; // Replace with actual JWT token

// Test configuration
const config = {
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

// Test functions
async function testDataStatus() {
  console.log('\n🔍 Testing Data Status Endpoint...');
  try {
    const response = await axios.get(
      `${BASE_URL}/api/dynamic-reports/routes/${TEST_ROUTE_ID}/data-status`,
      config
    );
    
    console.log('✅ Data Status Response:');
    console.log('   Route ID:', response.data.data.routeId);
    console.log('   Route Name:', response.data.data.routeName);
    console.log('   Total Data Points:', response.data.data.totalDataPoints);
    console.log('   Readiness Score:', response.data.data.readinessScore + '%');
    console.log('   Data Availability:');
    
    Object.entries(response.data.data.dataAvailability).forEach(([key, value]) => {
      console.log(`     ${key}: ${value.count} items (${value.available ? '✅' : '❌'})`);
    });
    
    if (response.data.data.recommendations.length > 0) {
      console.log('   Recommendations:');
      response.data.data.recommendations.forEach(rec => {
        console.log(`     • ${rec}`);
      });
    }
    
    return response.data.data;
  } catch (error) {
    console.error('❌ Data Status Test Failed:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testReportPreview() {
  console.log('\n👀 Testing Report Preview Endpoint...');
  try {
    const response = await axios.get(
      `${BASE_URL}/api/dynamic-reports/routes/${TEST_ROUTE_ID}/preview`,
      config
    );
    
    console.log('✅ Report Preview Response:');
    const data = response.data.data;
    
    console.log('   Route Info:');
    console.log(`     Name: ${data.routeInfo.routeName}`);
    console.log(`     From: ${data.routeInfo.fromName}`);
    console.log(`     To: ${data.routeInfo.toName}`);
    console.log(`     Distance: ${data.routeInfo.totalDistance} km`);
    console.log(`     Duration: ${data.routeInfo.estimatedDuration}`);
    console.log(`     Terrain: ${data.routeInfo.terrain}`);
    
    console.log('   Risk Summary:');
    console.log(`     Overall Risk Score: ${data.riskSummary.overallRiskScore}`);
    console.log(`     Risk Level: ${data.riskSummary.riskLevel}`);
    console.log(`     Critical Points: ${data.riskSummary.criticalPoints}`);
    
    console.log('   Data Availability:');
    Object.entries(data.dataAvailability).forEach(([key, value]) => {
      console.log(`     ${key}: ${value.available ? '✅' : '❌'}`);
    });
    
    return data;
  } catch (error) {
    console.error('❌ Report Preview Test Failed:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testReportGeneration() {
  console.log('\n📊 Testing Report Generation Endpoint...');
  try {
    const requestBody = {
      format: 'pdf',
      includeAnalysis: ['all'],
      download: false, // Get report info instead of downloading
      filename: `Test-Dynamic-Report-${Date.now()}.pdf`
    };
    
    console.log('   Generating report... (this may take a few moments)');
    const response = await axios.post(
      `${BASE_URL}/api/dynamic-reports/routes/${TEST_ROUTE_ID}/generate`,
      requestBody,
      config
    );
    
    console.log('✅ Report Generation Response:');
    const data = response.data.data;
    
    console.log('   Report Summary:');
    console.log(`     Filename: ${data.filename}`);
    console.log(`     Route: ${data.reportSummary.routeName}`);
    console.log(`     Distance: ${data.reportSummary.totalDistance} km`);
    console.log(`     Risk Level: ${data.reportSummary.riskLevel}`);
    console.log(`     Data Points: ${data.reportSummary.dataPoints}`);
    console.log(`     Critical Points: ${data.reportSummary.criticalPoints}`);
    
    console.log('   Analysis Breakdown:');
    Object.entries(data.analysisBreakdown).forEach(([key, value]) => {
      console.log(`     ${key}:`, JSON.stringify(value, null, 6));
    });
    
    console.log(`   Download URL: ${data.downloadUrl}`);
    console.log(`   Generated At: ${data.generatedAt}`);
    
    return data;
  } catch (error) {
    console.error('❌ Report Generation Test Failed:', error.response?.data?.message || error.message);
    if (error.response?.data?.troubleshooting) {
      console.log('   Troubleshooting suggestions:');
      error.response.data.troubleshooting.forEach(tip => {
        console.log(`     • ${tip}`);
      });
    }
    return null;
  }
}

async function testDownloadReport(filename) {
  console.log('\n📥 Testing Report Download Endpoint...');
  try {
    const response = await axios.get(
      `${BASE_URL}/api/dynamic-reports/download/${filename}`,
      {
        ...config,
        responseType: 'stream'
      }
    );
    
    const downloadPath = path.join(__dirname, 'downloads', filename);
    
    // Ensure download directory exists
    const downloadDir = path.dirname(downloadPath);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    
    // Save the file
    const writer = fs.createWriteStream(downloadPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`✅ Report downloaded successfully: ${downloadPath}`);
        const stats = fs.statSync(downloadPath);
        console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
        resolve(downloadPath);
      });
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('❌ Report Download Test Failed:', error.response?.data?.message || error.message);
    return null;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Dynamic Reports API Tests');
  console.log('=====================================');
  
  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/health`);
    console.log('✅ Server is running');
  } catch (error) {
    console.error('❌ Server is not running. Please start the server first.');
    process.exit(1);
  }
  
  // Validate configuration
  if (AUTH_TOKEN === 'your-jwt-token-here') {
    console.warn('⚠️  Warning: Please update AUTH_TOKEN with a valid JWT token');
    console.log('   You can get a token by logging in through /api/auth/login');
  }
  
  if (TEST_ROUTE_ID === '686bb57ee66a4a39825fc854') {
    console.warn('⚠️  Warning: Please update TEST_ROUTE_ID with a valid route ID');
    console.log('   You can get route IDs from /api/routes');
  }
  
  // Run tests
  const dataStatus = await testDataStatus();
  const preview = await testReportPreview();
  const report = await testReportGeneration();
  
  // Test download if report was generated
  if (report && report.filename) {
    await testDownloadReport(report.filename);
  }
  
  console.log('\n🎉 Dynamic Reports API Tests Completed');
  console.log('=====================================');
  
  // Summary
  console.log('\n📋 Test Summary:');
  console.log(`   Data Status: ${dataStatus ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   Report Preview: ${preview ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   Report Generation: ${report ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (dataStatus && dataStatus.readinessScore < 100) {
    console.log('\n💡 Tips for Better Reports:');
    console.log('   • Ensure route has been analyzed with all available endpoints');
    console.log('   • Run visibility analysis for sharp turns and blind spots');
    console.log('   • Collect network coverage data');
    console.log('   • Analyze road conditions');
    console.log('   • Map emergency services along the route');
  }
}

// Handle command line execution
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  testDataStatus,
  testReportPreview,
  testReportGeneration,
  testDownloadReport,
  runTests
};