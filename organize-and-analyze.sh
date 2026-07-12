#!/bin/bash

# Script to organize student data and run analysis
# This will copy files from the submissions folder and organize them by student

echo "=================================================="
echo "  Fitts' Law Data Organization & Analysis"
echo "=================================================="
echo ""

# Source directory
SOURCE_DIR="/Users/soha/Downloads/Head tracker submissions 2"
# Destination directory
DEST_DIR="./fitts-student-data"

# Create destination directory
echo "📁 Creating organized data directory..."
mkdir -p "$DEST_DIR"

# Extract unique student names
echo "👥 Identifying students..."
students=$(ls "$SOURCE_DIR" | grep -E "fitts-experiment" | sed -E 's/_[0-9]+_.*$//' | sort -u)

student_count=0
for student in $students; do
    student_count=$((student_count + 1))
    echo "   $student_count. $student"
    
    # Create student directory
    mkdir -p "$DEST_DIR/$student"
    
    # Copy their files
    cp "$SOURCE_DIR/${student}_"*"fitts-experiment-raw-data"*.csv "$DEST_DIR/$student/" 2>/dev/null
    cp "$SOURCE_DIR/${student}_"*"fitts-experiment-results"*.csv "$DEST_DIR/$student/" 2>/dev/null
    cp "$SOURCE_DIR/${student}_"*"calibration"*.csv "$DEST_DIR/$student/" 2>/dev/null
    
    # Count files
    file_count=$(ls "$DEST_DIR/$student" | wc -l | tr -d ' ')
    echo "      ✓ Copied $file_count files"
done

echo ""
echo "✅ Organized data for $student_count students"
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    echo "🐍 Python 3 found, checking dependencies..."
    
    # Check if pandas is installed
    if python3 -c "import pandas" 2>/dev/null; then
        echo "✅ Dependencies are installed"
        echo ""
        echo "🔍 Running analysis..."
        echo ""
        python3 analyze-fitts-data.py --data-dir "$DEST_DIR" --output "./analysis-results"
    else
        echo "⚠️  Required Python packages not installed"
        echo ""
        echo "To install dependencies, run:"
        echo "   pip3 install -r requirements.txt"
        echo ""
        echo "Then run the analysis manually:"
        echo "   python3 analyze-fitts-data.py --data-dir $DEST_DIR"
    fi
else
    echo "⚠️  Python 3 not found"
    echo ""
    echo "Alternative: Use the web-based viewer"
    echo "   1. Open fitts-data-viewer.html in your browser"
    echo "   2. Drag and drop all CSV files from $DEST_DIR"
fi

echo ""
echo "=================================================="
echo "  Organization Complete!"
echo "=================================================="
echo ""
echo "📁 Data organized in: $DEST_DIR"
echo ""
echo "Next steps:"
echo "  1. Check the organized data in: $DEST_DIR"
echo "  2. View analysis results in: ./analysis-results"
echo "  3. Or use web viewer: open fitts-data-viewer.html"
echo ""

