# ============================================================
# Fitts' Law + Multi-Dwell Replay Analysis — Single Cell Colab
# ============================================================
# 1. Paste this entire cell into Google Colab
# 2. Run it
# 3. Upload your 4 files when prompted:
#      fitts-experiment-raw-data-*.csv
#      fitts-experiment-results-*.csv
#      fitts-cursor-paths-*.json
#      fitts-variance-measurement-*.csv  (optional)
# 4. Scroll down through the output for all plots and tables
# ============================================================

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats
from google.colab import files
import json, math, glob, os, zipfile, shutil, warnings
from collections import defaultdict

warnings.filterwarnings('ignore')
sns.set_style('whitegrid')
plt.rcParams.update({'figure.figsize': (12,6), 'font.size': 12,
                     'axes.titlesize': 14, 'axes.labelsize': 12})
OUT = 'plots'
os.makedirs(OUT, exist_ok=True)

# ── UPLOAD ──────────────────────────────────────────────────
print('Upload your experiment files (raw CSV, results CSV, cursor-paths JSON, variance CSV):')
print('You can also upload a .zip containing all of them.\n')
uploaded = files.upload()
for fn in list(uploaded.keys()):
    if fn.endswith('.zip'):
        with zipfile.ZipFile(fn,'r') as z: z.extractall('.')
        print(f'Extracted {fn}')

raw_files     = sorted(glob.glob('**/fitts-experiment-raw-data*.csv', recursive=True))
paths_files   = sorted(glob.glob('**/fitts-cursor-paths*.json', recursive=True))
var_files     = sorted(glob.glob('**/fitts-variance-measurement*.csv', recursive=True))
print(f'\nDetected: {len(raw_files)} raw CSVs, {len(paths_files)} cursor-path JSONs, {len(var_files)} variance CSVs')

# ── LOAD ────────────────────────────────────────────────────
raw_dfs = []
for i,f in enumerate(raw_files,1):
    df = pd.read_csv(f); df['ParticipantID'] = f'P{i}'; raw_dfs.append(df)
    print(f'  P{i}: {len(df)} trials')
raw = pd.concat(raw_dfs, ignore_index=True) if raw_dfs else pd.DataFrame()

all_cursor_paths = []
for f in paths_files:
    with open(f) as fh: data = json.load(fh)
    all_cursor_paths.extend(data)
    print(f'  Cursor paths: {len(data)} trials')

variance_meas = pd.concat([pd.read_csv(f) for f in var_files], ignore_index=True) if var_files else None

print(f'\nLoaded: {len(raw)} trials, {len(all_cursor_paths)} cursor paths')

# ── PART A: FITTS METRICS ──────────────────────────────────
def compute_fitts_condition(group, mt_col='MovementTime'):
    valid = group.dropna(subset=[mt_col])
    if len(valid) < 3: return None
    first = valid[valid.get('TrialInLayout', valid['DirectionIndex']) == 0]
    cx = first.iloc[0]['StartX'] if len(first)>0 else valid.iloc[0]['StartX']
    cy = first.iloc[0]['StartY'] if len(first)>0 else valid.iloc[0]['StartY']
    rad = np.radians(valid['Direction'].astype(float))
    atx = cx + valid['Amplitude'].astype(float)*np.cos(rad)
    aty = cy + valid['Amplitude'].astype(float)*np.sin(rad)
    ex = valid['EndpointX'].astype(float) if 'EndpointX' in valid.columns else valid['SelectionX'].astype(float)
    ey = valid['EndpointY'].astype(float) if 'EndpointY' in valid.columns else valid['SelectionY'].astype(float)
    sx, sy = valid['StartX'].astype(float), valid['StartY'].astype(float)
    Ae = np.sqrt((ex-sx)**2+(ey-sy)**2).mean()
    dx_e, dy_e = ex.values-atx.values, ey.values-aty.values
    dx_a, dy_a = atx.values-sx.values, aty.values-sy.values
    alen = np.sqrt(dx_a**2+dy_a**2); alen=np.where(alen==0,1,alen)
    proj = (dx_e*dx_a+dy_e*dy_a)/alen
    We = max(4.133*np.std(proj,ddof=1),0.01) if len(proj)>1 else 1.0
    IDe = np.log2(Ae/We+1)
    mmt = valid[mt_col].mean()
    TP = IDe/mmt if mmt>0 else 0
    return {'N':len(valid),'MeanMT':mmt,'Ae':Ae,'We':We,'IDe':IDe,'TP':TP,
            'MeanReEntries':valid['ReEntryCount'].mean() if 'ReEntryCount' in valid.columns else None}

