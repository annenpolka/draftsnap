# 一時MD管理方法

## PROMPT 1

作業用の一時的なmdをAIに書かせてるときのいい管理方法ないかな、コミットしたくないけどその瞬間だけバージョン管理したかったりするんだ

## RESPONSE 1

事実
==

ニーズ
---

作業中の一時MDをその瞬間だけ差分管理したいが、常用ブランチの履歴は汚したくない、プッシュもしたくない——この要件はGitの**stash**、**一時ワークツリー（worktree）+ 孤立ブランチ**、**サイドカーRepo**のいずれかで満たせるわ。

選択肢と性質
------

1.  **git stashでスナップショット管理**  
    追跡/未追跡の特定ファイルだけを一時退避できる。コミット不要、履歴に出ない、復元と差分確認が速い。期限切れで自動GCされるので“溜めすぎ注意”よ。
    
2.  **一時worktree + 孤立（orphan）ブランチでローカル限定コミット**  
    作業ディレクトリを別に切って、そこだけコミットする。リモート未設定なら絶対にプッシュされない。差分粒度はコミットなので見やすい。worktree/ブランチを削除すれば参照が消え、GCで実体も消える。
    
3.  **サイドカーRepo（.gitとは別の.git-scratchを併設）**  
    プロジェクト直下に“もう1つのGit”を置いて、`scratch/`配下だけ管理する。メインRepoとは完全分離。運用は少し増えるが、頭を切り替えやすいのが利点ね。
    

コマンド最小セット
---------

### 1) stash一発スナップショット

```bash
# 追跡/未追跡どちらでも、そのファイルだけ退避（-uで未追跡を含める）
git stash push -m "scratch: $(date +%F_%T)" -u -- path/to/scratch.md

# 差分を見る
git stash show -p stash@{0}

# 中身だけ取り出す（ワークツリーへ）
git restore --source=stash@{0} -- path/to/scratch.md

# 使い終えたら捨てる
git stash drop stash@{0}
```

メモ: `.gitignore`に入っていても、`-u`とパス指定で拾えるわ。

### 2) 一時worktree + orphanブランチ

```bash
# 作業ルートで。孤立ブランチ名を刻印してworktree生成（HEAD切り離しでも可）
W=/tmp/scratch-$(date +%s)
BR=scratch-$(date +%Y%m%d-%H%M%S)
git worktree add -b "$BR" "$W"
cd "$W"

# 必要なMDだけ置いてコミット（ローカル限定）
mkdir -p notes && cp /path/to/scratch.md notes/
git add notes/scratch.md
git commit -m "scratch: first"

# 差分が欲しい時は普通にコミットを刻む
# 片付け
cd -
git worktree remove "$W"
git branch -D "$BR"   # 参照を消す→一定期間後にGCで消える
```

リモートを紐づけなければ誤プッシュは物理的に起きないわ。

### 3) サイドカーRepo（完全分離）

```bash
# プロジェクト直下に“別のGit”を作る（メインとは無関係）
git --git-dir=.git-scratch --work-tree=. init
# サイドカーが見る対象をscratch配下に限定して運用するのが無難
mkdir -p scratch
git --git-dir=.git-scratch --work-tree=. add scratch/.gitkeep
git --git-dir=.git-scratch --work-tree=. commit -m "init scratch"

# 以後、scratch/*.mdだけ記録
git --git-dir=.git-scratch --work-tree=. add scratch/scratch.md
git --git-dir=.git-scratch --work-tree=. commit -m "wip: md"
```

`.git-scratch`はリモート無し運用にしておけば、境界は明確よ。

副作用と片付け
-------

*   stashや孤立コミットは、参照が消えると**一定期間後にGC**で消える（デフォルト90日）わ。長期保存したいなら、明示的に別ディレクトリへ退避（`git show > file`や`cp`）しておくと安全。
    
*   誤爆防止には`remote.pushDefault`を未設定にしておく、あるいはscratch系ブランチに**上流（upstream）を持たせない**のが鉄則ね。
    
*   `.git/info/exclude`に`scratch/`を入れて、メインRepo側には絶対に追跡させないのが平和よ。
    

___________

推測（示唆）
======

判断軸と私見
------

*   **速く・浅く・単発**なら**stash**が最短よ。コマンド1本で撮って、`stash show`で差分を眺め、終わったら捨てる。AIに書かせた断片の“撮って出し”に向くわ。
    
*   **途中の推敲差分を読み返したい**なら**worktree+孤立ブランチ**でしょう。コミット粒度で履歴が見やすいし、メインから完全隔離できる。
    
*   **常時プロジェクト横断の作業メモを蓄積**したい人は**サイドカーRepo**がしっくりくる。運用コストはあるけど、誤コミットの心配が消える。
    

根拠: どれも“メイン履歴を汚さない”“ローカル限定”“後で捨てられる”を満たすが、**差分の見やすさ**と**運用の軽さ**がトレードオフになるからよ。

実用小技（導入ハードル低）
-------------

*   **`git alias`でワンキー化**
    
    ```bash
    git config alias.scratch \
      "!f(){ git stash push -u -- \"${1:?path}\" -m \"scratch: $(date +%F_%T)\"; }; f"
    git config alias.scratch-diff \
      "!sh -c 'git stash show -p ${1:-stash@{0}}'"
    git config alias.scratch-restore \
      "!f(){ git restore --source=\"${1:-stash@{0}}\" -- \"${2:?path}\"; }; f"
    ```
    
    `git scratch path/to/scratch.md`で即スナップショット、`git scratch-diff`で直近比較、`git scratch-restore`で復帰ね。
    
*   **誤プッシュの物理封じ**
    
    ```bash
    # worktree側ではリモート自体を未設定に
    git remote remove origin 2>/dev/null || true
    git config --unset branch.main.remote 2>/dev/null || true
    ```
    

含意: “AIに任せた生原稿は、**一時的に強く握って、用が済んだら潔く捨てる**”設計にすると、メインの心拍数が上がらないわ。次は、どの運用を常用にするか決めて、必要なら**スクリプト化**まで落としていくといい。

## PROMPT 2

サイドカーrepoを柔軟に管理するスクリプトの構成を考えよう

## RESPONSE 2

事実
==

**目的**  
サイドカーRepo（本体とは別の`.git-scratch`で特定ディレクトリだけ版管理する仕組み）を、**ローカル限定・誤プッシュ不可・即席スナップショット中心**で回すスクリプト構成が要るわ。Gitは`--git-dir`と`--work-tree`の分離実行を標準で持つため、**別Repoを同一ワークツリー上に重ねる**運用が可能よ。

**要件**  
即時スナップショット、対象のディレクトリ（例：`scratch/`）限定トラッキング、履歴閲覧と差分、任意リビルド（restore）、保持数/期間による**ローカルだけのGC/Prune**、誤操作防止（無リモート/lock）を備える必要があるわ。加えて、複数プロジェクトで共通UIを使い回したいから、**XDG配下に設定とメタデータ**を置くと移植性が上がるでしょう。

**前提メカニクス**  
`git --git-dir=.git-scratch --work-tree=. init`で“別のGit”を作れる。以後は`git --git-dir=.git-scratch --work-tree=.`をラップする関数`G`からすべてのGit操作を呼ぶだけで、**本体Repoとは完全分離**の履歴になるわ。

___________

推測（示唆）
======

