#!/bin/bash

# Simple CSV-based analysis without Python dependencies
# Extracts key statistics from the organized data

echo "=================================================="
echo "  Simple Fitts' Law Data Analysis"
echo "=================================================="
echo ""

DATA_DIR="./fitts-student-data"
OUTPUT_FILE="./simple-analysis-results.txt"

if [ ! -d "$DATA_DIR" ]; then
    echo "❌ Data directory not found: $DATA_DIR"
    echo "   Run ./organize-and-analyze.sh first"
    exit 1
fi

# Start output file
cat > "$OUTPUT_FILE" << 'EOF'
================================================================================
                    FITTS' LAW EXPERIMENT ANALYSIS REPORT
================================================================================

EOF

echo "📊 Analyzing data from: $DATA_DIR"
echo ""

# Count students
student_count=$(ls -d "$DATA_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ')
echo "   Students: $student_count"

# Count files
raw_files=$(find "$DATA_DIR" -name "*raw-data*.csv" | wc -l | tr -d ' ')
results_files=$(find "$DATA_DIR" -name "*results*.csv" | wc -l | tr -d ' ')
echo "   Raw data files: $raw_files"
echo "   Results files: $results_files"

# Add to report
cat >> "$OUTPUT_FILE" << EOF
Analysis Date: $(date)
Number of Participants: $student_count
Raw Data Files: $raw_files
Results Files: $results_files

================================================================================
PARTICIPANT LIST
================================================================================

EOF

# List participants
count=1
for student_dir in "$DATA_DIR"/*/ ; do
    student=$(basename "$student_dir")
    echo "   $count. $student" | tee -a "$OUTPUT_FILE"
    count=$((count + 1))
done

echo "" | tee -a "$OUTPUT_FILE"

# Analyze raw data files
echo "================================================================================
RAW DATA ANALYSIS
================================================================================" >> "$OUTPUT_FILE"

echo ""
echo "📈 Extracting statistics from raw data files..."

total_trials=0
for raw_file in $(find "$DATA_DIR" -name "*raw-data*.csv"); do
    student=$(basename $(dirname "$raw_file"))
    
    # Count trials (lines - 1 for header)
    trial_count=$(($(wc -l < "$raw_file") - 1))
    total_trials=$((total_trials + trial_count))
    
    echo "   $student: $trial_count trials"
done

echo ""
echo "   Total Trials: $total_trials"
echo ""

cat >> "$OUTPUT_FILE" << EOF

Total Trials Across All Participants: $total_trials
Average Trials per Participant: $((total_trials / student_count))

EOF

# Extract filter types from first raw data file
first_raw=$(find "$DATA_DIR" -name "*raw-data*.csv" | head -1)
if [ -f "$first_raw" ]; then
    echo "================================================================================
FILTER TYPES DETECTED
================================================================================" >> "$OUTPUT_FILE"
    
    filters=$(tail -n +2 "$first_raw" | cut -d',' -f6 | sort -u)
    echo "" >> "$OUTPUT_FILE"
    for filter in $filters; do
        echo "   • $filter" | tee -a "$OUTPUT_FILE"
    done
    echo "" >> "$OUTPUT_FILE"
fi

# Analyze results files if available
if [ $results_files -gt 0 ]; then
    echo "================================================================================
AGGREGATED RESULTS SUMMARY
================================================================================" >> "$OUTPUT_FILE"
    
    echo "" >> "$OUTPUT_FILE"
    echo "📊 Processing aggregated results files..."
    
    # Create temporary combined file
    temp_file=$(mktemp)
    
    # Combine all results files (skip headers except first)
    first=true
    for results_file in $(find "$DATA_DIR" -name "*results*.csv"); do
        if [ "$first" = true ]; then
            cat "$results_file" >> "$temp_file"
            first=false
        else
            tail -n +2 "$results_file" >> "$temp_file"
        fi
    done
    
    # Extract unique filter types
    filters=$(tail -n +2 "$temp_file" | cut -d',' -f4 | sort -u)
    
    echo "Filter Comparison:" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    
    for filter in $filters; do
        echo "   $filter:" | tee -a "$OUTPUT_FILE"
        
        # Extract throughput values (column 15: TP)
        throughputs=$(tail -n +2 "$temp_file" | awk -F',' -v f="$filter" '$4 == f {print $15}')
        
        if [ ! -z "$throughputs" ]; then
            # Calculate basic statistics using awk
            stats=$(echo "$throughputs" | awk '
            {
                sum += $1
                sumsq += ($1)^2
                if (NR == 1) {
                    min = max = $1
                } else {
                    if ($1 < min) min = $1
                    if ($1 > max) max = $1
                }
                values[NR] = $1
            }
            END {
                mean = sum / NR
                variance = (sumsq - sum^2/NR) / (NR-1)
                sd = sqrt(variance)
                printf "%.4f %.4f %.4f %.4f %d", mean, sd, min, max, NR
            }')
            
            mean=$(echo $stats | cut -d' ' -f1)
            sd=$(echo $stats | cut -d' ' -f2)
            min=$(echo $stats | cut -d' ' -f3)
            max=$(echo $stats | cut -d' ' -f4)
            n=$(echo $stats | cut -d' ' -f5)
            
            echo "      Mean Throughput: $mean bits/s (SD=$sd)" | tee -a "$OUTPUT_FILE"
            echo "      Range: $min - $max bits/s" | tee -a "$OUTPUT_FILE"
            echo "      N: $n conditions" | tee -a "$OUTPUT_FILE"
        fi
        echo "" | tee -a "$OUTPUT_FILE"
    done
    
    rm -f "$temp_file"
fi

# Sample data preview
echo "================================================================================
SAMPLE DATA PREVIEW
================================================================================" >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
if [ -f "$first_raw" ]; then
    echo "First 3 trials from $(basename $first_raw):" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    head -4 "$first_raw" | cut -c1-120 >> "$OUTPUT_FILE"
    echo "   ... (truncated)" >> "$OUTPUT_FILE"
fi

echo "" >> "$OUTPUT_FILE"
echo "================================================================================
NEXT STEPS
================================================================================" >> "$OUTPUT_FILE"

cat >> "$OUTPUT_FILE" << 'EOF'

To perform complete statistical analysis with graphs:

1. Install Python dependencies:
   pip3 install pandas numpy matplotlib seaborn scipy

2. Run full analysis:
   python3 analyze-fitts-data.py --data-dir ./fitts-student-data

3. Or use web viewer:
   Open fitts-data-viewer.html in your browser
   Drag and drop CSV files from fitts-student-data/

================================================================================
END OF REPORT
================================================================================
EOF

echo ""
echo "✅ Analysis complete!"
echo ""
echo "📄 Report saved to: $OUTPUT_FILE"
echo ""
echo "📊 Summary:"
cat "$OUTPUT_FILE"
echo ""
echo "=================================================="
echo "  View full report: cat $OUTPUT_FILE"
echo "=================================================="

