import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib import rcParams
from matplotlib.patches import FancyBboxPatch
import math

rcParams['font.family'] = 'Yu Gothic'
rcParams['axes.unicode_minus'] = False
rcParams['font.size'] = 9

C1 = '#047CBC'
C1D = '#035d9a'
C1L = '#e3f2fd'
C_BG = '#f8f8f8'
C_WH = '#ffffff'
C_BD = '#e0e0e0'
C_TL = '#666666'
C_PK = '#e91e63'
C_RD = '#d32f2f'
C_OR = '#ff9800'
C_GR = '#4caf50'

PW, PH = 8.27, 11.69

CODE_MAP = {
    'A':'司会','B':'開会祈り','C':'講話（神の言葉の宝）','D':'宝石を探し出す',
    'E':'聖書朗読','F':'討議1','G':'討議2','H':'最初の話し合い—担当',
    'I':'最初の話し合い—相手','J':'再訪問—担当','K':'再訪問—相手',
    'L':'聖書研究—担当','M':'聖書研究—相手','N':'信じていることを説明する—担当',
    'O':'信じていることを説明する—相手','P':'信じていることを説明する（話形式）',
    'Q':'話','R':'プログラム1','S':'プログラム2','T':'会衆の必要',
    'U':'会衆の聖書研究（司会）','V':'会衆の聖書研究（朗読者）','W':'閉会祈り'
}
MALE_ONLY = set('A B W C E U R S Q T D F G P'.split())
GRP_MAP = {'グループ1':'ポプラ','グループ2':'バオバブ','グループ3':'アーモンド','グループ4':'メタセコイア'}
AUX_CODES = set('E H I J K L M N O'.split())

hist = pd.read_csv(r'C:\KARAKIDA-PORTAL\assignment_history_import.csv')
hist['date'] = pd.to_datetime(hist['date'])
hist['code_label'] = hist['code'].map(CODE_MAP)

raw = pd.read_excel(r'C:\Users\kouta\Downloads\グループ成員表_202606.xlsx', header=None)
members = []
for gi, off in enumerate([1,8,15,22]):
    gn = GRP_MAP[f'グループ{gi+1}']
    for ri in range(3, 28):
        nm = raw.iloc[ri, off]
        if pd.isna(nm): continue
        members.append({'name':str(nm).strip(), 'age':int(raw.iloc[ri,off+1]) if pd.notna(raw.iloc[ri,off+1]) else None,
            'gender':str(raw.iloc[ri,off+2]) if pd.notna(raw.iloc[ri,off+2]) else '',
            'role1':str(raw.iloc[ri,off+3]) if pd.notna(raw.iloc[ri,off+3]) else '',
            'role2':str(raw.iloc[ri,off+4]) if pd.notna(raw.iloc[ri,off+4]) else '', 'group':gn})
mdf = pd.DataFrame(members)
nfix = {'佐々木己知子':'佐々木巳知子','吉冨慶子':'吉富慶子','青木恵美子':'青木惠美子'}
mdf['name'] = mdf['name'].replace(nfix)
hist['memberName'] = hist['memberName'].replace(nfix)
mdf['role_label'] = mdf['role1'].map({'長':'長老','援':'援助奉仕者'}).fillna('伝道者')
mdf['is_pioneer'] = mdf['role2'] == '開'
merged = hist.merge(mdf, left_on='memberName', right_on='name', how='left')
cnt = hist.groupby('memberName').size().reset_index(name='回数')
TODAY = pd.Timestamp('2026-05-13')

# ── 描画ヘルパー ──
def new_page():
    fig, ax = plt.subplots(figsize=(PW, PH))
    fig.patch.set_facecolor(C_BG)
    return fig, ax