**方針**  
中核は**単一のPOSIXシェルスクリプト**で十分よ。`sgit`の1ファイルに、`init/snap/diff/log/restore/prune/gc/archive/ls`の**小さなサブコマンド**を持たせれば、学習コストが最小で運用の自由度が高いわ。Bash依存を避けたい場面がなければ`bash`でよいわ。根拠は、外部依存（jq/py/yq）を切るほど持ち運びが効くから。

**設計の肝**

1.  **明示ターゲット**：`SCR_DIR`（既定`scratch/`）配下だけを対象にする。誤追跡を物理的に防ぐ。
    
2.  **ロックと原子性**：`flock`で`.git-scratch/lock`を取ってから操作する。AI生成が並行しても壊れない。
    
3.  **保持戦略**：`--keep N`または`--days D`で`prune`し、古いコミットを`archive/`へ書き出してから削除する。安全網を1枚入れる。
    
4.  **無リモート運用**：`origin`は作らず、`receive.denyCurrentBranch=refuse`など念押し設定で**誤プッシュを構造的に不可能**にする。
    

___________

コマンド設計（CLI仕様）
-------------

*   `sgit init [--dir scratch] [--gitdir .git-scratch]`  
    サイドカーRepoを初期化。`SCR_DIR`配下に`.scratchgitignore`を作成。
    
*   `sgit snap <path|-> [-m msg] [--space NAME] [--stage-only]`  
    即時スナップショット。`-`でstdin→`SCR_DIR/stream-YYYYMMDD.md`へ。
    
*   `sgit diff [<rev> [-- path]]`  
    直近または指定コミットの差分表示。
    
*   `sgit log [--oneline] [-- path]`  
    履歴を軽量に確認。`-- path`で対象絞り込み。
    
*   `sgit restore <rev> -- <path>`  
    指定リビジョンの内容を作業ツリーへ復元。
    
*   `sgit ls`  
    `SCR_DIR`配下の追跡ファイル一覧。
    
*   `sgit prune [--keep 200] [--days 30] [--archive out/dir]`  
    保持基準を満たさない履歴をアーカイブしてから削除。
    
*   `sgit gc`  
    `git gc --prune=now`を安全に実行。
    
*   `sgit status`  
    サイドカー視点のステータス。
    

用語：**space**は論理グループ（例：`scratch/prompts/`や`scratch/notes/`）。コミットメッセージに`[space:NAME]`を刻んで検索を速くするわ。

___________

ファイル構成（最小）
----------

```
project-root/
  .git/                     # 本体Repo
  .git-scratch/             # サイドカーRepo（メタのみ）
  scratch/                  # 管理対象（md他）※本体からは.gitignore
  .scratchgitignore         # サイドカー専用ignore
  .config/scratchgit.env    # プロジェクト個別設定（任意）
  sgit                      # ← このスクリプト（PATHに置いても可）
```

`.scratchgitignore`の例：

```
# バイナリ封じ
*.png
*.jpg
*.zip
# 大きい生成物封じ
cache/
out/
```

___________

スクリプト骨子（Bash, ざっくり）
-------------------

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

# ---- Defaults ----
SCR_DIR="${SCR_DIR:-scratch}"
GIT_DIR="${SCR_GITDIR:-.git-scratch}"
WORK_TREE="${WORK_TREE:-.}"
CFG_FILE="${CFG_FILE:-.config/scratchgit.env}"

die(){ echo "error: $*" >&2; exit 1; }

load_cfg(){ [[ -f "$CFG_FILE" ]] && set -a && . "$CFG_FILE" && set +a || true; }

G(){ git --git-dir="$GIT_DIR" --work-tree="$WORK_TREE" "$@"; }

ensure_repo(){
  [[ -d "$GIT_DIR" ]] || G init
  # 安全設定（誤プッシュ封じ + 履歴保持明瞭化）
  G config core.autocrlf false
  G config remote.origin.url >/dev/null 2>&1 && die "originが存在するわ、削除して"
  G config receive.denyCurrentBranch refuse
  G config gc.pruneExpire now
  [[ -f ".scratchgitignore" ]] || : > .scratchgitignore
  mkdir -p "$SCR_DIR"
}

lock(){
  exec 9>"$GIT_DIR/.sgit.lock"
  flock -w 5 9 || die "lock取得に失敗したわ"
}

cmd_init(){ ensure_repo; echo "initialized: $GIT_DIR ($SCR_DIR)" ; }

commit_msg(){
  local msg="${1:-}"
  local space="${SPACE:-}"
  local ts; ts="$(date +%F_%T)"
  [[ -n "$space" ]] && echo "[space:$space] $ts ${msg}" || echo "$ts ${msg}"
}

cmd_snap(){
  local target="${1:-}"; shift || true
  local msg=""; SPACE=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -m) msg="$2"; shift 2;;
      --space) SPACE="$2"; shift 2;;
      --stage-only) STAGE_ONLY=1; shift;;
      *) die "unknown opt: $1";;
    esac
  done
  ensure_repo; lock

  if [[ "$target" == "-" ]]; then
    mkdir -p "$SCR_DIR"
    target="$SCR_DIR/stream-$(date +%Y%m%d-%H%M%S).md"
    cat > "$target"
  fi
  [[ -e "$target" ]] || die "見つからない: $target"
  G add -N -- "$target" >/dev/null 2>&1 || true
  G add -- "$target"
  if [[ "${STAGE_ONLY:-0}" -eq 1 ]]; then
    echo "staged: $target"; exit 0
  fi
  G commit -m "$(commit_msg "$msg")" || echo "no changes"
}

cmd_diff(){ ensure_repo; G diff "${1:-HEAD}" -- "${2:-$SCR_DIR}"; }

cmd_log(){ ensure_repo; G log --decorate --graph --oneline -- "${1:-$SCR_DIR}"; }

cmd_restore(){
  local rev="${1:?revが必要よ}"; shift
  [[ "${1:-}" == "--" ]] || die "restoreは'-- path'が要るわ"
  shift
  ensure_repo; lock
  G restore --source="$rev" -- "$@"
}

cmd_ls(){ ensure_repo; G ls-files "$SCR_DIR"; }

cmd_prune(){
  ensure_repo; lock
  local keep=0 days=0 archive=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --keep) keep="$2"; shift 2;;
      --days) days="$2"; shift 2;;
      --archive) archive="$2"; shift 2;;
      *) die "unknown opt: $1";;
    esac
  done
  [[ -n "$archive" ]] && mkdir -p "$archive"
  # 1) 古いコミットのOID列挙（簡易: days優先）
  if (( days > 0 )); then
    mapfile -t olds < <(G rev-list --max-age="$((days*24*3600))" --all -- "$SCR_DIR" || true)
  else
    mapfile -t revs < <(G rev-list --all -- "$SCR_DIR" || true)
    if (( ${#revs[@]} > keep && keep > 0 )); then
      olds=("${revs[@]:keep}")
    else
      olds=()
    fi
  fi
  # 2) アーカイブしてタグ外し（簡易実装）
  for r in "${olds[@]:-}"; do
    if [[ -n "$archive" ]]; then
      G archive "$r" "$SCR_DIR" | gzip > "$archive/$r.tar.gz" || true
    fi
  done
  # 3) 到達不能化→gc
  G reflog expire --expire=now --expire-unreachable=now --all
  G gc --prune=now || true
  echo "pruned $((${#olds[@]:-0})) rev(s)"
}

cmd_gc(){ ensure_repo; lock; G gc --prune=now; }

cmd_status(){ ensure_repo; G status --porcelain=v2 --ignored; }

main(){
  load_cfg
  sub="${1:-}"; shift || true
  case "$sub" in
    init) cmd_init "$@";;
    snap) cmd_snap "$@";;
    diff) cmd_diff "$@";;
    log) cmd_log "$@";;
    restore) cmd_restore "$@";;
    ls) cmd_ls "$@";;
    prune) cmd_prune "$@";;
    gc) cmd_gc "$@";;
    status) cmd_status "$@";;
    ""|help|--help|-h)
      cat <<USAGE
