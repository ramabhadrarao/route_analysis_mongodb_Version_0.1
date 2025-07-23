"""
Route Analysis System with Multiprocessing
=========================================
This script processes route data from Excel files with parallel processing support.

Installation Requirements:
------------------------
pip install pandas numpy openpyxl geopy matplotlib tqdm

Usage:
------
1. Place your CSV file in the same directory as this script
2. Create a 'data' folder containing all Excel files
3. Run the script: python route_analyzer_mp.py
"""

import pandas as pd
import numpy as np
import os
import glob
from geopy.distance import geodesic
from datetime import datetime
import warnings
import multiprocessing as mp
from functools import partial
import logging
from tqdm import tqdm
import time
import sys

warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('route_analysis_debug.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class RouteAnalyzer:
    def __init__(self, csv_file, data_folder='data', num_workers=None):
        self.csv_file = csv_file
        self.data_folder = data_folder
        self.results = []
        self.csv_data = None
        self.num_workers = num_workers or mp.cpu_count() - 1
        logger.info(f"Initialized RouteAnalyzer with {self.num_workers} workers")
        
    def load_csv_index(self):
        """Load the CSV file containing route information"""
        try:
            logger.info(f"Loading CSV file: {self.csv_file}")
            self.csv_data = pd.read_csv(self.csv_file)
            logger.info(f"Successfully loaded CSV with {len(self.csv_data)} entries")
            logger.info(f"CSV Columns: {list(self.csv_data.columns)}")
            
            # Display first few rows
            logger.debug("First 5 rows of CSV:")
            logger.debug(f"\n{self.csv_data.head()}")
            
            return True
        except Exception as e:
            logger.error(f"Error loading CSV: {str(e)}")
            return False
    
    def generate_filename(self, row):
        """Generate Excel filename from CSV row"""
        # Using BU Code (col1) and Row Labels (col3) for filename
        col1 = str(row.iloc[0])  # BU Code
        col3 = str(row.iloc[2])  # Row Labels
        filename = f"{col1}_{col3}.xlsx"
        logger.debug(f"Generated filename: {filename}")
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
            
            logger.debug(f"Starting to process file: {filename}")
            
            # Try reading the Excel file
            try:
                logger.debug(f"Reading Excel file: {filepath}")
                df = pd.read_excel(filepath)
                logger.debug(f"Successfully read Excel with {len(df)} rows")
            except Exception as e:
                logger.error(f"Failed to read Excel file {filename}: {str(e)}")
                return {
                    'file_id': file_id,
                    'filename': filename,
                    'BU_Code': csv_row_data.iloc[0] if csv_row_data is not None else None,
                    'Location': csv_row_data.iloc[1] if csv_row_data is not None else None,
                    'Row_Labels': csv_row_data.iloc[2] if csv_row_data is not None else None,
                    'Customer_Name': csv_row_data.iloc[3] if csv_row_data is not None else None,
                    'status': 'Error reading file',
                    'total_points': 0,
                    'valid_points': 0,
                    'total_distance_km': 0,
                    'start_location': None,
                    'end_location': None,
                    'anomalies': ['Could not read Excel file']
                }
            
            # Log column information
            logger.debug(f"Excel columns found: {list(df.columns)}")
            
            # First attempt: Check if required columns exist
            lat_col = None
            lon_col = None
            
            # Common column name variations
            lat_variations = ['Latitude', 'latitude', 'lat', 'Lat', 'LATITUDE']
            lon_variations = ['Longitude', 'longitude', 'lon', 'Lon', 'LONGITUDE', 'Long']
            
            for col in df.columns:
                if any(lat_var in str(col) for lat_var in lat_variations):
                    lat_col = col
                    logger.debug(f"Found latitude column: {lat_col}")
                if any(lon_var in str(col) for lon_var in lon_variations):
                    lon_col = col
                    logger.debug(f"Found longitude column: {lon_col}")
            
            format_anomalies = []
            
            # Standard format processing
            if lat_col is not None and lon_col is not None:
                logger.debug(f"Using standard format processing for {filename}")
                # Process coordinates normally
                total_points = len(df)
                valid_points = []
                
                for idx, row in df.iterrows():
                    lat = row[lat_col]
                    lon = row[lon_col]
                    
                    if self.validate_coordinates(lat, lon):
                        valid_points.append((float(lat), float(lon)))
                
                logger.debug(f"Found {len(valid_points)} valid points out of {total_points}")
            else:
                logger.debug(f"No standard lat/lon columns found, trying mixed format parsing for {filename}")
                # Try mixed format parsing
                total_points = len(df)
                valid_points, format_anomalies = self.parse_mixed_coordinates(df)
                logger.debug(f"Mixed format parsing found {len(valid_points)} valid points")
            
            if len(valid_points) == 0:
                logger.warning(f"No valid coordinates found in {filename}")
                return {
                    'file_id': file_id,
                    'filename': filename,
                    'BU_Code': csv_row_data.iloc[0] if csv_row_data is not None else None,
                    'Location': csv_row_data.iloc[1] if csv_row_data is not None else None,
                    'Row_Labels': csv_row_data.iloc[2] if csv_row_data is not None else None,
                    'Customer_Name': csv_row_data.iloc[3] if csv_row_data is not None else None,
                    'status': 'No valid coordinates',
                    'total_points': total_points,
                    'valid_points': 0,
                    'total_distance_km': 0,
                    'start_location': None,
                    'end_location': None,
                    'anomalies': ['No valid coordinates found'] + format_anomalies
                }
            
            # Calculate distances and detect anomalies
            logger.debug(f"Calculating distances for {filename}")
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
            
            logger.info(f"Processed {filename}: Status={status}, Distance={total_distance:.2f}km, Points={len(valid_points)}/{total_points}")
            
            return {
                'file_id': file_id,
                'filename': filename,
                'BU_Code': csv_row_data.iloc[0] if csv_row_data is not None else None,
                'Location': csv_row_data.iloc[1] if csv_row_data is not None else None,
                'Row_Labels': csv_row_data.iloc[2] if csv_row_data is not None else None,
                'Customer_Name': csv_row_data.iloc[3] if csv_row_data is not None else None,
                'status': status,
                'total_points': total_points,
                'valid_points': len(valid_points),
                'total_distance_km': round(total_distance, 2),
                'start_location': f"{valid_points[0][0]:.6f}, {valid_points[0][1]:.6f}" if valid_points else None,
                'end_location': f"{valid_points[-1][0]:.6f}, {valid_points[-1][1]:.6f}" if valid_points else None,
                'anomalies': anomalies if anomalies else ['None detected']
            }
            
        except Exception as e:
            logger.error(f"Unexpected error processing {filepath}: {str(e)}")
            return {
                'file_id': os.path.basename(filepath).split('.')[0],
                'filename': os.path.basename(filepath),
                'BU_Code': csv_row_data.iloc[0] if csv_row_data is not None else None,
                'Location': csv_row_data.iloc[1] if csv_row_data is not None else None,
                'Row_Labels': csv_row_data.iloc[2] if csv_row_data is not None else None,
                'Customer_Name': csv_row_data.iloc[3] if csv_row_data is not None else None,
                'status': 'Processing error',
                'total_points': 0,
                'valid_points': 0,
                'total_distance_km': 0,
                'start_location': None,
                'end_location': None,
                'anomalies': [f'Error: {str(e)}']
            }
    
    def process_single_route(self, args):
        """Process a single route for multiprocessing"""
        idx, row, data_folder = args
        
        # Generate filename
        filename = self.generate_filename(row)
        filepath = os.path.join(data_folder, filename)
        
        # Process file
        if os.path.exists(filepath):
            result = self.process_file(filepath, row)
        else:
            logger.warning(f"File not found: {filepath}")
            result = {
                'file_id': filename.split('.')[0],
                'filename': filename,
                'BU_Code': row.iloc[0],
                'Location': row.iloc[1],
                'Row_Labels': row.iloc[2],
                'Customer_Name': row.iloc[3],
                'status': 'File not found',
                'total_points': 0,
                'valid_points': 0,
                'total_distance_km': 0,
                'start_location': None,
                'end_location': None,
                'anomalies': ['Excel file not found in data folder']
            }
        
        return result
    
    def process_all_routes(self, use_multiprocessing=True):
        """Process all routes based on CSV index"""
        if self.csv_data is None:
            logger.error("CSV data not loaded. Run load_csv_index() first.")
            return
        
        logger.info(f"Starting to process {len(self.csv_data)} routes...")
        start_time = time.time()
        
        if use_multiprocessing and len(self.csv_data) > 10:
            logger.info(f"Using multiprocessing with {self.num_workers} workers")
            
            # Prepare arguments for multiprocessing
            args_list = [(idx, row, self.data_folder) for idx, row in self.csv_data.iterrows()]
            
            # Create a pool of workers
            with mp.Pool(processes=self.num_workers) as pool:
                # Process files in parallel with progress bar
                results = list(tqdm(
                    pool.imap(self.process_single_route, args_list),
                    total=len(args_list),
                    desc="Processing routes",
                    unit="file"
                ))
            
            self.results = results
        else:
            logger.info("Using single-threaded processing")
            # Sequential processing with progress bar
            for idx, row in tqdm(self.csv_data.iterrows(), total=len(self.csv_data), desc="Processing routes"):
                result = self.process_single_route((idx, row, self.data_folder))
                self.results.append(result)
        
        end_time = time.time()
        elapsed_time = end_time - start_time
        logger.info(f"Completed processing {len(self.results)} routes in {elapsed_time:.2f} seconds")
        logger.info(f"Average time per file: {elapsed_time/len(self.results):.3f} seconds")
        
        return self.results
    
    def generate_summary_report(self, output_file='route_analysis_summary.csv'):
        """Generate a summary CSV report"""
        if not self.results:
            logger.error("No results to save")
            return
        
        # Convert results to DataFrame
        df = pd.DataFrame(self.results)
        
        # Add summary statistics
        logger.info("\n=== SUMMARY STATISTICS ===")
        logger.info(f"Total files processed: {len(df)}")
        logger.info(f"Files found: {len(df[df['status'] != 'File not found'])}")
        logger.info(f"Files not found: {len(df[df['status'] == 'File not found'])}")
        logger.info(f"Files with good data: {len(df[df['status'] == 'Good'])}")
        logger.info(f"Files with anomalies: {len(df[df['status'] == 'Has anomalies'])}")
        logger.info(f"Files with poor quality: {len(df[df['status'] == 'Poor quality data'])}")
        logger.info(f"Files with errors: {len(df[df['status'].str.contains('Error|error')])}")
        
        valid_routes = df[df['total_distance_km'] > 0]
        if len(valid_routes) > 0:
            logger.info(f"\nTotal distance covered: {valid_routes['total_distance_km'].sum():.2f} km")
            logger.info(f"Average route distance: {valid_routes['total_distance_km'].mean():.2f} km")
            logger.info(f"Shortest route: {valid_routes['total_distance_km'].min():.2f} km")
            logger.info(f"Longest route: {valid_routes['total_distance_km'].max():.2f} km")
        
        # Save to CSV
        df.to_csv(output_file, index=False)
        logger.info(f"\nDetailed results saved to: {output_file}")
        
        # Save problem files separately
        problem_files = df[df['status'] != 'Good']
        if len(problem_files) > 0:
            problem_files.to_csv('problem_routes.csv', index=False)
            logger.info(f"Problem routes saved to: problem_routes.csv")
        
        # Save missing files list
        missing_files = df[df['status'] == 'File not found']
        if len(missing_files) > 0:
            missing_files.to_csv('missing_files.csv', index=False)
            logger.info(f"Missing files list saved to: missing_files.csv")
        
        return df

# Main execution
def main():
    print("=== ROUTE ANALYSIS SYSTEM WITH MULTIPROCESSING ===")
    print("Install requirements: pip install pandas numpy openpyxl geopy matplotlib tqdm")
    print("-" * 60)
    
    # Configuration
    CSV_FILE = "routesinformation.csv"  # Your CSV file name
    DATA_FOLDER = "data"                # Folder containing Excel files
    USE_MULTIPROCESSING = True          # Set to False for single-threaded processing
    NUM_WORKERS = None                  # None = use all CPU cores - 1
    
    # Initialize analyzer
    analyzer = RouteAnalyzer(CSV_FILE, DATA_FOLDER, num_workers=NUM_WORKERS)
    
    # Load CSV index
    if not analyzer.load_csv_index():
        print("Failed to load CSV file. Please check the file path.")
        return
    
    # Process all routes
    print("\nStarting route analysis...")
    analyzer.process_all_routes(use_multiprocessing=USE_MULTIPROCESSING)
    
    # Generate summary report
    summary_df = analyzer.generate_summary_report()
    
    print("\n=== ANALYSIS COMPLETE ===")
    print("Check the following output files:")
    print("- route_analysis_summary.csv (all results)")
    print("- problem_routes.csv (routes with issues)")
    print("- missing_files.csv (files not found)")
    print("- route_analysis_debug.log (detailed debug information)")

if __name__ == "__main__":
    # Set multiprocessing start method (important for Windows)
    if __name__ == '__main__':
        mp.freeze_support()  # For Windows executable support
        main()