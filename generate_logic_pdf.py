from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        self.set_font('Meiryo', 'B', 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, 'KARAKIDA-PORTAL 割当自動生成ロジック仕様書', 0, 1, 'R')
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font('Meiryo', '', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f'{self.page_no()} / {{nb}}', 0, 0, 'C')

    def section_title(self, title):
        self.set_font('Meiryo', 'B', 14)
        self.set_text_color(4, 124, 188)
        self.cell(0, 10, title, 0, 1)
        self.set_draw_color(4, 124, 188)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(3)

    def sub_title(self, title):
        self.set_font('Meiryo', 'B', 11)
        self.set_text_color(60, 60, 60)
        self.cell(0, 8, title, 0, 1)
        self.ln(1)

    def body_text(self, text):
        self.set_font('Meiryo', '', 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, text)
        self.ln(2)

    def code_block(self, text):
        self.set_fill_color(245, 245, 245)
        self.set_font('Meiryo', '', 9)
        self.set_text_color(50, 50, 50)
        x = self.get_x()
        w = 190
        lines = text.split('\n')
        h = len(lines) * 5.5 + 6
        if self.get_y() + h > 270:
            self.add_page()
        y_start = self.get_y()
        self.rect(x, y_start, w, h, 'F')
        self.set_xy(x + 4, y_start + 3)
        for i, line in enumerate(lines):
            self.cell(0, 5.5, line)
            if i < len(lines) - 1:
                self.ln(5.5)
                self.set_x(x + 4)
        self.ln(8)

    def bullet(self, text, indent=0):
        self.set_font('Meiryo', '', 10)
        self.set_text_color(40, 40, 40)
        x = 14 + indent
        self.set_x(x)
        self.cell(5, 6, '•', 0, 0)
        self.multi_cell(190 - indent - 5, 6, text)
        self.ln(1)

    def numbered(self, num, text):
        self.set_font('Meiryo', 'B', 10)
        self.set_text_color(4, 124, 188)
        self.cell(8, 6, str(num) + '.', 0, 0)
        self.set_font('Meiryo', '', 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, text)
        self.ln(1)

    def table_row(self, cells, widths, bold=False, fill=False):
        style = 'B' if bold else ''
        if fill:
            self.set_fill_color(230, 242, 250)
        self.set_font('Meiryo', style, 9)
        self.set_text_color(40, 40, 40)
        h = 7
        for i, (cell, w) in enumerate(zip(cells, widths)):
            self.cell(w, h, cell, 1, 0, 'L', fill)
        self.ln(h)


pdf = PDF()
pdf.alias_nb_pages()
pdf.add_font('Meiryo', '', r'C:\Windows\Fonts\meiryo.ttc', uni=True)
pdf.add_font('Meiryo', 'B', r'C:\Windows\Fonts\meiryob.ttc', uni=True)
pdf.set_auto_page_break(auto=True, margin=20)
pdf.add_page()

# ── タイトル ──
pdf.set_font('Meiryo', 'B', 22)
pdf.set_text_color(4, 124, 188)
pdf.cell(0, 15, '割当自動生成ロジック', 0, 1, 'C')
pdf.set_font('Meiryo', '', 11)
pdf.set_text_color(120, 120, 120)
pdf.cell(0, 8, 'KARAKIDA-PORTAL  —  assignment.js', 0, 1, 'C')
pdf.ln(10)

# ══ 1. 全体フロー ══
pdf.section_title('1. 全体フロー (awGenerateAll)')
pdf.body_text('「自動生成」ボタン押下時に実行される。表示中の月の全週に対し、週ごとに順番に割当を生成する。')

pdf.sub_title('処理ステップ')
pdf.numbered(1, '対象抽出 — 表示中の月でフィルタした週一覧を取得')
pdf.numbered(2, '仮履歴 (tempHistory) を作成 — Firestore の assignmentHistory をディープコピー')
pdf.numbered(3, '週ごとにループ（日付順）:')
pdf.bullet('大会週 (conventionType あり) → スキップ', 10)
pdf.bullet('その週のプログラム項目から割当コード一覧を取得', 10)
pdf.bullet('awRunGeneration() でコア生成を実行', 10)
pdf.bullet('生成結果を仮履歴に書き戻し（次週の生成に反映）', 10)
pdf.numbered(4, 'UI のセレクトボックスに結果を反映')

pdf.ln(2)
pdf.sub_title('仮履歴の積み上げ（週間ローテーション）')
pdf.body_text(
    'Week1 生成後、tempHistory に割当結果を反映する:\n'
    '  tempHistory[名前][base].lastDate = Week1 の meetDate\n'
    '  tempHistory[名前][base].count++\n\n'
    'Week2 の生成時には更新済みの tempHistory を参照するため、\n'
    'Week1 で割当てた人は daysSince=7 となりスコアが下がり、別の人が優先される。'
)