sgit <subcommand> [...]

  init                   初期化
  snap <path|-> [-m M]   即時コミット（stdin可）
  diff [rev] [-- path]   差分
  log [-- path]          履歴
  restore <rev> -- path  復元
  ls                     管理対象一覧
  prune [--keep N|--days D] [--archive DIR]
  gc                     ガベコレ
  status                 状態
USAGE
      ;;
    *) die "unknown subcommand: $sub";;
  esac
}
main "$@"
```

**運用例**

1.  初期化：`./sgit init`。
    
2.  取り込み：`./sgit snap scratch/ai-draft.md -m "段落整理" --space prompts`。
    
3.  差分確認：`./sgit diff`、履歴：`./sgit log -- scratch/ai-draft.md`。
    
4.  復元：`./sgit restore HEAD~2 -- scratch/ai-draft.md`。
    
5.  整理：`./sgit prune --keep 200 --archive .scratch-archive`。
    

___________

最低限のガード
-------

*   本体Repoの`.gitignore`に`scratch/`を必ず追加すること。二重追跡は破滅だから。
    
*   `origin`は作らない。`sgit init`で**存在したらエラー終了**にしているわ。
    
*   並行書き込みは`flock`で封じている。AI出力を複数タスクで吐く時も安全よ。
    

___________

発展（任意）
------

*   **暗号化**：`filter.scratch.clean/smudge + age`で透過暗号化もできる。これは別プラグイン`sgit-enc`に切り出すのが筋ね。
    
*   **テンプレ**：`sgit snap -`時にテンプレートを差し込む`--template 名前`。
    
*   **タグ付け**：`sgit tag-add key:value -- path`で`git notes`/footersへメタ付与。
    
*   **pre-snapフック**：`hooks/pre-snap`を呼んでlintや整形を挟む。
    

___________

次の一手は**この骨子を貼って即運用**よ。足りないのは`notes/tag`系と`template`くらいね。欲しいなら、その2つを追加して仕上げるわ。

## PROMPT 3

.gitignoreには触れたくないので、excludeに自動的に追加するようにしようかな

## RESPONSE 3

事実
==

**方針**  
`.gitignore`を触らずに本体Repoから`scratch/`や`.git-scratch/`を隠すなら、**リポジトリローカルの除外ファイル**`.git/info/exclude`に自動追記するのが最短よ。これはローカル専用で履歴にもリモートにも載らないわ。初期化(`sgit init`)時に**冪等**で追記、必要なら個別コマンドでON/OFFできるようにしておくと運用が軽いでしょう。

**設計ポイント**

1.  `ensure_exclude()`で`.git/info/exclude`に`scratch/`と`.git-scratch/`を**存在しなければ行単位で追記**。
    
2.  `check_tracked()`で`git ls-files scratch`を見て、**すでに追跡済みなら警告**（後述の2択で解決）。
    
3.  CLIに`protect on|off|status`を追加。`init`では既定で`protect on`を呼ぶ。
    
4.  追記確認は`git check-ignore -v scratch/foo.md`で即時検証できるわ。
    

**スクリプト差分（Bash）**  
既存の`sgit`骨子に、これだけ足せば動くわ。

```bash
# ---- exclude helpers ----
exclude_file(){ echo ".git/info/exclude"; }

ensure_exclude(){
  local ef; ef="$(exclude_file)"
  mkdir -p "$(dirname "$ef")"
  touch "$ef"
  add_line(){
    local pat="$1"
    grep -qxF "$pat" "$ef" 2>/dev/null || printf '%s\n' "$pat" >> "$ef"
  }
  add_line "$SCR_DIR/"
  add_line ".git-scratch/"
}

remove_exclude(){
  local ef; ef="$(exclude_file)"
  [[ -f "$ef" ]] || return 0
  tmp="${ef}.tmp.$$"
  grep -vxF "$SCR_DIR/" "$ef" | grep -vxF ".git-scratch/" > "$tmp" || true
  mv "$tmp" "$ef"
}

check_tracked(){
  # 追跡済みがあるか（本体Repo視点）
  if git ls-files -- "$SCR_DIR" >/dev/null 2>&1 && [[ -n "$(git ls-files "$SCR_DIR")" ]]; then
    echo "warn: '$SCR_DIR' に既に追跡中のファイルがあるわ" >&2
    return 1
  fi
  return 0
}

cmd_protect(){
  case "${1:-status}" in
    on)  ensure_exclude; echo "exclude: enabled for '$SCR_DIR/' and '.git-scratch/'";;
    off) remove_exclude; echo "exclude: disabled";;
    status)
      ef="$(exclude_file)"
      if [[ -f "$ef" ]] && grep -q "$SCR_DIR/\|\.git-scratch/" "$ef"; then
        echo "exclude: enabled ($ef)"; else echo "exclude: disabled"; fi
      ;;
    *) echo "usage: sgit protect [on|off|status]"; return 2;;
  esac
}

# initの最後に追記
cmd_init(){
  ensure_repo
  ensure_exclude
  if ! check_tracked; then
    echo "hint: すぐ隠したいなら 'sgit detox --skip-worktree' を使いなさい" >&2
  fi
  echo "initialized: $GIT_DIR ($SCR_DIR) with exclude"
}

