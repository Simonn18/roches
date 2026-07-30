#!/usr/bin/env bash
# roychec — pre-commit hook enforcing §8.1 §12 « ?v= cascade alignment »
# Cf. obsidian/_CLAUDE.md §8.1 §12 + obsidian/CRITICAL_FACTS.md [11:45] [12:00] 28/07.
#
# Rationale : when N importers load the same module X.js under different
# ?v= values (e.g. main.js + render.js load './account.js' as ?v=201 and ?v=210),
# the browser caches them as distinct URLs → 2 module instances → main.js
# initializes auth on the ?v=201 instance, render.js reads state from the
# ?v=210 instance → UI reads stale 'guest' state → « INVITÉ reste » symptom
# (cf. CRITICAL_FACTS [11:45] 28/07, 3e itération du bug v5.9.12/v5.9.15/v5.9.16).
#
# Scope MVP v1.6 : static + dynamic ES imports in game/src/*.js, multi-level
# paths, comment-line filter. Hors scope : asset query strings (v1.7 carry-over).
#
# Cette itération (post-thinker audit [12:30]) résout 3 bugs latents :
#   1. `drift_exit=$()` capturait stdout, pas exit code — IF unreachable.
#      Fix : redirect-then-check pattern (écrire dans $DRIFT_TMP, tester `[[ -s ]]`).
#   2. `awk -F'?v='` traitait `?` comme quantifier (illegal primary).
#      Fix : éliminer awk -F via split() interne index()+substr().
#   3. Multi-pipeline fragile (BSD sed \t escape, missing -n, greedy trailing).
#      Fix : single POSIX awk pass avec match() et \047 octal pour apostrophes.
#
# Usage :
#   bash scripts/check-cache-bust.sh
#   ou en pre-commit hook :
#   symlink .git/hooks/pre-commit → scripts/check-cache-bust.sh
#
# Exit codes :
#   0 = aligned (pas de drift détecté, ou game/src/ vide)
#   1 = drift détecté — imprime les fichiers cibles + versions en collision
#   2 = usage error (game/src/ introuvable, etc.)
#
# Compatible bash 3.2+ (BSD sed/grep/awk sur macOS). POSIX-compliant regex
# (\047 octal pour apostrophe, pas de \s GNU). Aucune dépendance externe
# (awk + sort + find + mktemp suffisent).

set -euo pipefail
cd "$(dirname "$0")/.."

[[ -d "game/src" ]] || { echo "[check-cache-bust] FATAL: game/src/ absent depuis $(pwd)" >&2; exit 2; }

WORK=$(mktemp -d -t check-cache-bust.XXXXXX 2>/dev/null || mktemp -d)
trap 'rm -rf "$WORK"' EXIT
TARGETS="$WORK/targets.tsv"
DRIFT="$WORK/drift.txt"

# Phase 1 : extraction (target version) paires via single POSIX awk pass.
# - Skip pure comment lines (`//` ou block `*` continuation).
# - Match imports statiques `from './X.js?v=N'` ET dynamiques
#   `import('../X/Y.js?v=N')` (multi-niveaux).
# - Strip leading relative-path segments `./` ou `../`.
# - Strip surrounding quotes via gsub.
# - Space-delimited output (filenames roychec n'ont pas d'espace).
find game/src -type f -name "*.js" -print0 \
  | xargs -0 awk '
    /^[[:space:]]*(\/\/|\*)/ { next }
    {
      src = $0
      # Match: quote, leading ./ or ../, path, .js?v=NNN, quote
      # [\047\042] char class = apostrophe OR double-quote, POSIX-safe.
      while (match(src, /[\047\042][.][.]?[\/][A-Za-z0-9_\/.-]+\.js\?v=[0-9]+[\047\042]/)) {
        m = substr(src, RSTART, RLENGTH)
        # Strip leading + trailing quote
        gsub(/^[\047\042]|[\047\042]$/, "", m)
        # Strip leading ./ or ../ segments (POSIX-safe char class [.])
        sub(/^([.][.]?[\/])+/, "", m)
        # Split at ?v=
        i = index(m, "?v=")
        if (i > 0) {
          print substr(m, 1, i-1) " " substr(m, i+3)
        }
        src = substr(src, RSTART + RLENGTH)
      }
    }
  ' | sort -u > "$TARGETS"

if [[ ! -s "$TARGETS" ]]; then
  echo "OK §8.1 §12 — aucun import JS ?v= détecté dans game/src/."
  exit 0
fi

# Phase 2 : drift detection via awk + redirect-then-check pattern (PAS
# d exit-code capture dans `$()`). Compteur multidimensionnel simulé via
# `count[target]` + `list[target]` concat (POSIX awk n a pas d arrays 2D).
awk '
  {
    target = $1
    version = $2
    key = target SUBSEP version
    if (!seen[key]++) {
      count[target]++
      list[target] = (list[target] == "" ? version : list[target] "," version)
    }
  }
  END {
    for (target in count) {
      if (count[target] > 1)
        printf "DRIFT  %-40s versions=%s\n", target, list[target]
    }
  }
' "$TARGETS" > "$DRIFT"

if [[ -s "$DRIFT" ]]; then
  echo "[check-cache-bust] FAIL §8.1 §12 — partial ?v= bump détecté :"
  cat "$DRIFT"
  echo
  echo "Remediation : aligner TOUS les importers sur le MÊME ?v=NNN via cascade BSD sed :"
  echo "  for f in game/src/*.js game/index.html; do"
  echo "    sed -i '' -E 's/\\?v=OLD/\\?v=NEW/g' \"\$f\""
  echo "  done"
  echo "Cf. obsidian/_CLAUDE.md §8.1 §12 + obsidian/CRITICAL_FACTS.md [11:45] [12:00] 28/07."
  exit 1
fi

n_targets=$(awk '{print $1}' "$TARGETS" | sort -u | wc -l | tr -d ' ')
echo "OK §8.1 §12 — ${n_targets} cible(s) unique(s) vérifiée(s) dans game/src/, pas de drift ?v=."
exit 0
