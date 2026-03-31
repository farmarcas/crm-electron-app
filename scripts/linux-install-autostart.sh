#!/usr/bin/env bash
# Ponto de partida para testar autostart XDG no Linux (mesmo efeito que configureOpenAtLogin em main.js).
# Incluído no pacote .deb/.rpm (extraFiles). Uso típico sem argumentos: corre a partir da pasta do app.
#
#   chmod +x linux-install-autostart.sh
#   ./linux-install-autostart.sh
#
#   ./linux-install-autostart.sh --remove

set -euo pipefail

readonly APP_ID="br.com.farmarcas.crm-electron-app"
readonly PRODUCT_NAME="CRM Radar"
readonly PREFERRED_EXE_BASENAME="crm-electron-app"

is_chromium_helper() {
  case "$1" in
    chrome-sandbox | chrome_crashpad_handler | chrome_crashpad_handler64 | *.so) return 0 ;;
  esac
  return 1
}

resolve_script_dir() {
  local src="${BASH_SOURCE[0]}"
  if command -v readlink >/dev/null 2>&1 && readlink -f / >/dev/null 2>&1; then
    src="$(readlink -f "$src")"
  elif command -v realpath >/dev/null 2>&1; then
    src="$(realpath "$src")"
  fi
  cd "$(dirname "$src")" && pwd
}

discover_main_executable() {
  local script_dir="$1"
  local self_basename
  self_basename="$(basename "${BASH_SOURCE[0]}")"

  local preferred="${script_dir}/${PREFERRED_EXE_BASENAME}"
  if [[ -f "$preferred" && -x "$preferred" ]]; then
    printf '%s' "$preferred"
    return 0
  fi

  local candidates=()
  local f
  while IFS= read -r -d '' f; do
    local bn
    bn="$(basename "$f")"
    [[ "$bn" == "$self_basename" ]] && continue
    [[ "$bn" == *.sh ]] && continue
    is_chromium_helper "$bn" && continue
    [[ -f "$f" && -x "$f" ]] || continue
    candidates+=("$f")
  done < <(find "$script_dir" -maxdepth 1 -type f -executable -print0 2>/dev/null)

  if [[ ${#candidates[@]} -eq 0 ]]; then
    echo "Erro: não foi encontrado executável na pasta: $script_dir" >&2
    return 1
  fi

  if [[ ${#candidates[@]} -eq 1 ]]; then
    printf '%s' "${candidates[0]}"
    return 0
  fi

  local best="" bestsize=-1
  for f in "${candidates[@]}"; do
    local sz
    if sz=$(stat -c%s "$f" 2>/dev/null); then
      :
    elif sz=$(stat -f%z "$f" 2>/dev/null); then
      :
    else
      sz=0
    fi
    if [[ "$sz" -gt "$bestsize" ]]; then
      bestsize=$sz
      best=$f
    fi
  done
  printf '%s' "$best"
}

usage() {
  echo "Uso: $0              instala autostart (deteta o binário na mesma pasta)" >&2
  echo "     $0 /caminho/app  força o executável (opcional)" >&2
  echo "     $0 --remove     remove o autostart do utilizador atual" >&2
}

if [[ "${1:-}" == "--remove" ]]; then
  desktop="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/${APP_ID}.desktop"
  rm -f "$desktop"
  echo "Autostart removido: $desktop"
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  exec_path="$1"
else
  script_dir="$(resolve_script_dir)"
  exec_path="$(discover_main_executable "$script_dir")" || exit 1
fi

if [[ ! -f "$exec_path" ]]; then
  echo "Erro: ficheiro não encontrado: $exec_path" >&2
  exit 1
fi

autostart_dir="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
mkdir -p "$autostart_dir"
desktop_path="${autostart_dir}/${APP_ID}.desktop"

if [[ "$exec_path" =~ [[:space:]\"\'\\] ]]; then
  escaped="${exec_path//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  exec_field="\"$escaped\""
else
  exec_field="$exec_path"
fi

{
  echo "[Desktop Entry]"
  echo "Type=Application"
  echo "Version=1.0"
  echo "Name=${PRODUCT_NAME}"
  echo "Exec=${exec_field}"
  echo "Terminal=false"
  echo "NoDisplay=false"
  echo "X-GNOME-Autostart-enabled=true"
} >"$desktop_path"

echo "Autostart instalado: $desktop_path"
echo "Executável: $exec_path"
