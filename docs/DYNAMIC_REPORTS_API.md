# Dynamic Reports API Documentation

## Overview

The Dynamic Reports API provides comprehensive route analysis by collecting data from all existing endpoints and generating intelligent PDF reports with real-time risk assessment and scoring.

## Base URL
```
http://localhost:3000/api/dynamic-reports
```

## Authentication
All endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Generate Dynamic Report
**POST** `/routes/:routeId/generate`

Generates a comprehensive dynamic report for the specified route.

#### Request Body
```json
{
  "format": "pdf",
  "includeAnalysis": ["all"],
  "download": true,
  "filename": "Custom-Report-Name.pdf"
}
```

#### Parameters
- `format` (string, optional): Report format. Default: "pdf"
- `includeAnalysis` (array, optional): Analysis types to include. Default: ["all"]
- `download` (boolean, optional): Whether to download immediately. Default: true
- `filename` (string, optional): Custom filename for the report

#### Response (download=false)
```json
{
  "success": true,
  "message": "Dynamic report generated successfully",
  "data": {
    "filename": "HPCL-Dynamic-Report-Route-Name-1234567890.pdf",
    "downloadUrl": "/api/dynamic-reports/download/filename.pdf",
    "reportSummary": {
      "routeId": "686bb57ee66a4a39825fc854",
      "routeName": "Mumbai to Pune",
      "totalDistance": 148.5,
      "riskLevel": "MEDIUM",
      "dataPoints": 1247,
      "criticalPoints": 3
    },
    "analysisBreakdown": {
      "visibilityAnalysis": {
        "sharpTurns": 15,
        "blindSpots": 8,
        "avgRiskScore": 6.2
      },
      "networkCoverage": {
        "totalCoverage": 87.5,
        "deadZones": 3,
        "riskLevel": "LOW"
      },
      "roadConditions": {
        "avgQuality": 7.8,
        "poorSegments": 2,
        "riskLevel": "MEDIUM"
      },
      "emergencyServices": {
        "total": 12,
        "avgDistance": 8.5,
        "riskLevel": "LOW"
      }
    },
    "generatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Example Usage
```bash
curl -X POST \
  http://localhost:3000/api/dynamic-reports/routes/686bb57ee66a4a39825fc854/generate \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "pdf",
    "download": false,
    "filename": "Mumbai-Pune-Analysis.pdf"
  }'
```

### 2. Get Report Preview
**GET** `/routes/:routeId/preview`

Generates a preview of the report data without creating the PDF.

#### Response
```json
{
  "success": true,
  "message": "Report preview generated successfully",
  "data": {
    "routeInfo": {
      "routeId": "686bb57ee66a4a39825fc854",
      "routeName": "Mumbai to Pune",
      "fromName": "Mumbai",
      "toName": "Pune",
      "totalDistance": 148.5,
      "estimatedDuration": "3h 15m",
      "terrain": "mixed"
    },
    "riskSummary": {
      "overallRiskScore": 6.2,
      "riskLevel": "MEDIUM",
      "criticalPoints": 3,
      "riskFactors": {
        "visibility": 6.5,
        "roadConditions": 5.8,
        "networkCoverage": 4.2,
        "emergencyServices": 3.1
      }
    },
    "dataAvailability": {
      "visibilityData": {
        "sharpTurns": 15,
        "blindSpots": 8,
        "available": true
      },
      "networkData": {
        "coverage": 87.5,
        "deadZones": 3,
        "available": true
      },
      "roadConditions": {
        "avgQuality": 7.8,
        "poorSegments": 2,
        "available": true
      },
      "emergencyServices": {
        "total": 12,
        "available": true
      }
    },
    "reportMetadata": {
      "dataQualityLevel": "HIGH",
      "lastAnalyzed": "2024-01-15T09:45:00.000Z",
      "analysisVersion": "2.1.0"
    }
  }
}
```

#### Example Usage
```bash
curl -X GET \
  http://localhost:3000/api/dynamic-reports/routes/686bb57ee66a4a39825fc854/preview \
  -H "Authorization: Bearer your-jwt-token"
