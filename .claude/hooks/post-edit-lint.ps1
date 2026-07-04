# PostToolUse hook: run ESLint on the edited TypeScript file.
# Receives the hook input JSON on stdin; complements the tsc hook in settings.json.
$j = [Console]::In.ReadToEnd() | ConvertFrom-Json
$f = $j.tool_input.file_path
if ($f -match '\.ts$') {
  npx eslint $f
}
