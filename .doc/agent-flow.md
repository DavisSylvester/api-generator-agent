# API Generator Agent — Flow Documentation

## 1. High-Level Pipeline Flowchart

```mermaid
flowchart TB
    START([START: PRD Input]) --> LOAD_ENV[Load .env + Config]
    LOAD_ENV --> INIT_DI[Initialize DI Container]
    INIT_DI --> INIT_TIERS{Fallback Tiers?}
    INIT_TIERS -->|OLLAMA_API_KEY| TIER1[Tier 1: qwen3-coder-next<br/>Ollama Cloud]
    INIT_TIERS -->|OPENAI_API_KEY| TIER2[Tier 2: GPT-5.4<br/>OpenAI]
    INIT_TIERS -->|ANTHROPIC_API_KEY| TIER3[Tier 3: Claude Sonnet 4.6<br/>Anthropic]
    TIER1 & TIER2 & TIER3 --> PLAN

    subgraph Planning["Phase 1: Planning"]
        PLAN{Cached Plan?}
        PLAN -->|Yes| LOAD_PLAN[Load from .plan-cache/]
        PLAN -->|No| GEN_PLAN[/"LLM Call: qwen3.5:27b (local)"\]
        GEN_PLAN --> PARSE_PLAN[Parse JSON Task Graph]
        PARSE_PLAN --> VALIDATE_GRAPH{Valid DAG?}
        VALIDATE_GRAPH -->|No cycle| CACHE_PLAN[Cache plan to disk]
        VALIDATE_GRAPH -->|Cycle detected| FAIL_PLAN([FAIL: Invalid graph])
        LOAD_PLAN --> EXEC
        CACHE_PLAN --> EXEC
    end

    subgraph Execution["Phase 2: Task Execution (Topological Order)"]
        EXEC[Execute Task Graph] --> FOREACH[For each task in dependency order]
        FOREACH --> FIX_LOOP_ENTRY[Enter Fix Loop]
        FIX_LOOP_ENTRY --> SEED_KB[/Seed Knowledge Base<br/>docs/knowledge-bases/taskId-knowledge.md/]
        SEED_KB --> FIX_LOOP
    end

    subgraph FixLoop["Fix Loop (per task, max N iterations)"]
        FIX_LOOP[Start Iteration] --> CODEGEN
        CODEGEN[/"LLM Call: CodeGen Agent<br/>(qwen3-coder-next cloud)"\]
        CODEGEN --> CODE_CHECK{Code blocks<br/>found?}
        CODE_CHECK -->|No| RETRY_CODEGEN[/"RETRY: Same LLM + <br/>'MUST output code blocks'"\]
        RETRY_CODEGEN --> CODE_CHECK2{Code blocks<br/>found?}
        CODE_CHECK2 -->|No| CODEGEN_FAIL[CodeGen Failed]
        CODE_CHECK2 -->|Yes| SANITIZE
        CODE_CHECK -->|Yes| SANITIZE

        SANITIZE[Code Sanitizer<br/>- Strip env.mts imports<br/>- Fix async .resolve<br/>- Convert static to await import<br/>- Add .as plugin<br/>- Replace .derive with .resolve]

        SANITIZE --> ESLINT[/"Tool: ESLint Agent<br/>Auto-fix lint errors"\]
        ESLINT --> IMPORT_VAL{Import Validation<br/>Check paths + exports}
        IMPORT_VAL -->|Errors| FIX_ERRORS[Collect import errors]
        FIX_ERRORS --> CIRCUIT{Circuit Breaker<br/>Same errors 5x?}

        IMPORT_VAL -->|Pass| COPY_DEPS[Copy shared output<br/>into task code dir]
        COPY_DEPS --> DELETE_STALE[Delete stale tests<br/>from code/tests/]
        DELETE_STALE --> DOCKER_MONGO[/"Tool: Docker<br/>Ensure MongoDB running<br/>on port 27018"\]
        DOCKER_MONGO --> QA[/"Tool: QA Agent<br/>bun test against real MongoDB"\]
        QA --> QA_PASS{Tests Pass?}
        QA_PASS -->|Yes| WRITE_OUTPUT[Write to shared output]
        QA_PASS -->|No| QA_ERRORS[Collect QA errors]
        QA_ERRORS --> CIRCUIT

        CIRCUIT -->|Not stuck| NEXT_ITER{More iterations?}
        CIRCUIT -->|STUCK 5x| CIRCUIT_BREAK([CIRCUIT BREAK])
        NEXT_ITER -->|Yes| FIX_LOOP
        NEXT_ITER -->|No| EXHAUSTED([Iterations Exhausted])

        WRITE_OUTPUT --> TASK_PASS([TASK PASSED])
    end

    subgraph Fallback["Fallback System"]
        EXHAUSTED --> FB_TIER2[/"LLM Call: GPT-5.4<br/>16 fresh iterations"\]
        CODEGEN_FAIL --> FB_TIER2
        FB_TIER2 --> FB2_PASS{Passed?}
        FB2_PASS -->|Yes| TASK_PASS2([TASK PASSED via GPT-5.4])
        FB2_PASS -->|No| FB_TIER3[/"LLM Call: Claude Sonnet 4.6<br/>16 fresh iterations"\]
        FB_TIER3 --> FB3_PASS{Passed?}
        FB3_PASS -->|Yes| TASK_PASS3([TASK PASSED via Sonnet])
        FB3_PASS -->|No| DIAGNOSTIC
    end

    subgraph DiagnosticMode["Diagnostic Mode"]
        DIAGNOSTIC[Collect all errors] --> DIAG_CALL[/"LLM Calls: ALL models<br/>Request root cause analysis"\]
        CIRCUIT_BREAK --> DIAGNOSTIC
        DIAG_CALL --> DIAG_SUMMARY[Summarize solutions]
        DIAG_SUMMARY --> DIAG_FIX[/"LLM Fix: 30 cycles per model<br/>with diagnosis context"\]
        DIAG_FIX --> DIAG_PASS{Solved?}
        DIAG_PASS -->|Yes| TASK_PASS4([TASK PASSED via Diagnostic])
        DIAG_PASS -->|No| HARD_FAIL([HARD FAILURE<br/>Exit code 2<br/>"Needs human help"])
    end

    TASK_PASS & TASK_PASS2 & TASK_PASS3 & TASK_PASS4 --> NEXT_TASK{More tasks?}
    NEXT_TASK -->|Yes| FOREACH
    NEXT_TASK -->|No| CLEANUP

    subgraph Cleanup["Phase 3: Cleanup"]
        CLEANUP[Stop MongoDB Docker] --> DOC_GEN[/"LLM Call: Documentation Agent"\]
        DOC_GEN --> RESULTS[Print Results]
        RESULTS --> EXIT_CODE{Hard Failures?}
        EXIT_CODE -->|None| EXIT_0([EXIT 0: Success])
        EXIT_CODE -->|Some failed| EXIT_1([EXIT 1: Partial])
        EXIT_CODE -->|Hard failure| EXIT_2([EXIT 2: Needs Human])
    end

    style HARD_FAIL fill:#ff4444,color:#fff
    style TASK_PASS fill:#44bb44,color:#fff
    style TASK_PASS2 fill:#44bb44,color:#fff
    style TASK_PASS3 fill:#44bb44,color:#fff
    style TASK_PASS4 fill:#44bb44,color:#fff
    style EXIT_0 fill:#44bb44,color:#fff
    style EXIT_2 fill:#ff4444,color:#fff
    style CIRCUIT_BREAK fill:#ff8800,color:#fff
    style DIAGNOSTIC fill:#ff8800,color:#fff
```