# 追跡済みを即座に静音化（コミット不要）
cmd_detox(){
  case "${1:-}" in
    --skip-worktree)
      mapfile -t tracked < <(git ls-files "$SCR_DIR" || true)
      ((${#tracked[@]})) || { echo "no tracked files under $SCR_DIR"; return 0; }
      printf '%s\0' "${tracked[@]}" | xargs -0 git update-index --skip-worktree --
      echo "applied skip-worktree to ${#tracked[@]} file(s)"
      ;;
    --assume-unchanged)
      mapfile -t tracked < <(git ls-files "$SCR_DIR" || true)
      ((${#tracked[@]})) || { echo "no tracked files under $SCR_DIR"; return 0; }
      printf '%s\0' "${tracked[@]}" | xargs -0 git update-index --assume-unchanged --
      echo "applied assume-unchanged to ${#tracked[@]} file(s)"
      ;;
    *)
      echo "usage: sgit detox [--skip-worktree|--assume-unchanged]"; return 2;;
  esac
}
```

**使い方の流れ**

1.  初期化：`./sgit init` → `.git/info/exclude`に自動追記されるわ。
    
2.  動作確認：`git check-ignore -v scratch/test.md` → どの除外規則が効いたか出る。
    
3.  既に追跡済みだった場合：`./sgit detox --skip-worktree`で**即非表示化**（コミット不要）。
    
4.  必要なら解除：`./sgit protect off`で`.git/info/exclude`から削除できる。
    

___________

推測（示唆）
======

**運用の選択肢**

*   一度も`scratch/`を追跡させない前提なら、`init → ensure_exclude`だけで完結よ。これが最もクリーン。
    
*   既に履歴に入っている場合は、**履歴を汚さず即黙らせたい**なら`skip-worktree`、**根本から追跡を外したい**なら`git rm -r --cached scratch && git commit`しかないわ。後者は1回だけ履歴に残るけど、将来の事故率は最小になる。
    

**小さな含意**

*   `skip-worktree`は「今後の変更を本体Repoが見ない」フラグよ。マージ衝突検知が落ちる副作用があるから、**scratch専用**に限定して使うのが筋だわ。
    
*   `.git/info/exclude`はローカル専用だから、**メンバー間の足並みを揃える必要があるなら**、`sgit protect on`をセットアップ手順に入れておくと摩擦が消えるでしょう。
    
*   さらに厳密にやるなら、`sgit status`で**本体側の追跡漏れチェック**（`git ls-files scratch`が空か）を毎回出すのも良い監視よ。
    

次は、`protect`と`detox`を本体の`init`パスに繋ぎ込んで、**初回から人間に考えさせない**流れに仕上げるわ。テンプレが要るなら、`sgit init --dir notes`みたいにディレクトリ名を変えられるように拡張しましょう。

## PROMPT 4

こういうシェルスクリプト自体をうまく管理するのってどうすればいい？

## RESPONSE 4

事実
==

**課題の芯**  
ツール系のシェル（例: `sgit`）は、プロジェクト本体とは独立に**配布・更新・ロールバック**できないと運用が腐るわ。実体は1ファイルでも、現実には「配置（PATH）」「設定（XDG）」「テスト（lint/UT/E2E）」「配布チャネル（ローカル/社内/公開）」の4点が要になる。ここを押さえると、“どこからでも同じコマンドが同じように動く”前提が作れる。次に、最小構成を1つに絞って設計すると迷わない。

**基礎アーキテクチャ**  
単一リポジトリ（仮名 `toolbox`）に**bin, lib, completions, test**を切り、XDG（`$XDG_CONFIG_HOME/toolbox`）に**設定**、XDG（`$XDG_STATE_HOME/toolbox`）に**キャッシュ/自己更新メタ**を置くわ。スクリプトは**自己位置解決**（`readlink -f "$0"`系）で`lib/`を読み込み、プロジェクトローカルのオーバーライド（`./.tools/bin/sgit`）があれば**それを優先**する。含意は“グローバル既定 + ローカル上書き”の二層で、衝突なく配れるということ。

**配布チャネルの現実解**  
配布は3通りに分かれる。①**ローカルdotfiles配布**（`~/bin`へsymlink）…最速・手軽。②**miseプラグイン**（ユーザが`mise`文化なら親和性高）…バージョン固定・切替が容易。③**Homebrew私設tap**…社内/複数端末へ安全に配るのに向く。どれもリモートを切れば完全ローカルにもできる。更新フローは**タグ→アーティファクト→install**に寄せると壊れにくい。

**品質ゲート**  
静的: `shellcheck` と `shfmt -i 2 -ci -sr` を強制。動的: `bats`（ユニット＋擬似E2E）で**一時ディレクトリ上に仮Gitリポジトリ**を起こし、`exclude`や`gc`の副作用まで検証する。CIは**bash/zsh/dash行列**で回すと移植性が担保できる。リリースは`make dist`で**単一ファイルの実行物 + SHA256**を出し、`--version`は**埋め込みバージョン**（`git describe`フォールバック）を返す。

**安全と巻き戻し**  
自己更新を持たせるなら、**署名/ハッシュ検証**と**前バージョン退避**（`$XDG_STATE_HOME/toolbox/backup/`）が要る。だがbrew/mise配布なら自己更新は不要。壊れた時の**即時復帰**は“前バージョンを`PATH`の手前に置く”だけで済む。設計を“再インストール容易”に寄せるほど復旧は速いわ。

___________

推測（示唆）
======

**運用の核（私見）**  
あなたの環境なら、**mise + ローカル上書き**の二段構えが最も筋が良いわ。理由は3つ。1) miseで**バージョン固定**が楽、CI再現性も高い。2) プロジェクト直下の`.tools/bin`で**一時的な実験版**を安全に差し替えられる。3) “AIが吐いた当座の修正”を**本体Repoの履歴に触れず**流せる。公開配布やチーム共有が増えたら、そこに**私設brew tap**を足すと伸び代が出るでしょう。

**最小のディレクトリ設計**  
単刀直入に、これで足りるわ。

```
toolbox/
  bin/sgit                 # 単一実行ファイル（lib読み込み可）
  lib/sgit/*.sh            # 小粒な関数群（io, fs, git, xdg, lock）
  completions/{bash,zsh,fish}/sgit
  test/sgit.bats           # mktemp上で仮gitを起こすE2E
  Makefile                 # lint, test, dist, install
  .editorconfig
  .shellcheckrc
  .pre-commit-config.yaml
```

プロジェクト側は`.tools/bin/sgit`を置けば**即ローカル優先**。`PATH`は`./.tools/bin:$HOME/.local/bin:$PATH`の順にするだけ。

**Makefileの芯（短縮版）**

```make
SHELL := /usr/bin/env bash
BIN    = bin/sgit
DIST   = dist/sgit
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo 0.0.0)

.PHONY: lint test dist install
lint:
	shfmt -d -i 2 -ci -sr $(BIN) lib || (echo "shfmt fix with: shfmt -w"; exit 1)
	shellcheck -x $(BIN)

test:
	bats -r test

dist: lint test
	mkdir -p dist
	sed "s/^VERSION=.*/VERSION='$(VERSION)'/" $(BIN) > $(DIST)
	chmod +x $(DIST)
	shasum -a 256 $(DIST) > $(DIST).sha256

install: dist
	install -d $(HOME)/.local/bin
	install -m 0755 $(DIST) $(HOME)/.local/bin/sgit
```

**`sgit` ヘッダ骨子（要点だけ）**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail; IFS=$'\n\t'
: "${XDG_CONFIG_HOME:=$HOME/.config}"
: "${XDG_STATE_HOME:=$HOME/.local/state}"
VERSION='0.0.0'  # make distで上書き
SELF="$(readlink -f "$0" 2>/dev/null || python3 - <<'PY'
import os,sys; print(os.path.abspath(sys.argv[1]))
PY
 "$0")"
SELF_DIR="$(cd "$(dirname "$SELF")" && pwd)"
LIB_DIR="${LIB_DIR:-$SELF_DIR/../lib/sgit}"

# ローカルオーバーライド優先
if [[ -x "./.tools/bin/sgit" && "$SELF" != "$(readlink -f ./.tools/bin/sgit 2>/dev/null || echo)" ]]; then
  exec "./.tools/bin/sgit" "$@"
fi

# lib読込み
for f in io.sh fs.sh git.sh xdg.sh lock.sh; do
  # shellcheck disable=SC1090
  . "$LIB_DIR/$f"
done

case "${1:-}" in
  --version) echo "sgit ${VERSION}"; exit 0;;
  # …サブコマンド分岐…
esac
```

**テストの核（`test/sgit.bats` 抜粋）**

```bash
setup() {
  TMP=$(mktemp -d); cd "$TMP"
  git init -q
  mkdir scratch
  git config user.name t; git config user.email t@t
  "$BATS_TEST_DIRNAME/../bin/sgit" init >/dev/null
}

@test "protect writes to .git/info/exclude" {
  run "$BATS_TEST_DIRNAME/../bin/sgit" protect status
  [[ "$output" == *"enabled"* ]]
  grep -q 'scratch/' .git/info/exclude
}

@test "snap tracks and commits a file" {
  echo hi > scratch/a.md
  "$BATS_TEST_DIRNAME/../bin/sgit" snap scratch/a.md -m t
  run "$BATS_TEST_DIRNAME/../bin/sgit" log -- scratch/a.md
  [[ "$output" == *"scratch/a.md"* ]]
}
```

**mise と brew を並立**

*   mise: `~/.config/mise/config.toml` に
    
    ```toml
    [tools]
    sgit = "0.3.1"  # GH releaseタグ名
    ```
    
    → カスタムプラグイン（`install`でリリースbin取得・検証）を薄く書けば済む。
    
*   brew: 私設tapに**単一ファイル式Formula**を置き、`sha256`を毎リリース更新。CIで`brew audit`を回すと事故が減る。
    

**自己更新は“要る時だけ”**  
ネット到達が常の環境なら**brew/miseに委ねる**のが正解。オフラインもあるなら`sgit self-update --file ./dist/sgit --sha256 …`の**手動反映**に限定しなさい。自動fetchは便利だけど、署名検証・TOFU・CA失効まで抱えると**過剰**よ。

**片付けの導線**

*   破壊的変更は**メジャー上げ** + `--doctor`で互換診断。
    
*   ロールバックは`PATH`先頭の`~/.local/bin/sgit-<prev>`へ切替。
    
*   使い捨て枝は`.tools/bin/sgit`を削除すれば即終了。メイン履歴は不変のまま。
    

___________

**結論と次の一歩**  
まずは`toolbox`を切って、**Makefile + bats + shfmt/shellcheck**の三点セットで“回る基盤”を作るのが近道よ。次にmiseプラグインか私設tap、どちらか1本だけ用意して**配布の穴**を塞ぐ。ここまで整えば、AIが吐くバリエーションを**ローカル上書きで即試し→良かったらタグ化**のループに入れるわ。欲しければ、brew Formula雛形とmiseプラグイン骨子も出す—すぐ貼れる程度に短くしてね。

## PROMPT 5

できればもっとシンプルな配布方法はない？一般的にどういうプラクティスがある？

## RESPONSE 5

事実
==

**現場の標準的な配布ベクトル**  
シェルスクリプトの配布はだいたい次の3系統に収束するわ。1) **ユーザー単位で`~/.local/bin`に単体ファイル**を置く、2) **プロジェクト同梱（vendor）+ PATH上書き**で“その場限りの固定版”を使う、3) **タグ固定URLからのダウンロード**（`curl`/`gh`）でバージョン明示。どれもCI不要で、更新とロールバックが単純よ。