```

### 3. Get Data Status
**GET** `/routes/:routeId/data-status`

Checks the availability and quality of data for report generation.

#### Response
```json
{
  "success": true,
  "message": "Data status retrieved successfully",
  "data": {
    "routeId": "686bb57ee66a4a39825fc854",
    "routeName": "Mumbai to Pune",
    "lastAnalyzed": "2024-01-15T09:45:00.000Z",
    "dataAvailability": {
      "sharpTurns": { "count": 15, "available": true },
      "blindSpots": { "count": 8, "available": true },
      "accidentAreas": { "count": 5, "available": true },
      "roadConditions": { "count": 42, "available": true },
      "networkCoverage": { "count": 128, "available": true },
      "trafficData": { "count": 0, "available": false },
      "emergencyServices": { "count": 12, "available": true }
    },
    "totalDataPoints": 210,
    "readinessScore": 85,
    "recommendations": [
      "Collect traffic data for better analysis"
    ]
  }
}
```

#### Example Usage
```bash
curl -X GET \
  http://localhost:3000/api/dynamic-reports/routes/686bb57ee66a4a39825fc854/data-status \
  -H "Authorization: Bearer your-jwt-token"
```

### 4. Download Report
**GET** `/download/:filename`

Downloads a previously generated report file.

#### Example Usage
```bash
curl -X GET \
  http://localhost:3000/api/dynamic-reports/download/HPCL-Dynamic-Report-Mumbai-Pune-1234567890.pdf \
  -H "Authorization: Bearer your-jwt-token" \
  --output report.pdf