def page_table(df, title, fontsize=8, max_rows=28):
    """1ページに1テーブル。行が多ければ複数ページに分割。"""
    pages = []
    total = math.ceil(len(df) / max_rows) if len(df) > 0 else 1
    for i in range(total):
        chunk = df.iloc[i*max_rows:(i+1)*max_rows].reset_index(drop=True)
        fig, ax = new_page()
        ax.axis('off')
        t = f'{title}  [{i+1}/{total}]' if total > 1 else title
        ax.set_title(t, fontsize=11, fontweight='bold', color=C1D, loc='left', pad=20)
        if len(chunk) == 0:
            ax.text(0.5, 0.5, 'データなし', ha='center', va='center', fontsize=12, color=C_TL)
        else:
            tbl = ax.table(cellText=chunk.values, colLabels=chunk.columns, loc='upper center', cellLoc='center')
            tbl.auto_set_font_size(False)
            tbl.set_fontsize(fontsize)
            tbl.auto_set_column_width(range(len(chunk.columns)))
            tbl.scale(1.0, 1.5)
            for (r, c), cell in tbl.get_celld().items():
                cell.set_edgecolor(C_BD)
                cell.set_linewidth(0.5)
                if r == 0:
                    cell.set_facecolor(C1)
                    cell.set_text_props(color=C_WH, fontweight='bold')
                else:
                    cell.set_facecolor(C_WH if r % 2 == 1 else C1L)
        pages.append(fig)
    return pages

def page_chart(plot_fn, title):
    """1ページに1チャート。plot_fn(ax)でaxに描画。"""
    fig, ax = new_page()
    ax.set_facecolor(C_WH)
    for s in ['top','right']: ax.spines[s].set_visible(False)
    for s in ['left','bottom']: ax.spines[s].set_color(C_BD)
    ax.tick_params(colors=C_TL, labelsize=8)
    ax.set_title(title, fontsize=11, fontweight='bold', color=C1D, loc='left', pad=15)
    plot_fn(ax)
    fig.tight_layout(pad=2)
    return fig

def save_figs(pdf, figs):
    if isinstance(figs, list):
        for f in figs:
            pdf.savefig(f); plt.close(f)
    else:
        pdf.savefig(figs); plt.close(figs)