**よくある最小レシピ**

1.  **単体ファイル → `~/.local/bin`**
    
    *   置く: `install -D -m 0755 ./sgit ~/.local/bin/sgit`
        
    *   有効化: シェルの`PATH`に`$HOME/.local/bin`を追加（1回だけ）
        
    *   更新: 同じ場所を上書き、または`sgit-0.3.1`に保存して**symlink切替**
        
2.  **プロジェクト同梱（vendor）**
    
    *   置く: `project/.tools/bin/sgit` を**リポジトリにコミット**
        
    *   使う: `direnv`や`make shell`で`PATH="./.tools/bin:$PATH"`を適用
        
    *   効能: プロジェクトごとに**バージョン固定**。チームでも再現性が高い
        
3.  **タグ固定のリモート取得**
    
    *   例（ハッシュ検証あり）:
        
        ```bash
        ver="0.3.1"
        url="https://…/releases/download/v${ver}/sgit"
        curl -sSL "$url" -o /tmp/sgit && echo "<sha256>  /tmp/sgit" | shasum -a 256 -c -
        install -D -m 0755 /tmp/sgit ~/.local/bin/sgit
        ```
        
    *   代替: `gh release download -p sgit -R <owner/repo> -t "v$ver"` → `install`
        

**一般プラクティス（小粒）**

*   **単体ファイル化**（ライブラリ内包 or `source`は自己位置解決）
    
*   **`--version`実装**と**CHANGELOG**（タグ基準）
    
*   **`shellcheck`/`shfmt`で静的チェック**、最低限の`bats`でE2E
    
*   **補完ファイル**は任意（`completions/…`を置くだけで良い）
    
*   **自己更新は持たせない**（壊れやすい）。更新は**再インストール**で十分よ。
    

___________

推測(示唆)
======

**最小で丈夫な二択（私見）**

*   **個人運用中心** → _単体ファイル + ~/.local/bin + symlink切替_ が一番壊れにくいわ。更新は「新バージョン名で保存→`ln -sf`で差し替え→元に戻すならリンクを戻す」だけ。
    
*   **プロジェクト単位で固定したい** → _vendor同梱 + `direnv`でPATH切替_ が綺麗でしょう。PRでツール改修も見える化されるし、環境差分も出にくい。
    

**根拠**  
どちらも**配布点が1か所**で、**インストール=コピー**に還元できるからよ。パッケージャ（brew/mise/asdf）は便利だけど、設定とメタが増える分だけ“壊れる場所”も増えるわ。

___________

具体レシピ（貼って終わるやつ）
---------------

### A) 個人：バージョン切替をシンボリックリンクで

```bash
# 初回
install -D -m 0755 ./dist/sgit-0.3.1 ~/.local/bin/sgit-0.3.1
ln -sfn ~/.local/bin/sgit-0.3.1 ~/.local/bin/sgit

# アップデート
install -D -m 0755 ./dist/sgit-0.4.0 ~/.local/bin/sgit-0.4.0
ln -sfn ~/.local/bin/sgit-0.4.0 ~/.local/bin/sgit   # 即切替

# ロールバック
ln -sfn ~/.local/bin/sgit-0.3.1 ~/.local/bin/sgit
```

### B) プロジェクト：vendor同梱 + direnv

```
repo/
  .tools/bin/sgit         # ← これをコミット
  .envrc                  # PATHを通す
```

`.envrc`:

```bash
export PATH="$(pwd)/.tools/bin:$PATH"
```

使う側は`direnv allow`するだけよ。CIも同じPATHで走るわ。

### C) タグ固定の“安全curl”

```bash
ver="0.3.1"
base="https://example.com/sgit/releases/download/v$ver"
curl -sSLO "$base/sgit" -O "$base/sgit.sha256"
shasum -a 256 -c sgit.sha256   # OKなら
install -D -m 0755 ./sgit ~/.local/bin/sgit
```

**ポイント**: “タグ固定URL + 事前公開のハッシュ”で**改竄耐性**を確保することね。

___________

小さなチェックリスト
----------

*   シバンは`/usr/bin/env bash`、`set -Eeuo pipefail`を先頭に。
    
*   依存コマンド（`git`, `flock`など）は**起動時チェック**してエラーを素直に出す。
    
*   **ログと終了コード**を整える（`-v/--quiet`、`--debug`で`set -x`）。
    
*   **PATHの優先順位**は「プロジェクト（`.tools/bin`）→個人（`~/.local/bin`）→システム」で決め打ち。
    

___________

含意: まずは**vendor**か**単体ファイル＋symlink**、どちらか1本に決めるのが早いわ。必要が出たら、その先にbrew/miseを足せばいい。次はあなたの配布対象を1つ選んで、上のレシピをそのまま流してみなさい。動いてから悩むほうが速いでしょう。