---

## 2. Sequence Diagram — Full Pipeline Run

```mermaid
sequenceDiagram
    actor User
    participant CLI as index.mts<br/>(Entry Point)
    participant DI as DI Container
    participant Planner as Planning Agent<br/>qwen3.5:27b (local)
    participant FixLoop as Fix Loop<br/>Orchestrator
    participant Codegen as CodeGen Agent
    participant LLM_Q as qwen3-coder-next<br/>(Ollama Cloud)
    participant LLM_G as GPT-5.4<br/>(OpenAI)
    participant LLM_C as Claude Sonnet 4.6<br/>(Anthropic)
    participant Sanitizer as Code Sanitizer
    participant ESLint as ESLint Agent
    participant Validator as Import/Export<br/>Validator
    participant Docker as Docker Engine
    participant MongoDB as MongoDB<br/>(Docker)
    participant QA as QA Agent
    participant KB as Knowledge Bases<br/>docs/knowledge-bases/
    participant Output as Shared Output<br/>.workspace/output/

    User->>CLI: bun run src/index.mts <prd> <iterations>
    CLI->>DI: loadEnv() + createContainer()
    DI-->>CLI: Container with agents + fallback tiers

    rect rgb(230, 240, 255)
        Note over CLI,Planner: Phase 1: Planning
        CLI->>Planner: generateTaskGraph(prdText)
        Planner->>LLM_Q: System: planning prompt<br/>User: PRD text
        LLM_Q-->>Planner: JSON task graph (12-29 tasks)
        Planner-->>CLI: TaskGraph + cache to disk
    end

    rect rgb(230, 255, 230)
        Note over CLI,Output: Phase 2: Task Execution (for each task)
        CLI->>FixLoop: runFallbackFixLoop(task)

        FixLoop->>KB: Read persistent knowledge<br/>{taskId}-knowledge.md
        KB-->>FixLoop: Knowledge context (if exists)

        loop Fix Iteration (max N)
            FixLoop->>Codegen: generate/fix code
            Codegen->>LLM_Q: System: codegen prompt + suffix<br/>User: task + deps + errors
            LLM_Q-->>Codegen: Fenced code blocks

            alt No code blocks returned
                Codegen->>LLM_Q: RETRY with "MUST output code blocks"
                LLM_Q-->>Codegen: Code blocks (or fail)
            end

            Codegen->>Sanitizer: Raw code files
            Note over Sanitizer: - Remove env.mts imports<br/>- Fix async .resolve()<br/>- Add .as('plugin')<br/>- Convert static→await import()<br/>- Strip type-only exports
            Sanitizer-->>FixLoop: Sanitized code files

            FixLoop->>ESLint: Lint + auto-fix
            ESLint-->>FixLoop: Linted code

            FixLoop->>Validator: Check imports + exports
            Validator-->>FixLoop: Validation result

            alt Validation errors
                Note over FixLoop: Check circuit breaker:<br/>Same errors 5x in a row?
                FixLoop-->>FixLoop: Continue to next iteration
            else Validation passes
                FixLoop->>Output: Copy dependency code into task dir
                FixLoop->>QA: Delete stale code/tests/*.test.mts

                QA->>Docker: Ensure qa-mongodb container running
                Docker->>MongoDB: Start mongo:latest on port 27018
                Docker-->>QA: MongoDB ready

                QA->>MongoDB: bun test (real CRUD operations)
                MongoDB-->>QA: Test results

                alt Tests pass
                    QA-->>FixLoop: PASS
                    FixLoop->>Output: Write code to shared output
                else Tests fail
                    QA-->>FixLoop: Errors + test output
                    QA->>KB: Append QA knowledge
                    Note over FixLoop: Check circuit breaker
                end
            end
        end

        alt Primary exhausted → Fallback
            FixLoop->>LLM_G: Tier 2: GPT-5.4 (16 fresh iters)
            LLM_G-->>FixLoop: Result

            alt GPT-5.4 fails
                FixLoop->>LLM_C: Tier 3: Claude Sonnet (16 fresh iters)
                LLM_C-->>FixLoop: Result
            end

            alt All tiers fail → Diagnostic Mode
                FixLoop->>LLM_G: Request diagnosis
                FixLoop->>LLM_C: Request diagnosis
                LLM_G-->>FixLoop: Root cause analysis
                LLM_C-->>FixLoop: Root cause analysis
                FixLoop->>LLM_G: Diagnostic fix (30 cycles)
                FixLoop->>LLM_C: Diagnostic fix (30 cycles)

                alt Diagnostic fails
                    FixLoop-->>CLI: HARD FAILURE
                end
            end
        end

        FixLoop-->>CLI: TaskState (passed/failed)
    end

    rect rgb(255, 240, 230)
        Note over CLI,Docker: Phase 3: Cleanup
        CLI->>Docker: docker rm -f qa-mongodb
        CLI->>User: Results + exit code (0/1/2)
    end
```

