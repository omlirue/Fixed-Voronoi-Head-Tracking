#!/usr/bin/env python3
"""
Fitts' Law Experiment Data Analysis Script
Analyzes data from multiple participants and generates comprehensive results

Usage:
    python analyze-fitts-data.py --data-dir ./fitts-data-students/
    
Expected file structure:
    fitts-data-students/
        participant1/
            fitts-experiment-raw-data-*.csv
            fitts-experiment-results-*.csv
        participant2/
            ...
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import argparse
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

# Set style for better-looking plots
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (12, 8)
plt.rcParams['font.size'] = 10

class FittsAnalyzer:
    def __init__(self, data_dir):
        self.data_dir = Path(data_dir)
        self.raw_data = None
        self.results_data = None
        self.participants = []
        
    def load_all_data(self):
        """Load data from all participants"""
        raw_dfs = []
        results_dfs = []
        
        # Find all participant directories or CSV files
        csv_files = list(self.data_dir.glob("**/*raw-data*.csv"))
        
        if not csv_files:
            print(f"❌ No raw data files found in {self.data_dir}")
            print(f"   Looking for files matching: *raw-data*.csv")
            return False
            
        print(f"📁 Found {len(csv_files)} raw data files")
        
        for raw_file in csv_files:
            # Try to find corresponding results file
            results_file = None
            for pattern in ["*results*.csv", "*aggregated*.csv"]:
                matches = list(raw_file.parent.glob(pattern))
                if matches:
                    results_file = matches[0]
                    break
            
            # Determine participant ID from directory structure or filename
            participant_id = raw_file.parent.name
            if participant_id == self.data_dir.name:
                # Files are directly in data_dir, use filename
                participant_id = raw_file.stem.split('-')[0]
            
            print(f"   Loading {participant_id}...")
            
            # Load raw data
            try:
                df_raw = pd.read_csv(raw_file)
                df_raw['ParticipantID'] = participant_id
                raw_dfs.append(df_raw)
                self.participants.append(participant_id)
            except Exception as e:
                print(f"   ⚠️  Error loading {raw_file}: {e}")
                continue
            
            # Load results data if available
            if results_file:
                try:
                    df_results = pd.read_csv(results_file)
                    df_results['ParticipantID'] = participant_id
                    results_dfs.append(df_results)
                except Exception as e:
                    print(f"   ⚠️  Error loading {results_file}: {e}")
        
        if not raw_dfs:
            print("❌ No data could be loaded")
            return False
        
        self.raw_data = pd.concat(raw_dfs, ignore_index=True)
        if results_dfs:
            self.results_data = pd.concat(results_dfs, ignore_index=True)
        
        print(f"✅ Loaded data from {len(self.participants)} participants")
        print(f"   Total trials: {len(self.raw_data)}")
        
        return True
    
    def calculate_fitts_metrics(self):
        """Calculate Fitts' Law metrics from raw data if results not available"""
        if self.results_data is not None:
            print("✅ Using pre-calculated results data")
            return
        
        print("📊 Calculating Fitts' Law metrics from raw data...")
        
        # Group by participant, filter, and layout conditions
        grouping_cols = ['ParticipantID', 'FilterType', 'FilterRank', 
                        'TargetSize', 'Amplitude']
        
        # Remove any columns that don't exist
        grouping_cols = [col for col in grouping_cols if col in self.raw_data.columns]
        
        results = []
        
        for group_keys, group_data in self.raw_data.groupby(grouping_cols):
            # Calculate effective amplitude (mean actual distance)
            Ae = group_data['ActualAmplitude'].mean()
            
            # ISO 9241-9 directional projection: project endpoint deviation onto movement direction
            if 'Direction' in group_data.columns and 'TargetX' in group_data.columns:
                theta_rad = np.radians(group_data['Direction'].astype(float))
                dx = group_data['SelectionX'] - group_data['TargetX']
                dy = group_data['SelectionY'] - group_data['TargetY']
                projections = dx * np.cos(theta_rad) + dy * np.sin(theta_rad)
                We = 4.133 * projections.std()
            else:
                dx = group_data['SelectionX'] - group_data['TargetX']
                dy = group_data['SelectionY'] - group_data['TargetY']
                distances = np.sqrt(dx**2 + dy**2)
                We = 4.133 * distances.std()
            
            # Effective Index of Difficulty
            IDe = np.log2(Ae / We + 1) if We > 0 else 0
            
            # Mean Movement Time
            MeanMT = group_data['MovementTime'].mean()
            
            # Throughput (bits/second)
            TP = IDe / MeanMT if MeanMT > 0 else 0
            
            # Error rate (selections outside target)
            target_radius = group_data['TargetSize'].iloc[0] / 2
            errors = (distances > target_radius).sum()
            error_rate = errors / len(group_data)
            
            result = {
                **dict(zip(grouping_cols, group_keys)),
                'N': len(group_data),
                'MeanMT': MeanMT,
                'Ae': Ae,
                'We': We,
                'IDe': IDe,
                'TP': TP,
                'ErrorRate': error_rate
            }
            results.append(result)
        
        self.results_data = pd.DataFrame(results)
        print(f"✅ Calculated metrics for {len(results)} conditions")
    
    def generate_summary_statistics(self):
        """Generate summary statistics across all participants"""
        print("\n" + "="*80)
        print("📊 SUMMARY STATISTICS")
        print("="*80)
        
        # Overall statistics
        print(f"\n📈 Overall Performance:")
        print(f"   Participants: {len(self.participants)}")
        print(f"   Total Trials: {len(self.raw_data)}")
        print(f"   Mean Movement Time: {self.raw_data['MovementTime'].mean():.3f}s (SD={self.raw_data['MovementTime'].std():.3f})")
        
        if self.results_data is not None and 'TP' in self.results_data.columns:
            print(f"   Mean Throughput: {self.results_data['TP'].mean():.3f} bits/s (SD={self.results_data['TP'].std():.3f})")
        
        # By filter type
        if 'FilterType' in self.results_data.columns:
            print(f"\n🔧 Performance by Filter Type:")
            filter_stats = self.results_data.groupby('FilterType').agg({
                'MeanMT': ['mean', 'std'],
                'TP': ['mean', 'std']
            }).round(3)
            print(filter_stats)
        
        # By target size
        if 'TargetSize' in self.results_data.columns:
            print(f"\n🎯 Performance by Target Size:")
            size_stats = self.results_data.groupby('TargetSize').agg({
                'MeanMT': ['mean', 'std'],
                'TP': ['mean', 'std']
            }).round(3)
            print(size_stats)
        
        # By amplitude
        if 'Amplitude' in self.results_data.columns:
            print(f"\n📏 Performance by Amplitude:")
            amp_stats = self.results_data.groupby('Amplitude').agg({
                'MeanMT': ['mean', 'std'],
                'TP': ['mean', 'std']
            }).round(3)
            print(amp_stats)
    
    def perform_statistical_tests(self):
        """Perform statistical tests comparing filters"""
        print("\n" + "="*80)
        print("📊 STATISTICAL ANALYSIS")
        print("="*80)
        
        if 'FilterType' not in self.results_data.columns:
            print("⚠️  FilterType column not found, skipping filter comparison")
            return
        
        # Get unique filter types
        filters = self.results_data['FilterType'].unique()
        
        if len(filters) < 2:
            print(f"⚠️  Only one filter type found: {filters[0]}")
            return
        
        print(f"\n🔬 Comparing filters: {', '.join(filters)}")
        
        # Paired t-test for throughput
        if 'TP' in self.results_data.columns:
            print(f"\n📈 Throughput Comparison:")
            
            # Get throughput by participant and filter
            tp_by_filter = {}
            for filter_type in filters:
                filter_data = self.results_data[self.results_data['FilterType'] == filter_type]
                tp_by_participant = filter_data.groupby('ParticipantID')['TP'].mean()
                tp_by_filter[filter_type] = tp_by_participant
                print(f"   {filter_type}: M={tp_by_participant.mean():.3f}, SD={tp_by_participant.std():.3f}")
            
            # Perform t-test if we have two filters
            if len(filters) == 2:
                filter1, filter2 = filters
                common_participants = set(tp_by_filter[filter1].index) & set(tp_by_filter[filter2].index)
                
                if len(common_participants) > 1:
                    tp1 = [tp_by_filter[filter1][p] for p in common_participants]
                    tp2 = [tp_by_filter[filter2][p] for p in common_participants]
                    
                    t_stat, p_value = stats.ttest_rel(tp1, tp2)
                    print(f"\n   Paired t-test: t={t_stat:.3f}, p={p_value:.4f}")
                    
                    if p_value < 0.05:
                        print(f"   ✅ Significant difference (p < 0.05)")
                        better = filter1 if np.mean(tp1) > np.mean(tp2) else filter2
                        print(f"   🏆 {better} performed better")
                    else:
                        print(f"   ❌ No significant difference (p >= 0.05)")
        
        # Movement time comparison
        print(f"\n⏱️  Movement Time Comparison:")
        
        mt_by_filter = {}
        for filter_type in filters:
            filter_data = self.results_data[self.results_data['FilterType'] == filter_type]
            mt_by_participant = filter_data.groupby('ParticipantID')['MeanMT'].mean()
            mt_by_filter[filter_type] = mt_by_participant
            print(f"   {filter_type}: M={mt_by_participant.mean():.3f}s, SD={mt_by_participant.std():.3f}")
        
        if len(filters) == 2:
            filter1, filter2 = filters
            common_participants = set(mt_by_filter[filter1].index) & set(mt_by_filter[filter2].index)
            
            if len(common_participants) > 1:
                mt1 = [mt_by_filter[filter1][p] for p in common_participants]
                mt2 = [mt_by_filter[filter2][p] for p in common_participants]
                
                t_stat, p_value = stats.ttest_rel(mt1, mt2)
                print(f"\n   Paired t-test: t={t_stat:.3f}, p={p_value:.4f}")
                
                if p_value < 0.05:
                    print(f"   ✅ Significant difference (p < 0.05)")
                    better = filter1 if np.mean(mt1) < np.mean(mt2) else filter2
                    print(f"   🏆 {better} had faster movement times")
                else:
                    print(f"   ❌ No significant difference (p >= 0.05)")
    
    def create_visualizations(self, output_dir):
        """Create comprehensive visualizations"""
        output_dir = Path(output_dir)
        output_dir.mkdir(exist_ok=True)
        
        print(f"\n📊 Creating visualizations in {output_dir}/")
        
        # 1. Throughput comparison by filter
        if 'FilterType' in self.results_data.columns and 'TP' in self.results_data.columns:
            plt.figure(figsize=(10, 6))
            sns.boxplot(data=self.results_data, x='FilterType', y='TP')
            sns.swarmplot(data=self.results_data, x='FilterType', y='TP', 
                         color='black', alpha=0.3, size=3)
            plt.title('Throughput by Filter Type', fontsize=14, fontweight='bold')
            plt.ylabel('Throughput (bits/s)')
            plt.xlabel('Filter Type')
            plt.tight_layout()
            plt.savefig(output_dir / 'throughput_by_filter.png', dpi=300)
            print("   ✅ throughput_by_filter.png")
            plt.close()
        
        # 2. Movement time comparison
        if 'FilterType' in self.results_data.columns:
            plt.figure(figsize=(10, 6))
            sns.boxplot(data=self.results_data, x='FilterType', y='MeanMT')
            sns.swarmplot(data=self.results_data, x='FilterType', y='MeanMT',
                         color='black', alpha=0.3, size=3)
            plt.title('Movement Time by Filter Type', fontsize=14, fontweight='bold')
            plt.ylabel('Movement Time (s)')
            plt.xlabel('Filter Type')
            plt.tight_layout()
            plt.savefig(output_dir / 'movement_time_by_filter.png', dpi=300)
            print("   ✅ movement_time_by_filter.png")
            plt.close()
        
        # 3. Throughput by target size and filter
        if all(col in self.results_data.columns for col in ['FilterType', 'TargetSize', 'TP']):
            plt.figure(figsize=(12, 6))
            sns.barplot(data=self.results_data, x='TargetSize', y='TP', 
                       hue='FilterType', ci=95)
            plt.title('Throughput by Target Size and Filter', fontsize=14, fontweight='bold')
            plt.ylabel('Throughput (bits/s)')
            plt.xlabel('Target Size (pixels)')
            plt.legend(title='Filter Type')
            plt.tight_layout()
            plt.savefig(output_dir / 'throughput_by_size_filter.png', dpi=300)
            print("   ✅ throughput_by_size_filter.png")
            plt.close()
        
        # 4. Throughput by amplitude and filter
        if all(col in self.results_data.columns for col in ['FilterType', 'Amplitude', 'TP']):
            plt.figure(figsize=(12, 6))
            sns.barplot(data=self.results_data, x='Amplitude', y='TP',
                       hue='FilterType', ci=95)
            plt.title('Throughput by Amplitude and Filter', fontsize=14, fontweight='bold')
            plt.ylabel('Throughput (bits/s)')
            plt.xlabel('Amplitude (pixels)')
            plt.legend(title='Filter Type')
            plt.tight_layout()
            plt.savefig(output_dir / 'throughput_by_amplitude_filter.png', dpi=300)
            print("   ✅ throughput_by_amplitude_filter.png")
            plt.close()
        
        # 5. Individual participant performance
        if 'TP' in self.results_data.columns:
            participant_tp = self.results_data.groupby(['ParticipantID', 'FilterType'])['TP'].mean().reset_index()
            
            plt.figure(figsize=(14, 6))
            sns.barplot(data=participant_tp, x='ParticipantID', y='TP', hue='FilterType')
            plt.title('Individual Participant Throughput', fontsize=14, fontweight='bold')
            plt.ylabel('Throughput (bits/s)')
            plt.xlabel('Participant ID')
            plt.xticks(rotation=45, ha='right')
            plt.legend(title='Filter Type')
            plt.tight_layout()
            plt.savefig(output_dir / 'participant_throughput.png', dpi=300)
            print("   ✅ participant_throughput.png")
            plt.close()
        
        # 6. Fitts' Law regression plot
        if all(col in self.results_data.columns for col in ['IDe', 'MeanMT', 'FilterType']):
            plt.figure(figsize=(10, 6))
            
            for filter_type in self.results_data['FilterType'].unique():
                filter_data = self.results_data[self.results_data['FilterType'] == filter_type]
                plt.scatter(filter_data['IDe'], filter_data['MeanMT'], 
                          label=filter_type, alpha=0.6, s=50)
                
                # Add regression line
                z = np.polyfit(filter_data['IDe'], filter_data['MeanMT'], 1)
                p = np.poly1d(z)
                x_line = np.linspace(filter_data['IDe'].min(), filter_data['IDe'].max(), 100)
                plt.plot(x_line, p(x_line), '--', alpha=0.8)
            
            plt.xlabel('Index of Difficulty (bits)')
            plt.ylabel('Movement Time (s)')
            plt.title("Fitts' Law: MT = a + b × ID", fontsize=14, fontweight='bold')
            plt.legend()
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            plt.savefig(output_dir / 'fitts_law_regression.png', dpi=300)
            print("   ✅ fitts_law_regression.png")
            plt.close()
        
        # 7. Error rate comparison (if available)
        if 'ErrorRate' in self.results_data.columns and 'FilterType' in self.results_data.columns:
            plt.figure(figsize=(10, 6))
            sns.barplot(data=self.results_data, x='FilterType', y='ErrorRate', ci=95)
            plt.title('Error Rate by Filter Type', fontsize=14, fontweight='bold')
            plt.ylabel('Error Rate')
            plt.xlabel('Filter Type')
            plt.tight_layout()
            plt.savefig(output_dir / 'error_rate_by_filter.png', dpi=300)
            print("   ✅ error_rate_by_filter.png")
            plt.close()
        
        # 8. Heatmap of performance across conditions
        if all(col in self.results_data.columns for col in ['TargetSize', 'Amplitude', 'TP']):
            pivot_data = self.results_data.pivot_table(
                values='TP', 
                index='TargetSize', 
                columns='Amplitude',
                aggfunc='mean'
            )
            
            plt.figure(figsize=(10, 6))
            sns.heatmap(pivot_data, annot=True, fmt='.2f', cmap='YlOrRd')
            plt.title('Throughput Heatmap (Target Size × Amplitude)', 
                     fontsize=14, fontweight='bold')
            plt.ylabel('Target Size (pixels)')
            plt.xlabel('Amplitude (pixels)')
            plt.tight_layout()
            plt.savefig(output_dir / 'throughput_heatmap.png', dpi=300)
            print("   ✅ throughput_heatmap.png")
            plt.close()
    
    def export_summary_tables(self, output_dir):
        """Export summary tables to CSV"""
        output_dir = Path(output_dir)
        output_dir.mkdir(exist_ok=True)
        
        print(f"\n📄 Exporting summary tables to {output_dir}/")
        
        # 1. Overall summary by filter
        if 'FilterType' in self.results_data.columns:
            summary = self.results_data.groupby('FilterType').agg({
                'MeanMT': ['mean', 'std', 'min', 'max'],
                'TP': ['mean', 'std', 'min', 'max'],
                'IDe': ['mean', 'std']
            }).round(3)
            summary.to_csv(output_dir / 'summary_by_filter.csv')
            print("   ✅ summary_by_filter.csv")
        
        # 2. Summary by participant
        participant_summary = self.results_data.groupby(['ParticipantID', 'FilterType']).agg({
            'MeanMT': 'mean',
            'TP': 'mean',
            'N': 'sum'
        }).round(3)
        participant_summary.to_csv(output_dir / 'summary_by_participant.csv')
        print("   ✅ summary_by_participant.csv")
        
        # 3. Summary by condition
        if all(col in self.results_data.columns for col in ['FilterType', 'TargetSize', 'Amplitude']):
            condition_summary = self.results_data.groupby(['FilterType', 'TargetSize', 'Amplitude']).agg({
                'MeanMT': ['mean', 'std'],
                'TP': ['mean', 'std'],
                'N': 'sum'
            }).round(3)
            condition_summary.to_csv(output_dir / 'summary_by_condition.csv')
            print("   ✅ summary_by_condition.csv")
        
        # 4. Full results data
        self.results_data.to_csv(output_dir / 'all_results.csv', index=False)
        print("   ✅ all_results.csv")
    
    def generate_report(self, output_dir):
        """Generate a comprehensive text report"""
        output_dir = Path(output_dir)
        output_file = output_dir / 'analysis_report.txt'
        
        with open(output_file, 'w') as f:
            f.write("="*80 + "\n")
            f.write("FITTS' LAW EXPERIMENT ANALYSIS REPORT\n")
            f.write("="*80 + "\n\n")
            
            f.write(f"Analysis Date: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Number of Participants: {len(self.participants)}\n")
            f.write(f"Total Trials: {len(self.raw_data)}\n\n")
            
            # Overall statistics
            f.write("-"*80 + "\n")
            f.write("OVERALL PERFORMANCE\n")
            f.write("-"*80 + "\n")
            f.write(f"Mean Movement Time: {self.raw_data['MovementTime'].mean():.3f}s (SD={self.raw_data['MovementTime'].std():.3f})\n")
            
            if 'TP' in self.results_data.columns:
                f.write(f"Mean Throughput: {self.results_data['TP'].mean():.3f} bits/s (SD={self.results_data['TP'].std():.3f})\n")
            
            # By filter
            if 'FilterType' in self.results_data.columns:
                f.write("\n" + "-"*80 + "\n")
                f.write("PERFORMANCE BY FILTER TYPE\n")
                f.write("-"*80 + "\n")
                
                for filter_type in self.results_data['FilterType'].unique():
                    filter_data = self.results_data[self.results_data['FilterType'] == filter_type]
                    f.write(f"\n{filter_type}:\n")
                    f.write(f"  Movement Time: {filter_data['MeanMT'].mean():.3f}s (SD={filter_data['MeanMT'].std():.3f})\n")
                    if 'TP' in filter_data.columns:
                        f.write(f"  Throughput: {filter_data['TP'].mean():.3f} bits/s (SD={filter_data['TP'].std():.3f})\n")
            
            # Participant list
            f.write("\n" + "-"*80 + "\n")
            f.write("PARTICIPANTS\n")
            f.write("-"*80 + "\n")
            for i, pid in enumerate(self.participants, 1):
                f.write(f"{i}. {pid}\n")
            
            f.write("\n" + "="*80 + "\n")
            f.write("END OF REPORT\n")
            f.write("="*80 + "\n")
        
        print(f"\n📄 Analysis report saved to {output_file}")

