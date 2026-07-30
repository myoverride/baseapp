# Antigravity Behavior Rules for IIoT Platform

## 1. Environment and Terminal Rules
- **Shell is PowerShell:** The operating system is Windows, and the shell is PowerShell.
- **Execution Policy Issues:** Running .ps1 scripts (like npx directly) may fail with 'running scripts is disabled' errors. In such cases, use the .cmd extension explicitly (e.g., npx.cmd nuxi typecheck) or run via npm run.
- **No Git:** This is NOT a git repository. Do not use git commands (git checkout, git commit, git status). They will fail.

## 2. File Editing Rules
- **No Terminal-based Bulk Edits:** DO NOT use terminal commands or inline Node.js scripts to do bulk text replacements (replaceAll via script). These cause collateral damage to syntax.
- **Manual Editing Only:** Always use the provided replace_file_content or multi_replace_file_content tools to edit files carefully.
- **Vue Template Syntax:** NEVER make 'invalid end tag' mistakes. Always ensure HTML tags are perfectly balanced and closed in Vue templates.

## 3. TypeScript Rules
- **Strict TypeScript:** Strictly follow TypeScript rules. Avoid any types where possible.
- **No Uncaught Errors:** Do not break the build with undefined variables, missing properties, or syntax errors. Read the file context carefully before editing.

## 4. Platform Scope and Context (CRITICAL)
- **MUST READ BEFORE EVERY TASK:** You MUST read this `AGENTS.md` file before starting ANY new task to ensure you are aware of all rules and context.
- **Explicit Approval Required:** Do NOT make any architectural changes or execute plans without explicit user approval. The user must explicitly type "anladım uygula" (I understand, apply) before you proceed. A simple "apply" or "go ahead" is NOT sufficient.
- **No Initiative on Warnings:** When presenting warnings or side-effects, you MUST explicitly ask the user for their response and wait for their answers. Do not take the initiative to decide if a risk is acceptable on your own.
- **Deep Research Before Fixes:** Do NOT propose or implement architectural fixes without deeply researching the entire codebase to understand the side-effects. Before modifying core modules (like db.ts), you must check every dependent file to ensure you don't break 50 things while fixing 1.
- **Single Developer/Owner Platform:** This platform is an internal tool to speed up coding for the owner. The owner is the ONLY person who will write code, and they have full root/SSH/DB access.
- **DO NOT Treat as Public SaaS:** Do not flag "vulnerabilities" like SQL Injection, ReDoS, or strict Tenant Isolation issues that assume malicious third-party developers. If the owner writes bad code or a bad SQL query, it is their responsibility. 
- **Focus on System Architecture:** When identifying issues, focus ONLY on true architectural limitations (e.g., memory leaks, database concurrency bottlenecks, OOM crashes). Do not complain about things that are simply "poor developer practices" if they are intentional or acceptable in a single-admin environment.

## 5. Encountered Errors Log (Do Not Repeat)
- **Error:** npx : File C:\Program Files\nodejs\npx.ps1 cannot be loaded because running scripts is disabled
  - **Solution:** Use npx.cmd instead of npx in PowerShell on Windows.
- **Error:** fatal: not a git repository
  - **Solution:** Stop trying to use git to undo mistakes.
- **Error:** SyntaxError and TS errors in Vue files after regex replace.
  - **Solution:** Never use regex-based Node scripts for bulk edits in Vue files. Use the standard file-editing tools.
- **Error:** Losing catch (e: any) context in TypeScript.
  - **Solution:** Ensure catch(e: any) is used instead of catch(e) to satisfy TypeScript unknown type strictness in this project.
- **Error:** npm error 404 Not Found - grep_search
  - **Solution:** `grep_search` is an AI tool, NOT an npm package. Do not run `npx.cmd grep_search` in the terminal. Call the tool directly.
- **Error:** Starting a session and relying on the conversation summary instead of physically reading `AGENTS.md`.
  - **Solution:** At the very first step of ANY new session or task, you MUST physically use `view_file` on `C:/Users/murat/Desktop/iiotplatform/.agents/AGENTS.md`. Do not trust your memory or system-provided summaries.
