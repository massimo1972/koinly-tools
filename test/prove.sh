#!/bin/zsh
# Esegue le prove di Koinly Tools con JavaScriptCore del Mac (Node non serve): test/prove.sh [nome ...]
# Senza argomenti esegue tutte le prove di test/*.test.js.
cd "${0:a:h}/.." || exit 1
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
MODULI=(lettura report provenienza pratica detenzione ivaca sanzioni modelli costi banca estero etoro questionario xlsx-mini docx-mini)
if [ $# -gt 0 ]; then PROVE=($@); else PROVE=(${(f)"$(ls test/*.test.js | sed 's#test/##; s#\.test\.js##')"}); fi
TMP=$(mktemp -d); esito=0
for t in $PROVE; do
  { cat test/shim-jsc.js; for m in $MODULI; do echo 'module={exports:{}};'; cat $m.js; echo "__mod['../$m.js']=module.exports; __mod['./$m.js']=module.exports;"; done
    echo '(function(){'; cat test/$t.test.js; echo '})();'; } > $TMP/$t.js
  out=$($JSC $TMP/$t.js 2>&1); echo "== $t: $(echo $out | tail -1)"; echo $out | grep -q 'prove superate' || { echo $out | grep -v '^ok'; esito=1; }
done
rm -rf $TMP; exit $esito