gcols = [c for c in ['ParticipantID','PairNumber','PairVariance','FilterType','TargetSize','Amplitude'] if c in raw.columns]
rows = []
for keys,grp in raw.groupby(gcols):
    info = dict(zip(gcols, keys if isinstance(keys,tuple) else [keys]))
    m = compute_fitts_condition(grp,'MovementTime')
    if m:
        info.update(m)
        if 'EntryBasedMT' in grp.columns:
            em = compute_fitts_condition(grp,'EntryBasedMT')
            if em: info['EntryMT']=em['MeanMT']; info['EntryTP']=em['TP']
        rows.append(info)
cond = pd.DataFrame(rows)
print(f'\n{"="*70}\nComputed {len(cond)} conditions\n{"="*70}')

# ── SUMMARY STATS ──────────────────────────────────────────
print(f'\nOverall TP: {cond["TP"].mean():.3f} +/- {cond["TP"].std():.3f} bits/s')
print(f'Overall MT: {cond["MeanMT"].mean():.3f} +/- {cond["MeanMT"].std():.3f} s')
if 'FilterType' in cond.columns:
    print('\nBy Filter:')
    display(cond.groupby('FilterType')[['TP','MeanMT','We','IDe']].agg(['mean','std']).round(3))
if 'PairVariance' in cond.columns:
    print('\nBy SD Level x Filter:')
    display(cond.groupby(['PairVariance','FilterType'])[['TP','MeanMT']].agg(['mean','std']).round(3))

# ── STAT TESTS ──────────────────────────────────────────────
ftypes = sorted(cond['FilterType'].unique()) if 'FilterType' in cond.columns else []
def ttest_pair(data, label=''):
    if len(ftypes)!=2: return
    f1,f2 = ftypes
    t1=data[data['FilterType']==f1]['TP'].values; t2=data[data['FilterType']==f2]['TP'].values
    n=min(len(t1),len(t2))
    if n<2: return
    t1,t2=t1[:n],t2[:n]; ts,pv=stats.ttest_rel(t1,t2)
    d=np.mean(t1-t2)/np.std(t1-t2,ddof=1) if np.std(t1-t2,ddof=1)>0 else 0
    sig='*SIGNIFICANT*' if pv<0.05 else 'not significant'
    print(f'\n{label}: {f1}={np.mean(t1):.3f}, {f2}={np.mean(t2):.3f}, t={ts:.3f}, p={pv:.4f} {sig}, d={abs(d):.3f}')

print(f'\n{"="*70}\nSTATISTICAL TESTS\n{"="*70}')
ttest_pair(cond,'Overall')
if 'PairVariance' in cond.columns:
    for sd in sorted(cond['PairVariance'].unique()):
        ttest_pair(cond[cond['PairVariance']==sd], f'SD={sd:.1f}')

# ── PLOT: TP/MT by Filter ──────────────────────────────────
fig,axes=plt.subplots(1,2,figsize=(14,5))
sns.boxplot(data=cond,x='FilterType',y='TP',palette='Set2',ax=axes[0])
sns.stripplot(data=cond,x='FilterType',y='TP',color='black',alpha=.3,ax=axes[0])
axes[0].set_title('Throughput by Filter'); axes[0].set_ylabel('Throughput (bits/s)')
sns.boxplot(data=cond,x='FilterType',y='MeanMT',palette='Set2',ax=axes[1])
sns.stripplot(data=cond,x='FilterType',y='MeanMT',color='black',alpha=.3,ax=axes[1])
axes[1].set_title('Movement Time by Filter'); axes[1].set_ylabel('Movement Time (s)')
plt.tight_layout(); plt.savefig(f'{OUT}/tp_mt_by_filter.png',dpi=300,bbox_inches='tight'); plt.show()