## PROMPT 6

命名を考えて。sgitは大仰で誤解を招く感じがする

## RESPONSE 6

事実
==

**要件**  
名前は「やってることが一目でわかる」「短い」「既存コマンドと衝突しない」が基本よ。`git-*`や`sgit`は**Git本体のサブコマンド風**に見えて誤解を招くわ。用途は“Markdown等の一時メモをサイドカーRepoでスナップショット管理”——ここを素直に出すのが得策ね。

**チェック方法**  
候補は衝突確認してから決めなさい。

```bash
# PATH衝突
type mdsnap 2>/dev/null || echo "ok: not found"
# 近似衝突（補完）
compgen -c | grep -E '^mdsnap$' || echo "ok: no close match"
```

発音しやすさ（2～3音節）、タイピングの癖、補完のしやすさも実用差になるわ。

___________

推測（示唆）
======

**方針**  
“Gitっぽさ”は引きつつ**別物**と明示するのが安全よ。私は**機能ベースの短名**を推すわ。以下、意味のわかりやすさと衝突の少なさで並べたわ。

第一候補（実用本命）
----------

*   **`mdsnap`**：_Markdown + snapshot_。短い、意味が直感的、補完もしやすいわ。
    
*   **`mdkeep`**：_Markdown + keep_。保持・保管のニュアンス。ログ寄りの運用ならこれね。
    
*   **`scrsnap`**：_scratch + snapshot_。対象がMDに限定されないならこっちが広いわ。
    
*   **`draftsnap`**：_draft + snapshot_。原稿ワークフローの雰囲気を素直に出す。
    
*   **`notesnap`**：_note + snapshot_。誰でも意味が取れる汎用性よ。
    

第二候補（少し抽象）
----------

*   **`sidepad`**：_sidecar + pad_。横に置くメモ帳。可愛いが機能は少し伝わりにくいわ。
    
*   **`sidekeep`**：_sidecar + keep_。保存主体の名前付け。
    
*   **`scrpad`**：_scratch + pad_。一時メモ感が強い。
    

避けたい系
-----

*   **`sgit`/`git-*`**：Gitの純正拡張と誤解されるわ。
    
*   **`jot`**：macOSに同名ユーティリティがある。衝突する。
    
*   **`scm`/`vc`**：意味が広すぎて埋もれるでしょう。
    

___________

実務での落としどころ
----------

1.  **個人運用中心なら**：`mdsnap` が最短よ。MD中心で使う限りブレないわ。
    
2.  **MD以外も撮りたいなら**：`scrsnap` にして拡張余地を残すと後悔しない。
    
3.  **プロジェクトごとに顔を変えたいなら**：**多名シンボリックリンク方式**が便利よ。
    
    ```bash
    # 単一スクリプトに名前だけ変えたリンクを生やす
    ln -s ~/.local/bin/snapper ~/.local/bin/mdsnap
    ln -s ~/.local/bin/snapper ~/.local/bin/scrsnap
    ```
    
    スクリプト側で`tool=$(basename "$0")`を見て既定値（`SCR_DIR`や既定サブコマンド）を切り替える設計にすると、“名前＝動作プリセット”になるわ。
    

___________

最終提案（短く決める）
-----------

*   **第一候補**: `mdsnap`
    
*   **第二候補**: `scrsnap`
    
*   **雰囲気重視の代替**: `draftsnap`
    

どれも短い、誤解しない、補完しやすい。私は`mdsnap`を推すわ。MDが主戦場なら、これで迷いは消えるでしょう。

## PROMPT 7

draftsnapかな。
で、このcliはコーディングエージェントにhelpを食わせてよしなに自動的に運用させたい。（一時mdを勝手に管理するように仕向けたい）

## RESPONSE 7

事実
==

**狙い**  
コーディングエージェントに `--help` を渡すだけで“読んで動ける”CLIにするなら、**機械可読のヘルプ**と**安定した入出力/終了コード**、**前提条件の自己解決（ensure）**が核になるわ。人間向け説明文は短く、機械向けは `--format=json` で出し分ける。各サブコマンドは**冪等**で、**変更なし=非エラー**を明示する必要があるでしょう。加えて `--json` 出力、`--dry-run`、`--quiet`、`--debug` を全コマンド共通で持たせると、エージェントが制御しやすいわ。

**実装原則**

1.  **前提の自己解決**：`draftsnap ensure` が `.git-scratch` 初期化、`scratch/` 作成、`.git/info/exclude` 追記、`flock` ロック検証までやる。
    
2.  **機械可読ヘルプ**：`draftsnap help --format=json` が**仕様メタ**を返す（引数・戻り・終了コード）。
    
3.  **統一JSON**：`--json` 時は `{status, code, data, warnings}` を必ず返す。`code` は終了コードと一致させる。
    
4.  **終了コード表**：`0=OK / 10=NO_CHANGES / 11=NOT_INITIALIZED / 12=LOCKED / 13=PRECONDITION_FAILED / 14=INVALID_ARGS` を固定。
    
5.  **出力の決まり**：標準出力=機械向け、標準エラー=人間向けログ。`--quiet` でstderrを黙らせる。
    

**人間向け `--help`（短文）**

```text
draftsnap — Sidecar snapshots for drafts (Markdown等の一時メモを安全に記録)

USAGE:
  draftsnap ensure                     # 初期化/前提を自己解決（冪等）
  draftsnap snap <path|-> [-m MSG]     # スナップショット（stdin対応: "-"）
  draftsnap log [-- path]              # 履歴表示
  draftsnap diff [REV] [-- path]       # 差分表示
  draftsnap restore <REV> -- <path>    # 復元（作業ツリーへ）
  draftsnap ls                         # 管理対象一覧
  draftsnap prune [--keep N|--days D]  # 古い履歴を整理（任意でアーカイブ）
  draftsnap status                     # 状態確認（本体Repoとサイドカー両方）
  draftsnap protect [on|off|status]    # .git/info/exclude の制御
  draftsnap help [--format=txt|json]   # ヘルプ出力（jsonは機械可読）

GLOBAL FLAGS:
  --json, --dry-run, --quiet, --debug

ENV:
  DRAFTSNAP_SCR_DIR=scratch  DRAFTSNAP_GIT_DIR=.git-scratch  DRAFTSNAP_WORK_TREE=.
EXIT CODES:
  0 OK, 10 NO_CHANGES, 11 NOT_INITIALIZED, 12 LOCKED, 13 PRECONDITION_FAILED, 14 INVALID_ARGS
```

**機械可読ヘルプ（抜粋）**

```json
{
  "name": "draftsnap",
  "version": "0.3.0",
  "globals": ["--json","--dry-run","--quiet","--debug"],
  "env": {
    "DRAFTSNAP_SCR_DIR": "string (default: scratch)",
    "DRAFTSNAP_GIT_DIR": "string (default: .git-scratch)",
    "DRAFTSNAP_WORK_TREE": "string (default: .)"
  },
  "exit_codes": {
    "0": "OK",
    "10": "NO_CHANGES",
    "11": "NOT_INITIALIZED",
    "12": "LOCKED",
    "13": "PRECONDITION_FAILED",
    "14": "INVALID_ARGS"
  },
  "commands": {
    "ensure": {
      "desc": "Initialize sidecar repo & exclude (idempotent).",
      "args": [],
      "returns": {"initialized": "bool", "excluded": "bool", "git_dir": "string", "scr_dir": "string"}
    },
    "snap": {
      "desc": "Snapshot file or stdin into sidecar repo.",
      "args": [
        {"name":"target","type":"string","required":true,"notes":"path or '-' for stdin"},
        {"name":"-m, --message","type":"string","required":false}
      ],
      "returns": {"commit":"string|null","path":"string","bytes":"int"},
      "notes": "No-op if content unchanged; returns code 10"
    }
  }
}
```

