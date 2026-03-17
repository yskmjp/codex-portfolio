# 元データの置き場所

取得元からダウンロードした生データ CSV をここに置いてから、`normalize_fund_data.py` を実行してください。

自動取得を試す場合は、まず次を実行します。

```bash
python3 scripts/fetch_raw_fund_data.py
```

このスクリプトは MUFG AM の公式チャートデータから、4ファンドの日次基準価額を取得して `raw_data/` に保存します。

対象ファンド:

- eMAXIS Slim 国内株式（TOPIX）
- eMAXIS Slim 国内債券インデックス
- eMAXIS Slim 先進国株式インデックス
- eMAXIS Slim 先進国債券インデックス

想定している元データ:

- ファイル名かファンド名列に、対象ファンド名が含まれている CSV
- 日付列と基準価額列が入っている CSV

吸収できる主な列名:

- 日付列: `date`, `日付`, `基準日`, `年月日`
- 基準価額列: `nav`, `基準価額`, `基準価額(円)`, `基準価額（円）`
- ファンド名列: `fund`, `ファンド名`, `名称`, `商品名`, `銘柄名`

実行例:

```bash
python3 scripts/fetch_raw_fund_data.py
python3 scripts/normalize_fund_data.py
```

または、手動で取得したファイルを置いたうえで:

```bash
python3 scripts/normalize_fund_data.py
```

実行後、整形済みファイルが `/Users/yskmjp/Documents/codex/portfolio-simulator/data` に出力されます。
