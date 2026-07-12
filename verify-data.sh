#!/bin/bash

# Quick script to verify student data before analysis

echo "=================================================="
echo "  Data Verification Report"
echo "=================================================="
echo ""

SOURCE_DIR="/Users/soha/Downloads/Head tracker submissions 2"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Source directory not found: $SOURCE_DIR"
    exit 1
fi

echo "📁 Source: $SOURCE_DIR"
echo ""

# Count files by type
raw_files=$(ls "$SOURCE_DIR" | grep -c "raw-data")
results_files=$(ls "$SOURCE_DIR" | grep -c "results")
calibration_files=$(ls "$SOURCE_DIR" | grep -c "calibration")

echo "📊 File Summary:"
echo "   Raw data files: $raw_files"
echo "   Results files: $results_files"
echo "   Calibration files: $calibration_files"
echo ""

# Extract and count unique students
echo "👥 Students Identified:"
students=$(ls "$SOURCE_DIR" | grep -E "fitts-experiment" | sed -E 's/_[0-9]+_.*$//' | sort -u)

count=0
for student in $students; do
    count=$((count + 1))
    
    # Count files for this student
    raw=$(ls "$SOURCE_DIR" | grep "^${student}_" | grep -c "raw-data")
    results=$(ls "$SOURCE_DIR" | grep "^${student}_" | grep -c "results")
    
    status="✅"
    if [ $raw -eq 0 ]; then
        status="⚠️  Missing raw data"
    fi
    
    echo "   $count. $student"
    echo "      Raw: $raw, Results: $results  $status"
done

echo ""
echo "=================================================="
echo "  Total Students: $count"
echo "=================================================="
echo ""

# Check for students with complete data
complete=0
incomplete=0

for student in $students; do
    raw=$(ls "$SOURCE_DIR" | grep "^${student}_" | grep -c "raw-data")
    if [ $raw -gt 0 ]; then
        complete=$((complete + 1))
    else
        incomplete=$((incomplete + 1))
    fi
done

echo "✅ Students with raw data: $complete"
if [ $incomplete -gt 0 ]; then
    echo "⚠️  Students missing raw data: $incomplete"
fi

echo ""

# Sample one file to show structure
echo "📄 Sample Data Preview:"
echo "   (First 2 rows from a random raw data file)"
echo ""

sample_file=$(ls "$SOURCE_DIR"/*raw-data*.csv | head -1)
if [ -f "$sample_file" ]; then
    head -2 "$sample_file" | cut -c1-100
    echo "   ... (truncated)"
fi

echo ""
echo "=================================================="
echo ""

if [ $complete -ge 10 ]; then
    echo "✅ You have data from $complete students - ready to analyze!"
    echo ""
    echo "Next step: Run the analysis"
    echo "   ./organize-and-analyze.sh"
else
    echo "⚠️  You have data from $complete students"
    echo "   Consider collecting more data for robust results"
fi

echo ""

