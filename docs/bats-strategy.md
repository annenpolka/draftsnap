# Bats 導入方針 (Legacy)

> **注意**: draftsnap の現行開発はルート直下の TypeScript CLI と Vitest を前提としています。本ドキュメントは Bash + Bats ベースの旧フローを記録したレガシー資料です。Bash CLI を削除するまでは参考情報として残していますが、新しい機能追加や CI は pnpm / Vitest を使用してください。

## 目的
- TDD の土台となるシェルテストを、追加依存を極力抑えつつ macOS/Linux どちらでも再現できるようにする。
- プロジェクトローカルに Bats を配置し、CI/ローカルで同一バージョンを実行する。
- ネットワーク不通時でも事前に取得済みのディレクトリを再利用できるようにする。

## 採用方針
- GitHub Release から配布されている `bats-core` アーカイブをプロジェクト内 `vendor/bats-core` に展開する。
- 取得は `scripts/bootstrap-bats.sh` で行う。既存ディレクトリが存在すれば再ダウンロードせず、`--force`で上書きできる。
- バージョンは `BATS_VERSION` 変数で固定（初期値 `1.11.0`）。必要時は環境変数または引数で切り替えられる仕組みにする。
- ダウンロードには `curl` を利用し、未インストール環境向けに `fetch` / `wget` のフォールバックを用意する。
- 展開には標準の `tar` を使用。macOS/BSD との差異を避けるため `gtar` 依存は避ける。
- アーカイブの `SHA256` を事前に記述し、検証して改ざん防止を図る。

## 実行イメージ
```bash
# Bats を取得
./scripts/bootstrap-bats.sh

# テストを実行
./vendor/bats-core/bin/bats tests
```

## ディレクトリ構成
```
project-root/
  scripts/bootstrap-bats.sh  # Bats 取得スクリプト
  vendor/bats-core/          # 展開先（git 管理対象）
  tests/                     # Bats テスト
```

`vendor/bats-core` 配下は `.gitignore` でコミット対象から除外し、必要に応じてキャッシュ用に保持する。

## CI/ローカル整合
- CI では `scripts/bootstrap-bats.sh --quiet` を実行してからテストを走らせる。
- ローカルでも同じコマンドを用いれば同一バージョンを確保できる。
- 将来的にバージョンを更新する際は `BATS_VERSION` と `BATS_SHA256` を変更し、スクリプトを再実行。

## フォールバック案（検討のみ）
- どうしてもネットワークが利用できない環境では、事前に `vendor/bats-core` を配布して配置することで再利用可能。
- Homebrew や apt を利用する案は手軽だが、グローバル環境差異が大きいため今回の方針では採用しない。