---

## 3. Swimlane Diagram — Component Responsibilities

```mermaid
flowchart TB
    subgraph UserLane["User / CLI"]
        U1([PRD + Config]) --> U2[Parse args]
        U2 --> U3[Start pipeline]
        U_END[Receive results<br/>Exit code 0/1/2]
    end

    subgraph OrchestratorLane["Orchestrator Layer"]
        O1[Load .env] --> O2[Create DI Container]
        O2 --> O3[Run Pipeline]
        O3 --> O4[Execute Task Graph<br/>Topological order]
        O4 --> O5[Fix Loop per task]
        O5 --> O6{Circuit Breaker<br/>Stuck 5x?}
        O6 -->|No| O5
        O6 -->|Yes| O7[Fallback Tiers]
        O7 --> O8{All tiers failed?}
        O8 -->|Yes| O9[Diagnostic Mode]
        O9 --> O10{Diagnostic solved?}
        O10 -->|No| O11([HARD FAIL])
        O10 -->|Yes| O12[Task Complete]
        O8 -->|No| O12
        O12 --> O4
    end

    subgraph LLMLayer["LLM Layer (3 Providers)"]
        L1[/"qwen3.5:27b<br/>(Local Ollama)<br/>Planning + QA"\]
        L2[/"qwen3-coder-next<br/>(Ollama Cloud)<br/>Primary CodeGen"\]
        L3[/"GPT-5.4<br/>(OpenAI API)<br/>Tier 2 Fallback"\]
        L4[/"Claude Sonnet 4.6<br/>(Anthropic API)<br/>Tier 3 Fallback"\]
    end

    subgraph AgentLayer["Agent Layer"]
        A1[Planning Agent] -->|Uses| L1
        A2[CodeGen Agent] -->|Primary| L2
        A2 -->|Fallback| L3
        A2 -->|Fallback| L4
        A3[ESLint Agent] -->|bun eslint| A3_T[ESLint CLI]
        A4[QA Agent] -->|bun test| A4_T[Bun Test Runner]
        A5[Documentation Agent] -->|Uses| L1
    end

    subgraph ToolLayer["Tools & Sanitizers"]
        T1[Code Sanitizer<br/>- env.mts removal<br/>- async .resolve fix<br/>- .as plugin injection<br/>- await import conversion<br/>- .derive→.resolve<br/>- barrel cleanup]
        T2[Import/Export Validator<br/>- Path resolution<br/>- Named export check<br/>- Barrel verification<br/>- Indirect dep tolerance]
        T3[Knowledge Base Seeder<br/>- Read persistent KB<br/>- QA error analysis<br/>- Append learned fixes]
        T4[Circuit Breaker<br/>- Track error counts<br/>- Detect stale loops<br/>- Force-break at 5x]
    end

    subgraph InfraLayer["Infrastructure"]
        I1[("Docker Engine")]
        I2[("MongoDB<br/>mongo:latest<br/>Port 27018")]
        I3[("Ollama Cloud<br/>api.ollama.com")]
        I4[("OpenAI API<br/>api.openai.com")]
        I5[("Anthropic API<br/>api.anthropic.com")]
        I6[(".env file<br/>API keys + config")]
        I7[("Disk: .workspace/<br/>output, plans, logs")]
    end

    subgraph KBLayer["Knowledge & Persistence"]
        K1[("docs/knowledge-bases/<br/>9 persistent KB files")]
        K2[(".workspace/.plan-cache/<br/>Cached task graphs")]
        K3[(".workspace/{runId}/output/<br/>Shared generated code")]
        K4[(".workspace/{runId}/tasks/<br/>Per-task iterations")]
    end

    U3 --> O1
    O12 --> U_END
    O11 --> U_END

    O5 --> A2
    A2 --> T1
    T1 --> A3
    A3 --> T2
    T2 --> A4
    A4 --> I1
    I1 --> I2
    O5 --> T3
    T3 --> K1
    O6 --> T4

    A2 -->|Cloud| I3
    A2 -->|OpenAI| I4
    A2 -->|Anthropic| I5

    style O11 fill:#ff4444,color:#fff
    style O12 fill:#44bb44,color:#fff
    style T4 fill:#ff8800,color:#fff
    style O9 fill:#ff8800,color:#fff
```