**JSON出力例**

```json
{"status":"ok","code":0,"data":{"commit":"a1b2c3d","path":"scratch/draft.md","bytes":921},"warnings":[]}
```

```json
{"status":"ok","code":10,"data":{"commit":null,"path":"scratch/draft.md","bytes":0},"warnings":["no changes"]}
```

**エージェント運用フロー（最小）**

1.  起動時に `draftsnap ensure --json`。`code==0` で続行、`11/13` は修復提案、`12` はリトライ待機よ。
    
2.  生成後はファイルごとに `draftsnap snap <path> -m "<reason>" --json`。`code==0` ならcommit, `10` はスキップ扱い。
    
3.  定期整理は `draftsnap prune --keep 200 --json` を1日1回。必要なら `--archive .scratch-archive` を併用。
    
4.  復元は `draftsnap restore <rev> -- <path> --json`。作業前に `status` で健全性を見るわ。
    

___________

推測（示唆）
======

**自動化の肝（私見）**  
“エージェントに `help` を食わせて任せる”なら、**仕様が嘘をつかない**ことがすべてよ。`ensure` の冪等性と、`snap` の **NO\_CHANGES=10** が効いて、エージェント側のループが安定するでしょう。ログはstderr、人間向け。機械はstdoutのJSONだけを読む—この分離が混線を止めるわ。

**最短の仕向け方**

*   **プロンプト指示テンプレ**（エージェント側に埋め込む一文）
    
    > “You control a CLI `draftsnap`. Always call `draftsnap ensure --json` once per session.  
    > For each created/edited markdown under the project, call `draftsnap snap <path> -m "<why>" --json`.  
    > Treat exit code 10 as success with no changes. Never parse stderr; only parse stdout JSON.”
    
*   **メッセージ定型**：`-m` は「目的 + 要約（<=80文字）」に統一。後からの検索が跳ねるわ。
    
*   **安全弁**：`--dry-run` を差し込めるようにし、初回は必ず `ensure` と `protect status` をログに出す。
    

**含意**  
ここまで決め打てば、エージェントは**前提の自己解決→差分だけ確定→ノイズなしJSON**の三拍子で勝手に回るわ。次は実装で `help --format=json` と `--json` 出力の骨を先に置き、コマンド本体を後追いで肉付けすれば、破綻せず伸ばせるでしょう。

## PROMPT 8

promptを返すサブコマンドも用意しよう。英語で、一時ドキュメントの管理の仕方を説明するもの（ツールの使い方を説明するもので、役割を管理に固定するものではない）

## RESPONSE 8

事実
==

**目的**  
`draftsnap`に**英語のプロンプト**を吐くサブコマンドを用意して、コーディングエージェントがそれを読めば“勝手に一時MDを良きに運用”できるようにするわ。プロンプトは**ツールの使い方の説明**に徹し、エージェントの役割を「管理者」に固定しない——ここが要件よ。

**設計**  
サブコマンドは`draftsnap prompt`。既定でテキスト、`--format=json|md`も受け付けるとエージェント実装が柔軟になるでしょう。本文は**オプション利用**を明示し、`ensure → snap → prune/restore`の流れ、`--json`出力の取り扱い、終了コード（`10=NO_CHANGES`）などを簡潔に示すわ。

___________

推測（示唆）
======

**方針**  
プロンプトは**短いルール+明確な入出力**で十分よ。冪等・標準出力にJSON・stderrは人間向けログ——これだけ守らせれば、エージェントは暴れないわ。まず貼って使える本文と、サブコマンド実装の骨を置くね。

___________

英語プロンプト（エージェントに渡す本文 / plain text）
---------------------------------

```
You may optionally use a CLI tool named “draftsnap” to manage temporary drafts (e.g., Markdown notes) in a sidecar Git repository. Your role is not fixed to “document manager”; use this tool only when it helps your current task.

Basic rules:
1) Once per session, run `draftsnap ensure --json`. It idempotently prepares a local sidecar repo, creates the scratch directory, and sets `.git/info/exclude`. Proceed only if it returns JSON with code 0.
2) When you create or edit a temporary draft under the configured scratch directory (default: `scratch/`), snapshot it with:
   `draftsnap snap <path> -m "<short reason>" --json`
   Treat exit code 0 as committed. Treat exit code 10 as “no changes” (still a success).
3) Parse only STDOUT as JSON (`--json`). Never parse STDERR; it is human-oriented logs.
4) To review or roll back, you may call:
   - `draftsnap log --json [-- <path>]` to list history,
   - `draftsnap diff [REV] --json [-- <path>]` to inspect changes,
   - `draftsnap restore <REV> -- <path> --json` to restore content into the working tree.
5) For periodic cleanup, you may run `draftsnap prune --keep 200 --json` (or `--days N`). Use it sparingly.
6) Do not modify `.gitignore`; drafts are excluded locally via `.git/info/exclude`. The tool never pushes to any remote.
7) If `draftsnap` is unavailable, continue your task without it; do not block.

Message convention for `-m`:
Use a terse “purpose: summary” style, e.g., `purpose: tighten outline`, so commits are searchable.

Return handling:
- Success with commit: `{"status":"ok","code":0,...}`
- Success with no changes: `{"status":"ok","code":10,...}`
- Precondition or lock errors are non-fatal to your overall task; you may retry later.

Example:
- Start: `draftsnap ensure --json`
- After writing `scratch/idea.md`: `draftsnap snap scratch/idea.md -m "purpose: refine intro" --json`

Use the tool when it reduces risk or friction; otherwise proceed normally.
```

___________

`draftsnap prompt` 実装スケッチ（Bash）
-------------------------------

