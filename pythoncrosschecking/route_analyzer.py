"""
Route Analysis System
====================
This script processes route data from Excel files based on a CSV index file.

Installation Requirements:
------------------------
pip install pandas numpy openpyxl geopy matplotlib

Usage:
------
1. Place your CSV file in the same directory as this script
2. Create a 'data' folder containing all Excel files
3. Run the script: python route_analyzer.py
"""

import pandas as pd
import numpy as np
import os
import glob
from geopy.distance import geodesic
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

class RouteAnalyzer:
    def __init__(self, csv_file, data_folder='data'):
        self.csv_file = csv_file
        self.data_folder = data_folder
        self.results = []
        self.csv_data = None
        
    def load_csv_index(self):
        """Load the CSV file containing route information"""
        try:
            self.csv_data = pd.read_csv(self.csv_file)
            print(f"Loaded CSV with {len(self.csv_data)} entries")
            print(f"CSV Columns: {list(self.csv_data.columns)}")
            
            # Display first few rows
            print("\nFirst 5 rows of CSV:")
            print(self.csv_data.head())
            
            return True
        except Exception as e:
            print(f"Error loading CSV: {str(e)}")
            return False
    
    def generate_filename(self, row):
        """Generate Excel filename from CSV row"""
        # Assuming first and third columns are used for filename
        col1 = str(row.iloc[0])
        col3 = str(row.iloc[2])
        filename = f"{col1}_{col3}.xlsx"
        return filename
    
    def validate_coordinates(self, lat, lon):
        """Validate if coordinates are within valid ranges"""
        try:
            lat = float(lat)
            lon = float(lon)
            # Check if coordinates are within valid ranges
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                # Additional check for India region (rough boundaries)
                if 6 <= lat <= 38 and 68 <= lon <= 98:
                    return True
            return False
        except:
            return False
    
    def calculate_route_distance(self, points):
        """Calculate total distance for a route"""
        total_distance = 0
        distances = []
        
        for i in range(len(points) - 1):
            try:
                dist = geodesic(points[i], points[i+1]).kilometers
                distances.append(dist)
                total_distance += dist
            except:
                distances.append(0)
                
        return total_distance, distances
    
    def detect_anomalies(self, points, distances):
        """Detect anomalies in the route"""
        anomalies = []
        
        # Check for duplicate consecutive points
        duplicates = 0
        for i in range(len(points) - 1):
            if points[i] == points[i+1]:
                duplicates += 1
        
        if duplicates > 0:
            anomalies.append(f"Found {duplicates} duplicate consecutive points")
        
        # Check for large jumps (>100 km between consecutive points)
        large_jumps = [i for i, d in enumerate(distances) if d > 100]
        if large_jumps:
            anomalies.append(f"Large jumps (>100km) at positions: {large_jumps}")
        
        # Check for stationary segments (very small movements)
        stationary = [i for i, d in enumerate(distances) if 0 < d < 0.01]
        if len(stationary) > 5:
            anomalies.append(f"Many stationary points ({len(stationary)} segments < 10m)")
        
        return anomalies
    
    def parse_mixed_coordinates(self, df):
        """Parse coordinates from files with mixed format issues"""
        valid_points = []
        anomalies = []
        mixed_format_detected = False
        
        # Try to identify the data structure
        for idx, row in df.iterrows():
            # Convert row to list of values, filtering out NaN
            values = [v for v in row.values if pd.notna(v)]
            
            # Skip empty rows
            if len(values) == 0:
                continue
                
            # Check if we have numeric values
            numeric_values = []
            for v in values:
                try:
                    numeric_values.append(float(v))
                except:
                    continue
            
            # Case 1: Four values - likely 2 coordinate pairs mixed
            if len(numeric_values) == 4:
                mixed_format_detected = True
                # First pair
                lat1, lon1 = numeric_values[0], numeric_values[1]
                # Second pair
                lat2, lon2 = numeric_values[2], numeric_values[3]
                
                # Validate and add first pair
                if self.validate_coordinates(lat1, lon1):
                    valid_points.append((lat1, lon1))
                
                # Validate and add second pair
                if self.validate_coordinates(lat2, lon2):
                    valid_points.append((lat2, lon2))
                    
            # Case 2: Two values - standard lat/lon pair
            elif len(numeric_values) == 2:
                lat, lon = numeric_values[0], numeric_values[1]
                if self.validate_coordinates(lat, lon):
                    valid_points.append((lat, lon))
                    
            # Case 3: Odd number of values
            elif len(numeric_values) == 3:
                anomalies.append(f"Row {idx}: Found 3 values, expected 2 or 4")
                # Try to use first 2 values
                lat, lon = numeric_values[0], numeric_values[1]
                if self.validate_coordinates(lat, lon):
                    valid_points.append((lat, lon))
        
        if mixed_format_detected:
            anomalies.append("Mixed format detected: Multiple coordinate pairs per row")
            
        return valid_points, anomalies
    
    def check_alternating_regions(self, points):
        """Check if coordinates alternate between different regions"""
        if len(points) < 2:
            return []
            
        anomalies = []
        lat_groups = {}
        
        # Group points by latitude prefix (integer part)
        for i, (lat, lon) in enumerate(points):
            lat_prefix = int(lat)
            if lat_prefix not in lat_groups:
                lat_groups[lat_prefix] = []
            lat_groups[lat_prefix].append(i)
        
        # Check if we have multiple distinct regions
        if len(lat_groups) > 1:
            region_desc = ", ".join([f"{prefix}° ({len(indices)} points)" for prefix, indices in lat_groups.items()])
            anomalies.append(f"Route spans multiple latitude regions: {region_desc}")
            
            # Check if regions alternate
            prev_prefix = int(points[0][0])
            alternations = 0
            for lat, lon in points[1:]:
                curr_prefix = int(lat)
                if curr_prefix != prev_prefix:
                    alternations += 1
                    prev_prefix = curr_prefix
            
            if alternations > len(points) * 0.3:  # More than 30% alternations
                anomalies.append(f"Frequent alternation between regions detected ({alternations} times)")
        
        return anomalies
    
    def process_file(self, filepath, csv_row_data=None):
        """Process a single Excel file"""
        try:
            # Extract filename info
            filename = os.path.basename(filepath)
            file_id = filename.split('.')[0]
            
            # Try reading the Excel file
            try:
                df = pd.read_excel(filepath)
            except:
                return {
                    'file_id': file_id,
                    'filename': filename,
                    'csv_col1': csv_row_data.iloc[0] if csv_row_data is not None else None,
                    'csv_col2': csv_row_data.iloc[1] if csv_row_data is not None else None,
                    'csv_col3': csv_row_data.iloc[2] if csv_row_data is not None else None,
                    'csv_col4': csv_row_data.iloc[3] if csv_row_data is not None else None,
                    'status': 'Error reading file',
                    'total_points': 0,
                    'valid_points': 0,
                    'total_distance_km': 0,
                    'start_location': None,
                    'end_location': None,
                    'anomalies': ['Could not read Excel file']
                }
            
            # First attempt: Check if required columns exist
            lat_col = None
            lon_col = None
            
            # Common column name variations
            lat_variations = ['Latitude', 'latitude', 'lat', 'Lat', 'LATITUDE']
            lon_variations = ['Longitude', 'longitude', 'lon', 'Lon', 'LONGITUDE', 'Long']
            
            for col in df.columns:
                if any(lat_var in str(col) for lat_var in lat_variations):
                    lat_col = col
                if any(lon_var in str(col) for lon_var in lon_variations):
                    lon_col = col
            
            format_anomalies = []
            
            # Standard format processing
            if lat_col is not None and lon_col is not None:
                # Process coordinates normally
                total_points = len(df)
                valid_points = []
                
                for idx, row in df.iterrows():
                    lat = row[lat_col]
                    lon = row[lon_col]
                    
                    if self.validate_coordinates(lat, lon):
                        valid_points.append((float(lat), float(lon)))
            else:
                # Try mixed format parsing
                total_points = len(df)
                valid_points, format_anomalies = self.parse_mixed_coordinates(df)
            
            if len(valid_points) == 0:
                return {
                    'file_id': file_id,
                    'filename': filename,
                    'csv_col1': csv_row_data.iloc[0] if csv_row_data is not None else None,
                    'csv_col2': csv_row_data.iloc[1] if csv_row_data is not None else None,
                    'csv_col3': csv_row_data.iloc[2] if csv_row_data is not None else None,
                    'csv_col4': csv_row_data.iloc[3] if csv_row_data is not None else None,
                    'status': 'No valid coordinates',
                    'total_points': total_points,
                    'valid_points': 0,
                    'total_distance_km': 0,
                    'start_location': None,
                    'end_location': None,
                    'anomalies': ['No valid coordinates found'] + format_anomalies
                }
            
            # Calculate distances and detect anomalies
            total_distance, distances = self.calculate_route_distance(valid_points)
            anomalies = self.detect_anomalies(valid_points, distances)
            anomalies.extend(format_anomalies)
            
            # Additional check for alternating patterns
            alternating_regions = self.check_alternating_regions(valid_points)
            if alternating_regions:
                anomalies.extend(alternating_regions)
            
            # Determine status
            if len(valid_points) < total_points * 0.5:
                status = 'Poor quality data'
            elif anomalies:
                status = 'Has anomalies'
            else:
                status = 'Good'
            
            return {
                'file_id': file_id,
                'filename': filename,
                'csv_col1': csv_row_data.iloc[0] if csv_row_data is not None else None,
                'csv_col2': csv_row_data.iloc[1] if csv_row_data is not None else None,
                'csv_col3': csv_row_data.iloc[2] if csv_row_data is not None else None,
                'csv_col4': csv_row_data.iloc[3] if csv_row_data is not None else None,
                'status': status,
                'total_points': total_points,
                'valid_points': len(valid_points),
                'total_distance_km': round(total_distance, 2),
                'start_location': f"{valid_points[0][0]:.6f}, {valid_points[0][1]:.6f}" if valid_points else None,
                'end_location': f"{valid_points[-1][0]:.6f}, {valid_points[-1][1]:.6f}" if valid_points else None,
                'anomalies': anomalies if anomalies else ['None detected']
            }
            
        except Exception as e:
            return {
                'file_id': os.path.basename(filepath).split('.')[0],
                'filename': os.path.basename(filepath),
                'csv_col1': csv_row_data.iloc[0] if csv_row_data is not None else None,
                'csv_col2': csv_row_data.iloc[1] if csv_row_data is not None else None,
                'csv_col3': csv_row_data.iloc[2] if csv_row_data is not None else None,
                'csv_col4': csv_row_data.iloc[3] if csv_row_data is not None else None,
                'status': 'Processing error',
                'total_points': 0,
                'valid_points': 0,
                'total_distance_km': 0,
                'start_location': None,
                'end_location': None,
                'anomalies': [f'Error: {str(e)}']
            }
    
    def process_all_routes(self):
        """Process all routes based on CSV index"""
        if self.csv_data is None:
            print("CSV data not loaded. Run load_csv_index() first.")
            return
        
        print(f"\nProcessing {len(self.csv_data)} routes...")
        
        for idx, row in self.csv_data.iterrows():
            # Generate filename
            filename = self.generate_filename(row)
            filepath = os.path.join(self.data_folder, filename)
            
            # Process file
            if os.path.exists(filepath):
                if idx % 100 == 0:
                    print(f"Processing route {idx+1}/{len(self.csv_data)}...")
                result = self.process_file(filepath, row)
            else:
                result = {
                    'file_id': filename.split('.')[0],
                    'filename': filename,
                    'csv_col1': row.iloc[0],
                    'csv_col2': row.iloc[1],
                    'csv_col3': row.iloc[2],
                    'csv_col4': row.iloc[3],
                    'status': 'File not found',
                    'total_points': 0,
                    'valid_points': 0,
                    'total_distance_km': 0,
                    'start_location': None,
                    'end_location': None,
                    'anomalies': ['Excel file not found in data folder']
                }
            
            self.results.append(result)
        
        print(f"Completed processing {len(self.results)} routes")
        return self.results
    
    def generate_summary_report(self, output_file='route_analysis_summary.csv'):
        """Generate a summary CSV report"""
        if not self.results:
            print("No results to save")
            return
        
        # Convert results to DataFrame
        df = pd.DataFrame(self.results)
        
        # Add summary statistics
        print("\n=== SUMMARY STATISTICS ===")
        print(f"Total files processed: {len(df)}")
        print(f"Files found: {len(df[df['status'] != 'File not found'])}")
        print(f"Files not found: {len(df[df['status'] == 'File not found'])}")
        print(f"Files with good data: {len(df[df['status'] == 'Good'])}")
        print(f"Files with anomalies: {len(df[df['status'] == 'Has anomalies'])}")
        print(f"Files with poor quality: {len(df[df['status'] == 'Poor quality data'])}")
        print(f"Files with errors: {len(df[df['status'].str.contains('Error|error')])}")
        
        valid_routes = df[df['total_distance_km'] > 0]
        if len(valid_routes) > 0:
            print(f"\nTotal distance covered: {valid_routes['total_distance_km'].sum():.2f} km")
            print(f"Average route distance: {valid_routes['total_distance_km'].mean():.2f} km")
            print(f"Shortest route: {valid_routes['total_distance_km'].min():.2f} km")
            print(f"Longest route: {valid_routes['total_distance_km'].max():.2f} km")
        
        # Save to CSV
        df.to_csv(output_file, index=False)
        print(f"\nDetailed results saved to: {output_file}")
        
        # Save problem files separately
        problem_files = df[df['status'] != 'Good']
        if len(problem_files) > 0:
            problem_files.to_csv('problem_routes.csv', index=False)
            print(f"Problem routes saved to: problem_routes.csv")
        
        # Save missing files list
        missing_files = df[df['status'] == 'File not found']
        if len(missing_files) > 0:
            missing_files.to_csv('missing_files.csv', index=False)
            print(f"Missing files list saved to: missing_files.csv")
        
        return df
    
    def visualize_route(self, filepath, output_image=None):
        """Create a visual representation of the route"""
        try:
            import matplotlib.pyplot as plt
            
            result = self.process_file(filepath)
            
            if result['valid_points'] == 0:
                print(f"No valid points to visualize in {filepath}")
                return
            
            # Extract coordinates from the file again for visualization
            df = pd.read_excel(filepath)
            
            # Try standard format first
            lat_col = None
            lon_col = None
            for col in df.columns:
                if 'lat' in str(col).lower():
                    lat_col = col
                if 'lon' in str(col).lower():
                    lon_col = col
            
            if lat_col and lon_col:
                valid_points = []
                for idx, row in df.iterrows():
                    if self.validate_coordinates(row[lat_col], row[lon_col]):
                        valid_points.append((float(row[lat_col]), float(row[lon_col])))
            else:
                valid_points, _ = self.parse_mixed_coordinates(df)
            
            if not valid_points:
                print("No valid coordinates found for visualization")
                return
            
            # Separate coordinates
            lats = [p[0] for p in valid_points]
            lons = [p[1] for p in valid_points]
            
            # Create figure
            fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
            
            # Plot 1: Route map
            ax1.plot(lons, lats, 'b-', linewidth=1, alpha=0.6, label='Route')
            ax1.scatter(lons[0], lats[0], c='green', s=100, marker='o', label='Start', zorder=5)
            ax1.scatter(lons[-1], lats[-1], c='red', s=100, marker='s', label='End', zorder=5)
            
            # Highlight points by latitude region
            lat_17 = [(lat, lon) for lat, lon in valid_points if 17 <= lat < 18]
            lat_21 = [(lat, lon) for lat, lon in valid_points if 21 <= lat < 22]
            
            if lat_17:
                ax1.scatter([p[1] for p in lat_17], [p[0] for p in lat_17], 
                           c='orange', s=20, alpha=0.5, label='17° region')
            if lat_21:
                ax1.scatter([p[1] for p in lat_21], [p[0] for p in lat_21], 
                           c='purple', s=20, alpha=0.5, label='21° region')
            
            ax1.set_xlabel('Longitude')
            ax1.set_ylabel('Latitude')
            ax1.set_title(f'Route Map: {result["file_id"]}')
            ax1.legend()
            ax1.grid(True, alpha=0.3)
            
            # Plot 2: Distance progression
            distances = []
            cumulative_dist = 0
            for i in range(len(valid_points) - 1):
                dist = geodesic(valid_points[i], valid_points[i+1]).kilometers
                cumulative_dist += dist
                distances.append(cumulative_dist)
            
            ax2.plot(range(1, len(distances) + 1), distances, 'g-', linewidth=2)
            ax2.set_xlabel('Point Number')
            ax2.set_ylabel('Cumulative Distance (km)')
            ax2.set_title(f'Distance Progression\nTotal: {result["total_distance_km"]} km')
            ax2.grid(True, alpha=0.3)
            
            plt.tight_layout()
            
            if output_image:
                plt.savefig(output_image, dpi=150, bbox_inches='tight')
                print(f"Visualization saved to: {output_image}")
            else:
                plt.show()
                
        except ImportError:
            print("Matplotlib not installed. Run: pip install matplotlib")
        except Exception as e:
            print(f"Visualization error: {str(e)}")

# Main execution
def main():
    print("=== ROUTE ANALYSIS SYSTEM ===")
    print("Install requirements: pip install pandas numpy openpyxl geopy matplotlib")
    print("-" * 50)
    
    # Configuration
    CSV_FILE = "routesinformation.csv"  # Your CSV file name
    DATA_FOLDER = "data"       # Folder containing Excel files
    
    # Initialize analyzer
    analyzer = RouteAnalyzer(CSV_FILE, DATA_FOLDER)
    
    # Load CSV index
    if not analyzer.load_csv_index():
        print("Failed to load CSV file. Please check the file path.")
        return
    
    # Process all routes
    print("\nStarting route analysis...")
    analyzer.process_all_routes()
    
    # Generate summary report
    summary_df = analyzer.generate_summary_report()
    
    # Optional: Visualize a specific route
    # Example: analyzer.visualize_route('data/1527_0041000139.xlsx', 'route_visual.png')
    
    print("\n=== ANALYSIS COMPLETE ===")
    print("Check the following output files:")
    print("- route_analysis_summary.csv (all results)")
    print("- problem_routes.csv (routes with issues)")
    print("- missing_files.csv (files not found)")

if __name__ == "__main__":
    main()