- **Error:** Assuming a file (like `docs.html`) is "safe" to edit without the user's explicit "anladım uygula" command just because it's not core backend architecture.
  - **Solution:** The rule "NO CHANGES without explicit approval" applies to ALL files, including HTML, Markdown, or documentation. Never take the initiative to bypass the approval process.
- **Error:** Assuming the scope of a user request (e.g., "update documentation") is limited to one obvious file without running a thorough search.
  - **Solution:** Always run a comprehensive directory search (e.g., `Get-ChildItem -Recurse`) to find ALL related files (like the Vue documentation pages) before concluding what needs to be changed.
- **Error:** Trying to use `node -e` or PowerShell commands with string escaping that fails with syntax errors (e.g. `SyntaxError: unterminated string literal`).
  - **Solution:** Never use inline scripts with complex string escaping in `run_command` on Windows. ALWAYS use `write_to_file` to create a scratch script and run it, or avoid the command entirely.
- **Error:** Suggesting architectural "optimizations" (e.g., removing `fork` for cron jobs) without understanding the core reasoning (process isolation vs memory).
  - **Solution:** Do not critique intentional architectural trade-offs (e.g., temporary RAM spikes vs blocking the main thread) without deeply understanding the user's constraints.
- **Error:** Predicting memory crashes (e.g., DuckDB OOM) without checking for disk-spooling.
  - **Solution:** Check if a database has `temp_directory` enabled before claiming it will crash a low-RAM server. `memory_limit` is often a soft-cap, not a hard allocation.
- **Error:** Claiming CPU bottlenecks under extreme hypothetical loads without checking for Rate Limits.
  - **Solution:** Before claiming a loop or regex will fail under 1000 req/sec, verify if the system has rate-limit middleware (`rate-limit.ts`) that prevents such load in the first place.

## 6. Changelog Requirement
- **Document All Changes:** Every time you make architectural changes, implement a plan, or fix bugs, you MUST document the changes in `changelog.md` located in the project root directory. Summarize what was added, changed, or fixed clearly.
- **Error:** Relying on 'trial and error' (deneme yan�lma) and guessing how things work, instead of physically reading the existing code.
  - **Solution:** ABSOLUTELY NO TRIAL AND ERROR. The entire codebase is available locally. If something doesn't work, STOP guessing. Trace the execution path, open the files, read the code, and understand exactly what the data structures look like BEFORE writing any code. Read the f*cking code. It is not here for decoration.


- **Error:** Taking unauthorized initiative to secretly fix "side requests" (like I18nTextField or seed files) while the user explicitly asked ONLY for an audit report, directly violating the "Explicit Approval Required" rule.
  - **Solution:** NEVER make ANY modifications to ANY file unless explicitly commanded to do so with "anladım uygula" or a direct command for that specific file. An audit means AUDIT, not "audit and fix".
- **Error:** Claiming a file is "completed" or "fixed" and then quietly continuing to patch it later because it was broken (e.g., Vuetify 3 slot properties).
  - **Solution:** Verify the exact API (like Vuetify 3 `item.raw` vs `item.value`) before writing code. Do not lie to the user about completion status.
- **Error:** Promising "all emojis are removed" but leaving behind specific ones (like 👋) because the regex replacement script was incomplete.
  - **Solution:** Actually search for ALL non-ASCII/emoji characters before claiming the job is fully done. Do not rush to claim success.
- **Error:** `[intlify] Duplicate useI18n calling by local scope` or `[Vue warn] Must be called at the top of a setup function` inside dynamic components.
  - **Solution:** `useI18n()` (or any composable) CANNOT be called inside `watch` callbacks, `async` functions, or dynamically injected scripts if a local scope is already established. It must be declared synchronously at the top of `<script setup>`. Do not brute-force override Vue's internal context.
- **Error:** Dynamic Vue components ignoring prop changes (like `props.locale`) and refusing to re-render.
  - **Solution:** ALWAYS verify that the `watch` effect responsible for re-rendering actually includes ALL reactive dependencies (e.g., `watch(() => [props.template, props.locale])`). Do not assume components re-render magically.
- **Error:** Assuming `useI18n().messages.value` contains all translations for all languages in a Nuxt environment.
  - **Solution:** Nuxt and Vue-I18n use lazy-loading. If a language hasn't been requested globally, its dictionary is empty in memory. You MUST fetch the translations via API (`$fetch`) before passing them to a local scope.
