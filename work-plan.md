# draftsnap 作業計画

## 背景と目的
- 作業中の一時Markdown等を安全に差分管理するためのサイドカーGitツール`draftsnap`を実装する。
- `.git-scratch`サイドカーRepoと`scratch/`ワークスペースを冪等に構成し、誤プッシュ防止・局所的な履歴管理を提供する。
- 仕様は`project-summary.md`および最新の議論から抽出し、TDD(テスト駆動開発)のRed-Green-Refactorサイクルで段階的に完成させる。

## 基本方針
- **言語/実装**: 依存を抑えたPOSIX互換`bash`スクリプト1本構成(`bin/draftsnap`想定)。
- **テスト**: `bats`を用いたシェルテストを主軸に、コマンド単位の振る舞いを自動化。必要に応じて軽量の補助スクリプトでフィクスチャを生成。
- **設計原則**: 環境変数で`SCR_DIR`等を上書き可能、flockによる排他制御、JSONレスポンスと終了コード仕様(0/10/11/12/13/14)の厳守。
- **TDD運用**: テストリスト→失敗テスト実装→最小実装→リファクタの順に進める。テストリストは常に最新化し、完了した項目に印を付ける。

## フェーズ別タスク
### フェーズ0: 体制準備
- `bin/`ディレクトリと`tests/`(Bats)の雛形を作成。
- Makefileまたは`justfile`で`test`/`lint`タスクを定義。
- `.editorconfig`やshellcheck設定などの開発補助を整備。

### フェーズ1: 基盤コマンドと初期化
- `draftsnap ensure`でサイドカーRepoを冪等に構築(ディレクトリ作成/設定/ignore追記/リモート禁止設定)。
- `draftsnap status`で初期化状態・ロック状態・exclude適用状況をJSON/人間向けに出力。
- `draftsnap protect on|off|status`で`.git/info/exclude`を冪等制御。
- グローバルオプション(`--json`,`--quiet`,`--debug`,`--dry-run`,`--version`)の型を定義。

### フェーズ2: スナップショットと履歴閲覧
- `draftsnap snap <path|-> [-m] [--space]`の実装(差分検知でコード10を返す/標準入力取込/テンプレ対応の検討)。
- `draftsnap log [-- path]`と`draftsnap diff [rev] [-- path]`で履歴参照機能を提供。
- `draftsnap ls`で追跡対象ファイル一覧を出力。

### フェーズ3: 復元とメンテナンス
- `draftsnap restore <rev> -- <path>`で安全なリストア機構を実装。
- `draftsnap prune [--keep N|--days D] [--archive DIR]`と`draftsnap gc`で履歴の整理とGCを制御。
- `draftsnap detox`で本体Repo側追跡済みファイルの静音化(`--skip-worktree`/`--assume-unchanged`)を提供。

### フェーズ4: 運用サポートと磨き込み
- `draftsnap prompt`でエージェント向け運用ガイドを生成。
- `draftsnap help`で人間/JSON両向けヘルプを整備。
- ロック/エラー系(コード12~14)の分岐テスト、並行実行や破損ケースに対する防御を強化。
- README/使用例/チュートリアルを整備。

## 初期テストリスト
- [x] `ensure`が未初期化環境で`.git-scratch`と`scratch/`を作成し、JSONに`initialized:true`を返す。
- [x] `ensure`を再実行しても副作用がなく、`initialized:false`かつ`code=0`で成功する。
- [x] `ensure`が既存`DRAFTSNAP_SCR_DIR`・`DRAFTSNAP_GIT_DIR`環境変数を尊重して初期化する。
- [x] `ensure --json`が `{status, code, data}` を含む安定したスキーマを返す。
- [x] `ensure`が`.git/info/exclude`を冪等に更新し、重複行を出力しない。
- [x] `.git/info/exclude`に`scratch/`と`.git-scratch/`が重複なく追記される。
- [x] サイドカー側の追跡対象を明示するため、`.git-scratch/info/exclude`に`*`→`!<scr_dir>/`パターンを適用し、`status`がノイズレスであることを保証する。
- [x] `status`が初期化済み/未済を正しく判定する。
- [x] `status`がロック中を正しく判定する。
- [x] `snap`が新規コンテンツでコミットを作成し、戻り値`0`とコミットIDを返す。
- [x] `snap`が内容変更無しで`code=10`を返し、履歴を汚さない。
- [x] `snap -`で標準入力を`scratch/stream-YYYYMMDD.md`に保存しコミット。
- [x] `snap --space NAME`で`scratch/<NAME>/`へ格納し、コミットメッセージに`[space:NAME]`を付与する。
- [x] `log`が`--json`時に時系列ソート済み配列を返す。
- [x] `log`が人間向けの行リストを出力する。
- [x] `diff`が最新スナップショット同士を比較し、`--since`/`--current`で範囲を指定できる。
- [x] `restore`が既存ファイルを上書きし、バックアップ警告を発行。
- [x] `prune --keep 1`が古いコミットを`--archive`先へ書き出し、サイドカーから削除。
- [ ] 排他実行中(`flock`保持時)はコード12で待機せず失敗する。

## 開発体制とワークフロー
- ブランチ戦略は`main`に対する短命トピックブランチ。各ブランチでTDDサイクルを完走し、PR前に`shellcheck`/`bats`を実行。
- コミットメッセージは`feat:`,`fix:`,`test:`等の短いPrefixで整理。
- 自動化: GitHub Actionsまたはローカル`just test`でCIを模擬。

## リスクと未決事項
- `bats`導入方法(サブモジュールまたは`vendor/`)を決める必要がある。
- Mac/Linux双方での`flock`挙動差異検証。
- JSON組み立てに追加の依存(`jq`等)を避けるか、純bashで組むか検討。
- 大規模ファイル投入時のパフォーマンス(コミットサイズ)に対する制限を要調査。

## 次のアクション
1. Batsテスト環境の導入方式を決定し、`tests/`のテンプレートを作成する。
2. フェーズ0タスク(ディレクトリ/スクリプト雛形/ランナー)をRedステップから着手する。
3. テストリストに不足があれば都度追記し、順次TDDサイクルで消化していく。
