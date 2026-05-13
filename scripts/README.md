# USER_LIST インポートスクリプト

## 使い方

```bash
cd scripts
npm init -y
npm install firebase-admin
```

1. Firebase Console → プロジェクト設定 → サービスアカウント → 「新しい秘密鍵の生成」
2. ダウンロードしたJSONを `scripts/serviceAccount.json` として保存 (gitignoreに追加済み想定)
3. 実行:

```bash
# 上書きモード(既存ドキュメントは name 一致で更新)
node import-user-list.js

# 全削除して再投入
node import-user-list.js --purge

# 別のCSVパスを指定
node import-user-list.js /path/to/file.csv
```

## 変換ロジック

- `eligibleCodes`: `"A;W;C;D"` → `["A","W","C","D"]`
- `emergencyContacts`: JSON文字列 → オブジェクト配列
- `dev`: `"TRUE"`/`"FALSE"` → boolean
- ドキュメントID: `name` を使用 (同名がいる場合は要修正)

## 補足

- mwbMembers コレクションは廃止: 別途 Firebase Console から手動削除
- MEMBER_INFO コレクションも廃止: 同上
