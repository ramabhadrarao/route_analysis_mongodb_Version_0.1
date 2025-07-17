// File: hpcl-enhanced-pdf-generator.js
// Purpose: DYNAMIC HPCL PDF Report Generator with Real Route Model Integration
// Dependencies: pdfkit, fs, path, mongoose models
// Author: HPCL Journey Risk Management System
// Updated: 2024 - Fully Dynamic with Database Integration

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class HPCLDynamicPDFGenerator {
    constructor() {
        // Enhanced HPCL Color Scheme for Modern Design
        this.colors = {
            primary: [0, 82, 147],      // HPCL Blue #005293
            secondary: [60, 60, 60],    // Dark Gray
            danger: [220, 53, 69],      // Red #dc3545
            warning: [253, 126, 20],    // Orange #fd7e14
            success: [40, 167, 69],     // Green #28a745
            info: [0, 82, 147],         // HPCL Blue
            lightGray: [245, 245, 245], // Light Gray #f5f5f5
            white: [255, 255, 255],     // White
            accent: [255, 193, 7],      // Yellow accent #ffc107
            darkGray: [52, 58, 64],     // Dark text
            softBlue: [232, 245, 255],  // Soft blue background
            softGreen: [240, 248, 240], // Soft green background
            softRed: [255, 245, 245],   // Soft red background
            modernGray: [248, 249, 250] // Modern light background
        };
        
        // Check for HPCL logo
        this.logoPath = path.join(__dirname, 'HPCL-Logo.png');
        this.hasLogo = fs.existsSync(this.logoPath);
        
        console.log('✅ DYNAMIC HPCL PDF Generator initialized');
        console.log(`🖼️ HPCL Logo: ${this.hasLogo ? 'Found' : 'Not found'} at ${this.logoPath}`);
    }

    /**
     * DYNAMIC: Load route data from database with related models
     * @param {string} routeId - MongoDB ObjectId string
     * @param {string} userId - User ID for ownership verification
     * @returns {Object} Complete route data with related information
     */
    async loadDynamicRouteData(routeId, userId = null) {
        try {
            console.log(`🔄 Loading dynamic route data for: ${routeId}`);
            
            // Import models dynamically
            const Route = require('./models/Route');
            const SharpTurn = require('./models/SharpTurn');
            const BlindSpot = require('./models/BlindSpot');
            const AccidentProneArea = require('./models/AccidentProneArea');
            const RoadCondition = require('./models/RoadCondition');
            const WeatherCondition = require('./models/WeatherCondition');
            const TrafficData = require('./models/TrafficData');
            const EmergencyService = require('./models/EmergencyService');
            const NetworkCoverage = require('./models/NetworkCoverage');

            // Build query filter
            let routeFilter = { _id: routeId, status: { $ne: 'deleted' } };
            if (userId) {
                routeFilter.userId = userId;
            }

            // Load main route data
            const routeData = await Route.findOne(routeFilter).lean();
            
            if (!routeData) {
                throw new Error(`Route not found with ID: ${routeId}`);
            }

            console.log(`📊 Found route: ${routeData.routeName || routeData.routeId}`);

            // Load all related data dynamically
            const [
                sharpTurns,
                blindSpots,
                accidentAreas,
                roadConditions,
                weatherConditions,
                trafficData,
                emergencyServices,
                networkCoverage
            ] = await Promise.all([
                SharpTurn.find({ routeId }).lean(),
                BlindSpot.find({ routeId }).lean(),
                AccidentProneArea.find({ routeId }).lean(),
                RoadCondition.find({ routeId }).lean(),
                WeatherCondition.find({ routeId }).lean(),
                TrafficData.find({ routeId }).lean(),
                EmergencyService.find({ routeId }).lean(),
                NetworkCoverage.find({ routeId }).lean()
            ]);

            // Calculate dynamic statistics
            const dynamicStats = this.calculateDynamicStatistics({
                sharpTurns,
                blindSpots,
                accidentAreas,
                roadConditions,
                weatherConditions,
                trafficData,
                emergencyServices,
                networkCoverage
            });

            // Combine all data
            const completeRouteData = {
                ...routeData,
                dynamicStats,
                relatedData: {
                    sharpTurns: sharpTurns.length,
                    blindSpots: blindSpots.length,
                    accidentAreas: accidentAreas.length,
                    roadConditions: roadConditions.length,
                    weatherConditions: weatherConditions.length,
                    trafficData: trafficData.length,
                    emergencyServices: emergencyServices.length,
                    networkCoverage: networkCoverage.length
                },
                dataQuality: this.assessDataQuality(dynamicStats.totalDataPoints),
                lastAnalyzed: this.getLatestAnalysisDate([
                    ...sharpTurns, ...blindSpots, ...accidentAreas, 
                    ...roadConditions, ...weatherConditions, ...trafficData
                ])
            };

            console.log(`✅ Dynamic data loaded: ${dynamicStats.totalDataPoints} total data points`);
            return completeRouteData;

        } catch (error) {
            console.error('❌ Error loading dynamic route data:', error);
            throw new Error(`Failed to load route data: ${error.message}`);
        }
    }

    /**
     * DYNAMIC: Calculate real-time statistics from collected data
     * @param {Object} dataCollections - All related data collections
     * @returns {Object} Calculated statistics
     */
    calculateDynamicStatistics(dataCollections) {
        const stats = {
            totalDataPoints: 0,
            riskAnalysis: {
                avgRiskScore: 0,
                maxRiskScore: 0,
                criticalPoints: 0,
                riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 }
            },
            safetyMetrics: {
                sharpTurnsSeverity: { gentle: 0, moderate: 0, sharp: 0, hairpin: 0 },
                blindSpotTypes: { crest: 0, curve: 0, intersection: 0, obstruction: 0 },
                accidentSeverity: { minor: 0, moderate: 0, major: 0, fatal: 0 },
                emergencyServiceTypes: { hospital: 0, police: 0, fire_station: 0 }
            },
            infrastructureMetrics: {
                roadQuality: { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 },
                weatherRisk: 0,
                trafficCongestion: 0,
                networkDeadZones: 0
            }
        };

        // Calculate from sharp turns
        if (dataCollections.sharpTurns) {
            stats.totalDataPoints += dataCollections.sharpTurns.length;
            dataCollections.sharpTurns.forEach(turn => {
                if (turn.riskScore) {
                    stats.riskAnalysis.avgRiskScore += turn.riskScore;
                    stats.riskAnalysis.maxRiskScore = Math.max(stats.riskAnalysis.maxRiskScore, turn.riskScore);
                    if (turn.riskScore >= 8) stats.riskAnalysis.criticalPoints++;
                    this.categorizeRisk(turn.riskScore, stats.riskAnalysis.riskDistribution);
                }
                if (turn.turnSeverity) {
                    stats.safetyMetrics.sharpTurnsSeverity[turn.turnSeverity]++;
                }
            });
        }

        // Calculate from blind spots
        if (dataCollections.blindSpots) {
            stats.totalDataPoints += dataCollections.blindSpots.length;
            dataCollections.blindSpots.forEach(spot => {
                if (spot.riskScore) {
                    stats.riskAnalysis.avgRiskScore += spot.riskScore;
                    stats.riskAnalysis.maxRiskScore = Math.max(stats.riskAnalysis.maxRiskScore, spot.riskScore);
                    if (spot.riskScore >= 8) stats.riskAnalysis.criticalPoints++;
                    this.categorizeRisk(spot.riskScore, stats.riskAnalysis.riskDistribution);
                }
                if (spot.spotType) {
                    stats.safetyMetrics.blindSpotTypes[spot.spotType]++;
                }
            });
        }

        // Calculate from accident areas
        if (dataCollections.accidentAreas) {
            stats.totalDataPoints += dataCollections.accidentAreas.length;
            dataCollections.accidentAreas.forEach(area => {
                if (area.riskScore) {
                    stats.riskAnalysis.avgRiskScore += area.riskScore;
                    stats.riskAnalysis.maxRiskScore = Math.max(stats.riskAnalysis.maxRiskScore, area.riskScore);
                    if (area.riskScore >= 8) stats.riskAnalysis.criticalPoints++;
                    this.categorizeRisk(area.riskScore, stats.riskAnalysis.riskDistribution);
                }
                if (area.accidentSeverity) {
                    stats.safetyMetrics.accidentSeverity[area.accidentSeverity]++;
                }
            });
        }

        // Calculate from road conditions
        if (dataCollections.roadConditions) {
            stats.totalDataPoints += dataCollections.roadConditions.length;
            dataCollections.roadConditions.forEach(road => {
                if (road.surfaceQuality) {
                    stats.infrastructureMetrics.roadQuality[road.surfaceQuality]++;
                }
            });
        }

        // Calculate from weather conditions
        if (dataCollections.weatherConditions) {
            stats.totalDataPoints += dataCollections.weatherConditions.length;
            const avgWeatherRisk = dataCollections.weatherConditions.reduce((sum, w) => sum + (w.riskScore || 0), 0) / dataCollections.weatherConditions.length;
            stats.infrastructureMetrics.weatherRisk = avgWeatherRisk || 0;
        }

        // Calculate from traffic data
        if (dataCollections.trafficData) {
            stats.totalDataPoints += dataCollections.trafficData.length;
            const heavyTraffic = dataCollections.trafficData.filter(t => ['heavy', 'severe'].includes(t.congestionLevel)).length;
            stats.infrastructureMetrics.trafficCongestion = (heavyTraffic / dataCollections.trafficData.length) * 100;
        }

        // Calculate from emergency services
        if (dataCollections.emergencyServices) {
            stats.totalDataPoints += dataCollections.emergencyServices.length;
            dataCollections.emergencyServices.forEach(service => {
                if (service.serviceType && stats.safetyMetrics.emergencyServiceTypes[service.serviceType] !== undefined) {
                    stats.safetyMetrics.emergencyServiceTypes[service.serviceType]++;
                }
            });
        }

        // Calculate from network coverage
        if (dataCollections.networkCoverage) {
            const deadZones = dataCollections.networkCoverage.filter(n => n.isDeadZone).length;
            stats.infrastructureMetrics.networkDeadZones = deadZones;
        }

        // Finalize averages
        if (stats.totalDataPoints > 0) {
            stats.riskAnalysis.avgRiskScore /= stats.totalDataPoints;
            stats.riskAnalysis.avgRiskScore = Math.round(stats.riskAnalysis.avgRiskScore * 100) / 100;
        }

        return stats;
    }

    /**
     * Helper: Categorize risk score into distribution
     */
    categorizeRisk(riskScore, distribution) {
        if (riskScore >= 8) distribution.critical++;
        else if (riskScore >= 6) distribution.high++;
        else if (riskScore >= 4) distribution.medium++;
        else distribution.low++;
    }

    /**
     * Helper: Assess data quality based on total data points
     */
    assessDataQuality(totalDataPoints) {
        if (totalDataPoints >= 100) return { level: 'excellent', score: 95 };
        if (totalDataPoints >= 50) return { level: 'good', score: 80 };
        if (totalDataPoints >= 20) return { level: 'fair', score: 65 };
        if (totalDataPoints >= 5) return { level: 'poor', score: 40 };
        return { level: 'insufficient', score: 20 };
    }

    /**
     * Helper: Get latest analysis date from data collections
     */
    getLatestAnalysisDate(dataArrays) {
        let latestDate = null;
        
        dataArrays.forEach(item => {
            const dates = [item.createdAt, item.updatedAt, item.lastUpdated].filter(d => d);
            dates.forEach(date => {
                if (!latestDate || new Date(date) > new Date(latestDate)) {
                    latestDate = date;
                }
            });
        });
        
        return latestDate || new Date();
    }

    /**
     * Clean text to remove Unicode characters
     */
    cleanTextForPdf(text) {
        if (!text) return '';
        
        const unicodeReplacements = {
            '\u2705': '[OK]', '\u2713': '[OK]', '\u2717': '[X]', '\u26A0': '[!]',
            '\u00B0': ' deg', '\u2192': '->', '\u2022': '*', '\u2013': '-', '\u2014': '--'
        };
        
        let cleanedText = String(text);
        for (const [unicode, replacement] of Object.entries(unicodeReplacements)) {
            cleanedText = cleanedText.replace(new RegExp(unicode, 'g'), replacement);
        }
        
        return cleanedText.replace(/[^\x00-\x7F]/g, '?');
    }

    /**
     * DYNAMIC: Add title page header with logo - Enhanced Design
     */
    addDynamicTitlePageHeader(doc, routeData) {
        // Enhanced gradient header background
        const headerHeight = 110;
        
        // Primary header background with subtle gradient effect
        doc.rect(0, 0, doc.page.width, headerHeight).fill(this.colors.primary);
        
        // Add subtle accent stripe
        doc.rect(0, headerHeight - 4, doc.page.width, 4).fill(this.colors.accent);
        
        // Add HPCL Logo with enhanced positioning
        if (this.hasLogo) {
            try {
                doc.image(this.logoPath, 30, 20, { width: 65, height: 65 });
                
                // Add subtle logo shadow effect
                doc.circle(62.5, 52.5, 35).stroke([255, 255, 255, 0.1]);
            } catch (error) {
                console.warn('Warning: Could not load HPCL logo:', error.message);
            }
        }
        
        // Enhanced company branding with better typography
        doc.fontSize(14).fill('white').font('Helvetica-Bold')
           .text('HINDUSTAN PETROLEUM CORPORATION LIMITED', 110, 20);
        
        // Division with enhanced styling
        doc.fontSize(12).font('Helvetica').fillColor([220, 220, 220])
           .text('Journey Risk Management Division', 110, 65);
        
        // Enhanced tagline with modern styling
        doc.fontSize(9).font('Helvetica-Oblique').fillColor([200, 200, 200])
           .text('🚀 Powered by Route Analytics Pro - AI Intelligence Platform', 110, 82);
    }

    /**
     * DYNAMIC: Add main title with route-specific information - Enhanced Design
     */
    addDynamicMainTitle(doc, routeData) {
        // Enhanced main title with better spacing
        doc.y = 140;
        
        // Add decorative elements
        const centerX = doc.page.width / 2;
        doc.moveTo(centerX - 100, doc.y - 10).lineTo(centerX + 100, doc.y - 10)
           .strokeColor(this.colors.accent).lineWidth(2).stroke();
        
        // Main title with enhanced typography
        doc.fontSize(28).fillColor(this.colors.primary).font('Helvetica-Bold')
           .text('COMPREHENSIVE JOURNEY RISK', 0, doc.y, { align: 'center', width: doc.page.width });
        
        doc.y += 35;
        doc.fontSize(24).fillColor(this.colors.primary)
           .text('MANAGEMENT ANALYSIS REPORT', 0, doc.y, { align: 'center', width: doc.page.width });
        
        // Enhanced decorative line
        doc.y += 25;
        doc.moveTo(centerX - 80, doc.y).lineTo(centerX + 80, doc.y)
           .strokeColor(this.colors.accent).lineWidth(1).stroke();
        
        // Dynamic subtitle with enhanced styling
        doc.y += 20;
        const dataQualityText = routeData.dataQuality.level === 'excellent' ? 
            '✨ Enhanced with Complete AI Analysis & Multi-API Integration' :
            routeData.dataQuality.level === 'good' ?
            '🔬 Enhanced with Advanced AI Analysis & API Integration' :
            '🤖 Enhanced with Artificial Intelligence & Multi-API Analysis';
            
        doc.fontSize(14).fillColor(this.colors.secondary).font('Helvetica-Oblique')
           .text(dataQualityText, 0, doc.y, { align: 'center', width: doc.page.width });
    }

    /**
     * DYNAMIC: Add route details box with real data - Enhanced Design
     */
    addDynamicRouteDetailsBox(doc, routeData) {
        doc.y += 50;
        const boxY = doc.y;
        const boxHeight = 180; // Increased for better spacing
        const boxX = 60;
        const boxWidth = doc.page.width - 120;
        
        // Enhanced box with shadow effect
        doc.rect(boxX + 3, boxY + 3, boxWidth, boxHeight).fill([200, 200, 200, 0.3]); // Shadow
        doc.rect(boxX, boxY, boxWidth, boxHeight).fill([248, 249, 250]).stroke([220, 220, 220]);
        
        // Enhanced header with gradient-like effect
        const headerColor = routeData.dataQuality.level === 'excellent' ? this.colors.success :
                           routeData.dataQuality.level === 'good' ? this.colors.info :
                           routeData.dataQuality.level === 'fair' ? this.colors.warning : this.colors.danger;
        
        doc.rect(boxX, boxY, boxWidth, 35).fill(headerColor);
        
        // Add quality indicator icon
        const qualityIcon = routeData.dataQuality.level === 'excellent' ? '⭐' :
                           routeData.dataQuality.level === 'good' ? '✅' :
                           routeData.dataQuality.level === 'fair' ? '⚠️' : '🔴';
        
        doc.fontSize(15).fillColor('white').font('Helvetica-Bold')
           .text(`${qualityIcon} ROUTE ANALYSIS DETAILS (${routeData.dataQuality.level.toUpperCase()} DATA)`, boxX + 15, boxY + 10);
        
        // Dynamic route details
        const detailsStartY = boxY + 40;
        
        const formatDuration = (minutes) => {
            if (!minutes) return 'Not specified';
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return hours > 0 ? `${hours} hours ${mins} mins` : `${mins} minutes`;
        };
        
        // Build dynamic route details
        const routeDetails = [
            `Supply Location: ${this.cleanTextForPdf(routeData.fromAddress)} [${this.cleanTextForPdf(routeData.fromCode || 'N/A')}]`,
            `Destination: ${this.cleanTextForPdf(routeData.toAddress)} [${this.cleanTextForPdf(routeData.toCode || 'N/A')}]`,
            `Total Distance: ${routeData.totalDistance || 0} km`,
            `Estimated Duration: ${formatDuration(routeData.estimatedDuration)}`,
            `Route Terrain: ${this.cleanTextForPdf(routeData.terrain || 'Mixed')}`,
            `GPS Tracking Points: ${routeData.routePoints?.length || 0}`,
            `Analysis Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
            `Report Generated: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
        ];
        
        // Add highways if available
        if (routeData.majorHighways && routeData.majorHighways.length > 0) {
            routeDetails.splice(5, 0, `Major Highways: ${routeData.majorHighways.slice(0, 3).join(', ')}`);
        }
        
        // Add dynamic statistics
        if (routeData.dynamicStats.totalDataPoints > 0) {
            routeDetails.splice(-2, 0, `Total Data Points Analyzed: ${routeData.dynamicStats.totalDataPoints}`);
            routeDetails.splice(-2, 0, `Critical Risk Points: ${routeData.dynamicStats.riskAnalysis.criticalPoints}`);
        }
        
        // Enhanced details rendering with better formatting
        doc.fontSize(10).fillColor(this.colors.secondary).font('Helvetica');
        
        let detailY = detailsStartY;
        routeDetails.forEach((detail, index) => {
            // Alternate row background for better readability
            if (index % 2 === 0) {
                doc.rect(boxX + 5, detailY - 2, boxWidth - 10, 14).fill([240, 245, 250]);
            }
            
            // Enhanced bullet points with icons
            const icon = index < 2 ? '📍' : index < 4 ? '📏' : index < 6 ? '🛣️' : '📊';
            doc.text(`${icon} ${detail}`, boxX + 15, detailY);
            detailY += 15;
        });
        
        // Dynamic risk level indicator
        this.addDynamicRiskIndicator(doc, routeData, boxY + boxHeight + 15);
    }

    /**
     * DYNAMIC: Add risk indicator based on actual calculated risk - Enhanced Design
     */
    addDynamicRiskIndicator(doc, routeData, yPosition) {
        // Determine risk level from multiple sources
        let riskLevel = 'PENDING';
        let riskScore = 0;
        let riskColor = this.colors.secondary;
        let riskIcon = '⏳';
        
        if (routeData.riskScores?.totalWeightedScore) {
            riskScore = routeData.riskScores.totalWeightedScore;
            riskLevel = routeData.riskLevel || this.calculateRiskLevel(riskScore);
        } else if (routeData.dynamicStats.riskAnalysis.avgRiskScore > 0) {
            riskScore = routeData.dynamicStats.riskAnalysis.avgRiskScore;
            riskLevel = this.calculateRiskLevel(riskScore);
        }
        
        // Enhanced color and icon based on risk level
        switch (riskLevel) {
            case 'CRITICAL': 
                riskColor = this.colors.danger; 
                riskIcon = '🚨'; 
                break;
            case 'HIGH': 
                riskColor = [255, 87, 34]; 
                riskIcon = '⚠️'; 
                break;
            case 'MEDIUM': 
                riskColor = this.colors.warning; 
                riskIcon = '⚡'; 
                break;
            case 'LOW': 
                riskColor = this.colors.success; 
                riskIcon = '✅'; 
                break;
            default: 
                riskColor = this.colors.secondary; 
                riskIcon = '⏳'; 
                break;
        }
        
        // Enhanced risk indicator with shadow and rounded corners effect
        doc.y = yPosition;
        const riskBoxX = 60;
        const riskBoxWidth = doc.page.width - 120;
        
        // Shadow effect
        doc.rect(riskBoxX + 2, doc.y + 2, riskBoxWidth, 30).fill([0, 0, 0, 0.2]);
        
        // Main risk box with enhanced styling
        doc.rect(riskBoxX, doc.y, riskBoxWidth, 30).fill(riskColor);
        
        // Add accent border
        doc.rect(riskBoxX, doc.y, riskBoxWidth, 3).fill(this.colors.accent);
        
        let riskText = `${riskIcon} ROUTE RISK LEVEL: ${riskLevel}`;
        if (riskScore > 0) {
            riskText += ` (Score: ${riskScore.toFixed(1)}/10)`;
        }
        if (routeData.dynamicStats.riskAnalysis.criticalPoints > 0) {
            riskText += ` • ${routeData.dynamicStats.riskAnalysis.criticalPoints} Critical Points`;
        }
        
        doc.fontSize(12).fillColor('white').font('Helvetica-Bold')
           .text(riskText, 0, doc.y + 9, { align: 'center', width: doc.page.width });
    }

    /**
     * Helper: Calculate risk level from score
     */
    calculateRiskLevel(score) {
        if (score >= 8) return 'CRITICAL';
        if (score >= 6) return 'HIGH';
        if (score >= 4) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Create a detailed table for PDF reports - Enhanced Design
     * @param {PDFDocument} doc - PDF document instance
     * @param {string} title - Table title
     * @param {Array} data - Array of {label, value} objects
     * @param {number} yPosition - Y position to start table
     * @param {Object} options - Table styling options
     */
    createDetailedTable(doc, title, data, yPosition, options = {}) {
        const {
            rowHeight = 22,
            fontSize = 10,
            headerColor = this.colors.primary,
            textColor = this.colors.darkGray,
            borderColor = [230, 230, 230],
            padding = 15
        } = options;

        const tableY = yPosition;
        const tableWidth = doc.page.width - 100;
        const tableX = 50;
        
        // Enhanced table with shadow effect
        doc.rect(tableX + 2, tableY + 2, tableWidth, 30 + (data.length * rowHeight)).fill([0, 0, 0, 0.1]); // Shadow
        
        // Enhanced table header with gradient-like effect
        doc.rect(tableX, tableY, tableWidth, 30).fill(headerColor);
        doc.rect(tableX, tableY, tableWidth, 3).fill(this.colors.accent); // Top accent
        
        // Header icon based on title
        const headerIcon = title.includes('Risk') ? '⚠️' :
                          title.includes('Safety') ? '🛡️' :
                          title.includes('Weather') ? '🌤️' :
                          title.includes('Traffic') ? '🚦' : '📊';
        
        doc.fontSize(12).fillColor('white').font('Helvetica-Bold')
           .text(`${headerIcon} ${title}`, tableX + 15, tableY + 9);
        
        let currentY = tableY + 30;
        
        // Enhanced table rows with better styling
        data.forEach((row, index) => {
            const rowColor = index % 2 === 0 ? this.colors.lightGray : 'white';
            
            // Row background with subtle border
            doc.rect(tableX, currentY, tableWidth, rowHeight).fill(rowColor)
               .stroke(borderColor);
            
            // Add status indicator for certain values
            let statusIcon = '';
            if (row.value.toString().toLowerCase().includes('high')) statusIcon = '🔴';
            else if (row.value.toString().toLowerCase().includes('medium')) statusIcon = '🟡';
            else if (row.value.toString().toLowerCase().includes('low')) statusIcon = '🟢';
            else if (row.value.toString().includes('%')) statusIcon = '📈';
            
            // Enhanced text rendering
            doc.fontSize(fontSize).fillColor(textColor).font('Helvetica')
               .text(`• ${row.label}`, tableX + padding, currentY + 6);
            
            doc.font('Helvetica-Bold').fillColor(this.colors.primary)
               .text(`${statusIcon} ${row.value}`, tableX + tableWidth - 180, currentY + 6);
            
            currentY += rowHeight;
        });
        
        return currentY;
    }

    /**
     * DYNAMIC: Add footer with data source information - Enhanced Design
     */
    addDynamicTitlePageFooter(doc, routeData) {
        const footerY = doc.page.height - 90;
        
        // Enhanced footer with gradient background
        doc.rect(0, footerY, doc.page.width, 90).fill([248, 249, 250]);
        
        // Add top border accent
        doc.rect(0, footerY, doc.page.width, 2).fill(this.colors.accent);
        
        // Generation timestamp with enhanced styling
        const timestamp = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        doc.fontSize(10).fillColor(this.colors.primary).font('Helvetica-Bold')
           .text(`📅 Report Generated: ${timestamp} (IST)`, 60, footerY + 12);
        
        // Enhanced data source information with icons
        const dataSources = [];
        if (routeData.relatedData.sharpTurns > 0) dataSources.push('Sharp Turns Analysis');
        if (routeData.relatedData.blindSpots > 0) dataSources.push('Blind Spots Detection');
        if (routeData.relatedData.accidentAreas > 0) dataSources.push('Accident Data');
        if (routeData.relatedData.emergencyServices > 0) dataSources.push('Emergency Services');
        if (routeData.relatedData.networkCoverage > 0) dataSources.push('Network Coverage');
        
        const dataSourceText = dataSources.length > 0 ? 
            `🌐 Data Sources: ${dataSources.slice(0, 3).join(' • ')}${dataSources.length > 3 ? ' • +More' : ''}` :
            '🌐 Real-time Risk Assessment • Professional Safety Analysis';
        
        doc.fontSize(9).fillColor(this.colors.secondary).font('Helvetica')
           .text(dataSourceText, 60, footerY + 28);
        
        // AI Models information
        doc.text('🤖 AI Models: Risk Assessment AI • Pattern Recognition • Route Optimization', 60, footerY + 42);
        
        // Enhanced disclaimer with better formatting
        doc.fontSize(8).fillColor([120, 120, 120]).font('Helvetica-Oblique')
           .text('⚠️ Disclaimer: This report is generated using AI-powered analysis and should be used as a guidance tool. Always follow traffic rules and exercise caution while driving.', 
                 60, footerY + 58, { width: doc.page.width - 120, lineGap: 2 });
        
        // Add decorative footer element
        const centerX = doc.page.width / 2;
        doc.moveTo(centerX - 50, footerY + 78).lineTo(centerX + 50, footerY + 78)
           .strokeColor(this.colors.accent).lineWidth(1).stroke();
    }

    /**
     * MAIN METHOD: Generate dynamic title page from Route ID - Enhanced Layout
     * @param {string} routeId - MongoDB ObjectId
     * @param {string} userId - User ID for ownership verification
     * @param {string} outputPath - Output file path
     */
    async generateDynamicTitlePage(routeId, userId = null, outputPath = null) {
        try {
            console.log('📄 Generating ENHANCED DYNAMIC HPCL Title Page...');
            console.log(`🔍 Route ID: ${routeId}`);
            console.log(`👤 User ID: ${userId || 'Not specified'}`);
            
            // Load complete dynamic route data
            const routeData = await this.loadDynamicRouteData(routeId, userId);
            
            // Create PDF document with enhanced settings
            const doc = new PDFDocument({ 
                margin: 0,
                size: 'A4',
                bufferPages: true,
                info: {
                    Title: `HPCL Journey Risk Analysis - ${routeData.routeName || 'Route Analysis'}`,
                    Author: 'HPCL Journey Risk Management System',
                    Subject: `Enhanced Dynamic Route Analysis: ${routeData.fromName || 'Source'} to ${routeData.toName || 'Destination'}`,
                    Keywords: `HPCL, Enhanced Analysis, ${routeData.routeId}, Safety, Risk Assessment, AI`,
                    Creator: 'HPCL Risk Management Division - Enhanced Dynamic Generator'
                }
            });

            // Add subtle page background for modern look
            doc.rect(0, 0, doc.page.width, doc.page.height).fill([252, 253, 255]);

            // Generate enhanced dynamic content
            this.addDynamicTitlePageHeader(doc, routeData);
            this.addDynamicMainTitle(doc, routeData);
            this.addDynamicRouteDetailsBox(doc, routeData);
            this.addDynamicTitlePageFooter(doc, routeData);

            // Save or return
            if (outputPath) {
                return new Promise((resolve, reject) => {
                    const stream = fs.createWriteStream(outputPath);
                    doc.pipe(stream);
                    doc.end();

                    stream.on('finish', () => {
                        console.log(`✅ DYNAMIC HPCL Title Page generated: ${outputPath}`);
                        console.log(`📊 Route: ${routeData.routeName || routeData.routeId}`);
                        console.log(`🛣️ Distance: ${routeData.totalDistance}km`);
                        console.log(`📈 Data Points: ${routeData.dynamicStats.totalDataPoints}`);
                        console.log(`⚠️ Critical Points: ${routeData.dynamicStats.riskAnalysis.criticalPoints}`);
                        console.log(`🎯 Data Quality: ${routeData.dataQuality.level} (${routeData.dataQuality.score}%)`);
                        resolve({ filePath: outputPath, routeData });
                    });

                    stream.on('error', reject);
                });
            } else {
                return { doc, routeData };
            }

        } catch (error) {
            console.error('❌ Error generating dynamic title page:', error);
            throw error;
        }
    }
}

    /**
     * Add detailed analysis page with comprehensive data - Enhanced Design
     */
    addDetailedAnalysisPage(doc, routeData) {
        doc.addPage();
        
        // Enhanced page background
        doc.rect(0, 0, doc.page.width, doc.page.height).fill([252, 253, 255]);
        
        // Enhanced page header with decorative elements
        const headerY = 40;
        doc.rect(0, headerY, doc.page.width, 60).fill(this.colors.primary);
        doc.rect(0, headerY + 57, doc.page.width, 3).fill(this.colors.accent);
        
        doc.fontSize(20).fillColor('white').font('Helvetica-Bold')
           .text('📊 DETAILED ROUTE ANALYSIS', 50, headerY + 18);
        
        doc.fontSize(12).fillColor([220, 220, 220]).font('Helvetica')
           .text('Comprehensive AI-Powered Risk Assessment & Safety Analysis', 50, headerY + 42);
        
        let currentY = 130;
        
        // Enhanced Risk Analysis Section
        if (routeData.dynamicStats.riskAnalysis) {
            const riskData = [
                { label: 'Average Risk Score', value: `${routeData.dynamicStats.riskAnalysis.avgRiskScore.toFixed(1)}/10` },
                { label: 'Critical Risk Points', value: `${routeData.dynamicStats.riskAnalysis.criticalPoints} locations` },
                { label: 'High Risk Distribution', value: `${routeData.dynamicStats.riskAnalysis.riskDistribution.high} zones` },
                { label: 'Medium Risk Distribution', value: `${routeData.dynamicStats.riskAnalysis.riskDistribution.medium} zones` },
                { label: 'Safety Confidence', value: `${(100 - routeData.dynamicStats.riskAnalysis.avgRiskScore * 10).toFixed(1)}%` }
            ];
            
            currentY = this.createDetailedTable(doc, 'AI Risk Analysis Summary', riskData, currentY) + 25;
        }
        
        // Enhanced Safety Metrics Section
        if (routeData.dynamicStats.safetyMetrics) {
            const safetyData = [
                { label: 'Hospital Services', value: `${routeData.dynamicStats.safetyMetrics.emergencyServiceTypes.hospital} facilities` },
                { label: 'Police Stations', value: `${routeData.dynamicStats.safetyMetrics.emergencyServiceTypes.police} stations` },
                { label: 'Fire Stations', value: `${routeData.dynamicStats.safetyMetrics.emergencyServiceTypes.fire_station} stations` },
                { label: 'Sharp Turns (Hairpin)', value: `${routeData.dynamicStats.safetyMetrics.sharpTurnsSeverity.hairpin} turns` },
                { label: 'Accident Severity (Major)', value: `${routeData.dynamicStats.safetyMetrics.accidentSeverity.major} incidents` }
            ];
            
            currentY = this.createDetailedTable(doc, 'Safety Infrastructure & Emergency Response', safetyData, currentY) + 25;
        }
        
        // Enhanced Infrastructure Metrics
        if (routeData.dynamicStats.infrastructureMetrics) {
            const infraData = [
                { label: 'Road Quality (Poor)', value: `${routeData.dynamicStats.infrastructureMetrics.roadQuality.poor} segments` },
                { label: 'Road Quality (Critical)', value: `${routeData.dynamicStats.infrastructureMetrics.roadQuality.critical} segments` },
                { label: 'Weather Risk Factor', value: `${routeData.dynamicStats.infrastructureMetrics.weatherRisk.toFixed(1)}/10` },
                { label: 'Traffic Congestion', value: `${routeData.dynamicStats.infrastructureMetrics.trafficCongestion.toFixed(1)}%` },
                { label: 'Network Dead Zones', value: `${routeData.dynamicStats.infrastructureMetrics.networkDeadZones} areas` }
            ];
            
            currentY = this.createDetailedTable(doc, 'Infrastructure & Environmental Assessment', infraData, currentY) + 25;
        }
        
        // Add data quality assessment
        const qualityData = [
            { label: 'Data Quality Level', value: routeData.dataQuality.level.toUpperCase() },
            { label: 'Data Quality Score', value: `${routeData.dataQuality.score}%` },
            { label: 'Total Data Points', value: `${routeData.dynamicStats.totalDataPoints} points` },
            { label: 'Last Analysis', value: new Date(routeData.lastAnalyzed).toLocaleDateString() }
        ];
        
        currentY = this.createDetailedTable(doc, 'Data Quality & Analysis Metrics', qualityData, currentY) + 25;
    }
}