---

## 4. Data Flow Diagram

```mermaid
flowchart LR
    subgraph Inputs
        PRD[PRD.md]
        ENV[.env<br/>API keys]
        KB_IN[Knowledge Bases<br/>9 .md files]
        PLAN_CACHE[Plan Cache<br/>.json]
    end

    subgraph Processing
        PLAN_AGENT[Planning Agent<br/>→ Task Graph JSON]
        CODEGEN[CodeGen Agent<br/>→ .mts code files]
        SANITIZE[Code Sanitizer<br/>→ Clean .mts files]
        ESLINT_P[ESLint<br/>→ Linted .mts files]
        VALIDATE[Validator<br/>→ Import errors or PASS]
        QA_P[QA Agent<br/>→ Test results]
    end

    subgraph Infrastructure
        DOCKER_P[Docker: MongoDB]
        OLLAMA[Ollama Cloud API]
        OPENAI[OpenAI API]
        ANTHROPIC[Anthropic API]
    end

    subgraph Outputs
        CODE_OUT[Generated API<br/>.workspace/output/src/]
        TESTS_OUT[Test Files<br/>.workspace/output/tests/]
        LOGS[Run Logs<br/>.workspace/run.log]
        STATUS[Task Status<br/>JSON per task]
    end

    PRD --> PLAN_AGENT
    ENV --> PLAN_AGENT
    PLAN_CACHE -.->|if cached| PLAN_AGENT
    PLAN_AGENT --> CODEGEN
    KB_IN --> CODEGEN
    CODEGEN -->|via| OLLAMA
    CODEGEN -->|fallback| OPENAI
    CODEGEN -->|fallback| ANTHROPIC
    CODEGEN --> SANITIZE
    SANITIZE --> ESLINT_P
    ESLINT_P --> VALIDATE
    VALIDATE --> QA_P
    QA_P -->|real DB| DOCKER_P
    QA_P -->|pass| CODE_OUT
    QA_P -->|pass| TESTS_OUT
    QA_P -->|fail| CODEGEN
    QA_P --> LOGS
    QA_P --> STATUS
```

