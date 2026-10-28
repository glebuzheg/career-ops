#!/bin/bash
# macOS Finder launcher; compatible with the system Bash 3.2.
set -e
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
cd -- "$(dirname -- "$0")"

finish_launch() {
  launch_code=$?
  if [ "$launch_code" -ne 0 ]; then
    printf '\nНе удалось запустить Career Ops (код %s). Подробности выше.\n' "$launch_code" >&2
    if [ -t 0 ]; then read -r -p 'Нажмите Enter, чтобы закрыть окно… ' || true; fi
  fi
  exit "$launch_code"
}
trap finish_launch EXIT

printf '\nCareer Ops — локальный запуск\n\n'
if ! command -v node >/dev/null 2>&1; then
  printf 'Сначала установите Node.js 24 LTS, затем снова откройте этот файл.\nhttps://nodejs.org/en/download\n' >&2
  if command -v open >/dev/null 2>&1; then open 'https://nodejs.org/en/download' || true; fi
  exit 1
fi
if ! node -e 'const [m,n]=process.versions.node.split(".").map(Number);process.exit(m>=24||(m===23&&n>=4)||(m===22&&n>=13)?0:1)'; then
  printf 'Нужен Node.js 24 LTS (или совместимый Node 22.13+/23.4+). Обновите Node.js.\n' >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  printf 'Не найден npm. Переустановите Node.js 24 LTS с https://nodejs.org/en/download\n' >&2
  exit 1
fi

dependencies_ready() {
  node -e 'const fs=require("node:fs"),p=require("node:path"),root=process.argv[1];const pkg=JSON.parse(fs.readFileSync(p.join(root,"package.json"),"utf8"));const names=Object.keys({...pkg.dependencies,...pkg.devDependencies});process.exit(names.every(n=>fs.existsSync(p.join(root,"node_modules",n,"package.json")))?0:1);' "$1"
}

if ! dependencies_ready .; then
  printf 'Устанавливаю зависимости Career Ops…\n'
  npm install --ignore-scripts --package-lock=false
fi
if ! dependencies_ready web; then
  printf 'Устанавливаю веб-интерфейс…\n'
  npm --prefix web ci --ignore-scripts
fi

printf '\nОткрываю интерфейс. Оставьте это окно открытым; Ctrl+C остановит сервер.\n'
# Reuse the existing launcher: loopback binding, port checks, browser readiness
# polling and shutdown stay in one place. No CV or config files are initialized.
node scripts/ui-server.mjs