# ══ 2. コア生成ロジック ══
pdf.add_page()
pdf.section_title('2. コア生成ロジック (awRunGeneration)')

pdf.sub_title('入力パラメータ')
pdf.bullet('allCodes — その週の全割当コード (例: A, B, C, D, E, F, H, I, J, K ...)')
pdf.bullet('members — 生徒リスト (eligibleCodes, gender, familyGroup, position)')
pdf.bullet('history — 割当履歴 {名前: {コード: {lastDate, count}}}')
pdf.bullet('meetDate — その週の集会日（木曜日）')

pdf.ln(3)
pdf.sub_title('Step 1: コードを候補者数の少ない順にソート')
pdf.body_text(
    '各コードについて、そのコードの eligibleCodes を持つメンバー数をカウントし、'
    '少ない順にソートする。候補者が限られる役割を先に割当てることで、割当不能を防止する。'
)
pdf.code_block(
    'sortedCodes = allCodes.sort(候補者が少ない順)\n'
    '\n'
    '例: 聎書朝読(候補3名) → 談話担当(候補8名) → 司会(候補12名)'
)

pdf.sub_title('Step 2: 候補者フィルタリング')
pdf.body_text('各コードに対し、以下の条件で候補者を絞り込む:')
pdf.bullet('eligibleCodes にそのコードの base を持っていない → 除外')
pdf.bullet('同じ週内で既に別の役割に割当済み (assignedPersons) → 除外')
pdf.bullet('野外奉仕コード (F〜Q) かつ position が「長老」 → 除外')

pdf.ln(3)
pdf.sub_title('Step 3: ペア制約チェック（相手コードの場合）')
pdf.body_text(
    '担当・相手のペア関係: H↔I, J↔K, L↔M, N↔O\n\n'
    '相手コード (I, K, M, O) を処理する際:\n'
    '  • 先に割当済みの担当者の性別と候補者の性別を比較\n'
    '  • 異性ペアの場合 → 同じ familyGroup でなければ除外\n'
    '  • 同性 or 性別未設定 → 制約なし (OK)'
)

# ══ 3. スコア計算 ══
pdf.add_page()
pdf.section_title('3. スコア計算')

pdf.sub_title('基本式')
pdf.code_block(
    'score = daysSince × 10 − count\n'
    '\n'
    'daysSince = meetDate − lastDate (日数)\n'
    '           ※未割当なら9999\n'
    'count    = 過去の割当回数'
)
pdf.body_text(
    '→ スコアが高い = 長期間割当がない & 回数が少ない → 優先的に選ばれる\n'
    '→ 最高スコアの候補者がその役割に割当てられる'
)

pdf.sub_title('野外奉仕コード (F〜Q) の場合: 横断スコア')
pdf.body_text(
    '野外奉仕コードの場合、特定コードだけでなく全野外奉仕コード (F〜Q) を横断して\n'
    '最新の割当日と累計回数を算出する。'
)
pdf.code_block(
    '全野外奉仕コード(F〜Q)を横断して:\n'
    '  latestDate = 最も最近の割当日\n'
    '  totalCount = 全コードの割当回数合計\n'
    '\n'
    'daysSince = meetDate − latestDate\n'
    'score     = daysSince × 10 − totalCount'
)
pdf.body_text(
    '理由: 野外奉仕のコードは H=会話を始める担当、J=再び話し合う担当 のように項目ごとに異なるが、\n'
    '同じ生徒が毎週別の項目に出るのは不自然。全コード横断で見ることで、\n'
    '先週どの項目に出た人でもスコアが下がり、別の人が優先される。'
)

pdf.sub_title('その他のコード（司会・祈り・講演等）の場合')
pdf.body_text(
    'そのコード固有の履歴 (base 単位) で lastDate と count を取得してスコアを算出する。\n'
    '例: 司会者 (A) の履歴は A のみ参照。宝石を探し出す (D) の履歴は D のみ参照。'
)

# ══ 4. 割当決定 ══
pdf.sub_title('Step 5: 割当決定')
pdf.code_block(
    'candidates.sort(スコア降順)\n'
    'result[code] = candidates[0]   // 最高スコアの人\n'
    'assignedPersons.add(選ばれた人) // 同一週内の重複防止'
)

# ══ 5. コード体系 ══
pdf.add_page()
pdf.section_title('4. コード体系')