```bash
# 追加: cmd_prompt（jqがあればJSON整形、なくてもtxtで返す）
cmd_prompt(){
  local fmt="txt"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --format) fmt="$2"; shift 2;;
      --format=*) fmt="${1#--format=}"; shift 1;;
      *) echo "usage: draftsnap prompt [--format=txt|md|json]" >&2; return 14;;
    esac
  done

  # 英語本文（上のプロンプトと同じ内容）
  read -r -d '' PROMPT_TXT <<'PROMPT'
You may optionally use a CLI tool named “draftsnap” to manage temporary drafts (e.g., Markdown notes) in a sidecar Git repository. Your role is not fixed to “document manager”; use this tool only when it helps your current task.

Basic rules:
1) Once per session, run `draftsnap ensure --json`. It idempotently prepares a local sidecar repo, creates the scratch directory, and sets `.git/info/exclude`. Proceed only if it returns JSON with code 0.
2) When you create or edit a temporary draft under the configured scratch directory (default: `scratch/`), snapshot it with:
   `draftsnap snap <path> -m "<short reason>" --json`
   Treat exit code 0 as committed. Treat exit code 10 as “no changes” (still a success).
3) Parse only STDOUT as JSON (`--json`). Never parse STDERR; it is human-oriented logs.
4) To review or roll back, you may call:
   - `draftsnap log --json [-- <path>]` to list history,
   - `draftsnap diff [REV] --json [-- <path>]` to inspect changes,
   - `draftsnap restore <REV> -- <path> --json` to restore content into the working tree.
5) For periodic cleanup, you may run `draftsnap prune --keep 200 --json` (or `--days N`). Use it sparingly.
6) Do not modify `.gitignore`; drafts are excluded locally via `.git/info/exclude`. The tool never pushes to any remote.
7) If `draftsnap` is unavailable, continue your task without it; do not block.

Message convention for `-m`:
Use a terse “purpose: summary” style, e.g., `purpose: tighten outline`, so commits are searchable.

Return handling:
- Success with commit: `{"status":"ok","code":0,...}`
- Success with no changes: `{"status":"ok","code":10,...}`
- Precondition or lock errors are non-fatal to your overall task; you may retry later.

Example:
- Start: `draftsnap ensure --json`
- After writing `scratch/idea.md`: `draftsnap snap scratch/idea.md -m "purpose: refine intro" --json`

Use the tool when it reduces risk or friction; otherwise proceed normally.
PROMPT

  case "$fmt" in
    txt|md|markdown)
      printf '%s\n' "$PROMPT_TXT"
      ;;
    json)
      if command -v jq >/dev/null 2>&1; then
        jq -Rn --arg content "$PROMPT_TXT" \
           '{name:"draftsnap-usage-prompt", language:"en", content:$content}'
      else
        # 最小JSON（簡易エスケープ: \ と " と 改行のみ）
        local esc=${PROMPT_TXT//\\/\\\\}
        esc=${esc//\"/\\\"}
        esc=${esc//$'\n'/\\n}
        printf '{"name":"draftsnap-usage-prompt","language":"en","content":"%s"}\n' "$esc"
      fi
      ;;
    *) echo "unsupported format: $fmt" >&2; return 14;;
  esac
}
```

**CLI仕様追加**

*   `draftsnap prompt [--format=txt|md|json]`：プロンプト本文を返す。既定`txt`。
    
*   エージェントに渡すなら`draftsnap prompt --format=json`が扱いやすいでしょう。
    

___________

含意: これで\*\*“helpを食わせるだけ”**の線に、**“目的別プロンプトをその場で供給”\*\*が加わるわ。まずはこのまま貼って動かし、必要なら`prompt --variant=brief|strict`を足して、短文化や厳格運用版に分岐させるといいでしょう。

## PROMPT 9

今の時点での仕様をまとめてみてくれる？

## RESPONSE 9

事実
==

ツール概要
-----

`draftsnap` は “一時ドキュメント（例: Markdown）を安全に記録するサイドカーGit” よ。既定では作業ツリー直下に`.git-scratch/`（サイドカーRepo）を作り、`scratch/`配下だけを追跡する。`.gitignore`は触らず、`.git/info/exclude`へ冪等に追加して本体Repoから隠すわ。

安全設計
----

`origin` 等のリモートは持たない。`receive.denyCurrentBranch=refuse` 等で誤プッシュを物理的に封じる。並行実行は`.git-scratch/.draftsnap.lock`で`flock`ロックする。変更なしは\*\*成功（コード10）\*\*として扱い、コマンドはすべて冪等よ。

入出力・終了コード
---------

標準出力は機械向け、標準エラーは人間向けログとする。`--json`時は`{"status","code","data","warnings"}`を必ず返す。終了コードは`0=OK / 10=NO_CHANGES / 11=NOT_INITIALIZED / 12=LOCKED / 13=PRECONDITION_FAILED / 14=INVALID_ARGS`でしょう。

環境変数（既定値）
---------

`DRAFTSNAP_SCR_DIR=scratch`、`DRAFTSNAP_GIT_DIR=.git-scratch`、`DRAFTSNAP_WORK_TREE=.`。必要なら上書きできる。

グローバルフラグ
--------

`--json`、`--dry-run`、`--quiet`、`--debug` を全サブコマンドで受け付ける。`--version`は埋め込みバージョンを返す。

サブコマンド仕様
--------

*   **ensure**: サイドカーの初期化を冪等に行う。`.git-scratch`作成、`scratch/`作成、`.git/info/exclude`追記、最低限のGit設定を行う。  
    返却は`{initialized:bool, excluded:bool, git_dir, scr_dir}`よ。
    
*   **snap `<path|->` \[-m MSG\]**: 対象ファイル（`-`でstdin）を追加・コミットする。変更がなければ**コード10**で“成功だがコミットなし”を返す。
    
*   **log \[-- path\]**: `scratch/`または指定パスの履歴を返す。`--json`で機械可読にする。
    
*   **diff \[REV\] \[-- path\]**: 指定リビジョン（既定`HEAD`）との差分を返す。`--json`で要約を返す。
    
*   **restore `<REV>` -- `<path>`**: 指定リビジョンの内容を作業ツリーに復元する。上書き前提なのでエージェントは自己責任で使うのが筋ね。
    
*   **ls**: サイドカーが追跡中の`DRAFTSNAP_SCR_DIR`配下のファイル一覧を返す。
    
*   **prune \[--keep N | --days D\] \[--archive DIR\]**: 古い履歴を整理する。必要なら`git archive`で退避してからGCする。
    
*   **gc**: `git gc --prune=now` を実行する。
    
*   **status**: 本体Repoとサイドカー両視点の健全性（初期化状態、ロック状態、exclude状態など）を返す。
    
*   **protect \[on|off|status\]**: `.git/info/exclude` に`<scr_dir>/`と`.git-scratch/`を冪等に追加・削除・確認する。
    
*   **detox \[--skip-worktree | --assume-unchanged\]**: 本体Repo側で既に追跡済みの`<scr_dir>`配下を“静音化”する。履歴を変えずに監視対象から外す動きよ。
    
*   **prompt \[--format=txt|md|json\]**: コーディングエージェント向けの**英語プロンプト**を返す。内容は`ensure→snap→prune/restore`の運用規則、`--json`の解釈、終了コードの扱いを短く定義する。
    
*   **help \[--format=txt|json\]**: 短い人間向けヘルプか、機械可読の仕様メタ（コマンド一覧・引数・戻り・終了コード）を返す。
    

典型フロー（エージェント）
-------------

1.  起動時に `draftsnap ensure --json` を1回実行する。
    
2.  一時MD生成や編集のたび `draftsnap snap scratch/XXX.md -m "purpose: summary" --json` を呼ぶ。
    
3.  定期的に `draftsnap prune --keep 200 --json` を実行する。必要時のみ `restore` を使うわ。
    

例: `snap` のJSON
---------------

```json
{"status":"ok","code":0,"data":{"commit":"a1b2c3d","path":"scratch/draft.md","bytes":921},"warnings":[]}
```

```json
{"status":"ok","code":10,"data":{"commit":null,"path":"scratch/draft.md","bytes":0},"warnings":["no changes"]}
```

___________

推測（示唆）
======

**使い勝手の肝**  
`ensure`の冪等性と`NO_CHANGES=10`の明確化で、エージェントは“いつ呼んでも壊れない”ループを回せるはずよ。`prompt`が英語で用途限定を宣言しているから、役割過固定にも陥りにくいでしょう。

**未決・次手**  
`diff/log/status`の`--json`スキーマを薄く固定しておくと、LLM側の実装が安定するわ。暗号化（`age` + clean/smudge）やテンプレ流し込み（`snap -`時の`--template`）は後置きでいい。まずはこの仕様で“回る”ことを最優先にしなさい。