# ── PLOT: TP/MT by SD ──────────────────────────────────────
if 'PairVariance' in cond.columns:
    sl = {v:f'SD~{v:.1f}' for v in sorted(cond['PairVariance'].unique())}
    cond['SD_Label'] = cond['PairVariance'].map(sl)
    fig,axes=plt.subplots(1,2,figsize=(14,5))
    sns.barplot(data=cond,x='SD_Label',y='TP',hue='FilterType',palette='Set2',errorbar='sd',ax=axes[0])
    axes[0].set_title('Throughput by SD Level'); axes[0].set_ylabel('Throughput (bits/s)')
    sns.barplot(data=cond,x='SD_Label',y='MeanMT',hue='FilterType',palette='Set2',errorbar='sd',ax=axes[1])
    axes[1].set_title('Movement Time by SD Level'); axes[1].set_ylabel('Movement Time (s)')
    plt.tight_layout(); plt.savefig(f'{OUT}/tp_mt_by_sd.png',dpi=300,bbox_inches='tight'); plt.show()

# ── PLOT: Fitts Regression ─────────────────────────────────
fig,ax=plt.subplots(figsize=(10,6))
pal=sns.color_palette('Set2',n_colors=len(cond['FilterType'].unique()))
for i,ft in enumerate(sorted(cond['FilterType'].unique())):
    s=cond[cond['FilterType']==ft]
    ax.scatter(s['IDe'],s['MeanMT'],label=ft,alpha=.6,s=50,color=pal[i])
    if len(s)>2:
        z=np.polyfit(s['IDe'],s['MeanMT'],1); xl=np.linspace(s['IDe'].min(),s['IDe'].max(),100)
        r2=np.corrcoef(s['IDe'],s['MeanMT'])[0,1]**2
        ax.plot(xl,np.polyval(z,xl),'--',color=pal[i],lw=2,
                label=f'{ft}: MT={z[1]:.2f}+{z[0]:.2f}*ID (R²={r2:.3f})')
ax.set_xlabel('IDe (bits)'); ax.set_ylabel('Movement Time (s)')
ax.set_title("Fitts' Law Regression"); ax.legend(fontsize=9); ax.grid(True,alpha=.3)
plt.tight_layout(); plt.savefig(f'{OUT}/fitts_regression.png',dpi=300,bbox_inches='tight'); plt.show()

# ── PLOT: TP by Target Size ────────────────────────────────
if 'TargetSize' in cond.columns:
    cond['TS_px']=cond['TargetSize'].round(0).astype(int)
    fig,ax=plt.subplots(figsize=(10,5))
    sns.barplot(data=cond,x='TS_px',y='TP',hue='FilterType',palette='Set2',errorbar='sd',ax=ax)
    ax.set_title('Throughput by Target Size'); ax.set_ylabel('TP (bits/s)'); ax.set_xlabel('Target Size (px)')
    plt.tight_layout(); plt.savefig(f'{OUT}/tp_by_target_size.png',dpi=300,bbox_inches='tight'); plt.show()

# ── PLOT: Re-entry Counts ──────────────────────────────────
if 'ReEntryCount' in raw.columns:
    fig,ax=plt.subplots(figsize=(10,5))
    if 'PairVariance' in raw.columns:
        raw['SL']=raw['PairVariance'].round(1).astype(str)
        sns.boxplot(data=raw,x='SL',y='ReEntryCount',hue='FilterType',palette='Set2',ax=ax)
    else:
        sns.boxplot(data=raw,x='FilterType',y='ReEntryCount',palette='Set2',ax=ax)
    ax.set_title('Re-entries'); ax.set_ylabel('Re-entry Count')
    plt.tight_layout(); plt.savefig(f'{OUT}/reentries.png',dpi=300,bbox_inches='tight'); plt.show()

# ── VARIANCE MEASUREMENT ───────────────────────────────────
if variance_meas is not None and len(variance_meas)>0:
    print(f'\n{"="*70}\nVariance Measurement\n{"="*70}')
    display(variance_meas)

# ================================================================
# PART B: MULTI-DWELL REPLAY
# ================================================================
print(f'\n{"="*70}\nMULTI-DWELL REPLAY\n{"="*70}')

DWELLS = [200,400,600,800,1000,1200,1400,1600,1800,2000]

def pt_in(px,py,cx,cy,r): return (px-cx)**2+(py-cy)**2<=r**2

