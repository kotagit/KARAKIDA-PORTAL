# MWB → 進行表 Excel 変換ツール

生活と奉仕の集会ワークブック (JW Library エクスポートの ZIP) から、週ごとにタブで分かれた進行表 Excel を生成する Windows ツール。

## 機能

- 入力: `mwb_J_YYYYMM_NN.txt` を含む ZIP
- 出力: 各週がタブで分かれた `.xlsx` ファイル
- GUI モード (Tkinter) と CLI モードの両方に対応

## ユーザー向け: 配布済み `.exe` の使い方

1. `MWB_Excel変換.exe` をダブルクリック
2. 「選択...」で ZIP を選ぶ
3. 「Excel に変換」を押す
4. 保存先を指定 → 完了

## .exe を入手する方法

### GitHub Actions ビルド成果物（推奨）
`windows-tool/` 配下に変更を push すると、GitHub Actions が自動で `.exe` をビルドします。

1. GitHub の **Actions** タブを開く
2. 最新の `Build windows-tool .exe` ワークフローをクリック
3. 一番下の **Artifacts** から `MWB_Excel_Tool-windows` をダウンロード
4. ZIP を展開 → `MWB_Excel_Tool.exe` を取り出す

これだけで配布可能。Windows 端末でのビルド作業は不要。

### 手動ビルド（自分の Windows 端末で作る場合）

## 開発者向け: ビルド方法

### 前提

- Windows 10/11
- Python 3.9 以上

### .exe ビルド

```cmd
build_exe.bat
```

実行後、`dist\MWB_Excel_Tool.exe` が生成される。これ単体で配布可能（インストール不要）。

> 配布時に日本語ファイル名で渡したい場合は、生成後に `MWB_Excel_Tool.exe` を `MWB進行表変換.exe` 等にリネームしてください（ビルド時の名前は ASCII 必須）。

### ソースから直接実行

```cmd
pip install -r requirements.txt
python mwb_to_excel.py              # GUI モード
python mwb_to_excel.py input.zip output.xlsx   # CLI モード
```

## ファイル構成

| ファイル | 役割 |
|---|---|
| `mwb_to_excel.py` | メインスクリプト (GUI + CLI + パース + Excel 生成) |
| `requirements.txt` | Python 依存ライブラリ (openpyxl) |
| `build_exe.bat` | `.exe` 生成用のビルドスクリプト |
| `README.md` | このファイル |

## 設計メモ

このツールは KARAKIDA-PORTAL の `public/assignment.js` 内、以下の関数を Python に移植したもの:

- `awParseWeekLines` → `parse_week_lines`
- `awHandleZipImport` → `extract_weeks_from_zip`

担当者の自動生成 (`awRunGeneration`) や A〜W コードの割当 (`awMapItemsToCodes`) は含めていない。
本ツールが出力するのは **進行表のみ**（誰がやるかは含まない）。

## トラブルシューティング

### `mwb_J_*.txt が見つかりませんでした`
ZIP の中身を確認してください。JW Library から「JW Library Sign Language ZIP エクスポート」とは異なる形式の場合、ファイル名が変わっている可能性があります。

### 日付や項目が一部欠ける
PDF 由来のテキストレイアウトによるパース漏れの可能性。元 ZIP のテキスト内容を確認し、必要なら正規表現を調整。