// Export the dynamic class
module.exports = HPCLDynamicPDFGenerator;

// Example usage
if (require.main === module) {
    const generator = new HPCLDynamicPDFGenerator();
    
    // Example: Generate from actual route ID
    const routeId = '507f1f77bcf86cd799439011'; // Replace with actual route ID
    const userId = '507f191e810c19729de860ea';   // Replace with actual user ID
    
    generator.generateDynamicTitlePage(routeId, userId, 'hpcl-dynamic-route-analysis.pdf')
        .then((result) => {
            console.log('\n🎉 DYNAMIC title page generation completed!');
            console.log(`📁 File: ${result.filePath}`);
            console.log(`📊 Analysis: ${result.routeData.dynamicStats.totalDataPoints} data points`);
        })
        .catch((error) => {
            console.error('❌ Dynamic generation failed:', error);
        });
}

/* 
 * USAGE EXAMPLES:
 * 
 * 1. Generate from Route ID:
 *    const generator = new HPCLDynamicPDFGenerator();
 *    await generator.generateDynamicTitlePage(routeId, userId, 'output.pdf');
 * 
 * 2. For multi-page report:
 *    const { doc, routeData } = await generator.generateDynamicTitlePage(routeId, userId);
 *    doc.addPage();
 *    // Add more pages...
 *    doc.end();
 * 
 * 3. API Integration:
 *    router.get('/routes/:routeId/generate-pdf', async (req, res) => {
 *        const result = await generator.generateDynamicTitlePage(
 *            req.params.routeId, 
 *            req.user.id, 
 *            `route-${req.params.routeId}.pdf`
 *        );
 *        res.download(result.filePath);
 *    });
 */