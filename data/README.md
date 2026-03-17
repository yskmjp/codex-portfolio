# 基準価額データの置き場所

eMAXIS Slim の実データで相関を計算するため、次の4ファイルをこのディレクトリに置いてください。

- `emaxis_slim_japan_equity.csv`
- `emaxis_slim_japan_bond.csv`
- `emaxis_slim_developed_equity.csv`
- `emaxis_slim_developed_bond.csv`

CSV は以下のどちらかのヘッダーで読めます。

```csv
date,nav
2021-01-29,12034
2021-02-26,12120
```

```csv
日付,基準価額
2021/01/29,12034
2021/02/26,12120
```

補足:

- 日次でも月次でも読めますが、内部では月末ベースに集約して月次リターンを作ります
- 最低24件以上の価格データが必要です
- 4ファイルの共通月次期間が12か月以上必要です