```

## Data Collection Sources

The Dynamic Reports API collects data from the following existing endpoints:

### Route Information
- **Source**: `/api/routes/:routeId`
- **Data**: Basic route details, coordinates, distance, duration

### Visibility Analysis
- **Source**: `/api/visibility/routes/:routeId/*`
- **Data**: Sharp turns, blind spots, risk scores

### Network Coverage
- **Source**: `/api/network-coverage/routes/:routeId/*`
- **Data**: Operator coverage, dead zones, signal strength

### Road Conditions
- **Source**: `/api/enhanced-road-conditions/routes/:routeId/*`
- **Data**: Road quality, surface conditions, maintenance status

### Emergency Services
- **Source**: Database models
- **Data**: Hospitals, police stations, fire stations along route

### Traffic Data
- **Source**: Database models
- **Data**: Traffic patterns, congestion points, peak hours

### Weather Conditions
- **Source**: Database models
- **Data**: Weather patterns, seasonal risks, visibility conditions

### Accident Data
- **Source**: Database models
- **Data**: Historical accidents, prone areas, risk factors

## Risk Assessment

The system calculates risk scores for various factors:

### Risk Categories
- **LOW**: Score 0-3 (Green)
- **MEDIUM**: Score 4-6 (Yellow)
- **HIGH**: Score 7-8 (Orange)
- **CRITICAL**: Score 9-10 (Red)

### Risk Factors
1. **Visibility Risk**: Based on sharp turns and blind spots
2. **Road Conditions**: Based on surface quality and maintenance
3. **Network Coverage**: Based on dead zones and signal strength
4. **Emergency Services**: Based on proximity and availability
5. **Traffic Risk**: Based on congestion and peak hours
6. **Weather Risk**: Based on seasonal patterns and conditions
7. **Accident Risk**: Based on historical data and prone areas
8. **Terrain Risk**: Based on elevation changes and road type
9. **Speed Risk**: Based on speed limits and road design
10. **Security Risk**: Based on crime data and isolated areas

## Report Features

### Dynamic Content
- Real-time risk calculations
- Live data from all endpoints
- Adaptive recommendations
- Current data quality assessment

### Report Sections
1. **Executive Summary**: Route overview and risk assessment
2. **Detailed Analysis**: Comprehensive breakdown by category
3. **Risk Assessment**: Detailed risk factors and scores
4. **Recommendations**: Actionable insights and suggestions
5. **Emergency Information**: Critical contacts and services
6. **Route Mapping**: Visual representation with risk zones

### PDF Features
- Professional HPCL branding
- Interactive table of contents
- High-quality charts and graphs
- Detailed data tables
- Risk color coding
- QR codes for digital access

## Error Handling

### Common Error Responses

#### Route Not Found
```json
{
  "success": false,
  "message": "Route not found or access denied"
}
```

#### Insufficient Data
```json
{
  "success": false,
  "message": "Error generating dynamic report",
  "error": "Insufficient data for comprehensive analysis",
  "troubleshooting": [
    "Ensure route has been analyzed and contains data",
    "Check if all required services are running",
    "Verify sufficient disk space for report generation",
    "Ensure database connectivity"
  ]
}
```

#### Authentication Error
```json
{
  "success": false,
  "message": "Access denied. Please provide a valid token."
}
```

## Best Practices

### Before Generating Reports
1. **Check Data Status**: Use `/data-status` endpoint to verify data availability
2. **Run Analysis**: Ensure route has been analyzed with all available endpoints
3. **Verify Readiness**: Aim for readiness score > 70% for comprehensive reports

### Optimizing Report Quality
1. **Complete Analysis**: Run all available analysis endpoints
2. **Fresh Data**: Ensure recent analysis (within 24-48 hours)
3. **Multiple Sources**: Collect data from various endpoints for comprehensive coverage

### Performance Considerations
1. **Async Generation**: Use `download: false` for large reports
2. **Caching**: Reports are temporarily cached for quick access
3. **Cleanup**: Downloaded files are automatically cleaned up after 1 minute

## Integration Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

class DynamicReportsClient {
  constructor(baseUrl, authToken) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
    this.config = {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    };
  }

  async generateReport(routeId, options = {}) {
    const response = await axios.post(
      `${this.baseUrl}/api/dynamic-reports/routes/${routeId}/generate`,
      options,
      this.config
    );
    return response.data;
  }

  async getDataStatus(routeId) {
    const response = await axios.get(
      `${this.baseUrl}/api/dynamic-reports/routes/${routeId}/data-status`,
      this.config
    );
    return response.data;
  }

  async getPreview(routeId) {
    const response = await axios.get(
      `${this.baseUrl}/api/dynamic-reports/routes/${routeId}/preview`,
      this.config
    );
    return response.data;
  }
}

// Usage
const client = new DynamicReportsClient('http://localhost:3000', 'your-jwt-token');

// Check data status first
const status = await client.getDataStatus('route-id');
if (status.data.readinessScore > 70) {
  // Generate report
  const report = await client.generateReport('route-id', {
    download: false,
    filename: 'Custom-Report.pdf'
  });
  console.log('Report generated:', report.data.downloadUrl);
}
```

### Python
```python
import requests

class DynamicReportsClient:
    def __init__(self, base_url, auth_token):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {auth_token}',
            'Content-Type': 'application/json'
        }
    
    def generate_report(self, route_id, options=None):
        if options is None:
            options = {}
        
        response = requests.post(
            f'{self.base_url}/api/dynamic-reports/routes/{route_id}/generate',
            json=options,
            headers=self.headers
        )
        return response.json()
    
    def get_data_status(self, route_id):
        response = requests.get(
            f'{self.base_url}/api/dynamic-reports/routes/{route_id}/data-status',
            headers=self.headers
        )
        return response.json()
    
    def get_preview(self, route_id):
        response = requests.get(
            f'{self.base_url}/api/dynamic-reports/routes/{route_id}/preview',
            headers=self.headers
        )
        return response.json()

# Usage
client = DynamicReportsClient('http://localhost:3000', 'your-jwt-token')

# Check data status
status = client.get_data_status('route-id')
if status['data']['readinessScore'] > 70:
    # Generate report
    report = client.generate_report('route-id', {
        'download': False,
        'filename': 'Custom-Report.pdf'
    })
    print(f"Report generated: {report['data']['downloadUrl']}")
```

## Testing

Use the provided test script to verify functionality:

```bash
# Update test configuration
cd test
node dynamicReportsTest.js
```

The test script will:
1. Check server connectivity
2. Test data status endpoint
3. Test report preview
4. Generate a sample report
5. Test report download

## Support

For issues or questions:
1. Check the troubleshooting section in error responses
2. Verify data availability using `/data-status` endpoint
3. Ensure all required analysis has been completed
4. Check server logs for detailed error information

## Version History

- **v2.1.0**: Initial release of Dynamic Reports API
  - Comprehensive data collection from all endpoints
  - Real-time risk assessment and scoring
  - Professional PDF generation with HPCL branding
  - Data quality assessment and recommendations