pdf.sub_title('割当コード一覧')
w = [20, 90, 80]
pdf.table_row(['コード', '役割', '区分'], w, bold=True, fill=True)
pdf.table_row(['A', '司会者', '開会'], w)
pdf.table_row(['B', '祈り（開会）', '開会'], w)
pdf.table_row(['C', '神の言葉の宝 講演1', '講演'], w)
pdf.table_row(['D', '宝石を探し出す', '講演'], w)
pdf.table_row(['E', '聖書朗読', '講演'], w)
pdf.table_row(['F, G', '聖書朗読・朗読者', '野外奉仕'], w)
pdf.table_row(['H / I', '会話を始める 担当/相手', '野外奉仕ペア'], w)
pdf.table_row(['J / K', '再び話し合う 担当/相手', '野外奉仕ペア'], w)
pdf.table_row(['L / M', '3つ目の生徒割当 担当/相手', '野外奉仕ペア'], w)
pdf.table_row(['N / O', '4つ目の生徒割当 担当/相手', '野外奉仕ペア'], w)
pdf.table_row(['P〜', 'その他生徒', '野外奉仕'], w)
pdf.table_row(['R〜', 'クリスチャンとして生活する', '講演'], w)

pdf.ln(4)
pdf.sub_title('ペア関係')
w2 = [30, 50, 50, 60]
pdf.table_row(['ペア', '担当コード', '相手コード', '備考'], w2, bold=True, fill=True)
pdf.table_row(['1', 'H', 'I', '会話を始める'], w2)
pdf.table_row(['2', 'J', 'K', '再び話し合う'], w2)
pdf.table_row(['3', 'L', 'M', '3つ目の生徒割当'], w2)
pdf.table_row(['4', 'N', 'O', '4つ目の生徒割当'], w2)

# ══ 6. 制約まとめ ══
pdf.ln(6)
pdf.section_title('5. 制約まとめ')

w3 = [60, 130]
pdf.table_row(['制約', '内容'], w3, bold=True, fill=True)
pdf.table_row(['同一週内重複なし', 'assignedPersons で管理。1人1週1役割のみ'], w3)
pdf.table_row(['長老は生徒割当除外', 'position=長老 かつ野外奉仕コード(F〜Q) → 除外'], w3)
pdf.table_row(['異性ペアは家族のみ', '担当と相手が異性の場合、familyGroup 一致が必要'], w3)
pdf.table_row(['野外奉仕は横断スコア', 'F〜Q 全体の最新割当日・累計回数で判定'], w3)
pdf.table_row(['大会週スキップ', 'conventionType あり → 生成しない'], w3)
pdf.table_row(['週間ローテーション', 'tempHistory で仮履歴を積み上げて連続週を防止'], w3)

# ══ 7. フローチャート ══
pdf.add_page()
pdf.section_title('6. 処理フローチャート')
pdf.ln(2)

pdf.set_font('Meiryo', '', 9)
pdf.set_text_color(40, 40, 40)
pdf.set_fill_color(245, 245, 245)

flow = [
    ('▶', '「自動生成」ボタン押下'),
    ('↓', ''),
    ('☐', 'メンバーが0件？ → アラートで中止'),
    ('↓', ''),
    ('■', '表示中の月でフィルタ → 対象週一覧'),
    ('↓', ''),
    ('■', 'assignmentHistory をディープコピー → tempHistory'),
    ('↓', ''),
    ('▷', '週ごとのループ開始'),
    ('', ''),
    ('  ☐', '大会週？ → スキップ'),
    ('  ↓', ''),
    ('  ■', 'プログラム項目からコード一覧取得'),
    ('  ↓', ''),
    ('  ■', 'コードを候補者数の少ない順にソート'),
    ('  ↓', ''),
    ('  ▷', '各コードのループ'),
    ('', ''),
    ('    ■', '候補者フィルタ (eligible / 未割当 / 長老除外)'),
    ('    ↓', ''),
    ('    ■', 'ペア制約チェック (異性ペア→家族のみ)'),
    ('    ↓', ''),
    ('    ■', 'スコア計算 (FM横断 or 個別base)'),
    ('    ↓', ''),
    ('    ■', '最高スコアの候補者を割当'),
    ('', ''),
    ('  ◀', 'コードループ終了'),
    ('  ↓', ''),
    ('  ■', '生成結果を tempHistory に書き戻し'),
    ('', ''),
    ('◀', '週ループ終了'),
    ('↓', ''),
    ('■', 'UI のセレクトボックスに反映'),
    ('↓', ''),
    ('◉', '完了'),
]

for sym, desc in flow:
    if not sym and not desc:
        pdf.ln(1)
        continue
    indent = len(sym) - len(sym.lstrip())
    x = 20 + indent * 3
    pdf.set_x(x)
    pdf.set_font('Meiryo', 'B', 9)
    pdf.cell(8, 5.5, sym.strip(), 0, 0)
    pdf.set_font('Meiryo', '', 9)
    pdf.cell(0, 5.5, desc, 0, 1)

out_path = r'C:\KARAKIDA-PORTAL\割当自動生成ロジック.pdf'
pdf.output(out_path)
print(f'PDF saved: {out_path}')