# ══════════════════════════════════════════
output_path = r'C:\Users\kouta\Downloads\割当分析レポート.pdf'
with PdfPages(output_path) as pdf:

    # ━━━ 表紙 ━━━
    fig, ax = new_page()
    ax.axis('off')
    ax.add_patch(FancyBboxPatch((0.05,0.72),0.90,0.18, boxstyle="round,pad=0.02", facecolor=C1, edgecolor='none', transform=ax.transAxes))
    ax.text(0.5,0.84,'割当分析レポート', ha='center',va='center',fontsize=28,fontweight='bold',color=C_WH)
    ax.text(0.5,0.76,'唐木田会衆 集会割当履歴の総合分析', ha='center',va='center',fontsize=12,color='#cce5f5')
    info = f'分析日: {TODAY.strftime("%Y年%m月%d日")}\nデータ期間: {hist["date"].min().strftime("%Y/%m/%d")} 〜 {hist["date"].max().strftime("%Y/%m/%d")}\n総レコード数: {len(hist)}件 / 成員数: {len(mdf)}名'
    ax.add_patch(FancyBboxPatch((0.15,0.56),0.70,0.12, boxstyle="round,pad=0.015", facecolor=C_WH, edgecolor=C_BD, linewidth=1, transform=ax.transAxes))
    ax.text(0.5,0.62, info, ha='center',va='center',fontsize=10,color='#222',linespacing=1.8)
    toc = ['1. 割当の公平性分析','2. 間隔・ローテーション分析（全生徒）','3. 年齢層別分析',
           '4. 役割別分析','5. 開拓者分析','6. 担当・相手ペア分析',
           '7. 月別推移','8. 次回優先割当リスト','9. 補助会場シミュレーション']
    ax.text(0.5,0.48,'目　次', ha='center',fontsize=14,fontweight='bold',color=C1D)
    for i,t in enumerate(toc):
        ax.text(0.25, 0.42 - i*0.035, t, fontsize=10, color='#222')
    save_figs(pdf, fig)

    # ━━━ 1. 公平性分析 ━━━
    ac = mdf.merge(cnt, left_on='name', right_on='memberName', how='left').fillna(0)
    ac['回数'] = ac['回数'].astype(int)
    ac = ac.sort_values('回数', ascending=False)

    def plot_ranking(ax):
        top30 = ac.head(30)
        colors = [C1 if g=='男' else C_PK for g in top30['gender']]
        ax.barh(range(len(top30)), top30['回数'].values, color=colors, height=0.7)
        ax.set_yticks(range(len(top30)))
        ax.set_yticklabels(top30['name'].values, fontsize=7)
        ax.invert_yaxis()
        ax.set_xlabel('割当回数')
        ax.legend(handles=[
            plt.Line2D([0],[0],marker='s',color='w',markerfacecolor=C1,markersize=8,label='男性'),
            plt.Line2D([0],[0],marker='s',color='w',markerfacecolor=C_PK,markersize=8,label='女性')
        ], frameon=False, fontsize=8, loc='lower right')
    save_figs(pdf, page_chart(plot_ranking, '1. 割当の公平性分析 — 割当回数ランキング（上位30名）'))

    # 統計 + グループ別
    active = ac[ac['回数']>0]['回数']
    stat_df = pd.DataFrame({'項目':['平均','中央値','標準偏差','最多','最少','割当0回'],
        '値':[f'{active.mean():.1f}回',f'{active.median():.0f}回',f'{active.std():.1f}',
              f'{active.max():.0f}回',f'{active.min():.0f}回',f'{(ac["回数"]==0).sum()}名']})
    save_figs(pdf, page_table(stat_df, '基本統計', fontsize=10))

    gm = dict(zip(mdf['name'],mdf['group']))
    hg = hist.copy(); hg['group'] = hg['memberName'].map(gm)
    gs = hg.groupby('group').agg(総割当数=('memberName','size'),ユニーク成員=('memberName','nunique')).reset_index()
    gmc = mdf.groupby('group').size().reset_index(name='成員数')
    gs = gs.merge(gmc, on='group', how='left')
    gs['一人あたり'] = (gs['総割当数']/gs['成員数']).round(1)
    save_figs(pdf, page_table(gs.rename(columns={'group':'グループ'}), 'グループ別統計', fontsize=10))

    # 性別×コード
    gmap = dict(zip(mdf['name'],mdf['gender']))
    hgc = hist.copy(); hgc['gender'] = hgc['memberName'].map(gmap)
    def plot_gender_code(ax):
        cg = hgc.groupby(['code','gender']).size().unstack(fill_value=0)
        cg.index = [f"{c} ({CODE_MAP.get(c,c)[:8]})" for c in cg.index]
        cg.plot(kind='barh', ax=ax, color={'男':C1,'女':C_PK}, stacked=True, edgecolor='none')
        ax.legend(frameon=False, fontsize=8)
        ax.set_xlabel('回数')
    save_figs(pdf, page_chart(plot_gender_code, 'コード別 男女分布'))

    viol = hgc[(hgc['gender']=='女') & (hgc['code'].isin(MALE_ONLY))]
    if len(viol) > 0:
        vdf = viol[['memberName','code','code_label','date']].copy()
        vdf['date'] = vdf['date'].dt.strftime('%Y/%m/%d')
        vdf.columns = ['名前','コード','割当名','日付']
        save_figs(pdf, page_table(vdf, '⚠ 男性限定コードに女性が割当'))

    # ━━━ 2. 間隔・ローテーション ━━━
    ld = hist.groupby('memberName')['date'].max().reset_index()
    ld.columns = ['name','last_date']
    ld['経過日数'] = (TODAY - ld['last_date']).dt.days
    ld = ld.merge(mdf[['name','gender','group']], on='name', how='left')
    ld = ld.sort_values('経過日数', ascending=False)

    def plot_elapsed(ax):
        top25 = ld.head(25)
        cs = [C_RD if d>60 else C_OR if d>30 else C_GR for d in top25['経過日数']]
        ax.barh(range(len(top25)), top25['経過日数'].values, color=cs, height=0.7)
        ax.set_yticks(range(len(top25)))
        ax.set_yticklabels(top25['name'].values, fontsize=7)
        ax.invert_yaxis()
        ax.set_xlabel('経過日数')
        ax.axvline(x=30, color=C_OR, linestyle='--', alpha=0.5, label='30日')
        ax.axvline(x=60, color=C_RD, linestyle='--', alpha=0.5, label='60日')
        ax.legend(frameon=False, fontsize=7)
    save_figs(pdf, page_chart(plot_elapsed, '2. 間隔分析 — 前回割当からの経過日数（上位25）'))

    hs = hist.sort_values(['memberName','date'])
    hs['prev'] = hs.groupby('memberName')['date'].shift(1)
    hs['gap'] = (hs['date']-hs['prev']).dt.days
    cons = hs[hs['gap']<=7].groupby('memberName').size().reset_index(name='連続週回数').sort_values('連続週回数',ascending=False)
    cons.columns = ['名前','連続週回数']
    save_figs(pdf, page_table(cons.head(25), '2週連続割当の回数（上位25名）'))

    # 男女別統計
    ag = hs[hs['gap'].notna()].groupby('memberName')['gap'].agg(['mean','min','max','count']).reset_index()
    ag.columns = ['name','平均間隔','最短','最長','回数']
    ag = ag.merge(mdf[['name','gender','group']], on='name', how='left').sort_values('平均間隔')
    fg = ag[ag['gender']=='女']['平均間隔']; mg = ag[ag['gender']=='男']['平均間隔']
    ggs = pd.DataFrame({'区分':['男性','女性','全体'], '人数':[len(mg),len(fg),len(ag)],
        '平均間隔(日)':[mg.mean(),fg.mean(),ag['平均間隔'].mean()],
        '中央値(日)':[mg.median(),fg.median(),ag['平均間隔'].median()],
        '標準偏差':[mg.std(),fg.std(),ag['平均間隔'].std()],
        '最短(日)':[mg.min(),fg.min(),ag['平均間隔'].min()],
        '最長(日)':[mg.max(),fg.max(),ag['平均間隔'].max()]})
    for c in ['平均間隔(日)','中央値(日)','標準偏差','最短(日)','最長(日)']:
        ggs[c] = ggs[c].round(1)
    save_figs(pdf, page_table(ggs, '男女別 割当間隔統計', fontsize=10))

    # 全生徒間隔一覧
    gd = ag[['name','gender','group','平均間隔','最短','最長','回数']].copy()
    gd['平均間隔'] = gd['平均間隔'].round(1); gd['最短']=gd['最短'].astype(int); gd['最長']=gd['最長'].astype(int)
    gd.columns = ['名前','性別','グループ','平均間隔(日)','最短(日)','最長(日)','割当回数']
    save_figs(pdf, page_table(gd, '全生徒 割当間隔一覧（平均間隔順）', fontsize=8, max_rows=28))

    gd2 = gd.sort_values('割当回数', ascending=False).reset_index(drop=True)
    save_figs(pdf, page_table(gd2, '全生徒 割当間隔一覧（割当回数順）', fontsize=8, max_rows=28))

    # コード別ローテーション
    cr = hist.groupby('code').agg(担当者数=('memberName','nunique'),総回数=('memberName','size')).reset_index()
    cr['コード名'] = cr['code'].map(CODE_MAP)
    cr['平均周期(日)'] = ''
    for _,row in cr.iterrows():
        c=row['code']; ds=hist[hist['code']==c].sort_values('date')['date']
        if len(ds)>1: cr.loc[cr['code']==c,'平均周期(日)'] = f"{ds.diff().dropna().dt.days.mean():.0f}"
    cd = cr[['code','コード名','担当者数','総回数','平均周期(日)']].copy()
    cd.columns = ['コード','割当名','担当者数','総回数','平均周期(日)']
    cd = cd.sort_values('総回数', ascending=False)
    save_figs(pdf, page_table(cd, 'コード別 ローテーション統計', fontsize=9))

    # ━━━ 3. 年齢層別 ━━━
    mv = merged[merged['age'].notna()].copy()
    mv['ag'] = pd.cut(mv['age'], bins=[0,29,39,49,59,69,79,100],
                      labels=['20代以下','30代','40代','50代','60代','70代','80代+'])
    ast = mv.groupby('ag').agg(割当数=('memberName','size'),人数=('memberName','nunique')).reset_index()
    ast['一人あたり'] = (ast['割当数']/ast['人数']).round(1)

    def plot_age(ax):
        cs = ['#b3e5fc','#81d4fa','#4fc3f7','#29b6f6','#03a9f4','#0288d1',C1D]
        ax.bar(range(len(ast)), ast['一人あたり'], color=cs[:len(ast)], width=0.6)
        ax.set_xticks(range(len(ast))); ax.set_xticklabels(ast['ag'], fontsize=9)
        ax.set_ylabel('一人あたり割当回数')
        for i,v in enumerate(ast['一人あたり']):
            ax.text(i, v+0.15, str(v), ha='center', fontweight='bold', color=C1D, fontsize=9)
    save_figs(pdf, page_chart(plot_age, '3. 年齢層別 一人あたり割当回数'))

    yng = mdf[(mdf['age'].notna())&(mdf['age']<=39)]
    yh = yng.merge(cnt, left_on='name', right_on='memberName', how='left').fillna(0)
    yh['回数'] = yh['回数'].astype(int)
    yc = hist[hist['memberName'].isin(yng['name'])].groupby('memberName')['code'].apply(lambda x:len(set(x))).reset_index(name='コード種類')
    yh = yh.merge(yc, left_on='name', right_on='memberName', how='left').fillna(0)
    yh['コード種類'] = yh['コード種類'].astype(int)
    yd = yh[['name','gender','group','回数','コード種類']].sort_values('回数',ascending=False)
    yd.columns = ['名前','性別','グループ','割当回数','コード種類']
    save_figs(pdf, page_table(yd, '若年層（39歳以下）の育成状況'))

    eld = mdf[(mdf['age'].notna())&(mdf['age']>=75)]
    eh = eld.merge(cnt, left_on='name', right_on='memberName', how='left').fillna(0)
    eh['回数'] = eh['回数'].astype(int)
    ed = eh[['name','gender','group','回数']].sort_values('回数',ascending=False)
    ed.columns = ['名前','性別','グループ','割当回数']
    save_figs(pdf, page_table(ed, '高齢者（75歳以上）の負荷チェック'))

    # ━━━ 4. 役割別 ━━━
    rm = dict(zip(mdf['name'],mdf['role_label']))
    hr = hist.copy(); hr['role'] = hr['memberName'].map(rm).fillna('不明')
    rs = hr.groupby('role').agg(総割当=('memberName','size'),人数=('memberName','nunique')).reset_index()
    rs['一人あたり'] = (rs['総割当']/rs['人数']).round(1)

    def plot_role(ax):
        rc = {'長老':C1D,'援助奉仕者':C1,'伝道者':'#4fc3f7','不明':'#ccc'}
        ax.bar(rs['role'], rs['一人あたり'], color=[rc.get(r,'#999') for r in rs['role']], width=0.5)
        ax.set_ylabel('一人あたり割当回数')
        for i,(r,v) in enumerate(zip(rs['role'],rs['一人あたり'])):
            ax.text(i, v+0.3, str(v), ha='center', fontweight='bold', color=C1D, fontsize=10)
    save_figs(pdf, page_chart(plot_role, '4. 役割別 一人あたり割当回数'))
    save_figs(pdf, page_table(rs.rename(columns={'role':'役割'}), '役割別統計', fontsize=10))

    eld_s = set(mdf[mdf['role1']=='長']['name']); srv_s = set(mdf[mdf['role1']=='援']['name'])
    appt = eld_s | srv_s
    ca = []
    for c in sorted(CODE_MAP):
        a = set(hist[hist['code']==c]['memberName']); t=len(a); ap=len(a&appt)
        ca.append({'コード':c,'割当名':CODE_MAP[c][:12],'総担当者':t,'長老/援助':ap,'伝道者':t-ap,
                   '任命者率':f"{ap/t*100:.0f}%" if t>0 else '-'})
    save_figs(pdf, page_table(pd.DataFrame(ca), 'コード別 長老/援助奉仕者 vs 伝道者'))

    # ━━━ 5. 開拓者 ━━━
    pm = dict(zip(mdf['name'],mdf['is_pioneer']))
    hp = hist.copy(); hp['is_pio'] = hp['memberName'].map(pm)
    ps = hp.groupby('is_pio').agg(総割当=('memberName','size'),人数=('memberName','nunique')).reset_index()
    ps['区分'] = ps['is_pio'].map({True:'開拓者',False:'非開拓者'})
    ps['一人あたり'] = (ps['総割当']/ps['人数']).round(1)

    def plot_pio(ax):
        ax.bar(ps['区分'], ps['一人あたり'], color=[C_GR,C1], width=0.4)
        for i,v in enumerate(ps['一人あたり']):
            ax.text(i, v+0.3, str(v), ha='center', fontweight='bold', color=C1D, fontsize=10)
        ax.set_ylabel('一人あたり割当回数')
    save_figs(pdf, page_chart(plot_pio, '5. 開拓者 vs 非開拓者 一人あたり割当回数'))
    save_figs(pdf, page_table(ps[['区分','総割当','人数','一人あたり']], '開拓者統計', fontsize=10))

    pios = mdf[mdf['is_pioneer']].copy()
    pc = pios.merge(cnt, left_on='name', right_on='memberName', how='left').fillna(0)
    pc['回数'] = pc['回数'].astype(int)
    pcc = hist[hist['memberName'].isin(pios['name'])].groupby('memberName')['code'].apply(lambda x:', '.join(sorted(set(x)))).reset_index(name='担当コード')
    pc = pc.merge(pcc, left_on='name', right_on='memberName', how='left').fillna('')
    pd2 = pc[['name','gender','role_label','group','回数','担当コード']].sort_values('回数',ascending=False)
    pd2.columns = ['名前','性別','役割','グループ','割当回数','担当コード']
    save_figs(pdf, page_table(pd2, '開拓者一覧と割当状況', fontsize=7))

    pn = set(pios['name'])
    hpm = hist[hist['memberName'].isin(pn)].copy()
    hpm['month'] = hpm['date'].dt.to_period('M')
    pmo = hpm.groupby('month').size().reset_index(name='割当数')
    pmo['m'] = pmo['month'].astype(str)
    def plot_pio_month(ax):
        ax.bar(range(len(pmo)), pmo['割当数'], color=C_GR)
        ax.set_xticks(range(len(pmo)))
        ax.set_xticklabels(pmo['m'], rotation=45, fontsize=6.5)
        ax.set_ylabel('割当件数')
    save_figs(pdf, page_chart(plot_pio_month, '開拓者の月別割当件数推移'))

    # ━━━ 6. 担当・相手ペア ━━━
    pairs = [('H','I','最初の話し合い'),('J','K','再訪問'),('L','M','聖書研究'),('N','O','信じていることを説明する')]
    pr = []
    for tc,ac2,lb in pairs:
        td=set(hist[hist['code']==tc]['date'].dt.strftime('%Y/%m/%d'))
        ad=set(hist[hist['code']==ac2]['date'].dt.strftime('%Y/%m/%d'))
        pr.append({'種類':lb,'担当':tc,'相手':ac2,'両方あり':len(td&ad),'担当のみ':len(td-ad),'相手のみ':len(ad-td)})
    save_figs(pdf, page_table(pd.DataFrame(pr), '6. 担当・相手ペアの日付マッチング', fontsize=10))

    ai = set('I K M O'.split()); tn = set('H J L N'.split())
    sh = hist[hist['code'].isin(ai|tn)].copy()
    sh['is_ai'] = sh['code'].isin(ai)
    sb = sh.groupby('memberName').agg(担当回数=('is_ai',lambda x:(~x).sum()),相手回数=('is_ai',lambda x:x.sum()),総回数=('is_ai','size')).reset_index()
    sb['相手率(%)'] = (sb['相手回数']/sb['総回数']*100).round(0).astype(int)
    sb = sb[sb['総回数']>=3].sort_values('相手率(%)',ascending=False)
    sb.columns = ['名前','担当回数','相手回数','総回数','相手率(%)']
    save_figs(pdf, page_table(sb, '相手役に偏っている成員（3回以上）'))

    # ━━━ 7. 月別推移 ━━━
    hm = hist.copy(); hm['month'] = hm['date'].dt.to_period('M')
    mo = hm.groupby('month').agg(割当数=('memberName','size'),ユニーク人数=('memberName','nunique')).reset_index()
    mo['m'] = mo['month'].astype(str)

    def plot_monthly1(ax):
        ax.bar(range(len(mo)), mo['割当数'], color=C1)
        ax.set_xticks(range(len(mo))); ax.set_xticklabels(mo['m'], rotation=45, fontsize=6.5)
        ax.set_ylabel('割当件数')
    save_figs(pdf, page_chart(plot_monthly1, '7. 月別 割当件数推移'))

    def plot_monthly2(ax):
        ax.plot(range(len(mo)), mo['ユニーク人数'], marker='o', color=C_PK, linewidth=2, markersize=4)
        ax.fill_between(range(len(mo)), mo['ユニーク人数'], alpha=0.1, color=C_PK)
        ax.set_xticks(range(len(mo))); ax.set_xticklabels(mo['m'], rotation=45, fontsize=6.5)
        ax.set_ylabel('ユニーク人数')
    save_figs(pdf, page_chart(plot_monthly2, '月別 割当参加人数推移'))

    # ━━━ 8. 次回優先割当リスト ━━━
    for gen, label in [('男','男性'),('女','女性')]:
        sub = mdf[mdf['gender']==gen].merge(ld[['name','last_date','経過日数']], on='name', how='left')
        sub['経過日数'] = sub['経過日数'].fillna(9999).astype(int)
        sub['最終割当'] = sub['last_date'].apply(lambda x: x.strftime('%Y/%m/%d') if pd.notna(x) else '履歴なし')
        sub = sub.sort_values('経過日数', ascending=False)
        cols = ['name','role_label','group','最終割当','経過日数'] if gen=='男' else ['name','group','最終割当','経過日数']
        hd = ['名前','役割','グループ','最終割当','経過日数'] if gen=='男' else ['名前','グループ','最終割当','経過日数']
        d = sub[cols].copy(); d.columns = hd
        save_figs(pdf, page_table(d, f'8. {label} 次回優先割当リスト（経過日数順）'))

    # ━━━ 9. 補助会場シミュレーション ━━━
    aux_h = hist[hist['code'].isin(AUX_CODES)]
    avg_aux = aux_h.groupby('date').size().mean()
    aux_members = set(aux_h['memberName'])
    no_aux = set(mdf['name']) - aux_members

    sm = pd.DataFrame({'項目':['対象コード数','対象コード','現状の週平均割当枠','2会場時の週平均割当枠（予測）',
                               '現状の対象コード担当者数','割当履歴なしの成員数（新規候補）'],
        '値':[len(AUX_CODES), 'E, H, I, J, K, L, M, N, O', f'{avg_aux:.1f}件',f'{avg_aux*2:.1f}件',
              f'{len(aux_members)}名',f'{len(no_aux)}名']})
    save_figs(pdf, page_table(sm, '9. 補助会場シミュレーション — 影響サマリー', fontsize=10))

    ac2 = aux_h.groupby('memberName').size().reset_index(name='現状回数')
    aux_s = aux_h.sort_values(['memberName','date'])
    aux_s['prev'] = aux_s.groupby('memberName')['date'].shift(1)
    aux_s['gap'] = (aux_s['date']-aux_s['prev']).dt.days
    aag = aux_s[aux_s['gap'].notna()].groupby('memberName')['gap'].mean().reset_index(name='現状間隔')
    sim = ac2.merge(aag, on='memberName', how='left')
    sim['予測回数'] = (sim['現状回数']*2).astype(int)
    sim['予測間隔(日)'] = (sim['現状間隔']/2).round(1)
    sim['現状間隔'] = sim['現状間隔'].round(1)
    sim = sim.sort_values('現状回数', ascending=False)
    sd = sim[['memberName','現状回数','予測回数','現状間隔','予測間隔(日)']].copy()
    sd.columns = ['名前','現状回数','予測回数','現状間隔(日)','予測間隔(日)']
    save_figs(pdf, page_table(sd, '補助会場追加時の割当変化予測'))

    pot = mdf[mdf['name'].isin(no_aux)][['name','gender','group']].copy()
    pot.columns = ['名前','性別','グループ']
    if len(pot) > 0:
        save_figs(pdf, page_table(pot, '対象コード割当履歴なし → 新規割当候補'))

print(f'PDF saved: {output_path}')