if all_cursor_paths:
    cx0,cy0 = all_cursor_paths[0]['startX'], all_cursor_paths[0]['startY']
    print(f'Screen center: ({cx0},{cy0})')
    for t in all_cursor_paths:
        rd=math.radians(t['direction'])
        t['atx']=cx0+t['amplitude']*math.cos(rd)
        t['aty']=cy0+t['amplitude']*math.sin(rd)

    ml={}
    for _,row in raw.iterrows():
        g=int(row['GlobalTrialNumber']); d=float(row['Direction']); a=float(row['Amplitude']); r=math.radians(d)
        ml[g]={'pn':int(row['PairNumber']),'pv':float(row['PairVariance']),'ft':row['FilterType'],
               'ts':float(row['TargetSize']),'a':a,'d':d,
               'sx':float(row['StartX']),'sy':float(row['StartY']),
               'tx':cx0+a*math.cos(r),'ty':cy0+a*math.sin(r)}

    dwell_rows=[]      # aggregated per condition
    dwell_trials=[]    # per-trial for Fitts regression
    for dms in DWELLS:
        groups=defaultdict(lambda:{'s':[],'m':[]})
        for trial in all_cursor_paths:
            gtn=trial['globalTrialNumber']
            if gtn not in ml: continue
            m=ml[gtn]; path=trial['cursorPath']
            if not path: continue
            tx,ty,rad=trial['atx'],trial['aty'],trial['targetSize']/2
            t0=path[0]['t']; et=None; ex0=None; ey0=None; found=None
            for sp in path:
                x,y,t=sp['x'],sp['y'],sp['t']
                if pt_in(x,y,tx,ty,rad):
                    if et is None: et=t; ex0=x; ey0=y
                    if t-et>=dms:
                        found={'success':True,'mt':max((t-t0)/1000-dms/1000,0.001),'ex':ex0,'ey':ey0}
                        break
                else: et=None; ex0=None; ey0=None
            if found is None: found={'success':False,'mt':None,'ex':None,'ey':None}
            key=(m['pn'],m['ft'])
            groups[key]['s'].append(found); groups[key]['m'].append(m)
            if found['success']:
                ae_t=math.sqrt((found['ex']-m['sx'])**2+(found['ey']-m['sy'])**2)
                dwell_trials.append({'dwell_ms':dms,'dwell_s':dms/1000,'gtn':gtn,
                    'pn':m['pn'],'pv':m['pv'],'ft':m['ft'],'ts':m['ts'],'amp':m['a'],
                    'mt':found['mt'],'ae':ae_t})

        for (pn,ft),g in groups.items():
            ok=[(s,m) for s,m in zip(g['s'],g['m']) if s['success']]
            pv=g['m'][0]['pv']; nt=len(g['s'])
            if len(ok)<3:
                dwell_rows.append({'dwell_ms':dms,'dwell_s':dms/1000,'pn':pn,'pv':pv,'ft':ft,
                                   'tp':None,'mmt':None,'ns':len(ok),'nt':nt,'er':1-len(ok)/nt if nt else 1})
                continue
            mts,projs,aes_=[],[],[]
            for s,m in ok:
                ae=math.sqrt((s['ex']-m['sx'])**2+(s['ey']-m['sy'])**2); aes_.append(ae)
                dxa,dya=m['tx']-m['sx'],m['ty']-m['sy']; al=math.sqrt(dxa**2+dya**2)
                if al==0: continue
                projs.append(((s['ex']-m['tx'])*dxa+(s['ey']-m['ty'])*dya)/al); mts.append(s['mt'])
            if len(mts)<3: continue
            we=max(4.133*np.std(projs,ddof=1),0.01); ae=np.mean(aes_)
            ide=math.log2(ae/we+1); mmt=np.mean(mts); tp=ide/mmt if mmt>0 else 0
            dwell_rows.append({'dwell_ms':dms,'dwell_s':dms/1000,'pn':pn,'pv':pv,'ft':ft,
                               'tp':tp,'mmt':mmt,'we':we,'ide':ide,'ns':len(mts),'nt':nt,
                               'er':1-len(mts)/nt})
    dt_df=pd.DataFrame(dwell_trials)

    dd=pd.DataFrame(dwell_rows)
    print(f'Replay complete: {len(dd)} rows')

    # ── PLOT: Dwell vs Throughput (side by side, matching legends) ──
    vd=dd.dropna(subset=['tp'])
    fts=sorted(vd['ft'].unique()); pns=sorted(vd['pn'].unique())
    flab={'exponential':'Exponential Smoothing','oneEuro':'One Euro Filter'}
    # Build SD labels sorted by pair number
    plab={}
    for pn in pns:
        pv_vals=vd[vd['pn']==pn]['pv'].unique()
        plab[pn]=f'SD~{pv_vals[0]:.1f}' if len(pv_vals) else f'Pair {pn}'
    cols=['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b'][:len(pns)]

    fig,axes=plt.subplots(1,len(fts),figsize=(7*len(fts),6),sharey=True)
    if len(fts)==1: axes=[axes]
    for ax,ft in zip(axes,fts):
        for j,pn in enumerate(pns):
            s=vd[(vd['pn']==pn)&(vd['ft']==ft)].sort_values('dwell_s')
            if len(s): ax.plot(s['dwell_s'],s['tp'],'o-',color=cols[j],label=plab.get(pn,f'P{pn}'),lw=2,ms=6)
        ax.set_xlabel('Dwell Time (s)'); ax.set_title(flab.get(ft,ft),fontweight='bold')
        ax.legend(fontsize=11); ax.grid(True,alpha=.3); ax.set_xlim(0,2.2)
    axes[0].set_ylabel('Throughput (bits/s)')
    fig.suptitle('Dwell Time vs Throughput by SD Level',fontsize=15,fontweight='bold',y=1.02)
    plt.tight_layout(); plt.savefig(f'{OUT}/dwell_vs_tp.png',dpi=300,bbox_inches='tight'); plt.show()

    # ── PLOT: Combined ─────────────────────────────────────
    fst={'exponential':('--','s'),'oneEuro':('-','o')}
    fsh={'exponential':'Exp','oneEuro':'1\u20ac'}
    fig,ax=plt.subplots(figsize=(10,7))
    for j,pn in enumerate(pns):
        for ft in fts:
            s=vd[(vd['pn']==pn)&(vd['ft']==ft)].sort_values('dwell_s')
            if not len(s): continue
            ls,mk=fst.get(ft,('-','o'))
            ax.plot(s['dwell_s'],s['tp'],linestyle=ls,marker=mk,color=cols[j],
                    label=f'{plab.get(pn,f"P{pn}")} ({fsh.get(ft,ft)})',lw=2,ms=6)
    ax.set_xlabel('Dwell Time (s)'); ax.set_ylabel('Throughput (bits/s)')
    ax.set_title('Dwell Time vs Throughput\n(Dashed=Exponential, Solid=One Euro)',fontweight='bold')
    ax.legend(fontsize=9,ncol=2); ax.grid(True,alpha=.3); ax.set_xlim(0,2.2)
    plt.tight_layout(); plt.savefig(f'{OUT}/dwell_vs_tp_combined.png',dpi=300,bbox_inches='tight'); plt.show()

    # ── PLOT: Error Rate ───────────────────────────────────
    fig,ax=plt.subplots(figsize=(10,6))
    for j,pn in enumerate(pns):
        for ft in fts:
            s=dd[(dd['pn']==pn)&(dd['ft']==ft)].sort_values('dwell_s')
            if not len(s): continue
            ls,mk=fst.get(ft,('-','o'))
            ax.plot(s['dwell_s'],s['er']*100,linestyle=ls,marker=mk,color=cols[j],
                    label=f'{plab.get(pn,f"P{pn}")} ({fsh.get(ft,ft)})',lw=2,ms=6)
    ax.set_xlabel('Dwell Time (s)'); ax.set_ylabel('Error Rate (%)')
    ax.set_title('Error Rate vs Dwell Time',fontweight='bold')
    ax.legend(fontsize=9,ncol=2); ax.grid(True,alpha=.3); ax.set_xlim(0,2.2)
    ax.set_ylim(-2,max(dd['er'].max()*100+5,10))
    plt.tight_layout(); plt.savefig(f'{OUT}/dwell_vs_error.png',dpi=300,bbox_inches='tight'); plt.show()

    # ── PLOT: Dwell vs MT ──────────────────────────────────
    vm=dd.dropna(subset=['mmt'])
    fig,ax=plt.subplots(figsize=(10,6))
    for j,pn in enumerate(pns):
        for ft in fts:
            s=vm[(vm['pn']==pn)&(vm['ft']==ft)].sort_values('dwell_s')
            if not len(s): continue
            ls,mk=fst.get(ft,('-','o'))
            ax.plot(s['dwell_s'],s['mmt'],linestyle=ls,marker=mk,color=cols[j],
                    label=f'{plab.get(pn,f"P{pn}")} ({fsh.get(ft,ft)})',lw=2,ms=6)
    ax.set_xlabel('Dwell Time (s)'); ax.set_ylabel('Movement Time (s, dwell excluded)')
    ax.set_title('MT vs Dwell Time (longer dwell = harder to sustain)',fontweight='bold')
    ax.legend(fontsize=9,ncol=2); ax.grid(True,alpha=.3); ax.set_xlim(0,2.2)
    plt.tight_layout(); plt.savefig(f'{OUT}/dwell_vs_mt.png',dpi=300,bbox_inches='tight'); plt.show()

    # ── PLOT: CROSSOVER (professor's predicted criss-cross) ─
    # Side-by-side: one panel per filter, same legend style as the dwell_vs_tp plot
    print(f'\n{"="*70}\nCROSSOVER ANALYSIS (Professor\'s hypothesis)\n{"="*70}')

    fig,axes=plt.subplots(1,len(fts),figsize=(7*len(fts),6),sharey=True)
    if len(fts)==1: axes=[axes]
    for ax,ft in zip(axes,fts):
        sub=vd[vd['ft']==ft]
        for j,pn in enumerate(pns):
            s=sub[sub['pn']==pn].sort_values('dwell_s')
            if not len(s): continue
            ax.plot(s['dwell_s'],s['tp'],'o-',color=cols[j],
                    label=plab.get(pn,f'P{pn}'),lw=2.5,ms=7)
            # Annotate % drop at the end
            if len(s)>=2:
                t_first=s.iloc[0]['tp']; t_last=s.iloc[-1]['tp']
                drop_pct=(1-t_last/t_first)*100 if t_first>0 else 0
                ax.annotate(f'{drop_pct:.0f}% drop',xy=(s.iloc[-1]['dwell_s'],t_last),
                           fontsize=9,color=cols[j],fontweight='bold',
                           xytext=(10,-5),textcoords='offset points')
        ax.set_xlabel('Dwell Time (s)',fontsize=13)
        ax.set_title(f'{flab.get(ft,ft)}',fontweight='bold',fontsize=14)
        ax.legend(fontsize=11); ax.grid(True,alpha=.3); ax.set_xlim(0,2.2)
    axes[0].set_ylabel('Throughput (bits/s)',fontsize=13)
    fig.suptitle('Crossover Test: Do high-SD and low-SD lines cross?',fontsize=15,fontweight='bold',y=1.02)
    plt.tight_layout()
    plt.savefig(f'{OUT}/crossover_sidebyside.png',dpi=300,bbox_inches='tight'); plt.show()

    # Also save individual crossover plots
    for ft in fts:
        fig,ax=plt.subplots(figsize=(9,6))
        sub=vd[vd['ft']==ft]
        for j,pn in enumerate(pns):
            s=sub[sub['pn']==pn].sort_values('dwell_s')
            if not len(s): continue
            ax.plot(s['dwell_s'],s['tp'],'o-',color=cols[j],
                    label=plab.get(pn,f'P{pn}'),lw=2.5,ms=7)
            if len(s)>=2:
                t_first=s.iloc[0]['tp']; t_last=s.iloc[-1]['tp']
                drop_pct=(1-t_last/t_first)*100 if t_first>0 else 0
                ax.annotate(f'{drop_pct:.0f}% drop',xy=(s.iloc[-1]['dwell_s'],t_last),
                           fontsize=9,color=cols[j],fontweight='bold',
                           xytext=(10,-5),textcoords='offset points')
        ax.set_xlabel('Dwell Time (s)',fontsize=13)
        ax.set_ylabel('Throughput (bits/s)',fontsize=13)
        ax.set_title(f'Crossover Test: {flab.get(ft,ft)}',fontweight='bold',fontsize=14)
        ax.legend(fontsize=11); ax.grid(True,alpha=.3); ax.set_xlim(0,2.2)
        plt.tight_layout()
        plt.savefig(f'{OUT}/crossover_{ft}.png',dpi=300,bbox_inches='tight'); plt.show()

    # ── PLOT: Fitts regression at each dwell time ─────────
    if len(dt_df)>0:
        print(f'\n{"="*70}\nFitts\' Law Regression at Each Dwell Time\n{"="*70}')
        # Compute nominal ID for each trial from target size and amplitude
        dt_df['nomID']=np.log2(2*dt_df['amp']/dt_df['ts'])
        dwell_colors=plt.cm.viridis(np.linspace(0.15,0.85,len(DWELLS)))

        for ft in fts:
            fig,ax=plt.subplots(figsize=(10,6))
            for k,dms in enumerate(DWELLS):
                sub=dt_df[(dt_df['ft']==ft)&(dt_df['dwell_ms']==dms)]
                if len(sub)<3: continue
                # Group by layout (target size + amplitude) to get mean MT per ID
                gm=sub.groupby(['ts','amp']).agg({'mt':'mean','nomID':'mean'}).reset_index()
                ax.scatter(gm['nomID'],gm['mt'],color=dwell_colors[k],alpha=.7,s=40)
                if len(gm)>1:
                    z=np.polyfit(gm['nomID'],gm['mt'],1); xl=np.linspace(gm['nomID'].min(),gm['nomID'].max(),50)
                    r2=np.corrcoef(gm['nomID'],gm['mt'])[0,1]**2 if len(gm)>2 else 0
                    ax.plot(xl,np.polyval(z,xl),'-',color=dwell_colors[k],lw=2,
                            label=f'{dms/1000:.1f}s: a={z[1]:.2f} b={z[0]:.2f} R²={r2:.2f}')
            ax.set_xlabel('Index of Difficulty (bits)',fontsize=12)
            ax.set_ylabel('Movement Time (s)',fontsize=12)
            ax.set_title(f"Fitts' Law at Each Dwell Time — {flab.get(ft,ft)}",fontweight='bold')
            ax.legend(fontsize=9,title='Dwell'); ax.grid(True,alpha=.3)
            plt.tight_layout()
            plt.savefig(f'{OUT}/fitts_per_dwell_{ft}.png',dpi=300,bbox_inches='tight'); plt.show()

    # ── TABLE: Pivot ───────────────────────────────────────
    print(f'\n{"="*70}\nSummary Tables\n{"="*70}')
    print('\nThroughput (bits/s) by condition and dwell time:')
    piv=dd.pivot_table(index=['pn','pv','ft'],columns='dwell_s',values='tp').round(3)
    display(piv)

    print('\nThroughput drop from shortest to longest dwell:')
    d_min,d_max=min(DWELLS)/1000, max(DWELLS)/1000
    for (pn,ft),g in dd.groupby(['pn','ft']):
        t_lo=g[g['dwell_s']==d_min]['tp'].values; t_hi=g[g['dwell_s']==d_max]['tp'].values
        if len(t_lo) and len(t_hi) and t_lo[0] and t_hi[0]:
            drop=(1-t_hi[0]/t_lo[0])*100
            print(f'  Pair {pn} ({ft}) SD~{g["pv"].iloc[0]:.1f}: {t_lo[0]:.3f} -> {t_hi[0]:.3f} ({drop:.1f}% drop)')

    dd.to_csv(f'{OUT}/multi_dwell_results.csv',index=False)
    print(f'\nSaved: {OUT}/multi_dwell_results.csv')
else:
    print('No cursor-paths JSON uploaded - skipping dwell replay.')

# ── EXPORT ─────────────────────────────────────────────────
cond.to_csv(f'{OUT}/fitts_conditions.csv',index=False)
print(f'Saved: {OUT}/fitts_conditions.csv')
if 'PairVariance' in cond.columns:
    cond.groupby(['PairVariance','FilterType']).agg({'TP':['mean','std'],'MeanMT':['mean','std'],'We':'mean','IDe':'mean','N':'sum'}).round(4).to_csv(f'{OUT}/summary_by_sd_filter.csv')
print(f'\nAll output files:')
for f in sorted(glob.glob(f'{OUT}/*')): print(f'  {f} ({os.path.getsize(f)/1024:.1f} KB)')
shutil.make_archive('fitts_output','zip',OUT)
files.download('fitts_output.zip')
print('\nDone! Download started.')