---

## 5. Component Inventory

| Component | File | Role | LLM Used | External Deps |
|-----------|------|------|----------|---------------|
| **Entry Point** | `src/index.mts` | CLI, arg parsing, exit codes | - | - |
| **DI Container** | `src/container/di.mts` | Wire all agents + tiers | - | env vars |
| **Planning Agent** | `src/agents/planning-agent.mts` | PRD → task graph | qwen3.5:27b (local) | Ollama |
| **CodeGen Agent** | `src/agents/codegen-agent.mts` | Task → code files | qwen3-coder-next | Ollama Cloud |
| **Code Sanitizer** | `src/agents/codegen-agent.mts` (sanitizeCodeFiles) | Auto-fix LLM mistakes | - | - |
| **ESLint Agent** | `src/agents/eslint-agent.mts` | Lint + auto-fix | - | ESLint CLI |
| **QA Agent** | `src/agents/qa-agent.mts` | Run tests, manage MongoDB | - | Docker, MongoDB, bun test |
| **Import Validator** | `src/validators/import-validator.mts` | Check imports/exports | - | - |
| **Fix Loop** | `src/orchestrator/fix-loop.mts` | Iteration loop + circuit breaker | - | - |
| **Fallback Loop** | `src/orchestrator/fallback-fix-loop.mts` | Multi-tier escalation | GPT-5.4, Sonnet | OpenAI, Anthropic |
| **Diagnostic Fix** | `src/orchestrator/diagnostic-fix.mts` | Last-resort analysis + fix | All 3 models | All 3 APIs |
| **Pipeline** | `src/orchestrator/pipeline.mts` | Top-level orchestrator | - | - |
| **Knowledge Bases** | `docs/knowledge-bases/*.md` | Persistent task-specific hints | - | Filesystem |
| **Plan Cache** | `.workspace/.plan-cache/` | Cached task graphs | - | Filesystem |
| **OpenAI Factory** | `src/llm/openai-factory.mts` | Create ChatOpenAI | - | OpenAI API |
| **Anthropic Factory** | `src/llm/anthropic-factory.mts` | Create ChatAnthropic | - | Anthropic API |
| **Ollama Factory** | `src/llm/ollama-factory.mts` | Create ChatOllama | - | Ollama API |

---

## 6. LLM Call Map

Every LLM call in the system:

| Call Site | Model | Purpose | Avg Duration | Retries |
|-----------|-------|---------|-------------|---------|
| Planning Agent | qwen3.5:27b (local) | PRD → task graph JSON | 50-100s | 1 model |
| CodeGen (generate) | qwen3-coder-next (cloud) | Initial code generation | 10-50s | Tier 1 retry |
| CodeGen (fix) | qwen3-coder-next (cloud) | Fix errors from QA | 15-90s | Tier 1 retry |
| Fallback Tier 2 | GPT-5.4 (OpenAI) | Rescue stuck tasks | 15-40s | 16 iters |
| Fallback Tier 3 | Claude Sonnet 4.6 (Anthropic) | Last model fallback | 10-30s | 16 iters |
| Diagnostic Analysis | All 3 models | Root cause analysis | 20-60s | 1 per model |
| Diagnostic Fix | All 3 models | Fix with diagnosis context | 15-40s | 30 iters each |
| Documentation Agent | qwen3.5:27b (local) | Generate API docs | 30-60s | 1 model |