def main():
    parser = argparse.ArgumentParser(
        description='Analyze Fitts Law experiment data from multiple participants',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example usage:
  python analyze-fitts-data.py --data-dir ./fitts-data-students/
  python analyze-fitts-data.py --data-dir ./data/ --output ./results/
        """
    )
    
    parser.add_argument('--data-dir', type=str, required=True,
                       help='Directory containing participant data (CSV files)')
    parser.add_argument('--output', type=str, default='./analysis-results',
                       help='Output directory for results (default: ./analysis-results)')
    
    args = parser.parse_args()
    
    print("="*80)
    print("FITTS' LAW EXPERIMENT DATA ANALYSIS")
    print("="*80)
    print(f"\n📁 Data directory: {args.data_dir}")
    print(f"📁 Output directory: {args.output}\n")
    
    # Create analyzer
    analyzer = FittsAnalyzer(args.data_dir)
    
    # Load data
    if not analyzer.load_all_data():
        print("\n❌ Failed to load data. Please check your data directory.")
        return 1
    
    # Calculate metrics
    analyzer.calculate_fitts_metrics()
    
    # Generate summary statistics
    analyzer.generate_summary_statistics()
    
    # Perform statistical tests
    analyzer.perform_statistical_tests()
    
    # Create visualizations
    analyzer.create_visualizations(args.output)
    
    # Export summary tables
    analyzer.export_summary_tables(args.output)
    
    # Generate report
    analyzer.generate_report(args.output)
    
    print("\n" + "="*80)
    print("✅ ANALYSIS COMPLETE!")
    print("="*80)
    print(f"\n📊 Results saved to: {args.output}/")
    print("\nGenerated files:")
    print("  📊 Visualizations: *.png")
    print("  📄 Summary tables: *.csv")
    print("  📄 Text report: analysis_report.txt")
    print("\n")
    
    return 0

if __name__ == '__main__':
    exit(main())

